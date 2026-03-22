CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_subscription_email_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tomorrow DATE;
  next_payment_brt DATE;
  auto_enabled TEXT;
  reminder_hour INTEGER := 8;
  reminder_minute INTEGER := 0;
  now_brt TIMESTAMP;
  now_minutes INTEGER;
  target_minutes INTEGER;
  anon_jwt TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';
BEGIN
  -- Only run when next_payment actually changes
  IF OLD.next_payment IS NOT DISTINCT FROM NEW.next_payment THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO auto_enabled
  FROM public.email_settings
  WHERE setting_key = 'auto_send_enabled'
  LIMIT 1;

  IF auto_enabled IS NULL OR auto_enabled <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE((SELECT setting_value::integer FROM public.email_settings WHERE setting_key = 'reminder_hour' AND setting_value ~ '^[0-9]{1,2}$' LIMIT 1), 8),
    COALESCE((SELECT setting_value::integer FROM public.email_settings WHERE setting_key = 'reminder_minute' AND setting_value ~ '^[0-9]{1,2}$' LIMIT 1), 0)
  INTO reminder_hour, reminder_minute;

  IF reminder_hour < 0 OR reminder_hour > 23 THEN
    reminder_hour := 8;
  END IF;

  IF reminder_minute < 0 OR reminder_minute > 59 THEN
    reminder_minute := 0;
  END IF;

  tomorrow := (timezone('America/Sao_Paulo', now())::date + 1);
  next_payment_brt := (timezone('America/Sao_Paulo', NEW.next_payment))::date;

  IF next_payment_brt <> tomorrow OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  now_brt := timezone('America/Sao_Paulo', now());
  now_minutes := (EXTRACT(HOUR FROM now_brt)::integer * 60) + EXTRACT(MINUTE FROM now_brt)::integer;
  target_minutes := (reminder_hour * 60) + reminder_minute;

  -- If D-1 was marked after configured time, send immediately.
  IF now_minutes < target_minutes THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/email-billing-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_jwt
    ),
    body := jsonb_build_object(
      'clientId', NEW.client_id::text,
      'source', 'subscription_trigger'
    )
  );

  RAISE NOTICE 'Email D-1 reminder triggered immediately for client % subscription %', NEW.client_id, NEW.id;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('email-billing-reminder-8am', 'email-billing-reminder-every-minute')
  LOOP
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'email-billing-reminder-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/email-billing-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4"}'::jsonb,
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);
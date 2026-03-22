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
  anon_jwt TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';
BEGIN
  -- Check if auto send is enabled
  SELECT setting_value INTO auto_enabled FROM email_settings WHERE setting_key = 'auto_send_enabled';
  IF auto_enabled IS NULL OR auto_enabled != 'true' THEN
    RETURN NEW;
  END IF;

  -- Check if next_payment is tomorrow in BRT
  tomorrow := (timezone('America/Sao_Paulo', now())::date + 1);
  next_payment_brt := (timezone('America/Sao_Paulo', NEW.next_payment))::date;

  IF next_payment_brt != tomorrow OR NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  -- Send email via edge function
  PERFORM net.http_post(
    url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/email-billing-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_jwt
    ),
    body := jsonb_build_object('clientId', NEW.client_id::text)
  );

  RAISE NOTICE 'Email D-1 reminder triggered for client % subscription %', NEW.client_id, NEW.id;
  RETURN NEW;
END;
$$;
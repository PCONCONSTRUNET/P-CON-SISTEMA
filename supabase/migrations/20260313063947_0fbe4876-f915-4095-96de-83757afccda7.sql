-- Table to store email reminder settings
CREATE TABLE public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to email_settings" ON public.email_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default values: send at 08:00
INSERT INTO public.email_settings (setting_key, setting_value) VALUES 
  ('reminder_hour', '8'),
  ('reminder_minute', '0'),
  ('auto_send_enabled', 'true');

-- Trigger function: when subscription.next_payment changes to tomorrow,
-- send the email via edge function
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
  IF OLD.next_payment IS NOT DISTINCT FROM NEW.next_payment THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO auto_enabled FROM email_settings WHERE setting_key = 'auto_send_enabled';
  IF auto_enabled IS NULL OR auto_enabled != 'true' THEN
    RETURN NEW;
  END IF;

  tomorrow := (timezone('America/Sao_Paulo', now())::date + 1);
  next_payment_brt := (timezone('America/Sao_Paulo', NEW.next_payment))::date;

  IF next_payment_brt != tomorrow OR NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

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

CREATE TRIGGER trigger_email_d1_reminder
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_subscription_email_reminder();
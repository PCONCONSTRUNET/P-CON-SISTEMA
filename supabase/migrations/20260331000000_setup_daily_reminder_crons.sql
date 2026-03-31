-- Setup pg_cron daily reminder jobs for WhatsApp and Email (08:00 BRT = 11:00 UTC)
-- Requires pg_cron and pg_net extensions enabled in Supabase Dashboard → Database → Extensions

-- Remove existing jobs if they exist (safe re-run)
SELECT cron.unschedule('daily-whatsapp-auto-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-whatsapp-auto-reminders'
);
SELECT cron.unschedule('daily-email-billing-reminder') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-email-billing-reminder'
);

-- WhatsApp D-0 + D-5 automatic reminders — every day at 11:00 UTC (08:00 BRT)
SELECT cron.schedule(
  'daily-whatsapp-auto-reminders',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url_host', true) || '/functions/v1/whatsapp-auto-reminders'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Email D-5 automatic reminders — every day at 11:00 UTC (08:00 BRT)
-- The function itself checks the configured hour/minute from email_settings table
SELECT cron.schedule(
  'daily-email-billing-reminder',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.supabase_url_host', true) || '/functions/v1/email-billing-reminder'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{"forceRun": true}'::jsonb
  );
  $$
);

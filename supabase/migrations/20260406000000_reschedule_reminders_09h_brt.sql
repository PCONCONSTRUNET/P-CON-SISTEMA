-- Reagendar lembretes automáticos para 09:00 BRT (12:00 UTC)
-- Antes estava em 11:00 UTC = 08:00 BRT

-- Remove os jobs existentes
SELECT cron.unschedule('daily-whatsapp-auto-reminders') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-whatsapp-auto-reminders');

SELECT cron.unschedule('daily-email-billing-reminder') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-email-billing-reminder');

-- WhatsApp D-0 + D-1 automático — todo dia às 12:00 UTC (09:00 BRT)
SELECT cron.schedule(
  'daily-whatsapp-auto-reminders',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/whatsapp-auto-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Email D-5 automático — todo dia às 12:00 UTC (09:00 BRT)
SELECT cron.schedule(
  'daily-email-billing-reminder',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/email-billing-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{"forceRun": true}'::jsonb
  );
  $$
);

-- Verificar resultado
SELECT jobname, schedule, active FROM cron.job 
WHERE jobname IN ('daily-whatsapp-auto-reminders', 'daily-email-billing-reminder');

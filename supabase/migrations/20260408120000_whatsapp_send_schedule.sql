-- Tabela de configurações de agendamento de envio automático do WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  send_hour INTEGER NOT NULL DEFAULT 9 CHECK (send_hour >= 0 AND send_hour <= 23),
  send_minute INTEGER NOT NULL DEFAULT 0 CHECK (send_minute >= 0 AND send_minute <= 59),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to whatsapp_settings"
  ON public.whatsapp_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Configuração padrão: 09:00 BRT
INSERT INTO public.whatsapp_settings (send_hour, send_minute)
SELECT 9, 0
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_settings);

-- Recriar cron para rodar todo início de hora (a edge function decide internamente se é hora de enviar)
SELECT cron.unschedule('daily-whatsapp-auto-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-whatsapp-auto-reminders');

SELECT cron.schedule(
  'daily-whatsapp-auto-reminders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bevahgtmcdicyhjnrylk.supabase.co/functions/v1/whatsapp-auto-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- Migration: Estabilização definitiva do PostgreSQL / PostgREST / Realtime
-- ============================================================================
-- Resolve:
-- 1. Remove triggers antigos na tabela subscriptions que ainda disparavam
--    net.http_post() para o projeto antigo/morto (lcnaptefceboratxhzox)
-- 2. Substitui extensions.http_post(...)::text em admin_notifications por
--    chamada assíncrona segura via pg_net (timeout 2s), evitando travar workers
-- 3. Remove cron jobs agressivos (* * * * *) ou legados e limpa filas/logs
--    de pg_cron e pg_net acumulados em disco
-- 4. Reduz replicação WAL do Supabase Realtime apenas para tabelas usadas ao vivo
-- 5. Cria índices em tabelas de indicações e mensagens WhatsApp
-- ============================================================================

-- 1. Remover triggers legados que ainda chamam o projeto antigo
DROP TRIGGER IF EXISTS trigger_subscription_date_change ON public.subscriptions;
DROP TRIGGER IF EXISTS trigger_notify_subscription_date_change ON public.subscriptions;
DROP TRIGGER IF EXISTS trigger_email_d1_reminder ON public.subscriptions;

DROP FUNCTION IF EXISTS public.notify_subscription_date_change() CASCADE;
DROP FUNCTION IF EXISTS public.notify_subscription_email_reminder() CASCADE;

-- 2. Tornar o webhook de push de admin_notifications 100% assíncrono via pg_net
CREATE OR REPLACE FUNCTION public.fn_push_on_admin_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'title', NEW.title,
      'message', NEW.message,
      'category', NEW.category,
      'type', NEW.type
    )
  );

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    PERFORM net.http_post(
      url := 'https://bevahgtmcdicyhjnrylk.supabase.co/functions/v1/send-push-notification',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := v_payload,
      timeout_milliseconds := 2000
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[push-webhook] Falha nao-bloqueante ao enfileirar push: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Remover cron jobs agressivos (* * * * *) ou com URL antiga
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN (
      SELECT jobid, jobname
      FROM cron.job
      WHERE schedule = '* * * * *'
         OR jobname LIKE '%every-minute%'
         OR command LIKE '%lcnaptefceboratxhzox%'
    ) LOOP
      PERFORM cron.unschedule(r.jobid);
      RAISE NOTICE 'Cron removido: % (%)', r.jobname, r.jobid;
    END LOOP;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Limpar histórico pesado de pg_cron, pg_net e sessões expiradas (libera I/O)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '2 days';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'net' AND table_name = '_http_response') THEN
    DELETE FROM net._http_response WHERE created < now() - INTERVAL '2 days';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_sessions') THEN
    DELETE FROM public.client_sessions WHERE expires_at < now();
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 5. Remover do Realtime tabelas que não precisam de WAL streaming contínuo
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['affiliates', 'referral_leads', 'notifications', 'proposals']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 6. Índices faltantes para indicações e WhatsApp (eliminam Seq Scans)
CREATE INDEX IF NOT EXISTS idx_referral_links_client_id ON public.referral_links(client_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_link_id ON public.referral_clicks(referral_link_id);
CREATE INDEX IF NOT EXISTS idx_referral_leads_link_id ON public.referral_leads(referral_link_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_link_id ON public.referral_rewards(referral_link_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_btzap_id ON public.whatsapp_messages(btzap_message_id) WHERE btzap_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sub_payment_links_client_id ON public.subscription_payment_links(client_id);

-- 7. Atualizar estatísticas do planejador
ANALYZE public.clients;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.invoices;
ANALYZE public.admin_notifications;
ANALYZE public.subscription_payment_links;
ANALYZE public.referral_links;
ANALYZE public.referral_clicks;
ANALYZE public.referral_leads;
ANALYZE public.referral_rewards;
ANALYZE public.whatsapp_messages;

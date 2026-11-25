-- ============================================================================
-- Migration de Emergência: Alívio de RAM/Disk I/O/WAL (Supabase Free Nano)
-- ============================================================================
-- Diagnóstico real no banco mostrou:
-- - cron.job_run_details acumulou 144 MB de bloat num banco total de 162 MB
-- - 7 tabelas no WAL do Supabase Realtime (consumo alto nos 512MB da VM)
-- - Webhooks / abas paralelas elevando pico de conexões
-- ============================================================================

-- 1. Deixar WAL streaming no Realtime APENAS para as 3 tabelas críticas ao vivo
--    (payments, payment_links, admin_notifications)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clients',
    'subscriptions',
    'invoices',
    'subscription_payment_links',
    'whatsapp_messages',
    'whatsapp_templates',
    'whatsapp_settings',
    'app_settings',
    'client_coupons',
    'coupon_transactions',
    'affiliates',
    'referral_leads',
    'notifications',
    'proposals',
    'expenses'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['payments', 'payment_links', 'admin_notifications']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 2. Remover resíduo antigo de cron/pg_net e sessões expiradas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'net' AND table_name = '_http_response') THEN
    DELETE FROM net._http_response WHERE created < now() - INTERVAL '6 hours';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '24 hours' OR status IN ('failed', 'connecting');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_sessions') THEN
    DELETE FROM public.client_sessions WHERE expires_at < now();
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Índice faltante para despesas
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at DESC);

-- 4. Atualiza estatísticas do planejador
ANALYZE public.clients;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.invoices;
ANALYZE public.expenses;
ANALYZE public.payment_links;
ANALYZE public.admin_notifications;

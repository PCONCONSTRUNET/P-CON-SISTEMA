-- ============================================================================
-- Migration: Otimização de estabilidade, Disk I/O e índices no PostgreSQL
-- ============================================================================
-- Execute no SQL Editor do Supabase (Projeto: bevahgtmcdicyhjnrylk)
-- ============================================================================

-- 1. Remover cron jobs agressivos (* * * * *) ou apontando para projeto antigo
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
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Limpar logs antigos de pg_cron / pg_net e sessões expiradas (reduz Disk I/O)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'cron' AND table_name = 'job_run_details'
  ) THEN
    DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '3 days';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'net' AND table_name = '_http_response'
  ) THEN
    DELETE FROM net._http_response WHERE created < now() - INTERVAL '3 days';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_sessions'
  ) THEN
    DELETE FROM public.client_sessions WHERE expires_at < now();
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Índices essenciais e compostos para evitar Seq Scans em disco
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_document ON public.clients(document);

CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON public.subscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON public.subscriptions(next_payment);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_next_payment
  ON public.subscriptions(status, next_payment);

CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_created_at
  ON public.payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id
  ON public.payments(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON public.invoices(issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications(created_at DESC) WHERE is_read = false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contracts') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts(client_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_flags') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_flags_client_id ON public.client_flags(client_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_vault') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_vault_client_id ON public.client_vault(client_id)';
  END IF;
END $$;

-- 4. Atualiza estatísticas do planejador de queries
ANALYZE public.clients;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.invoices;
ANALYZE public.admin_notifications;

-- ==============================================================================
-- P-CON SISTEMA - RESOLUÇÃO DE DISK I/O E EXCLUSÃO DEFINITIVA DO PORTFÓLIO
-- Cole e execute este script no SQL Editor do Supabase
-- (Os arquivos de storage já foram 100% removidos via Storage API)
-- ==============================================================================

-- 1. Excluir a tabela do banco de dados (e suas policies em cascata)
DROP TABLE IF EXISTS public.portfolio_items CASCADE;

-- 2. Desativar/Remover cron jobs agressivos que rodam a cada minuto ou apontam para o banco antigo
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN (
      SELECT jobid, jobname 
      FROM cron.job 
      WHERE jobname LIKE '%every-minute%' 
         OR jobname LIKE '%lcnaptefceboratxhzox%'
         OR schedule = '* * * * *'
    ) LOOP
      PERFORM cron.unschedule(r.jobid);
      RAISE NOTICE 'Job removido do cron: % (%)', r.jobname, r.jobid;
    END LOOP;
  END IF;
END $$;

-- 3. Limpar logs acumulados do pg_cron e pg_net que geram gravações constantes em disco
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '2 days';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'net' AND table_name = '_http_response') THEN
    DELETE FROM net._http_response WHERE created < now() - INTERVAL '2 days';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. Criar índices essenciais para evitar leituras sequenciais (Seq Scans) em disco
CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON public.subscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON public.subscriptions(next_payment);

CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_document ON public.clients(document);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON public.invoices(issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON public.admin_notifications(is_read, created_at DESC);

-- 5. Atualizar estatísticas do planejador do PostgreSQL
ANALYZE public.clients;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.invoices;
ANALYZE public.admin_notifications;

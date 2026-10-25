-- Migration: Remove portfolio and optimize disk I/O
-- Drop portfolio storage and table
DO $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id = 'portfolio';
  DELETE FROM storage.buckets WHERE id = 'portfolio';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;

DROP TABLE IF EXISTS public.portfolio_items CASCADE;

-- Unschedule obsolete/aggressive crons
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
    END LOOP;
  END IF;
END $$;

-- Clean accumulated cron & net logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '3 days';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'net' AND table_name = '_http_response') THEN
    DELETE FROM net._http_response WHERE created < now() - INTERVAL '3 days';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Performance indexes to prevent Seq Scans and save Disk I/O
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
CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients(phone);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON public.invoices(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON public.admin_notifications(is_read, created_at DESC);

ANALYZE public.clients;
ANALYZE public.subscriptions;
ANALYZE public.payments;
ANALYZE public.invoices;
ANALYZE public.admin_notifications;

-- ==============================================================================
-- P-CON SISTEMA - ÍNDICES LEVES E ESSENCIAIS PARA ACABAR COM A LENTIDÃO
-- Cole e execute no SQL Editor do Supabase (leva menos de 1 segundo)
-- ==============================================================================

-- 1. Os 4 índices mais críticos para cruzamento de clientes e pagamentos
CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);

-- 2. Desligar o cron que ficava rodando a cada minuto
DO $$
DECLARE r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN (
      SELECT jobid FROM cron.job 
      WHERE schedule = '* * * * *' 
         OR jobname LIKE '%every-minute%'
    ) LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;
  END IF;
END $$;

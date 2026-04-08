-- ===================================================
-- PATCH FINAL DE SCHEMA — P-CON SISTEMA
-- Objetivo: Adicionar colunas em tabelas que já existiam e resetar cache da API.
-- ===================================================

-- 1. SUBSCRIPTIONS
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS asaas_id TEXT;

-- 2. PAYMENTS
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS asaas_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS proposal_id UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS proposal_payment_type TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- 3. INVOICES
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. CONTRACTS
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS file_path TEXT;

-- 5. AFFILIATES
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS approved_by UUID;

-- 6. RESETAR CACHE DA API (PostgREST)
-- Isso força o Supabase a "ver" as novas colunas imediatamente
NOTIFY pgrst, 'reload schema';

-- 7. RE-HABILITAR REALTIME PARA GARANTIR
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions, public.payments, public.invoices;
EXCEPTION
    WHEN others THEN null;
END $$;

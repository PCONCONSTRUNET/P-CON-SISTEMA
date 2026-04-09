-- ==========================================
-- RECONSTRUÇÃO DE TABELAS AUSENTES E RLS
-- Objetivo: Criar tabelas faltantes para abas OFF (Implantações e Cupons)
-- ==========================================

-- 1. TABELA IMPLEMENTATIONS
CREATE TABLE IF NOT EXISTS public.implementations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active',
  availability TEXT NOT NULL DEFAULT 'available',
  category TEXT,
  tags TEXT[],
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. TABELA IMPLEMENTATION_REQUESTS
CREATE TABLE IF NOT EXISTS public.implementation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id UUID NOT NULL REFERENCES public.implementations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. TABELA CLIENT_COUPONS
CREATE TABLE IF NOT EXISTS public.client_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  initial_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  current_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  origin TEXT,
  referral_reward_id UUID REFERENCES public.referral_rewards(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. TABELA COUPON_TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.coupon_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_coupon_id UUID NOT NULL REFERENCES public.client_coupons(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  transaction_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS e Permissões ALL nas tabelas para evitar "Tela OFF ou Erros de Cadastro"
ALTER TABLE public.implementations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access to implementations" ON public.implementations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.implementation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access to implementation_requests" ON public.implementation_requests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.client_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access to client_coupons" ON public.client_coupons FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.coupon_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access to coupon_transactions" ON public.coupon_transactions FOR ALL USING (true) WITH CHECK (true);

-- Notificar o banco para recarregar as tabelas ativas no Supabase PostgREST
NOTIFY pgrst, 'reload schema';

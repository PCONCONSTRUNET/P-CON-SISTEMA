-- ==========================================
-- CORREÇÃO DE RLS PARA IMPLANTAÇÕES, CUPONS E INDICAÇÕES
-- Objetivo: Liberar acesso integral para correção das abas vazias/travadas
-- ==========================================

-- 1. Implantações
DO $$ BEGIN
    ALTER TABLE public.implementations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to implementations" ON public.implementations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.implementation_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to implementation_requests" ON public.implementation_requests FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

-- 2. Cupons
DO $$ BEGIN
    ALTER TABLE public.client_coupons ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to client_coupons" ON public.client_coupons FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.coupon_transactions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to coupon_transactions" ON public.coupon_transactions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

-- 3. Indicações (Referrals)
DO $$ BEGIN
    ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to referral_settings" ON public.referral_settings FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to referral_links" ON public.referral_links FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.referral_leads ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to referral_leads" ON public.referral_leads FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to referral_rewards" ON public.referral_rewards FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to referral_clicks" ON public.referral_clicks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.referral_submissions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public full access to referral_submissions" ON public.referral_submissions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN others THEN null; END $$;

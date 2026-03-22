-- Tabela de afiliados externos (não são clientes)
CREATE TABLE public.affiliates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  pix_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, inactive
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES auth.users(id)
);

-- Credenciais de login dos afiliados
CREATE TABLE public.affiliate_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sessões de login dos afiliados
CREATE TABLE public.affiliate_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_user_id UUID NOT NULL REFERENCES public.affiliate_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Links de indicação dos afiliados
CREATE TABLE public.affiliate_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Cliques nos links de afiliados
CREATE TABLE public.affiliate_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_link_id UUID NOT NULL REFERENCES public.affiliate_links(id) ON DELETE CASCADE,
  ip_hash TEXT,
  user_agent TEXT,
  referer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Leads capturados por afiliados
CREATE TABLE public.affiliate_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_link_id UUID NOT NULL REFERENCES public.affiliate_links(id) ON DELETE CASCADE,
  lead_name TEXT NOT NULL,
  lead_email TEXT,
  lead_phone TEXT,
  source TEXT DEFAULT 'form',
  is_converted BOOLEAN NOT NULL DEFAULT false,
  converted_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Recompensas dos afiliados
CREATE TABLE public.affiliate_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_link_id UUID NOT NULL REFERENCES public.affiliate_links(id) ON DELETE CASCADE,
  affiliate_lead_id UUID NOT NULL REFERENCES public.affiliate_leads(id) ON DELETE CASCADE UNIQUE,
  amount NUMERIC NOT NULL DEFAULT 100,
  status referral_reward_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_rewards ENABLE ROW LEVEL SECURITY;

-- Políticas para affiliates
CREATE POLICY "Allow public insert for affiliate registration" ON public.affiliates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read for affiliates" ON public.affiliates FOR SELECT USING (true);
CREATE POLICY "Allow authenticated update for affiliates" ON public.affiliates FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete for affiliates" ON public.affiliates FOR DELETE USING (true);

-- Políticas para affiliate_users
CREATE POLICY "Allow public insert for affiliate users" ON public.affiliate_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read for affiliate users" ON public.affiliate_users FOR SELECT USING (true);
CREATE POLICY "Allow public update for affiliate users" ON public.affiliate_users FOR UPDATE USING (true);

-- Políticas para affiliate_sessions
CREATE POLICY "Allow public insert for affiliate sessions" ON public.affiliate_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read for affiliate sessions" ON public.affiliate_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public delete for affiliate sessions" ON public.affiliate_sessions FOR DELETE USING (true);

-- Políticas para affiliate_links
CREATE POLICY "Allow public read for affiliate links" ON public.affiliate_links FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert for affiliate links" ON public.affiliate_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update for affiliate links" ON public.affiliate_links FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete for affiliate links" ON public.affiliate_links FOR DELETE USING (true);

-- Políticas para affiliate_clicks
CREATE POLICY "Allow public insert for affiliate clicks" ON public.affiliate_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read for affiliate clicks" ON public.affiliate_clicks FOR SELECT USING (true);

-- Políticas para affiliate_leads
CREATE POLICY "Allow public insert for affiliate leads" ON public.affiliate_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read for affiliate leads" ON public.affiliate_leads FOR SELECT USING (true);
CREATE POLICY "Allow authenticated update for affiliate leads" ON public.affiliate_leads FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete for affiliate leads" ON public.affiliate_leads FOR DELETE USING (true);

-- Políticas para affiliate_rewards
CREATE POLICY "Allow public read for affiliate rewards" ON public.affiliate_rewards FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert for affiliate rewards" ON public.affiliate_rewards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update for affiliate rewards" ON public.affiliate_rewards FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete for affiliate rewards" ON public.affiliate_rewards FOR DELETE USING (true);

-- Triggers para updated_at
CREATE TRIGGER update_affiliates_updated_at BEFORE UPDATE ON public.affiliates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_affiliate_users_updated_at BEFORE UPDATE ON public.affiliate_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_affiliate_links_updated_at BEFORE UPDATE ON public.affiliate_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_affiliate_rewards_updated_at BEFORE UPDATE ON public.affiliate_rewards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para criar link automaticamente quando afiliado é aprovado
CREATE OR REPLACE FUNCTION public.handle_affiliate_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se o status mudou para 'approved', criar o link de indicação
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO affiliate_links (affiliate_id, slug, is_active)
    VALUES (NEW.id, generate_referral_slug(), true)
    ON CONFLICT (affiliate_id) DO NOTHING;
    
    NEW.approved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_affiliate_approval
BEFORE UPDATE ON public.affiliates
FOR EACH ROW
EXECUTE FUNCTION public.handle_affiliate_approval();
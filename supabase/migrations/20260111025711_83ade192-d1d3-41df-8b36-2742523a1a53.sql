-- Create referral status enum
CREATE TYPE public.referral_reward_status AS ENUM ('pending', 'approved', 'paid');

-- Global referral settings table
CREATE TABLE public.referral_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  reward_value numeric NOT NULL DEFAULT 100,
  validity_days integer NOT NULL DEFAULT 60,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO public.referral_settings (is_active, reward_value, validity_days) VALUES (true, 100, 60);

-- Referral links table (one per client)
CREATE TABLE public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- Referral clicks tracking
CREATE TABLE public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id uuid NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  ip_hash text,
  user_agent text,
  referer text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Referral leads (when a visitor becomes a lead)
CREATE TABLE public.referral_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id uuid NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  lead_name text NOT NULL,
  lead_email text,
  lead_phone text,
  source text DEFAULT 'form',
  is_converted boolean NOT NULL DEFAULT false,
  converted_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Referral rewards
CREATE TABLE public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id uuid NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  referral_lead_id uuid NOT NULL REFERENCES public.referral_leads(id) ON DELETE CASCADE UNIQUE,
  amount numeric NOT NULL DEFAULT 100,
  status referral_reward_status NOT NULL DEFAULT 'pending',
  approved_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_settings (admin only read, public read for checking if active)
CREATE POLICY "Allow public read for referral settings" ON public.referral_settings FOR SELECT USING (true);
CREATE POLICY "Allow authenticated update for referral settings" ON public.referral_settings FOR UPDATE USING (true);

-- RLS Policies for referral_links
CREATE POLICY "Allow public read for referral links" ON public.referral_links FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert for referral links" ON public.referral_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update for referral links" ON public.referral_links FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete for referral links" ON public.referral_links FOR DELETE USING (true);

-- RLS Policies for referral_clicks (public insert for tracking)
CREATE POLICY "Allow public read for referral clicks" ON public.referral_clicks FOR SELECT USING (true);
CREATE POLICY "Allow public insert for referral clicks" ON public.referral_clicks FOR INSERT WITH CHECK (true);

-- RLS Policies for referral_leads
CREATE POLICY "Allow public read for referral leads" ON public.referral_leads FOR SELECT USING (true);
CREATE POLICY "Allow public insert for referral leads" ON public.referral_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update for referral leads" ON public.referral_leads FOR UPDATE USING (true);

-- RLS Policies for referral_rewards
CREATE POLICY "Allow public read for referral rewards" ON public.referral_rewards FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert for referral rewards" ON public.referral_rewards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update for referral rewards" ON public.referral_rewards FOR UPDATE USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_referral_settings_updated_at BEFORE UPDATE ON public.referral_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_referral_links_updated_at BEFORE UPDATE ON public.referral_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_referral_rewards_updated_at BEFORE UPDATE ON public.referral_rewards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate unique slug
CREATE OR REPLACE FUNCTION public.generate_referral_slug()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;
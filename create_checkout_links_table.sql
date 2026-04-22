-- Tabela para links de pagamento/checkout
CREATE TABLE IF NOT EXISTS checkout_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive, paid, expired
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  expires_at TIMESTAMPTZ,
  payment_method TEXT, -- NULL = all, 'pix', 'card'
  max_installments INTEGER DEFAULT 1,
  allow_pix BOOLEAN DEFAULT true,
  allow_card BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_id UUID REFERENCES payments(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para busca por slug
CREATE INDEX IF NOT EXISTS idx_checkout_links_slug ON checkout_links(slug);

-- RLS (Row Level Security)
ALTER TABLE checkout_links ENABLE ROW LEVEL SECURITY;

-- Policy: permite tudo para authenticated (admin)
CREATE POLICY "Allow all for authenticated" ON checkout_links
  FOR ALL USING (true) WITH CHECK (true);

-- Policy: permite select para anon (público via slug)
CREATE POLICY "Allow anon select" ON checkout_links
  FOR SELECT USING (true);

-- Policy: permite update para anon (para registrar views)
CREATE POLICY "Allow anon update" ON checkout_links
  FOR UPDATE USING (true) WITH CHECK (true);

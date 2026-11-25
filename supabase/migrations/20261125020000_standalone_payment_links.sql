-- ============================================================================
-- Migration: Aba Links de Pagamento (cobranças avulsas com PIX / Cartão e
--            preenchimento obrigatório de Nome + CPF pelo cliente)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token             text NOT NULL UNIQUE,
  title             text NOT NULL,
  description       text,
  amount            numeric NOT NULL CHECK (amount > 0),
  allow_pix         boolean NOT NULL DEFAULT true,
  allow_card        boolean NOT NULL DEFAULT true,
  max_installments  integer NOT NULL DEFAULT 4 CHECK (max_installments BETWEEN 1 AND 4),
  status            text NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled'
  client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  payer_name        text,
  payer_document    text,
  payer_email       text,
  payer_phone       text,
  payment_id        uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payment_method    text,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_link_id uuid REFERENCES public.payment_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_links_token ON public.payment_links(token);
CREATE INDEX IF NOT EXISTS idx_payment_links_status_created ON public.payment_links(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_client_id ON public.payment_links(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_link_id ON public.payments(payment_link_id);

-- RLS
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access to payment links" ON public.payment_links;
CREATE POLICY "Public full access to payment links"
  ON public.payment_links
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_links;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Timestamp automático
DROP TRIGGER IF EXISTS update_payment_links_updated_at ON public.payment_links;
CREATE TRIGGER update_payment_links_updated_at
  BEFORE UPDATE ON public.payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Gerador de token curto e legível baseado no título: ex. gestao-de-redes-4a9f
CREATE OR REPLACE FUNCTION public.generate_payment_link_token(p_title text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug      text;
  v_suffix    text;
  v_candidate text;
BEGIN
  v_slug := translate(
    lower(COALESCE(btrim(p_title), 'cobranca')),
    'áàâãäéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaeeeeiiiiooooouuuucnyyaaaaaeeeeiiiiooooouuuucny'
  );
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  v_slug := left(v_slug, 26);
  v_slug := btrim(v_slug, '-');

  IF COALESCE(v_slug, '') = '' THEN
    v_slug := 'cobranca';
  END IF;

  LOOP
    v_suffix := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 4);
    v_candidate := v_slug || '-' || v_suffix;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.payment_links WHERE token = v_candidate
    ) AND NOT EXISTS (
      SELECT 1 FROM public.subscription_payment_links WHERE token = v_candidate
    );
  END LOOP;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_assign_payment_link_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.token IS NULL OR btrim(NEW.token) = '' THEN
    NEW.token := public.generate_payment_link_token(NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_payment_link_token ON public.payment_links;
CREATE TRIGGER trg_assign_payment_link_token
  BEFORE INSERT ON public.payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_assign_payment_link_token();

-- RPC: registra/vincula Nome e CPF do cliente no link antes de gerar PIX ou Cartão
CREATE OR REPLACE FUNCTION public.prepare_payment_link_payer(
  p_token text,
  p_name text,
  p_document text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link       public.payment_links%ROWTYPE;
  v_clean_name text := btrim(COALESCE(p_name, ''));
  v_clean_doc  text := regexp_replace(COALESCE(p_document, ''), '\D', '', 'g');
  v_client     public.clients%ROWTYPE;
  v_email      text;
BEGIN
  IF v_clean_name = '' OR length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Informe seu nome completo';
  END IF;

  IF length(v_clean_doc) NOT IN (11, 14) THEN
    RAISE EXCEPTION 'CPF ou CNPJ invalido';
  END IF;

  SELECT * INTO v_link
  FROM public.payment_links
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de pagamento nao encontrado';
  END IF;

  IF v_link.status = 'cancelled' THEN
    RAISE EXCEPTION 'Este link de pagamento foi cancelado';
  END IF;

  -- Busca cliente já existente pelo CPF/CNPJ normalizado
  SELECT * INTO v_client
  FROM public.clients
  WHERE regexp_replace(COALESCE(document, ''), '\D', '', 'g') = v_clean_doc
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_email := v_clean_doc || '@cliente.pconassinantes.site';
    INSERT INTO public.clients (
      name,
      email,
      document,
      status
    ) VALUES (
      v_clean_name,
      v_email,
      btrim(p_document),
      'active'
    )
    RETURNING * INTO v_client;
  END IF;

  UPDATE public.payment_links
  SET client_id = v_client.id,
      payer_name = v_clean_name,
      payer_document = btrim(p_document),
      payer_email = COALESCE(NULLIF(btrim(v_client.email), ''), v_clean_doc || '@cliente.pconassinantes.site'),
      updated_at = now()
  WHERE id = v_link.id
  RETURNING * INTO v_link;

  RETURN jsonb_build_object(
    'link_id', v_link.id,
    'client_id', v_client.id,
    'client_name', v_clean_name,
    'client_email', v_link.payer_email,
    'client_document', v_link.payer_document
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_payment_link_payer(text, text, text)
  TO anon, authenticated, service_role;

-- RPC idempotente para confirmar pagamento de um link avulso
CREATE OR REPLACE FUNCTION public.complete_payment_link(
  p_token text,
  p_payment_id uuid DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_payment_method text DEFAULT 'PIX',
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link           public.payment_links%ROWTYPE;
  v_payment_id     uuid := p_payment_id;
  v_paid_ts        timestamptz := COALESCE(p_paid_at, now());
  v_invoice_exists boolean := false;
  v_invoice_number text;
BEGIN
  SELECT * INTO v_link
  FROM public.payment_links
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'not_found');
  END IF;

  IF v_payment_id IS NULL AND NULLIF(btrim(p_transaction_id), '') IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE transaction_id = btrim(p_transaction_id)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_link.status <> 'paid' THEN
    UPDATE public.payment_links
    SET status = 'paid',
        payment_id = COALESCE(v_payment_id, payment_id),
        payment_method = COALESCE(NULLIF(btrim(p_payment_method), ''), payment_method, 'PIX'),
        paid_at = v_paid_ts,
        updated_at = now()
    WHERE id = v_link.id
    RETURNING * INTO v_link;
  END IF;

  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET payment_link_id = COALESCE(payment_link_id, v_link.id)
    WHERE id = v_payment_id;

    IF v_link.client_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.invoices WHERE payment_id = v_payment_id
      ) INTO v_invoice_exists;

      IF NOT v_invoice_exists THEN
        v_invoice_number :=
          'NF-' ||
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
          '-' ||
          upper(right(v_payment_id::text, 4));

        INSERT INTO public.invoices (
          payment_id, client_id, number, amount, status, description
        ) VALUES (
          v_payment_id,
          v_link.client_id,
          v_invoice_number,
          v_link.amount,
          'issued',
          v_link.title
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'completed', true,
    'status', v_link.status,
    'paid_at', v_link.paid_at,
    'payment_id', v_link.payment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_payment_link(text, uuid, text, text, timestamptz)
  TO anon, authenticated, service_role;

-- Trigger automático: quando webhook ou check-status marcar payments como 'paid',
-- atualiza o payment_links correspondente automaticamente no banco
CREATE OR REPLACE FUNCTION public.fn_sync_standalone_payment_link_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.payment_links%ROWTYPE;
BEGIN
  IF NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_link_id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.payment_links
    WHERE id = NEW.payment_link_id
      AND status <> 'paid'
    LIMIT 1;
  ELSIF NEW.subscription_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.payment_links
    WHERE client_id = NEW.client_id
      AND status = 'pending'
      AND (
        NEW.description ILIKE ('%' || title || '%')
        OR abs(amount - NEW.amount) < 0.01
      )
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  IF v_link.id IS NOT NULL THEN
    UPDATE public.payment_links
    SET status = 'paid',
        payment_id = COALESCE(NEW.id, payment_id),
        payment_method = COALESCE(NULLIF(btrim(NEW.payment_method), ''), payment_method, 'PIX'),
        paid_at = COALESCE(NEW.paid_at, now()),
        updated_at = now()
    WHERE id = v_link.id
      AND status <> 'paid';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_standalone_payment_link ON public.payments;
CREATE TRIGGER trg_sync_standalone_payment_link
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_standalone_payment_link_on_paid();

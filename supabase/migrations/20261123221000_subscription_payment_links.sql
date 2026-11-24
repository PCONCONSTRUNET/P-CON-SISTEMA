-- ============================================================================
-- Migration: Links automáticos de cobrança por ciclo de assinatura
-- ============================================================================
-- 1. Cria tabela public.subscription_payment_links (um link único por ciclo mensal)
-- 2. Vincula payments.subscription_link_id
-- 3. Trigger automático: toda assinatura ativa ganha um link pendente na hora
-- 4. Função idempotente public.advance_subscription_cycle(...) para dar baixa no
--    pagamento, emitir nota fiscal, avançar próximo mês e gerar o link novo
-- 5. Backfill para todas as assinaturas ativas já existentes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_payment_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE DEFAULT ('sub-' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12)),
  amount          numeric NOT NULL,
  due_date        timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled'
  payment_id      uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payment_method  text,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subscription_link_id uuid REFERENCES public.subscription_payment_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_payment_links_sub_status
  ON public.subscription_payment_links(subscription_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_payment_links_token
  ON public.subscription_payment_links(token);

CREATE INDEX IF NOT EXISTS idx_payments_subscription_link_id
  ON public.payments(subscription_link_id);

-- RLS
ALTER TABLE public.subscription_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read subscription payment links" ON public.subscription_payment_links;
CREATE POLICY "Public read subscription payment links"
  ON public.subscription_payment_links
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated manage subscription payment links" ON public.subscription_payment_links;
CREATE POLICY "Authenticated manage subscription payment links"
  ON public.subscription_payment_links
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_payment_links;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- ── Helper: calcula próximo vencimento mensal (12:00 BRT, com clamp de fim de mês) ──
CREATE OR REPLACE FUNCTION public.compute_next_monthly_due_date(p_current timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_local_date date;
  v_next_date  date;
BEGIN
  v_local_date := (COALESCE(p_current, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  v_next_date  := (v_local_date + INTERVAL '1 month')::date;
  RETURN (v_next_date::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

-- ── Trigger: garante link pendente sempre que uma assinatura estiver ativa ───────────
CREATE OR REPLACE FUNCTION public.fn_sync_subscription_payment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_id uuid;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT id INTO v_pending_id
    FROM public.subscription_payment_links
    WHERE subscription_id = NEW.id
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_id IS NULL THEN
      INSERT INTO public.subscription_payment_links (
        subscription_id,
        client_id,
        amount,
        due_date,
        status
      ) VALUES (
        NEW.id,
        NEW.client_id,
        NEW.value,
        NEW.next_payment,
        'pending'
      );
    ELSIF TG_OP = 'UPDATE' AND (
      OLD.value IS DISTINCT FROM NEW.value
      OR OLD.next_payment IS DISTINCT FROM NEW.next_payment
      OR OLD.client_id IS DISTINCT FROM NEW.client_id
    ) THEN
      UPDATE public.subscription_payment_links
      SET amount = NEW.value,
          due_date = NEW.next_payment,
          client_id = NEW.client_id,
          updated_at = now()
      WHERE id = v_pending_id;
    END IF;
  ELSE
    UPDATE public.subscription_payment_links
    SET status = 'cancelled',
        updated_at = now()
    WHERE subscription_id = NEW.id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscription_payment_link ON public.subscriptions;
CREATE TRIGGER trg_sync_subscription_payment_link
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_subscription_payment_link();

-- ── RPC idempotente: baixa no ciclo atual, gera NF, avança mês e cria novo link ──
CREATE OR REPLACE FUNCTION public.advance_subscription_cycle(
  p_subscription_id      uuid,
  p_payment_id           uuid DEFAULT NULL,
  p_subscription_link_id uuid DEFAULT NULL,
  p_payment_method       text DEFAULT 'PIX',
  p_paid_at              timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub              public.subscriptions%ROWTYPE;
  v_paid_link        public.subscription_payment_links%ROWTYPE;
  v_new_link         public.subscription_payment_links%ROWTYPE;
  v_next_due         timestamptz;
  v_paid_ts          timestamptz := COALESCE(p_paid_at, now());
  v_invoice_exists   boolean := false;
  v_invoice_amount   numeric;
  v_invoice_number   text;
BEGIN
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('advanced', false, 'reason', 'subscription_not_found');
  END IF;

  -- Idempotência 1: este payment_id já concluiu um ciclo
  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_paid_link
    FROM public.subscription_payment_links
    WHERE payment_id = p_payment_id
      AND status = 'paid'
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_new_link
      FROM public.subscription_payment_links
      WHERE subscription_id = p_subscription_id
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1;

      RETURN jsonb_build_object(
        'advanced', false,
        'already_processed', true,
        'next_payment', v_sub.next_payment,
        'new_link_id', v_new_link.id,
        'new_link_token', v_new_link.token
      );
    END IF;
  END IF;

  -- Idempotência 2: este link específico já foi pago
  IF p_subscription_link_id IS NOT NULL THEN
    SELECT * INTO v_paid_link
    FROM public.subscription_payment_links
    WHERE id = p_subscription_link_id
      AND status = 'paid'
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_new_link
      FROM public.subscription_payment_links
      WHERE subscription_id = p_subscription_id
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1;

      RETURN jsonb_build_object(
        'advanced', false,
        'already_processed', true,
        'next_payment', v_sub.next_payment,
        'new_link_id', v_new_link.id,
        'new_link_token', v_new_link.token
      );
    END IF;
  END IF;

  -- Localiza o link pendente correspondente
  IF p_subscription_link_id IS NOT NULL THEN
    SELECT * INTO v_paid_link
    FROM public.subscription_payment_links
    WHERE id = p_subscription_link_id
      AND subscription_id = p_subscription_id
      AND status = 'pending'
    LIMIT 1;
  END IF;

  IF v_paid_link.id IS NULL THEN
    SELECT * INTO v_paid_link
    FROM public.subscription_payment_links
    WHERE subscription_id = p_subscription_id
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Marca o link atual como pago
  IF v_paid_link.id IS NOT NULL THEN
    UPDATE public.subscription_payment_links
    SET status = 'paid',
        payment_id = COALESCE(p_payment_id, payment_id),
        payment_method = COALESCE(p_payment_method, payment_method),
        paid_at = v_paid_ts,
        updated_at = now()
    WHERE id = v_paid_link.id;
  ELSE
    -- Caso raro sem link pendente prévio, registra o ciclo pago no histórico
    INSERT INTO public.subscription_payment_links (
      subscription_id, client_id, amount, due_date, status, payment_id, payment_method, paid_at
    ) VALUES (
      v_sub.id, v_sub.client_id, v_sub.value, v_sub.next_payment, 'paid', p_payment_id, p_payment_method, v_paid_ts
    )
    RETURNING * INTO v_paid_link;
  END IF;

  -- Calcula o próximo vencimento mensal
  v_next_due := public.compute_next_monthly_due_date(v_sub.next_payment);

  -- Atualiza assinatura para o próximo mês (o trigger acima criará o novo link 'pending')
  UPDATE public.subscriptions
  SET next_payment = v_next_due,
      status = 'active',
      updated_at = now()
  WHERE id = v_sub.id;

  -- Emite nota fiscal caso ainda não exista para o pagamento
  IF p_payment_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.invoices WHERE payment_id = p_payment_id
    ) INTO v_invoice_exists;

    IF NOT v_invoice_exists THEN
      SELECT amount INTO v_invoice_amount FROM public.payments WHERE id = p_payment_id;
      v_invoice_number := 'NF-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') || '-' || upper(right(p_payment_id::text, 4));

      INSERT INTO public.invoices (
        payment_id,
        client_id,
        number,
        amount,
        status,
        description
      ) VALUES (
        p_payment_id,
        v_sub.client_id,
        v_invoice_number,
        COALESCE(v_invoice_amount, v_sub.value),
        'issued',
        'Valor pago referente ao plano ativo: ' || v_sub.plan_name
      );
    END IF;
  END IF;

  -- Garante e retorna o novo link pendente criado para o próximo mês
  SELECT * INTO v_new_link
  FROM public.subscription_payment_links
  WHERE subscription_id = p_subscription_id
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_new_link.id IS NULL THEN
    INSERT INTO public.subscription_payment_links (
      subscription_id, client_id, amount, due_date, status
    ) VALUES (
      v_sub.id, v_sub.client_id, v_sub.value, v_next_due, 'pending'
    )
    RETURNING * INTO v_new_link;
  END IF;

  RETURN jsonb_build_object(
    'advanced', true,
    'already_processed', false,
    'paid_link_id', v_paid_link.id,
    'next_payment', v_next_due,
    'new_link_id', v_new_link.id,
    'new_link_token', v_new_link.token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_subscription_cycle(uuid, uuid, uuid, text, timestamptz)
  TO authenticated, service_role;

-- ── Backfill: gera link pendente para todas as assinaturas ativas já existentes ──
INSERT INTO public.subscription_payment_links (
  subscription_id,
  client_id,
  amount,
  due_date,
  status
)
SELECT
  s.id,
  s.client_id,
  s.value,
  s.next_payment,
  'pending'
FROM public.subscriptions s
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscription_payment_links l
    WHERE l.subscription_id = s.id
      AND l.status = 'pending'
  );

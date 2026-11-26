-- ============================================================================
-- Migration: Suporte completo a Pagamentos Parciais em cobranças avulsas
-- ============================================================================
-- Permite:
-- 1. Registrar pagamento parcial no Admin (ex: cobrou 1700, pagou 700 ->
--    cria transação paga de 700 e mantém saldo restante de 1000 em aberto).
-- 2. Cliente pagar valor parcial no Portal do Cliente (/cliente / /checkout):
--    o PIX parcial pago fica registrado como "Pago" no histórico e abate
--    automaticamente o valor em aberto da cobrança principal.
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS parent_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_partial_attempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_applied boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payments_parent_payment_id
  ON public.payments(parent_payment_id)
  WHERE parent_payment_id IS NOT NULL;

-- ── Helper interno: aplica abatimento de um pagamento parcial na guia pai ──
CREATE OR REPLACE FUNCTION public.internal_deduct_parent_payment(
  p_parent_id uuid,
  p_paid_amount numeric,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent        public.payments%ROWTYPE;
  v_orig          numeric;
  v_new_remaining numeric;
  v_new_paid      numeric;
BEGIN
  SELECT * INTO v_parent
  FROM public.payments
  WHERE id = p_parent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'parent_not_found');
  END IF;

  IF v_parent.status NOT IN ('pending', 'overdue') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'parent_not_open', 'parent_status', v_parent.status);
  END IF;

  v_orig := COALESCE(v_parent.original_amount, v_parent.amount);
  v_new_remaining := ROUND(GREATEST(v_parent.amount - p_paid_amount, 0)::numeric, 2);
  v_new_paid := ROUND((COALESCE(v_parent.paid_amount, 0) + p_paid_amount)::numeric, 2);

  IF v_new_remaining <= 0.009 THEN
    -- Saldo zerado por tentativa filha já marcada como 'paid':
    -- fecha o pai com valor 0 e status 'cancelled' para não duplicar o valor no faturamento
    UPDATE public.payments
    SET original_amount = v_orig,
        paid_amount = v_new_paid,
        amount = 0,
        status = 'cancelled',
        paid_at = COALESCE(p_paid_at, now())
    WHERE id = v_parent.id;
  ELSE
    UPDATE public.payments
    SET original_amount = v_orig,
        paid_amount = v_new_paid,
        amount = v_new_remaining,
        status = 'pending'
    WHERE id = v_parent.id;
  END IF;

  RETURN jsonb_build_object(
    'applied', true,
    'original_amount', v_orig,
    'paid_amount', v_new_paid,
    'remaining_amount', v_new_remaining
  );
END;
$$;

-- ── Trigger BEFORE: quando pagamento vinculado a guia pai vira 'paid', abate saldo ──
CREATE OR REPLACE FUNCTION public.fn_apply_partial_payment_before_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_payment_id IS NOT NULL
     AND NEW.status = 'paid'
     AND COALESCE(NEW.partial_applied, false) = false
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid' OR COALESCE(OLD.partial_applied, false) = false)
  THEN
    PERFORM public.internal_deduct_parent_payment(
      NEW.parent_payment_id,
      NEW.amount,
      COALESCE(NEW.paid_at, now())
    );
    NEW.is_partial_attempt := false;
    NEW.partial_applied := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_partial_payment_before_paid ON public.payments;
CREATE TRIGGER trg_apply_partial_payment_before_paid
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_apply_partial_payment_before_paid();

-- ── Trigger AFTER: cancela tentativas QR antigas e garante NF para parcial pago ──
CREATE OR REPLACE FUNCTION public.fn_finalize_partial_payment_after_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_exists boolean := false;
  v_invoice_number text;
BEGIN
  IF NEW.parent_payment_id IS NOT NULL
     AND NEW.status = 'paid'
     AND COALESCE(NEW.partial_applied, false) = true
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
  THEN
    -- Cancela outras tentativas pendentes antigas da mesma cobrança pai
    UPDATE public.payments
    SET status = 'cancelled',
        is_partial_attempt = true
    WHERE parent_payment_id = NEW.parent_payment_id
      AND id <> NEW.id
      AND status = 'pending'
      AND is_partial_attempt = true;

    -- Garante NF para esta parcela paga caso ainda não exista
    IF NEW.client_id IS NOT NULL AND NEW.amount > 0 THEN
      SELECT EXISTS(
        SELECT 1 FROM public.invoices WHERE payment_id = NEW.id
      ) INTO v_invoice_exists;

      IF NOT v_invoice_exists THEN
        v_invoice_number :=
          'PARC-' ||
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
          '-' ||
          upper(right(NEW.id::text, 4));

        INSERT INTO public.invoices (
          payment_id, client_id, number, amount, status, description
        ) VALUES (
          NEW.id,
          NEW.client_id,
          v_invoice_number,
          NEW.amount,
          'issued',
          COALESCE(NEW.description, 'Pagamento parcial')
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_partial_payment_after_paid ON public.payments;
CREATE TRIGGER trg_finalize_partial_payment_after_paid
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_finalize_partial_payment_after_paid();

-- ── RPC 1 (Admin): registra pagamento parcial manual em 1 transação atômica ──
CREATE OR REPLACE FUNCTION public.apply_partial_payment(
  p_parent_payment_id uuid,
  p_paid_amount       numeric,
  p_payment_method    text DEFAULT 'PIX',
  p_description       text DEFAULT NULL,
  p_paid_at           timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent         public.payments%ROWTYPE;
  v_paid_ts        timestamptz := COALESCE(p_paid_at, now());
  v_method         text := COALESCE(NULLIF(btrim(p_payment_method), ''), 'PIX');
  v_orig           numeric;
  v_new_remaining  numeric;
  v_new_paid_total numeric;
  v_child          public.payments%ROWTYPE;
  v_child_desc     text;
  v_invoice_exists boolean := false;
  v_invoice_number text;
BEGIN
  SELECT * INTO v_parent
  FROM public.payments
  WHERE id = p_parent_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada';
  END IF;

  IF v_parent.status NOT IN ('pending', 'overdue') THEN
    RAISE EXCEPTION 'Esta cobrança não está mais em aberto';
  END IF;

  IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor pago maior que zero';
  END IF;

  IF p_paid_amount > v_parent.amount + 0.01 THEN
    RAISE EXCEPTION 'O valor pago não pode ser maior que o saldo em aberto (R$ %)', ROUND(v_parent.amount::numeric, 2);
  END IF;

  v_orig := COALESCE(v_parent.original_amount, v_parent.amount);

  -- Se quitou 100% do saldo em aberto, marca a própria guia como paga
  IF p_paid_amount >= v_parent.amount - 0.009 THEN
    UPDATE public.payments
    SET status = 'paid',
        payment_method = v_method,
        paid_at = v_paid_ts,
        original_amount = v_orig,
        paid_amount = ROUND((COALESCE(v_parent.paid_amount, 0) + v_parent.amount)::numeric, 2)
    WHERE id = v_parent.id
    RETURNING * INTO v_parent;

    UPDATE public.payments
    SET status = 'cancelled',
        is_partial_attempt = true
    WHERE parent_payment_id = v_parent.id
      AND status = 'pending'
      AND is_partial_attempt = true;

    IF v_parent.client_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM public.invoices WHERE payment_id = v_parent.id) INTO v_invoice_exists;
      IF NOT v_invoice_exists THEN
        v_invoice_number :=
          'NF-' ||
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
          '-' ||
          upper(right(v_parent.id::text, 4));
        INSERT INTO public.invoices (
          payment_id, client_id, number, amount, status, description
        ) VALUES (
          v_parent.id,
          v_parent.client_id,
          v_invoice_number,
          v_parent.amount,
          'issued',
          COALESCE(v_parent.description, 'Pagamento quitado')
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'settled', true,
      'paid_payment_id', v_parent.id,
      'parent_payment_id', v_parent.id,
      'original_amount', v_orig,
      'paid_amount', v_parent.paid_amount,
      'remaining_amount', 0
    );
  END IF;

  -- Pagamento parcial real: abate do pai e cria nova transação PAGA
  v_new_remaining := ROUND((v_parent.amount - p_paid_amount)::numeric, 2);
  v_new_paid_total := ROUND((COALESCE(v_parent.paid_amount, 0) + p_paid_amount)::numeric, 2);

  UPDATE public.payments
  SET original_amount = v_orig,
      paid_amount = v_new_paid_total,
      amount = v_new_remaining,
      status = 'pending'
  WHERE id = v_parent.id;

  v_child_desc := COALESCE(
    NULLIF(btrim(p_description), ''),
    'Pagamento parcial (R$ ' ||
      REPLACE(TO_CHAR(p_paid_amount, 'FM9999990.00'), '.', ',') ||
      ' de R$ ' ||
      REPLACE(TO_CHAR(v_orig, 'FM9999990.00'), '.', ',') ||
      ') - ' || COALESCE(NULLIF(btrim(v_parent.description), ''), 'Cobrança avulsa')
  );

  INSERT INTO public.payments (
    client_id,
    subscription_id,
    parent_payment_id,
    is_partial_attempt,
    partial_applied,
    amount,
    status,
    payment_method,
    description,
    paid_at
  ) VALUES (
    v_parent.client_id,
    v_parent.subscription_id,
    v_parent.id,
    false,
    true, -- Já deduzido acima nesta transação atômica
    ROUND(p_paid_amount::numeric, 2),
    'paid',
    v_method,
    v_child_desc,
    v_paid_ts
  )
  RETURNING * INTO v_child;

  -- Cancela tentativas QR Code parciais antigas não pagas da mesma guia
  UPDATE public.payments
  SET status = 'cancelled',
      is_partial_attempt = true
  WHERE parent_payment_id = v_parent.id
    AND id <> v_child.id
    AND status = 'pending'
    AND is_partial_attempt = true;

  -- Emite nota fiscal da parcela paga
  IF v_child.client_id IS NOT NULL THEN
    v_invoice_number :=
      'PARC-' ||
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
      '-' ||
      upper(right(v_child.id::text, 4));

    INSERT INTO public.invoices (
      payment_id, client_id, number, amount, status, description
    ) VALUES (
      v_child.id,
      v_child.client_id,
      v_invoice_number,
      v_child.amount,
      'issued',
      v_child.description
    );
  END IF;

  RETURN jsonb_build_object(
    'settled', false,
    'paid_payment_id', v_child.id,
    'parent_payment_id', v_parent.id,
    'original_amount', v_orig,
    'paid_amount', v_new_paid_total,
    'remaining_amount', v_new_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_partial_payment(uuid, numeric, text, text, timestamptz)
  TO authenticated, service_role;

-- ── RPC 2 (Portal do Cliente): vincula QR Code parcial gerado ao pagamento pai ──
CREATE OR REPLACE FUNCTION public.link_partial_payment_attempt(
  p_parent_payment_id uuid,
  p_transaction_id    text,
  p_client_id         uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent public.payments%ROWTYPE;
  v_child  public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_parent
  FROM public.payments
  WHERE id = p_parent_payment_id
    AND client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'parent_not_found');
  END IF;

  SELECT * INTO v_child
  FROM public.payments
  WHERE transaction_id = btrim(p_transaction_id)
    AND client_id = p_client_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'child_not_found');
  END IF;

  IF v_child.id = v_parent.id THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'same_row');
  END IF;

  -- Cancela outras tentativas pendentes antigas não-pagas deste pai
  UPDATE public.payments
  SET status = 'cancelled'
  WHERE parent_payment_id = v_parent.id
    AND id <> v_child.id
    AND status = 'pending'
    AND is_partial_attempt = true;

  UPDATE public.payments
  SET parent_payment_id = v_parent.id,
      is_partial_attempt = (v_child.status <> 'paid')
  WHERE id = v_child.id
  RETURNING * INTO v_child;

  -- Caso raríssimo em que o pagamento já entrou como 'paid' antes do vínculo
  IF v_child.status = 'paid' AND COALESCE(v_child.partial_applied, false) = false THEN
    UPDATE public.payments
    SET status = 'paid',
        is_partial_attempt = false
    WHERE id = v_child.id;
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'child_id', v_child.id,
    'parent_id', v_parent.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_partial_payment_attempt(uuid, text, uuid)
  TO anon, authenticated, service_role;

-- ── RPC 3 (Portal do Cliente): confirma PIX parcial por transaction_id se webhook atrasar ──
CREATE OR REPLACE FUNCTION public.confirm_partial_payment_by_tx(
  p_transaction_id text,
  p_client_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_child
  FROM public.payments
  WHERE transaction_id = btrim(p_transaction_id)
    AND client_id = p_client_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'not_found');
  END IF;

  IF v_child.status <> 'paid' THEN
    UPDATE public.payments
    SET status = 'paid',
        paid_at = COALESCE(paid_at, now()),
        is_partial_attempt = false
    WHERE id = v_child.id
    RETURNING * INTO v_child;
  END IF;

  RETURN jsonb_build_object(
    'confirmed', true,
    'payment_id', v_child.id,
    'parent_payment_id', v_child.parent_payment_id,
    'partial_applied', v_child.partial_applied
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_partial_payment_by_tx(text, uuid)
  TO anon, authenticated, service_role;

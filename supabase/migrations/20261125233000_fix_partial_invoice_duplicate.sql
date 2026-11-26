-- ============================================================================
-- Fix: Evita erro "duplicate key value violates unique constraint invoices_number_key"
-- ao registrar pagamento parcial via apply_partial_payment.
-- ============================================================================
-- Causa raiz: o trigger AFTER INSERT (trg_finalize_partial_payment_after_paid)
-- ja emitia a NF da parcela logo apos o INSERT em public.payments, e em seguida
-- apply_partial_payment tentava inserir a mesma NF novamente.
-- Alem disso, aumentamos a entropia do sufixo para 8 chars + ON CONFLICT DO NOTHING.
-- ============================================================================

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
    -- Cancela outras tentativas pendentes antigas da mesma cobranca pai
    UPDATE public.payments
    SET status = 'cancelled',
        is_partial_attempt = true
    WHERE parent_payment_id = NEW.parent_payment_id
      AND id <> NEW.id
      AND status = 'pending'
      AND is_partial_attempt = true;

    -- Garante NF para esta parcela paga caso ainda nao exista
    IF NEW.client_id IS NOT NULL AND NEW.amount > 0 THEN
      SELECT EXISTS(
        SELECT 1 FROM public.invoices WHERE payment_id = NEW.id
      ) INTO v_invoice_exists;

      IF NOT v_invoice_exists THEN
        v_invoice_number :=
          'PARC-' ||
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
          '-' ||
          upper(left(replace(NEW.id::text, '-', ''), 8));

        INSERT INTO public.invoices (
          payment_id, client_id, number, amount, status, description
        ) VALUES (
          NEW.id,
          NEW.client_id,
          v_invoice_number,
          NEW.amount,
          'issued',
          COALESCE(NEW.description, 'Pagamento parcial')
        )
        ON CONFLICT (number) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

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

  -- Se quitou 100% do saldo em aberto, marca a propria guia como paga
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
          upper(left(replace(v_parent.id::text, '-', ''), 8));
        INSERT INTO public.invoices (
          payment_id, client_id, number, amount, status, description
        ) VALUES (
          v_parent.id,
          v_parent.client_id,
          v_invoice_number,
          v_parent.amount,
          'issued',
          COALESCE(v_parent.description, 'Pagamento quitado')
        )
        ON CONFLICT (number) DO NOTHING;
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

  -- Pagamento parcial real: abate do pai e cria nova transacao PAGA
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
    true, -- Ja deduzido acima nesta transacao atomica
    ROUND(p_paid_amount::numeric, 2),
    'paid',
    v_method,
    v_child_desc,
    v_paid_ts
  )
  RETURNING * INTO v_child;

  -- Cancela tentativas QR Code parciais antigas nao pagas da mesma guia
  UPDATE public.payments
  SET status = 'cancelled',
      is_partial_attempt = true
  WHERE parent_payment_id = v_parent.id
    AND id <> v_child.id
    AND status = 'pending'
    AND is_partial_attempt = true;

  -- Emite NF da parcela paga somente se o trigger AFTER INSERT ainda nao emitiu
  IF v_child.client_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.invoices WHERE payment_id = v_child.id) INTO v_invoice_exists;
    IF NOT v_invoice_exists THEN
      v_invoice_number :=
        'PARC-' ||
        to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
        '-' ||
        upper(left(replace(v_child.id::text, '-', ''), 8));

      INSERT INTO public.invoices (
        payment_id, client_id, number, amount, status, description
      ) VALUES (
        v_child.id,
        v_child.client_id,
        v_invoice_number,
        v_child.amount,
        'issued',
        v_child.description
      )
      ON CONFLICT (number) DO NOTHING;
    END IF;
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

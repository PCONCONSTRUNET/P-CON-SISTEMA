-- ============================================================================
-- Migration: Link de Pagamento para saldo pendente / restante em aberto
-- Permite criar um link avulso (/pagar/...) para qualquer cobrança em aberto
-- (ou para o saldo restante de uma cobrança parcial), quitando/abatendo a
-- cobrança alvo automaticamente quando pago via PIX ou Cartão.
-- ============================================================================

ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS target_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_links_target_payment_id
  ON public.payment_links(target_payment_id)
  WHERE target_payment_id IS NOT NULL;

-- ── RPC: Cria link de pagamento para uma cobrança em aberto (ou parte dela) ──
CREATE OR REPLACE FUNCTION public.create_payment_link_for_open_payment(
  p_payment_id       uuid,
  p_amount           numeric DEFAULT NULL,
  p_title            text DEFAULT NULL,
  p_description      text DEFAULT NULL,
  p_allow_pix        boolean DEFAULT true,
  p_allow_card       boolean DEFAULT true,
  p_max_installments integer DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment      public.payments%ROWTYPE;
  v_client       public.clients%ROWTYPE;
  v_prev_link    public.payment_links%ROWTYPE;
  v_link         public.payment_links%ROWTYPE;
  v_amount       numeric;
  v_title        text;
  v_description  text;
  v_token        text;
  v_installments integer := LEAST(GREATEST(COALESCE(p_max_installments, 4), 1), 4);
  v_payer_name   text;
  v_payer_doc    text;
  v_payer_email  text;
  v_payer_phone  text;
BEGIN
  IF COALESCE(p_allow_pix, false) = false AND COALESCE(p_allow_card, false) = false THEN
    RAISE EXCEPTION 'Ative pelo menos PIX ou Cartão.';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada.';
  END IF;

  IF v_payment.status NOT IN ('pending', 'overdue') THEN
    RAISE EXCEPTION 'Esta cobrança não está mais em aberto.';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, v_payment.amount)::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.';
  END IF;

  IF v_amount > v_payment.amount + 0.01 THEN
    RAISE EXCEPTION 'O valor do link não pode ser maior que o saldo em aberto (R$ %).', ROUND(v_payment.amount::numeric, 2);
  END IF;

  IF v_payment.client_id IS NOT NULL THEN
    SELECT * INTO v_client
    FROM public.clients
    WHERE id = v_payment.client_id
    LIMIT 1;
  END IF;

  IF v_payment.payment_link_id IS NOT NULL THEN
    SELECT * INTO v_prev_link
    FROM public.payment_links
    WHERE id = v_payment.payment_link_id
    LIMIT 1;
  END IF;

  v_title := COALESCE(
    NULLIF(btrim(p_title), ''),
    NULLIF(btrim(v_payment.description), ''),
    'Cobrança P-CON'
  );

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  IF v_description IS NULL AND COALESCE(v_payment.paid_amount, 0) > 0 THEN
    v_description := 'Saldo restante em aberto (Total: R$ ' ||
      REPLACE(TO_CHAR(COALESCE(v_payment.original_amount, v_payment.amount + v_payment.paid_amount), 'FM9999990.00'), '.', ',') ||
      ' · Pago: R$ ' ||
      REPLACE(TO_CHAR(v_payment.paid_amount, 'FM9999990.00'), '.', ',') || ')';
  END IF;

  v_payer_name := COALESCE(NULLIF(btrim(v_client.name), ''), NULLIF(btrim(v_prev_link.payer_name), ''));
  v_payer_doc := COALESCE(NULLIF(btrim(v_client.document), ''), NULLIF(btrim(v_prev_link.payer_document), ''));
  v_payer_email := COALESCE(NULLIF(btrim(v_client.email), ''), NULLIF(btrim(v_prev_link.payer_email), ''));
  v_payer_phone := COALESCE(NULLIF(btrim(v_client.phone), ''), NULLIF(btrim(v_prev_link.payer_phone), ''));

  v_token := public.generate_payment_link_token(v_title);

  INSERT INTO public.payment_links (
    token,
    title,
    description,
    amount,
    original_amount,
    allow_pix,
    allow_card,
    max_installments,
    status,
    client_id,
    payer_name,
    payer_document,
    payer_email,
    payer_phone,
    target_payment_id
  ) VALUES (
    v_token,
    v_title,
    v_description,
    v_amount,
    CASE
      WHEN v_amount < v_payment.amount - 0.009 THEN ROUND(v_payment.amount::numeric, 2)
      ELSE NULL
    END,
    COALESCE(p_allow_pix, true),
    COALESCE(p_allow_card, true),
    v_installments,
    'pending',
    v_payment.client_id,
    v_payer_name,
    v_payer_doc,
    v_payer_email,
    v_payer_phone,
    v_payment.id
  )
  RETURNING * INTO v_link;

  RETURN jsonb_build_object('link', row_to_json(v_link));
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_link_for_open_payment(
  uuid, numeric, text, text, boolean, boolean, integer
) TO authenticated, service_role;

-- ── Atualiza complete_payment_link para abater target_payment_id quando aplicável ──
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
  v_payment_row    public.payments%ROWTYPE;
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
    SELECT * INTO v_payment_row
    FROM public.payments
    WHERE id = v_payment_id
    FOR UPDATE;

    IF FOUND THEN
      -- Se esse link apontava para uma cobrança em aberto (target_payment_id) e foi gerado
      -- um pagamento separado (ex: Cartão com taxa ou valor parcial menor), vincula para abater o pai
      IF v_link.target_payment_id IS NOT NULL
         AND v_link.target_payment_id <> v_payment_row.id
         AND v_payment_row.parent_payment_id IS NULL
      THEN
        UPDATE public.payments
        SET payment_link_id = v_link.id,
            parent_payment_id = v_link.target_payment_id,
            amount = LEAST(v_payment_row.amount, v_link.amount)
        WHERE id = v_payment_row.id;
      ELSE
        UPDATE public.payments
        SET payment_link_id = CASE
              WHEN v_payment_row.id = v_link.target_payment_id THEN v_link.id
              ELSE COALESCE(payment_link_id, v_link.id)
            END,
            paid_amount = CASE
              WHEN v_payment_row.id = v_link.target_payment_id
                   AND v_payment_row.status = 'paid'
                   AND v_payment_row.original_amount IS NOT NULL
                THEN GREATEST(COALESCE(v_payment_row.paid_amount, 0), v_payment_row.original_amount)
              ELSE paid_amount
            END
        WHERE id = v_payment_row.id;
      END IF;
    END IF;

    IF v_link.client_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.invoices WHERE payment_id = v_payment_id
      ) INTO v_invoice_exists;

      IF NOT v_invoice_exists THEN
        v_invoice_number :=
          'NF-' ||
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
          '-' ||
          upper(left(replace(v_payment_id::text, '-', ''), 8));

        INSERT INTO public.invoices (
          payment_id, client_id, number, amount, status, description
        ) VALUES (
          v_payment_id,
          v_link.client_id,
          v_invoice_number,
          v_link.amount,
          'issued',
          v_link.title
        )
        ON CONFLICT (number) DO NOTHING;
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

-- ── Atualiza trigger quando pagamento vira 'paid' (webhook/check-status) ──
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

  -- 1. Prioriza link aguardando pagamento criado diretamente para esta cobrança (target_payment_id)
  SELECT * INTO v_link
  FROM public.payment_links
  WHERE target_payment_id = NEW.id
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  -- 2. Caso contrário, busca por payment_link_id direto (quando não já quitado)
  IF v_link.id IS NULL AND NEW.payment_link_id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.payment_links
    WHERE id = NEW.payment_link_id
      AND status <> 'paid'
    LIMIT 1;
  END IF;

  -- 3. Fallback por client_id + título/valor
  IF v_link.id IS NULL AND NEW.subscription_id IS NULL AND NEW.client_id IS NOT NULL THEN
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

    -- Se esse link era para uma cobrança em aberto (target_payment_id) mas gerou linha separada,
    -- vincula/abate o pagamento pai automaticamente
    IF v_link.target_payment_id IS NOT NULL
       AND v_link.target_payment_id <> NEW.id
       AND NEW.parent_payment_id IS NULL
       AND COALESCE(NEW.partial_applied, false) = false
    THEN
      UPDATE public.payments
      SET parent_payment_id = v_link.target_payment_id,
          amount = LEAST(NEW.amount, v_link.amount)
      WHERE id = NEW.id;
    ELSIF v_link.target_payment_id = NEW.id AND NEW.original_amount IS NOT NULL THEN
      -- Reutilizou exatamente a guia do saldo restante: completa paid_amount = original_amount
      UPDATE public.payments
      SET paid_amount = GREATEST(COALESCE(paid_amount, 0), original_amount),
          payment_link_id = v_link.id
      WHERE id = NEW.id;
    END IF;

    IF v_link.target_payment_id IS NULL
       AND v_link.original_amount IS NOT NULL
       AND v_link.original_amount > v_link.amount + 0.009
       AND v_link.client_id IS NOT NULL
    THEN
      PERFORM public.internal_sync_payment_link_partial_balance(v_link.id);
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

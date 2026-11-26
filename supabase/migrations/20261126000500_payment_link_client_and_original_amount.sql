-- ============================================================================
-- Migration: Vincular Cliente + Valor Original (Parcial) em Links de Pagamento
--            + Estorno automático ao excluir pagamento parcial em Pagamentos
-- ============================================================================

ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS balance_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_links_balance_payment_id
  ON public.payment_links(balance_payment_id)
  WHERE balance_payment_id IS NOT NULL;

-- ── Trigger AFTER DELETE em payments: reverte saldo do pai se excluir parcial paga ──
CREATE OR REPLACE FUNCTION public.fn_revert_partial_payment_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent          public.payments%ROWTYPE;
  v_other_paid      numeric := 0;
  v_restored_amount numeric;
BEGIN
  -- Limpa vínculos no próprio payment_links se o pagamento removido era referência
  UPDATE public.payment_links
  SET payment_id = CASE WHEN payment_id = OLD.id THEN NULL ELSE payment_id END,
      balance_payment_id = CASE WHEN balance_payment_id = OLD.id THEN NULL ELSE balance_payment_id END
  WHERE payment_id = OLD.id OR balance_payment_id = OLD.id;

  IF OLD.parent_payment_id IS NOT NULL THEN
    -- Remove NF PARC- órfã gerada automaticamente apenas para essa parcela removida
    DELETE FROM public.invoices
    WHERE payment_id = OLD.id
      AND number LIKE 'PARC-%';

    IF OLD.status = 'paid' AND COALESCE(OLD.partial_applied, false) = true THEN
      SELECT * INTO v_parent
      FROM public.payments
      WHERE id = OLD.parent_payment_id
      FOR UPDATE;

      IF FOUND THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_other_paid
        FROM public.payments
        WHERE parent_payment_id = v_parent.id
          AND id <> OLD.id
          AND status = 'paid'
          AND COALESCE(partial_applied, false) = true;

        v_restored_amount := ROUND((
          CASE
            WHEN v_parent.original_amount IS NOT NULL
              THEN GREATEST(v_parent.original_amount - v_other_paid, 0)
            ELSE GREATEST(v_parent.amount + OLD.amount, 0)
          END
        )::numeric, 2);

        UPDATE public.payments
        SET amount = v_restored_amount,
            paid_amount = ROUND(v_other_paid::numeric, 2),
            original_amount = CASE
              WHEN v_other_paid <= 0.009 THEN NULL
              ELSE v_parent.original_amount
            END,
            status = CASE
              WHEN v_parent.status IN ('cancelled', 'paid') AND v_restored_amount > 0.009 THEN 'pending'
              ELSE v_parent.status
            END,
            paid_at = CASE
              WHEN v_parent.status IN ('cancelled', 'paid') AND v_restored_amount > 0.009 THEN NULL
              ELSE v_parent.paid_at
            END
        WHERE id = v_parent.id;
      END IF;
    END IF;
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_partial_payment_on_delete ON public.payments;
CREATE TRIGGER trg_revert_partial_payment_on_delete
  AFTER DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_revert_partial_payment_on_delete();

-- ── Helper interno: vincula saldo restante caso link tenha original_amount > amount ──
CREATE OR REPLACE FUNCTION public.internal_sync_payment_link_partial_balance(
  p_link_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link         public.payment_links%ROWTYPE;
  v_paid_payment public.payments%ROWTYPE;
  v_balance      public.payments%ROWTYPE;
  v_other_paid   numeric := 0;
  v_paid_total   numeric := 0;
  v_new_rem      numeric := 0;
  v_has_others   boolean := false;
BEGIN
  SELECT * INTO v_link
  FROM public.payment_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'link_not_found');
  END IF;

  -- Busca o pagamento ligado ao link
  SELECT * INTO v_paid_payment
  FROM public.payments
  WHERE id = v_link.payment_id
     OR payment_link_id = v_link.id
  ORDER BY (id = v_link.payment_id) DESC,
           (status = 'paid') DESC,
           created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Mantém payment_links.payment_id e payments.client_id alinhados
  IF v_paid_payment.id IS NOT NULL THEN
    IF v_link.payment_id IS NULL THEN
      UPDATE public.payment_links SET payment_id = v_paid_payment.id WHERE id = v_link.id;
      v_link.payment_id := v_paid_payment.id;
    END IF;

    IF v_paid_payment.client_id IS DISTINCT FROM v_link.client_id THEN
      UPDATE public.payments SET client_id = v_link.client_id WHERE id = v_paid_payment.id;
      v_paid_payment.client_id := v_link.client_id;
    END IF;

    UPDATE public.invoices
    SET client_id = v_link.client_id
    WHERE payment_id = v_paid_payment.id
      AND v_link.client_id IS NOT NULL
      AND client_id IS DISTINCT FROM v_link.client_id;
  END IF;

  -- Se o link não está pago ainda, nada de saldo restante para lançar agora
  IF v_link.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'balance_payment_id', v_link.balance_payment_id);
  END IF;

  -- Se original_amount > amount, cria ou atualiza a cobrança mãe pendente do restante
  IF v_link.original_amount IS NOT NULL AND v_link.original_amount > v_link.amount + 0.009 THEN
    IF v_link.client_id IS NULL THEN
      RAISE EXCEPTION 'Vincule um cliente cadastrado para lançar o saldo restante na área do cliente.';
    END IF;

    IF v_link.balance_payment_id IS NOT NULL THEN
      SELECT * INTO v_balance
      FROM public.payments
      WHERE id = v_link.balance_payment_id
      FOR UPDATE;
    END IF;

    IF v_balance.id IS NOT NULL AND v_balance.status IN ('pending', 'overdue') THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_other_paid
      FROM public.payments
      WHERE parent_payment_id = v_balance.id
        AND id <> COALESCE(v_paid_payment.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status = 'paid'
        AND COALESCE(partial_applied, false) = true;

      v_paid_total := ROUND((v_other_paid + v_link.amount)::numeric, 2);
      v_new_rem := ROUND(GREATEST(v_link.original_amount - v_paid_total, 0)::numeric, 2);

      UPDATE public.payments
      SET client_id = v_link.client_id,
          original_amount = ROUND(v_link.original_amount::numeric, 2),
          paid_amount = v_paid_total,
          amount = v_new_rem,
          status = CASE WHEN v_new_rem <= 0.009 THEN 'paid' ELSE 'pending' END,
          description = v_link.title
      WHERE id = v_balance.id
      RETURNING * INTO v_balance;
    ELSE
      INSERT INTO public.payments (
        client_id,
        subscription_id,
        payment_link_id,
        amount,
        original_amount,
        paid_amount,
        status,
        payment_method,
        description
      ) VALUES (
        v_link.client_id,
        NULL,
        v_link.id,
        ROUND((v_link.original_amount - v_link.amount)::numeric, 2),
        ROUND(v_link.original_amount::numeric, 2),
        ROUND(v_link.amount::numeric, 2),
        'pending',
        COALESCE(v_link.payment_method, v_paid_payment.payment_method, 'PIX'),
        v_link.title
      )
      RETURNING * INTO v_balance;
    END IF;

    IF v_paid_payment.id IS NOT NULL AND v_paid_payment.id <> v_balance.id THEN
      UPDATE public.payments
      SET parent_payment_id = v_balance.id,
          partial_applied = true,
          is_partial_attempt = false,
          client_id = v_link.client_id
      WHERE id = v_paid_payment.id;
    END IF;

    UPDATE public.payment_links
    SET balance_payment_id = v_balance.id
    WHERE id = v_link.id;

    RETURN jsonb_build_object(
      'ok', true,
      'balance_payment_id', v_balance.id,
      'remaining_amount', v_balance.amount,
      'paid_amount', v_balance.paid_amount,
      'original_amount', v_balance.original_amount
    );
  ELSE
    -- Sem valor original maior que valor pago: remove vínculo de saldo se existia
    IF v_link.balance_payment_id IS NOT NULL THEN
      SELECT * INTO v_balance
      FROM public.payments
      WHERE id = v_link.balance_payment_id
      FOR UPDATE;

      IF v_paid_payment.id IS NOT NULL AND v_paid_payment.parent_payment_id = v_link.balance_payment_id THEN
        UPDATE public.payments
        SET parent_payment_id = NULL,
            partial_applied = false
        WHERE id = v_paid_payment.id;
      END IF;

      UPDATE public.payment_links
      SET balance_payment_id = NULL
      WHERE id = v_link.id;

      IF v_balance.id IS NOT NULL AND v_balance.status IN ('pending', 'overdue') THEN
        SELECT EXISTS(
          SELECT 1 FROM public.payments
          WHERE parent_payment_id = v_balance.id
            AND status = 'paid'
        ) INTO v_has_others;

        IF NOT v_has_others THEN
          DELETE FROM public.payments WHERE id = v_balance.id;
        END IF;
      END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'balance_payment_id', NULL);
  END IF;
END;
$$;

-- ── Atualiza trigger do payment_link para também criar saldo caso link já tenha original_amount ──
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

  -- Evita recursão caso esta linha seja o saldo pai recém-criado
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

    IF v_link.original_amount IS NOT NULL AND v_link.original_amount > v_link.amount + 0.009 AND v_link.client_id IS NOT NULL THEN
      PERFORM public.internal_sync_payment_link_partial_balance(v_link.id);
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- ── RPC pública para Admin: editar link (inclusive pago), vincular cliente e definir valor original ──
CREATE OR REPLACE FUNCTION public.configure_payment_link_billing(
  p_link_id          uuid,
  p_title            text DEFAULT NULL,
  p_description      text DEFAULT NULL,
  p_amount           numeric DEFAULT NULL,
  p_allow_pix        boolean DEFAULT NULL,
  p_allow_card       boolean DEFAULT NULL,
  p_max_installments integer DEFAULT NULL,
  p_client_id        uuid DEFAULT NULL,
  p_clear_client     boolean DEFAULT false,
  p_original_amount  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link            public.payment_links%ROWTYPE;
  v_client          public.clients%ROWTYPE;
  v_final_client_id uuid;
  v_effective_amount numeric;
  v_effective_orig   numeric;
  v_sync_res        jsonb;
BEGIN
  SELECT * INTO v_link
  FROM public.payment_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de pagamento não encontrado';
  END IF;

  v_effective_amount := CASE
    WHEN v_link.status = 'paid' THEN v_link.amount
    WHEN p_amount IS NOT NULL AND p_amount > 0 THEN ROUND(p_amount::numeric, 2)
    ELSE v_link.amount
  END;

  v_effective_orig := CASE
    WHEN p_original_amount IS NOT NULL AND p_original_amount > v_effective_amount + 0.009
      THEN ROUND(p_original_amount::numeric, 2)
    ELSE NULL
  END;

  IF p_clear_client THEN
    v_final_client_id := NULL;
  ELSIF p_client_id IS NOT NULL THEN
    SELECT * INTO v_client
    FROM public.clients
    WHERE id = p_client_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente selecionado não encontrado';
    END IF;
    v_final_client_id := v_client.id;
  ELSE
    v_final_client_id := v_link.client_id;
    IF v_final_client_id IS NOT NULL THEN
      SELECT * INTO v_client FROM public.clients WHERE id = v_final_client_id LIMIT 1;
    END IF;
  END IF;

  IF v_effective_orig IS NOT NULL AND v_link.status = 'paid' AND v_final_client_id IS NULL THEN
    RAISE EXCEPTION 'Vincule um cliente cadastrado para lançar o saldo restante na área do cliente.';
  END IF;

  UPDATE public.payment_links
  SET title = COALESCE(NULLIF(btrim(p_title), ''), title),
      description = CASE WHEN p_description IS NULL THEN description ELSE NULLIF(btrim(p_description), '') END,
      amount = v_effective_amount,
      allow_pix = COALESCE(p_allow_pix, allow_pix),
      allow_card = COALESCE(p_allow_card, allow_card),
      max_installments = COALESCE(p_max_installments, max_installments),
      client_id = v_final_client_id,
      payer_name = CASE
        WHEN p_clear_client THEN payer_name
        WHEN v_client.id IS NOT NULL THEN COALESCE(NULLIF(btrim(payer_name), ''), v_client.name)
        ELSE payer_name
      END,
      payer_document = CASE
        WHEN p_clear_client THEN payer_document
        WHEN v_client.id IS NOT NULL THEN COALESCE(NULLIF(btrim(payer_document), ''), v_client.document)
        ELSE payer_document
      END,
      payer_email = CASE
        WHEN p_clear_client THEN payer_email
        WHEN v_client.id IS NOT NULL THEN COALESCE(NULLIF(btrim(payer_email), ''), v_client.email)
        ELSE payer_email
      END,
      payer_phone = CASE
        WHEN p_clear_client THEN payer_phone
        WHEN v_client.id IS NOT NULL THEN COALESCE(NULLIF(btrim(payer_phone), ''), v_client.phone)
        ELSE payer_phone
      END,
      original_amount = v_effective_orig,
      updated_at = now()
  WHERE id = v_link.id
  RETURNING * INTO v_link;

  v_sync_res := public.internal_sync_payment_link_partial_balance(v_link.id);

  SELECT * INTO v_link FROM public.payment_links WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'link', row_to_json(v_link),
    'sync', v_sync_res
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.configure_payment_link_billing(
  uuid, text, text, numeric, boolean, boolean, integer, uuid, boolean, numeric
) TO authenticated, service_role;

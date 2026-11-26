-- ============================================================================
-- Migration: RPC finalize_card_payment_attempt
-- Normaliza valor líquido na tabela payments (sem inflar faturamento com juros MP)
-- e vincula/abate cobrança pai ou parcial quando pago com Cartão no Portal/Link.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_card_payment_attempt(
  p_transaction_id    text,
  p_client_id         uuid,
  p_base_amount       numeric,
  p_gross_amount      numeric DEFAULT NULL,
  p_installments      integer DEFAULT 1,
  p_parent_payment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child      public.payments%ROWTYPE;
  v_base_amt   numeric := ROUND(GREATEST(COALESCE(p_base_amount, 0), 0)::numeric, 2);
  v_gross_amt  numeric := ROUND(GREATEST(COALESCE(p_gross_amount, p_base_amount, 0), 0)::numeric, 2);
  v_note       text;
  v_new_desc   text;
BEGIN
  SELECT * INTO v_child
  FROM public.payments
  WHERE transaction_id = btrim(p_transaction_id)
    AND client_id = p_client_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  IF v_base_amt <= 0 THEN
    v_base_amt := v_child.amount;
  END IF;

  v_note := CASE
    WHEN v_gross_amt > v_base_amt + 0.01 THEN
      'Cartão ' || COALESCE(GREATEST(p_installments, 1), 1)::text || 'x (c/ taxa MP R$ ' ||
      REPLACE(TO_CHAR(v_gross_amt, 'FM9999990.00'), '.', ',') || ')'
    ELSE
      'Cartão ' || COALESCE(GREATEST(p_installments, 1), 1)::text || 'x'
  END;

  v_new_desc := CASE
    WHEN COALESCE(v_child.description, '') ILIKE '%Cartão%x%' THEN v_child.description
    WHEN NULLIF(btrim(v_child.description), '') IS NOT NULL THEN v_child.description || ' · ' || v_note
    ELSE v_note
  END;

  IF p_parent_payment_id IS NOT NULL AND p_parent_payment_id <> v_child.id THEN
    -- Vincula à cobrança pai (se já estiver 'paid', o trigger trg_apply_partial_payment_before_paid
    -- abate v_base_amt automaticamente e marca partial_applied = true)
    UPDATE public.payments
    SET parent_payment_id = p_parent_payment_id,
        amount = v_base_amt,
        description = v_new_desc,
        is_partial_attempt = (v_child.status <> 'paid')
    WHERE id = v_child.id
    RETURNING * INTO v_child;
  ELSE
    UPDATE public.payments
    SET amount = v_base_amt,
        description = v_new_desc
    WHERE id = v_child.id
    RETURNING * INTO v_child;
  END IF;

  UPDATE public.invoices
  SET amount = v_base_amt,
      description = v_new_desc
  WHERE payment_id = v_child.id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_child.id,
    'amount', v_child.amount,
    'parent_payment_id', v_child.parent_payment_id,
    'partial_applied', v_child.partial_applied
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_card_payment_attempt(
  text, uuid, numeric, numeric, integer, uuid
) TO anon, authenticated, service_role;

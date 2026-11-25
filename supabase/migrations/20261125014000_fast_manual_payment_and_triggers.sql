-- ============================================================================
-- Migration: Registro manual de pagamento em 1 transação (RPC) + correção
--            de nome do cliente na notificação e verificação de triggers
-- ============================================================================

-- 1. Corrigir fn_notify_payment_received() para buscar o nome por NEW.client_id
--    também em pagamentos avulsos/manuais (quando subscription_id IS NULL)
CREATE OR REPLACE FUNCTION public.fn_notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_client_id uuid;
  v_formatted_amount text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'paid') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid' OR OLD.status IS NULL)) THEN

    IF NEW.client_id IS NOT NULL THEN
      SELECT id, name INTO v_client_id, v_client_name
      FROM public.clients
      WHERE id = NEW.client_id
      LIMIT 1;
    ELSIF NEW.subscription_id IS NOT NULL THEN
      SELECT c.id, c.name INTO v_client_id, v_client_name
      FROM public.subscriptions s
      JOIN public.clients c ON c.id = s.client_id
      WHERE s.id = NEW.subscription_id
      LIMIT 1;
    END IF;

    v_formatted_amount := REPLACE(TO_CHAR(NEW.amount, 'FM9999990.00'), '.', ',');

    INSERT INTO public.admin_notifications (
      title,
      message,
      category,
      type,
      metadata
    ) VALUES (
      'Mensalidade Paga 💰',
      COALESCE(v_client_name, 'Cliente') || ' pagou R$ ' || v_formatted_amount || '.',
      'payments',
      'payment_received',
      jsonb_build_object(
        'payment_id', NEW.id,
        'client_id', COALESCE(v_client_id, NEW.client_id),
        'amount', NEW.amount
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Garantir que o push de admin_notifications nunca bloqueie a transação
CREATE OR REPLACE FUNCTION public.fn_push_on_admin_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'title', NEW.title,
      'message', NEW.message,
      'category', NEW.category,
      'type', NEW.type
    )
  );

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    PERFORM net.http_post(
      url := 'https://bevahgtmcdicyhjnrylk.supabase.co/functions/v1/send-push-notification',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := v_payload,
      timeout_milliseconds := 2000
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- 3. RPC atômica: registra pagamento manual + fatura em 1 única requisição HTTP
CREATE OR REPLACE FUNCTION public.register_manual_payment(
  p_client_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'PIX',
  p_description text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_payment public.payments%ROWTYPE;
  v_invoice_number text;
  v_desc text;
BEGIN
  SELECT name INTO v_client_name
  FROM public.clients
  WHERE id = p_client_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado';
  END IF;

  v_desc := COALESCE(NULLIF(btrim(p_description), ''), 'Pagamento manual de ' || v_client_name);

  INSERT INTO public.payments (
    client_id,
    amount,
    status,
    payment_method,
    description,
    paid_at
  ) VALUES (
    p_client_id,
    p_amount,
    'paid',
    COALESCE(NULLIF(btrim(p_payment_method), ''), 'PIX'),
    v_desc,
    COALESCE(p_paid_at, now())
  )
  RETURNING * INTO v_payment;

  v_invoice_number :=
    'MANUAL-' ||
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') ||
    '-' ||
    upper(right(v_payment.id::text, 4));

  INSERT INTO public.invoices (
    payment_id,
    client_id,
    number,
    amount,
    status,
    description
  ) VALUES (
    v_payment.id,
    p_client_id,
    v_invoice_number,
    v_payment.amount,
    'issued',
    v_payment.description
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'invoice_number', v_invoice_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_manual_payment(uuid, numeric, text, text, timestamptz)
  TO anon, authenticated, service_role;

-- ================================================================
-- Migration: Fix Admin Notifications for Payment Received and Expiry
-- ================================================================

-- ── 1. FIX GATILHO DE PAGAMENTO CONFIRMADO ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_client_id UUID;
  formatted_amount TEXT;
BEGIN
  -- Só notifica se o status mudou para 'paid' (ou foi inserido como 'paid')
  IF (TG_OP = 'INSERT' AND NEW.status = 'paid') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid' OR OLD.status IS NULL)) THEN
     
    -- Buscar o nome e ID do cliente através da assinatura associada ao pagamento
    SELECT c.id, c.name INTO v_client_id, v_client_name 
    FROM public.clients c
    JOIN public.subscriptions s ON s.client_id = c.id
    WHERE s.id = NEW.subscription_id;
    
    -- Formatando o valor no padrão brasileiro (ex: 150,00)
    formatted_amount := REPLACE(TO_CHAR(NEW.amount, 'FM9999990.00'), '.', ',');
    
    -- Inserir na tabela admin_notifications (o que disparará o webhook do OneSignal)
    INSERT INTO public.admin_notifications (
      title,
      message,
      category,
      type,
      metadata
    ) VALUES (
      'Mensalidade Paga 💰',
      COALESCE(v_client_name, 'Cliente') || ' pagou a mensalidade de R$ ' || formatted_amount || '.',
      'payments',
      'payment_received',
      jsonb_build_object(
        'payment_id', NEW.id,
        'client_id', v_client_id,
        'amount', NEW.amount
      )
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- ── 2. FIX ROTINA DIÁRIA DE ASSINATURAS EXPIRANDO ──────────────────
-- Adicionando verificações para 3 e 5 dias de vencimento
CREATE OR REPLACE FUNCTION public.fn_check_expiring_subscriptions_and_notify()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_record RECORD;
  today_date DATE;
  v_type TEXT;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Data de hoje no fuso horário de Brasília (BRT, America/Sao_Paulo)
  today_date := (timezone('America/Sao_Paulo', now()))::date;

  FOR sub_record IN
    SELECT 
      s.id AS subscription_id,
      s.value AS subscription_value,
      c.id AS client_id,
      c.name AS client_name,
      ((timezone('America/Sao_Paulo', s.next_payment))::date - today_date) AS days_remaining
    FROM public.subscriptions s
    JOIN public.clients c ON s.client_id = c.id
    WHERE s.status = 'active'
      -- next_payment hoje, em 3 dias ou em 5 dias
      AND ((timezone('America/Sao_Paulo', s.next_payment))::date IN (today_date, today_date + 3, today_date + 5))
  LOOP
    
    IF sub_record.days_remaining = 0 THEN
      v_type := 'subscription_expires_today';
      v_title := 'Assinatura Vence Hoje 📅';
      v_message := 'A assinatura de ' || sub_record.client_name || ' vence hoje.';
    ELSIF sub_record.days_remaining = 3 THEN
      v_type := 'subscription_expires_in_3_days';
      v_title := 'Assinatura Vence em 3 Dias ⏳';
      v_message := 'A assinatura de ' || sub_record.client_name || ' vence em 3 dias.';
    ELSIF sub_record.days_remaining = 5 THEN
      v_type := 'subscription_expires_in_5_days';
      v_title := 'Assinatura Vence em 5 Dias ⏳';
      v_message := 'A assinatura de ' || sub_record.client_name || ' vence em 5 dias.';
    END IF;

    -- Evitar notificações duplicadas para o mesmo tipo, dia e assinatura
    IF NOT EXISTS (
      SELECT 1 
      FROM public.admin_notifications
      WHERE type = v_type
        AND (metadata->>'subscription_id')::uuid = sub_record.subscription_id
        AND created_at::date = today_date
    ) THEN
      
      INSERT INTO public.admin_notifications (
        title,
        message,
        category,
        type,
        metadata
      ) VALUES (
        v_title,
        v_message,
        'payments',
        v_type,
        jsonb_build_object(
          'subscription_id', sub_record.subscription_id,
          'client_id', sub_record.client_id,
          'amount', sub_record.subscription_value,
          'days_remaining', sub_record.days_remaining
        )
      );
      
    END IF;
  END LOOP;
END;
$$;

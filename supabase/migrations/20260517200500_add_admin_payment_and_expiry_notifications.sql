-- ================================================================
-- Migration: Add Admin Notifications for Payment Received and Expiry Today
-- ================================================================
-- 1. Cria Trigger de Pagamento Confirmado na tabela payments
-- 2. Cria Função Diária de Assinaturas Vencendo Hoje
-- 3. Agenda a verificação diária via pg_cron
-- ================================================================

-- ── 1. GATILHO DE PAGAMENTO CONFIRMADO ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_name TEXT;
  formatted_amount TEXT;
BEGIN
  -- Só notifica se o status mudou para 'paid' (ou foi inserido como 'paid')
  IF (TG_OP = 'INSERT' AND NEW.status = 'paid') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid' OR OLD.status IS NULL)) THEN
     
    -- Buscar o nome do cliente
    SELECT name INTO client_name 
    FROM public.clients 
    WHERE id = NEW.client_id;
    
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
      COALESCE(client_name, 'Cliente') || ' pagou a mensalidade de R$ ' || formatted_amount || '.',
      'payments',
      'payment_received',
      jsonb_build_object(
        'payment_id', NEW.id,
        'client_id', NEW.client_id,
        'amount', NEW.amount
      )
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar Trigger AFTER INSERT OR UPDATE na tabela public.payments
DROP TRIGGER IF EXISTS trg_notify_payment_received ON public.payments;
CREATE TRIGGER trg_notify_payment_received
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_payment_received();

COMMENT ON TRIGGER trg_notify_payment_received ON public.payments
  IS 'Gera notificação administrativa em tempo real e push OneSignal quando uma fatura é paga.';


-- ── 2. ROTINA DIÁRIA DE ASSINATURAS EXPIRANDO HOJE ──────────────────
CREATE OR REPLACE FUNCTION public.fn_check_expiring_subscriptions_and_notify()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_record RECORD;
  today_date DATE;
BEGIN
  -- Data de hoje no fuso horário de Brasília (BRT, America/Sao_Paulo)
  today_date := (timezone('America/Sao_Paulo', now()))::date;

  FOR sub_record IN
    SELECT 
      s.id AS subscription_id,
      s.value AS subscription_value,
      c.id AS client_id,
      c.name AS client_name
    FROM public.subscriptions s
    JOIN public.clients c ON s.client_id = c.id
    WHERE s.status = 'active'
      -- next_payment no dia de hoje (considerando timezone de Brasília)
      AND (timezone('America/Sao_Paulo', s.next_payment))::date = today_date
  LOOP
    -- Evitar notificações duplicadas para o mesmo dia e assinatura
    IF NOT EXISTS (
      SELECT 1 
      FROM public.admin_notifications
      WHERE type = 'subscription_expires_today'
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
        'Assinatura Vence Hoje 📅',
        'A assinatura de ' || sub_record.client_name || ' vence hoje.',
        'payments',
        'subscription_expires_today',
        jsonb_build_object(
          'subscription_id', sub_record.subscription_id,
          'client_id', sub_record.client_id,
          'amount', sub_record.subscription_value
        )
      );
      
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_check_expiring_subscriptions_and_notify()
  IS 'Verifica assinaturas que vencem hoje no fuso BRT e gera push automático para o admin.';


-- ── 3. AGENDAR VERIFICAÇÃO DIÁRIA NO PG_CRON ───────────────────────
-- Remove o job antigo se existir
DO $$
BEGIN
  PERFORM cron.unschedule('daily-expiring-subscriptions-push');
EXCEPTION 
  WHEN others THEN 
    NULL;
END $$;

-- Agenda a nova rotina todos os dias às 11:05 UTC (08:05 BRT)
DO $$
BEGIN
  PERFORM cron.schedule(
    'daily-expiring-subscriptions-push',
    '5 11 * * *', -- 11:05 UTC (08:05 BRT)
    'SELECT public.fn_check_expiring_subscriptions_and_notify();'
  );
EXCEPTION 
  WHEN others THEN
    -- Se pg_cron não estiver habilitado/disponível, apenas exibe um warning sem travar
    RAISE WARNING 'Não foi possível agendar no pg_cron: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.notify_subscription_date_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tomorrow DATE;
  client_record RECORD;
  formatted_phone TEXT;
  message_text TEXT;
  formatted_value TEXT;
  next_payment_brt DATE;
  anon_jwt TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';
BEGIN
  IF OLD.next_payment IS DISTINCT FROM NEW.next_payment THEN
    tomorrow := (timezone('America/Sao_Paulo', now())::date + 1);
    next_payment_brt := (timezone('America/Sao_Paulo', NEW.next_payment))::date;

    IF next_payment_brt = tomorrow AND NEW.status = 'active' THEN
      SELECT id, name, phone INTO client_record
      FROM clients
      WHERE id = NEW.client_id;

      IF client_record.phone IS NOT NULL AND client_record.phone != '' THEN
        formatted_phone := regexp_replace(client_record.phone, '\D', '', 'g');
        IF NOT formatted_phone LIKE '55%' THEN
          formatted_phone := '55' || formatted_phone;
        END IF;

        formatted_value := REPLACE(TO_CHAR(NEW.value, 'FM999999990.00'), '.', ',');

        -- Message without link (link will be in the button)
        message_text := 'Ola ' || client_record.name || '! 💈' || chr(10) || chr(10) ||
          'Passando para lembrar que a fatura referente a sua assinatura ativa do *' || NEW.plan_name || '* no valor de *R$ ' || formatted_value || '* vence amanha.' || chr(10) || chr(10) ||
          'Qualquer duvida, estamos a disposicao.';

        PERFORM net.http_post(
          url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/whatsapp-send',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || anon_jwt
          ),
          body := jsonb_build_object(
            'phone', formatted_phone,
            'message', message_text,
            'clientId', client_record.id::TEXT,
            'type', 'subscription_date_change',
            'sendImage', true,
            'sendButton', true
          )
        );

        RAISE NOTICE 'WhatsApp D-1 reminder (BRT) sent to % (%) for subscription %', client_record.name, formatted_phone, NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
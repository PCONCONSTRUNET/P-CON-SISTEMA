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
  client_area_url TEXT := 'https://www.assinaturaspcon.sbs/cliente';
BEGIN
  -- Only proceed if next_payment was changed
  IF OLD.next_payment IS DISTINCT FROM NEW.next_payment THEN
    tomorrow := (CURRENT_DATE + INTERVAL '1 day')::DATE;
    
    -- Check if the new next_payment date is tomorrow
    IF NEW.next_payment::DATE = tomorrow AND NEW.status = 'active' THEN
      -- Get client info
      SELECT id, name, phone INTO client_record
      FROM clients
      WHERE id = NEW.client_id;
      
      -- Only proceed if client has a phone number
      IF client_record.phone IS NOT NULL AND client_record.phone != '' THEN
        -- Format phone number
        formatted_phone := regexp_replace(client_record.phone, '\D', '', 'g');
        IF NOT formatted_phone LIKE '55%' THEN
          formatted_phone := '55' || formatted_phone;
        END IF;
        
        -- Format value
        formatted_value := REPLACE(TO_CHAR(NEW.value, 'FM999999990.00'), '.', ',');
        
        -- Build message with client area link
        message_text := 'Ola ' || client_record.name || '! 💈' || E'\n\n' ||
          'Passando para lembrar que a fatura referente a sua assinatura ativa do *' || NEW.plan_name || '* no valor de *R$ ' || formatted_value || '* vence amanha.' || E'\n\n' ||
          '📱 *Acesse sua area do cliente:*' || E'\n' || client_area_url || E'\n\n' ||
          'Qualquer duvida, estamos a disposicao.';
        
        -- Send WhatsApp message via edge function using pg_net
        PERFORM net.http_post(
          url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/whatsapp-send',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4'
          ),
          body := jsonb_build_object(
            'phone', formatted_phone,
            'message', message_text,
            'clientId', client_record.id::TEXT,
            'type', 'subscription_date_change'
          )
        );
        
        -- Log the action
        RAISE NOTICE 'WhatsApp D-1 reminder sent to % (%) for subscription %', client_record.name, formatted_phone, NEW.id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
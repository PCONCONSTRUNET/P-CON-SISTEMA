CREATE OR REPLACE FUNCTION public.notify_subscription_date_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tomorrow DATE;
  client_record RECORD;
  template_record RECORD;
  formatted_phone TEXT;
  message_text TEXT;
  formatted_value TEXT;
  next_payment_brt DATE;
  send_image BOOLEAN;
  send_button BOOLEAN;
  image_url_val TEXT;
  button_text_val TEXT;
  button_url_val TEXT;
  http_body JSONB;
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
        -- Fetch template from database
        SELECT * INTO template_record
        FROM whatsapp_templates
        WHERE template_key = 'subscription_reminder' AND is_active = true
        LIMIT 1;

        formatted_phone := regexp_replace(client_record.phone, '\D', '', 'g');
        IF NOT formatted_phone LIKE '55%' THEN
          formatted_phone := '55' || formatted_phone;
        END IF;

        formatted_value := REPLACE(TO_CHAR(NEW.value, 'FM999999990.00'), '.', ',');

        -- Use template from DB or fallback
        IF template_record IS NOT NULL THEN
          message_text := template_record.message_template;
          message_text := REPLACE(message_text, '{{client_name}}', client_record.name);
          message_text := REPLACE(message_text, '{{plan_name}}', NEW.plan_name);
          message_text := REPLACE(message_text, '{{amount}}', 'R$ ' || formatted_value);
          send_image := (template_record.image_url IS NOT NULL AND template_record.image_url != '');
          send_button := template_record.button_enabled;
          image_url_val := template_record.image_url;
          button_text_val := template_record.button_text;
          button_url_val := template_record.button_url;
        ELSE
          message_text := 'Ola ' || client_record.name || '! 💈' || chr(10) || chr(10) ||
            'Passando para lembrar que a fatura referente a sua assinatura ativa do *' || NEW.plan_name || '* no valor de *R$ ' || formatted_value || '* vence amanha.' || chr(10) || chr(10) ||
            'Qualquer duvida, estamos a disposicao.';
          send_image := true;
          send_button := true;
          image_url_val := NULL;
          button_text_val := NULL;
          button_url_val := NULL;
        END IF;

        http_body := jsonb_build_object(
          'phone', formatted_phone,
          'message', message_text,
          'clientId', client_record.id::TEXT,
          'type', 'subscription_date_change',
          'sendImage', send_image,
          'sendButton', send_button
        );

        -- Add imageUrl if available
        IF image_url_val IS NOT NULL THEN
          http_body := http_body || jsonb_build_object('imageUrl', image_url_val);
        END IF;

        -- Add button info if available
        IF button_text_val IS NOT NULL THEN
          http_body := http_body || jsonb_build_object('buttonText', button_text_val, 'buttonUrl', button_url_val);
        END IF;

        PERFORM net.http_post(
          url := 'https://lcnaptefceboratxhzox.supabase.co/functions/v1/whatsapp-send',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || anon_jwt
          ),
          body := http_body
        );

        RAISE NOTICE 'WhatsApp D-1 reminder (BRT) sent to % (%) for subscription %', client_record.name, formatted_phone, NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
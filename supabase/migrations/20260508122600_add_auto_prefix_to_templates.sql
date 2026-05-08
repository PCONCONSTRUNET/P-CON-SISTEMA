-- Add "(Mensagem Automática)" prefix to all WhatsApp templates
UPDATE whatsapp_templates
SET message_template = '*(Mensagem Automática)*' || chr(10) || chr(10) || message_template,
    updated_at = now()
WHERE message_template NOT LIKE '*(Mensagem Automática)*%';

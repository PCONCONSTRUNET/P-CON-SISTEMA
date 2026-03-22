UPDATE whatsapp_templates 
SET message_template = 'Ola {{client_name}}! 💈

💰 *Lembrete de cobrança*

A fatura referente ao seu plano *{{plan_name}}* no valor de *{{amount}}* vence *hoje*.

Efetue o pagamento para manter sua assinatura ativa!

Qualquer duvida, estamos a disposicao.',
updated_at = now()
WHERE template_key = 'due_today';

UPDATE whatsapp_templates 
SET message_template = 'Ola {{client_name}}! 💈

Passando para lembrar que a fatura referente a sua assinatura ativa do *{{plan_name}}* no valor de *{{amount}}* vence amanha.

Qualquer duvida, estamos a disposicao.',
updated_at = now()
WHERE template_key = 'subscription_reminder';
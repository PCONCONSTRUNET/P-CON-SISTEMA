UPDATE whatsapp_templates 
SET message_template = 'Ola {{client_name}}! 💈

✅ *Pagamento confirmado!*

Recebemos seu pagamento de *{{amount}}* referente ao plano *{{plan_name}}* com sucesso.

Obrigado por manter sua assinatura em dia!

Qualquer duvida, estamos a disposicao.',
updated_at = now()
WHERE template_key = 'payment_confirmed';
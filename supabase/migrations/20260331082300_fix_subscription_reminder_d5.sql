-- Fix subscription_reminder template: change from D-1 to D-5
UPDATE whatsapp_templates
SET
  name        = 'Lembrete de Assinatura (D-5)',
  description = 'Enviado automaticamente 5 dias antes do vencimento',
  message_template = 'Ola {{client_name}}! 💈

Passando para lembrar que a fatura referente a sua assinatura ativa do *{{plan_name}}* no valor de *{{amount}}* vence em 5 dias.

Qualquer duvida, estamos a disposicao.',
  updated_at  = now()
WHERE template_key = 'subscription_reminder';

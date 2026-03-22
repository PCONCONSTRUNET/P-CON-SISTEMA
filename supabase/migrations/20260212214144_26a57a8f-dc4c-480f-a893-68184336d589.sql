
-- Table to store WhatsApp message templates, image and button config
CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE, -- e.g. 'due_today', 'payment_confirmed', 'subscription_reminder'
  name TEXT NOT NULL, -- Display name
  description TEXT, -- Admin description
  message_template TEXT NOT NULL, -- Message with placeholders like {{client_name}}, {{amount}}, {{plan_name}}
  image_url TEXT, -- URL of the promotional image
  button_enabled BOOLEAN NOT NULL DEFAULT true,
  button_text TEXT DEFAULT 'Acessar Área do Cliente',
  button_url TEXT DEFAULT 'https://www.assinaturaspcon.sbs/cliente',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to whatsapp_templates"
ON public.whatsapp_templates
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates based on current hardcoded messages
INSERT INTO public.whatsapp_templates (template_key, name, description, message_template, image_url, button_enabled, button_text, button_url) VALUES
(
  'due_today',
  'Lembrete de Vencimento (D-0)',
  'Enviado automaticamente no dia do vencimento às 09:00',
  'Ola {{client_name}}! 💈

💰 *Lembrete de cobrança*

A fatura referente ao seu plano *{{plan_name}}* no valor de *{{amount}}* vence *hoje*.

Efetue o pagamento para manter sua assinatura ativa!

Qualquer duvida, estamos a disposicao.',
  'https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg',
  true,
  'Acessar Área do Cliente',
  'https://www.assinaturaspcon.sbs/cliente'
),
(
  'payment_confirmed',
  'Confirmação de Pagamento',
  'Enviado quando um pagamento é confirmado (manual ou automático)',
  'Ola {{client_name}}! 💈

✅ *Pagamento confirmado!*

Recebemos seu pagamento de *{{amount}}* referente ao plano *{{plan_name}}* com sucesso.

Obrigado por manter sua assinatura em dia!

Qualquer duvida, estamos a disposicao.',
  'https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg',
  true,
  'Acessar Área do Cliente',
  'https://www.assinaturaspcon.sbs/cliente'
),
(
  'subscription_reminder',
  'Lembrete de Assinatura (D-1)',
  'Enviado um dia antes do vencimento quando a data de pagamento é alterada',
  'Ola {{client_name}}! 💈

Passando para lembrar que a fatura referente a sua assinatura ativa do *{{plan_name}}* no valor de *{{amount}}* vence amanha.

Qualquer duvida, estamos a disposicao.',
  'https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg',
  true,
  'Acessar Área do Cliente',
  'https://www.assinaturaspcon.sbs/cliente'
);

-- Migration: Garante registro inicial do gateway Mercado Pago em payment_gateway_settings
INSERT INTO public.payment_gateway_settings (
  gateway_name,
  client_id,
  client_secret,
  webhook_token,
  is_active
) VALUES (
  'mercadopago',
  '',
  '',
  '',
  false
)
ON CONFLICT (gateway_name) DO NOTHING;

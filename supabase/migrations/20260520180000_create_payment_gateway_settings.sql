-- Migration: Cria tabela payment_gateway_settings para armazenar
-- credenciais de gateways de pagamento (EFI Bank, etc.)

CREATE TABLE IF NOT EXISTS public.payment_gateway_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_name    text NOT NULL UNIQUE,        -- 'efi', 'mistic', etc.
  client_id       text,
  client_secret   text,
  pix_key         text,                        -- Chave PIX (CNPJ, CPF, email...)
  certificate_pem text,                        -- Certificado + chave privada em formato PEM (mTLS)
  webhook_token   text,                        -- Token opcional para validar callbacks
  is_active       boolean DEFAULT false,
  extra_config    jsonb,                       -- Configurações adicionais futuras
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Somente usuários autenticados (admin) podem ler e alterar
ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

-- Política: apenas usuários autenticados (service_role ignora RLS)
CREATE POLICY "Authenticated users can manage payment settings"
  ON public.payment_gateway_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insere as configurações iniciais do EFI Bank (sem certificado ainda)
INSERT INTO public.payment_gateway_settings (
  gateway_name,
  client_id,
  client_secret,
  pix_key,
  certificate_pem,
  is_active
) VALUES (
  'efi',
  'Client_Id_9f56674f99f6ead4692bde21d14643533c141ed8',
  'Client_Secret_cd76491961078685347f8ccf6c55d9c11813310c',
  '66214350000169',
  '',
  false
)
ON CONFLICT (gateway_name) DO NOTHING;

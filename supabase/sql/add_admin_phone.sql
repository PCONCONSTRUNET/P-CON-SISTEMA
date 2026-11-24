-- Adiciona coluna admin_phone na tabela whatsapp_settings
-- Este é o número que receberá a notificação DDA com lista de faturas que vencem em 5 dias
ALTER TABLE whatsapp_settings 
ADD COLUMN IF NOT EXISTS admin_phone TEXT;

-- Opcional: já setar o número do admin
-- UPDATE whatsapp_settings SET admin_phone = '554896915303';

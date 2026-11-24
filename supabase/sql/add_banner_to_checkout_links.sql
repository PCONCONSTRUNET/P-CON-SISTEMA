-- Adiciona coluna image_url na tabela checkout_links para o banner
ALTER TABLE checkout_links 
ADD COLUMN IF NOT EXISTS image_url TEXT;

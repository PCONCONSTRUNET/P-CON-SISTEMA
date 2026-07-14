-- Adiciona nova coluna de array
ALTER TABLE public.portfolio_items ADD COLUMN image_urls TEXT[] DEFAULT '{}'::TEXT[];

-- Migra a imagem existente (se houver) para o array
UPDATE public.portfolio_items SET image_urls = ARRAY[image_url] WHERE image_url IS NOT NULL AND image_url != '';

-- Remove a coluna antiga
ALTER TABLE public.portfolio_items DROP COLUMN image_url;

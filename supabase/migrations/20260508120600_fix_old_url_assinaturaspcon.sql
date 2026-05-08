-- Fix: Replace old domain "assinaturaspcon.sbs" with new domain "pconassinantes.site"
-- in all whatsapp_templates fields (message_template, button_url, image_url)

-- 1. Fix button_url in all templates
UPDATE whatsapp_templates
SET button_url = REPLACE(button_url, 'assinaturaspcon.sbs', 'pconassinantes.site'),
    updated_at = now()
WHERE button_url ILIKE '%assinaturaspcon.sbs%';

-- 2. Fix message_template text in all templates
UPDATE whatsapp_templates
SET message_template = REPLACE(message_template, 'assinaturaspcon.sbs', 'pconassinantes.site'),
    updated_at = now()
WHERE message_template ILIKE '%assinaturaspcon.sbs%';

-- 3. Fix image_url in all templates (just in case)
UPDATE whatsapp_templates
SET image_url = REPLACE(image_url, 'assinaturaspcon.sbs', 'pconassinantes.site'),
    updated_at = now()
WHERE image_url ILIKE '%assinaturaspcon.sbs%';

-- 4. Also ensure button_url defaults are correct for known templates
UPDATE whatsapp_templates
SET button_url = 'https://www.pconassinantes.site/cliente'
WHERE button_url IS NULL OR button_url = '';

-- 5. Safety: Verify no old URLs remain
-- SELECT id, template_key, button_url, 
--        CASE WHEN message_template ILIKE '%assinaturaspcon%' THEN 'STILL HAS OLD URL' ELSE 'OK' END as msg_check,
--        CASE WHEN button_url ILIKE '%assinaturaspcon%' THEN 'STILL HAS OLD URL' ELSE 'OK' END as btn_check
-- FROM whatsapp_templates;

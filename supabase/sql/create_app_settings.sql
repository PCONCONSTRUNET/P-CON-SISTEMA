-- Tabela de configurações globais do sistema
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_labore_mode TEXT DEFAULT 'percent',
  pro_labore_percent NUMERIC DEFAULT 30,
  pro_labore_fixed NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Allow all read app_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Allow all update app_settings" ON public.app_settings FOR UPDATE USING (true);
CREATE POLICY "Allow all insert app_settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all delete app_settings" ON public.app_settings FOR DELETE USING (true);

-- Inserir linha padrão caso não exista
INSERT INTO public.app_settings (id, pro_labore_mode, pro_labore_percent, pro_labore_fixed)
SELECT gen_random_uuid(), 'percent', 30, 0
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);

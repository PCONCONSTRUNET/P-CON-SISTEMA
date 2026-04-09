-- Fix do RLS da tabela de contratos
-- Permite acesso total e irrestrito (assim como estava parametrizado antes da migração sincrona)

CREATE POLICY "Public full access to contracts" 
ON public.contracts 
FOR ALL 
USING (true) 
WITH CHECK (true);

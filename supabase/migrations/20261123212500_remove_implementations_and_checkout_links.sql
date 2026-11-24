-- Migration: Remove tabelas dos módulos removidos (Implantações e Links de Pagamento)
DROP TABLE IF EXISTS public.implementation_requests CASCADE;
DROP TABLE IF EXISTS public.implementations CASCADE;
DROP TABLE IF EXISTS public.checkout_links CASCADE;

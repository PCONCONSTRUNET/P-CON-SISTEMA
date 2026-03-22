-- Make subscription_id nullable to allow single charges without subscriptions
ALTER TABLE public.payments 
ALTER COLUMN subscription_id DROP NOT NULL;

-- Add client_id column to payments for single charges that don't have a subscription
ALTER TABLE public.payments 
ADD COLUMN client_id uuid REFERENCES public.clients(id);

-- Add description column to payments
ALTER TABLE public.payments 
ADD COLUMN description text;

-- Add asaas_id column to store the ASAAS payment ID
ALTER TABLE public.payments 
ADD COLUMN asaas_id text;
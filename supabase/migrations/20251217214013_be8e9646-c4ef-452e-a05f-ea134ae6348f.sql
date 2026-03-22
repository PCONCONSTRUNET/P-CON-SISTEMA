-- Add asaas_id column to subscriptions table for Asaas integration
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS asaas_id TEXT;
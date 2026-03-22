-- Add description column to invoices table to store plan information
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS description TEXT;
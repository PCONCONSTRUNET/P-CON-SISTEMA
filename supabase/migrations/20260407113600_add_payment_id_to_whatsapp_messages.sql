-- Add payment_id to whatsapp_messages for precise deduplication of payment confirmation messages
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

-- Index for fast deduplication lookups (payment_id + message_type)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_payment_id
  ON public.whatsapp_messages(payment_id)
  WHERE payment_id IS NOT NULL;

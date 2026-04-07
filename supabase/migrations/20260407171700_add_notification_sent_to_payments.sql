-- Add atomic notification deduplication flag to payments table
-- This prevents duplicate WhatsApp messages when Mercado Pago fires
-- payment.created AND payment.updated webhooks simultaneously for the same payment.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.payments.notification_sent_at IS
  'Timestamp when the payment confirmation WhatsApp was sent. NULL = not yet sent. '
  'Used as an atomic mutex to prevent duplicate notifications from concurrent webhooks.';

-- Create table for WhatsApp message logs
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  btzap_message_id VARCHAR(100),
  remote_jid VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  status_updated_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for faster lookups
CREATE INDEX idx_whatsapp_messages_client_id ON public.whatsapp_messages(client_id);
CREATE INDEX idx_whatsapp_messages_btzap_id ON public.whatsapp_messages(btzap_message_id);
CREATE INDEX idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Allow all operations (admin dashboard)
CREATE POLICY "Allow all operations on whatsapp_messages"
  ON public.whatsapp_messages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at
CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
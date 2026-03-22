-- Create contracts table
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Create policy for full access
CREATE POLICY "Allow full access to contracts"
ON public.contracts
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for contract files
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', true);

-- Storage policies
CREATE POLICY "Contract files are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'contracts');

CREATE POLICY "Anyone can upload contract files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Anyone can update contract files"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'contracts');

CREATE POLICY "Anyone can delete contract files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'contracts');
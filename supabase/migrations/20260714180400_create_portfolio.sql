-- Create portfolio_items table
CREATE TABLE IF NOT EXISTS public.portfolio_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project_url TEXT,
    image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    order_index INTEGER DEFAULT 0
);

-- RLS for portfolio_items
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio items are viewable by everyone" 
ON public.portfolio_items FOR SELECT 
USING (true);

CREATE POLICY "Portfolio items can be inserted by authenticated users" 
ON public.portfolio_items FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Portfolio items can be updated by authenticated users" 
ON public.portfolio_items FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Portfolio items can be deleted by authenticated users" 
ON public.portfolio_items FOR DELETE 
TO authenticated 
USING (true);

-- Create portfolio bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for portfolio bucket
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'portfolio' );

CREATE POLICY "Auth Insert" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK ( bucket_id = 'portfolio' );

CREATE POLICY "Auth Update" 
ON storage.objects FOR UPDATE 
TO authenticated
USING ( bucket_id = 'portfolio' );

CREATE POLICY "Auth Delete" 
ON storage.objects FOR DELETE 
TO authenticated
USING ( bucket_id = 'portfolio' );

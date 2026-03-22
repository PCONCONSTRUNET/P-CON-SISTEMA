
CREATE TABLE public.referral_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_name TEXT NOT NULL,
  referrer_phone TEXT NOT NULL,
  referrer_email TEXT,
  referrer_document TEXT,
  referred_name TEXT NOT NULL,
  referred_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert for referral submissions"
  ON public.referral_submissions
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public read for referral submissions"
  ON public.referral_submissions
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public update for referral submissions"
  ON public.referral_submissions
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Allow public delete for referral submissions"
  ON public.referral_submissions
  FOR DELETE
  TO public
  USING (true);

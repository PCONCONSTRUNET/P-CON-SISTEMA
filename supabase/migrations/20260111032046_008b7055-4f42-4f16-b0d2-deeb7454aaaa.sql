-- Add DELETE policies for referral_leads
CREATE POLICY "Allow authenticated delete for referral leads" 
ON public.referral_leads 
FOR DELETE 
USING (true);

-- Add DELETE policy for referral_rewards
CREATE POLICY "Allow authenticated delete for referral rewards" 
ON public.referral_rewards 
FOR DELETE 
USING (true);
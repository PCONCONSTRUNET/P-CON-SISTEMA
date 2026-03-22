-- Drop existing policy and create new one that allows DELETE
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.notifications;

-- Create policies for all operations
CREATE POLICY "Allow public read for notifications" 
ON public.notifications 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert for notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update for notifications" 
ON public.notifications 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete for notifications" 
ON public.notifications 
FOR DELETE 
USING (true);
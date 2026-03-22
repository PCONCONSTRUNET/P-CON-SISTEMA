-- Create a trigger function to automatically create referral link for new clients
CREATE OR REPLACE FUNCTION public.handle_new_client_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only create if the referral system is active
  IF EXISTS (SELECT 1 FROM referral_settings WHERE is_active = true) THEN
    INSERT INTO referral_links (client_id, slug, is_active)
    VALUES (NEW.id, generate_referral_slug(), true);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to execute function when a new client is created
CREATE TRIGGER on_client_created_referral
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_client_referral();
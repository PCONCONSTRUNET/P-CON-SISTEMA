ALTER TABLE public.proposals
ADD COLUMN monthly_amount NUMERIC;

CREATE OR REPLACE FUNCTION public.validate_proposal_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_name IS NULL OR btrim(NEW.client_name) = '' THEN
    RAISE EXCEPTION 'client_name is required';
  END IF;

  IF NEW.project_title IS NULL OR btrim(NEW.project_title) = '' THEN
    RAISE EXCEPTION 'project_title is required';
  END IF;

  IF NEW.total_amount < 0 THEN
    RAISE EXCEPTION 'total_amount cannot be negative';
  END IF;

  IF NEW.discount_amount < 0 THEN
    RAISE EXCEPTION 'discount_amount cannot be negative';
  END IF;

  IF NEW.entry_amount IS NOT NULL AND NEW.entry_amount < 0 THEN
    RAISE EXCEPTION 'entry_amount cannot be negative';
  END IF;

  IF NEW.monthly_amount IS NOT NULL AND NEW.monthly_amount < 0 THEN
    RAISE EXCEPTION 'monthly_amount cannot be negative';
  END IF;

  IF NEW.entry_amount IS NOT NULL AND NEW.entry_amount > NEW.total_amount THEN
    RAISE EXCEPTION 'entry_amount cannot be greater than total_amount';
  END IF;

  IF NEW.status NOT IN ('draft', 'sent', 'viewed', 'approved', 'rejected', 'entry_paid', 'paid', 'expired') THEN
    RAISE EXCEPTION 'invalid proposal status';
  END IF;

  IF NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'valid_until is required';
  END IF;

  IF NEW.public_slug IS NULL OR btrim(NEW.public_slug) = '' THEN
    NEW.public_slug := public.generate_referral_slug();
  END IF;

  RETURN NEW;
END;
$$;
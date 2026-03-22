-- Create proposals table for commercial quotes / budgets
CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  client_name TEXT NOT NULL,
  client_company TEXT,
  client_email TEXT,
  client_phone TEXT,
  project_title TEXT NOT NULL,
  project_description TEXT,
  scope_items TEXT[] NOT NULL DEFAULT '{}',
  delivery_deadline TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  entry_amount NUMERIC,
  allow_partial_payment BOOLEAN NOT NULL DEFAULT false,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  start_deadline TEXT,
  notes TEXT,
  terms_and_conditions TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  public_slug TEXT NOT NULL DEFAULT public.generate_referral_slug(),
  public_link_enabled BOOLEAN NOT NULL DEFAULT false,
  allow_online_approval BOOLEAN NOT NULL DEFAULT true,
  allow_payment BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  first_viewed_at TIMESTAMP WITH TIME ZONE,
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  view_count INTEGER NOT NULL DEFAULT 0,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  entry_paid_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX proposals_public_slug_key ON public.proposals(public_slug);
CREATE INDEX proposals_status_idx ON public.proposals(status);
CREATE INDEX proposals_valid_until_idx ON public.proposals(valid_until);
CREATE INDEX proposals_created_at_idx ON public.proposals(created_at DESC);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to proposals"
ON public.proposals
FOR ALL
TO public
USING (true)
WITH CHECK (true);

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

CREATE TRIGGER validate_proposals_before_write
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.validate_proposal_fields();

CREATE TRIGGER update_proposals_updated_at
BEFORE UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.record_proposal_view(p_public_slug TEXT)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_proposal public.proposals;
BEGIN
  UPDATE public.proposals
  SET
    view_count = COALESCE(view_count, 0) + 1,
    first_viewed_at = COALESCE(first_viewed_at, now()),
    last_viewed_at = now(),
    status = CASE
      WHEN status IN ('sent', 'draft') AND valid_until >= now() THEN 'viewed'
      WHEN status IN ('sent', 'draft') AND valid_until < now() THEN 'expired'
      ELSE status
    END
  WHERE public_slug = p_public_slug
    AND public_link_enabled = true
  RETURNING * INTO updated_proposal;

  RETURN updated_proposal;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_proposal(p_public_slug TEXT, p_action TEXT)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_proposal public.proposals;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid proposal action';
  END IF;

  UPDATE public.proposals
  SET
    status = CASE
      WHEN valid_until < now() THEN 'expired'
      WHEN p_action = 'approve' THEN 'approved'
      WHEN p_action = 'reject' THEN 'rejected'
      ELSE status
    END,
    approved_at = CASE WHEN p_action = 'approve' AND valid_until >= now() THEN now() ELSE approved_at END,
    rejected_at = CASE WHEN p_action = 'reject' AND valid_until >= now() THEN now() ELSE rejected_at END,
    first_viewed_at = COALESCE(first_viewed_at, now()),
    last_viewed_at = now(),
    view_count = COALESCE(view_count, 0) + 1
  WHERE public_slug = p_public_slug
    AND public_link_enabled = true
  RETURNING * INTO updated_proposal;

  RETURN updated_proposal;
END;
$$;
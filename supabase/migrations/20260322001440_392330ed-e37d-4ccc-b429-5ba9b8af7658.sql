ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS proposal_id UUID,
ADD COLUMN IF NOT EXISTS proposal_payment_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_proposal_id_fkey'
  ) THEN
    ALTER TABLE public.payments
    ADD CONSTRAINT payments_proposal_id_fkey
    FOREIGN KEY (proposal_id)
    REFERENCES public.proposals(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_proposal_id ON public.payments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_payments_proposal_payment_type ON public.payments(proposal_payment_type);

CREATE OR REPLACE FUNCTION public.validate_payment_proposal_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.proposal_payment_type IS NOT NULL AND NEW.proposal_payment_type NOT IN ('entry', 'total') THEN
    RAISE EXCEPTION 'invalid proposal payment type';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_payment_proposal_fields_trigger ON public.payments;
CREATE TRIGGER validate_payment_proposal_fields_trigger
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_payment_proposal_fields();
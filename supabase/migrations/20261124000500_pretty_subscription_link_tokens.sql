-- ============================================================================
-- Migration: Links curtos e amigáveis (<nome>-<dd>-<mm>) para assinaturas
-- ============================================================================
-- Exemplo: https://www.pconassinantes.site/pagar/alisson-25-11
-- Em caso de colisão (ex.: outro Alisson no mesmo dia/mês ou no ano seguinte),
-- adiciona sufixo automático (-26, -2, -3...) sem nunca falhar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_subscription_link_token(
  p_client_id uuid,
  p_due_date timestamptz,
  p_exclude_link_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_first_name  text;
  v_slug        text;
  v_ddmm        text;
  v_yy          text;
  v_base        text;
  v_candidate   text;
  v_suffix      integer := 2;
BEGIN
  SELECT name INTO v_client_name
  FROM public.clients
  WHERE id = p_client_id;

  v_first_name := split_part(btrim(COALESCE(v_client_name, 'cliente')), ' ', 1);
  v_slug := translate(
    lower(v_first_name),
    'áàâãäéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaeeeeiiiiooooouuuucnyyaaaaaeeeeiiiiooooouuuucny'
  );
  v_slug := regexp_replace(v_slug, '[^a-z0-9]', '', 'g');
  IF COALESCE(v_slug, '') = '' THEN
    v_slug := 'cliente';
  END IF;

  v_ddmm := to_char(COALESCE(p_due_date, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD-MM');
  v_yy   := to_char(COALESCE(p_due_date, now()) AT TIME ZONE 'America/Sao_Paulo', 'YY');
  v_base := v_slug || '-' || v_ddmm;

  -- 1. Tenta o formato limpo: ex. alisson-25-11
  v_candidate := v_base;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_payment_links
    WHERE token = v_candidate
      AND (p_exclude_link_id IS NULL OR id <> p_exclude_link_id)
  ) THEN
    RETURN v_candidate;
  END IF;

  -- 2. Tenta com ano: ex. alisson-25-11-26
  v_candidate := v_base || '-' || v_yy;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_payment_links
    WHERE token = v_candidate
      AND (p_exclude_link_id IS NULL OR id <> p_exclude_link_id)
  ) THEN
    RETURN v_candidate;
  END IF;

  -- 3. Fallback sequencial garantido único: ex. alisson-25-11-2, -3...
  LOOP
    v_candidate := v_base || '-' || v_suffix::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.subscription_payment_links
      WHERE token = v_candidate
        AND (p_exclude_link_id IS NULL OR id <> p_exclude_link_id)
    );
    v_suffix := v_suffix + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Trigger BEFORE INSERT: garante token amigável mesmo quando o insert usa o DEFAULT
CREATE OR REPLACE FUNCTION public.fn_assign_pretty_subscription_link_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.token IS NULL OR btrim(NEW.token) = '' OR NEW.token LIKE 'sub-%' THEN
    NEW.token := public.generate_subscription_link_token(NEW.client_id, NEW.due_date, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pretty_subscription_link_token ON public.subscription_payment_links;
CREATE TRIGGER trg_assign_pretty_subscription_link_token
  BEFORE INSERT ON public.subscription_payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_assign_pretty_subscription_link_token();

-- Atualiza fn_sync_subscription_payment_link para manter o token sincronizado ao editar vencimento/cliente
CREATE OR REPLACE FUNCTION public.fn_sync_subscription_payment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_id uuid;
  v_new_token  text;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT id INTO v_pending_id
    FROM public.subscription_payment_links
    WHERE subscription_id = NEW.id
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_id IS NULL THEN
      INSERT INTO public.subscription_payment_links (
        subscription_id,
        client_id,
        amount,
        due_date,
        status
      ) VALUES (
        NEW.id,
        NEW.client_id,
        NEW.value,
        NEW.next_payment,
        'pending'
      );
    ELSIF TG_OP = 'UPDATE' AND (
      OLD.value IS DISTINCT FROM NEW.value
      OR OLD.next_payment IS DISTINCT FROM NEW.next_payment
      OR OLD.client_id IS DISTINCT FROM NEW.client_id
    ) THEN
      IF OLD.next_payment IS DISTINCT FROM NEW.next_payment OR OLD.client_id IS DISTINCT FROM NEW.client_id THEN
        v_new_token := public.generate_subscription_link_token(NEW.client_id, NEW.next_payment, v_pending_id);
        UPDATE public.subscription_payment_links
        SET amount = NEW.value,
            due_date = NEW.next_payment,
            client_id = NEW.client_id,
            token = v_new_token,
            updated_at = now()
        WHERE id = v_pending_id;
      ELSE
        UPDATE public.subscription_payment_links
        SET amount = NEW.value,
            updated_at = now()
        WHERE id = v_pending_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.subscription_payment_links
    SET status = 'cancelled',
        updated_at = now()
    WHERE subscription_id = NEW.id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

-- Atualiza links pendentes atuais que ainda estão no formato antigo (sub-xxxx)
DO $$
DECLARE
  r RECORD;
  v_pretty text;
BEGIN
  FOR r IN
    SELECT id, client_id, due_date
    FROM public.subscription_payment_links
    WHERE status = 'pending'
      AND token LIKE 'sub-%'
    ORDER BY created_at ASC
  LOOP
    v_pretty := public.generate_subscription_link_token(r.client_id, r.due_date, r.id);
    UPDATE public.subscription_payment_links
    SET token = v_pretty,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;

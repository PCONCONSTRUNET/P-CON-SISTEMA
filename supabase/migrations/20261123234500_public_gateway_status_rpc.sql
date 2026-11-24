-- ============================================================================
-- Migration: RPC pública ultrarrápida para consultar status dos gateways
-- ============================================================================
-- Evita cold-start de 2 Edge Functions (efi-pay + mercadopago) toda vez que
-- o cliente abre o link de pagamento /pagar-assinatura/:id.
-- Retorna APENAS flags públicos (is_active, configured e public_key do MP),
-- sem expor nenhum segredo (client_secret, certificate_pem, webhook_token).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_payment_gateway_status()
RETURNS TABLE (
  gateway_name text,
  is_active boolean,
  configured boolean,
  public_key text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pgs.gateway_name,
    (
      COALESCE(pgs.is_active, false)
      AND CASE
        WHEN pgs.gateway_name = 'efi' THEN (
          COALESCE(btrim(pgs.client_id), '') <> ''
          AND COALESCE(btrim(pgs.client_secret), '') <> ''
          AND COALESCE(btrim(pgs.pix_key), '') <> ''
          AND COALESCE(btrim(pgs.certificate_pem), '') <> ''
        )
        WHEN pgs.gateway_name = 'mercadopago' THEN (
          COALESCE(btrim(pgs.client_secret), '') <> ''
        )
        ELSE false
      END
    ) AS is_active,
    CASE
      WHEN pgs.gateway_name = 'efi' THEN (
        COALESCE(btrim(pgs.client_id), '') <> ''
        AND COALESCE(btrim(pgs.client_secret), '') <> ''
        AND COALESCE(btrim(pgs.pix_key), '') <> ''
        AND COALESCE(btrim(pgs.certificate_pem), '') <> ''
      )
      WHEN pgs.gateway_name = 'mercadopago' THEN (
        COALESCE(btrim(pgs.client_secret), '') <> ''
      )
      ELSE false
    END AS configured,
    CASE
      WHEN pgs.gateway_name = 'mercadopago' THEN NULLIF(btrim(pgs.client_id), '')
      ELSE NULL
    END AS public_key
  FROM public.payment_gateway_settings pgs
  WHERE pgs.gateway_name IN ('efi', 'mercadopago');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_gateway_status()
  TO anon, authenticated, service_role;

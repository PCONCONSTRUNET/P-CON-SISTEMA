import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { completeSubscriptionPaymentCycle } from "../_shared/subscription-cycle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ─── URLs da API EFI ────────────────────────────────────────────────────────
const EFI_PIX_BASE = "https://pix.api.efipay.com.br";

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
};

const EFI_DISABLED_MESSAGE =
  "Gateway de pagamento EFI Bank está desativado no momento. Ative-o nas configurações de EFI Bank para processar pagamentos.";

class GatewayDisabledError extends Error {
  statusCode = 403;
  gatewayDisabled = true;

  constructor(message = EFI_DISABLED_MESSAGE) {
    super(message);
    this.name = "GatewayDisabledError";
  }
}

function isRowConfigured(
  data: {
    client_id?: string | null;
    client_secret?: string | null;
    certificate_pem?: string | null;
    pix_key?: string | null;
  } | null,
): boolean {
  return !!(
    data?.client_id?.trim() &&
    data?.client_secret?.trim() &&
    data?.certificate_pem?.trim() &&
    data?.pix_key?.trim()
  );
}

// ─── Carrega configurações do banco ─────────────────────────────────────────
async function loadEfiSettings(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  options: { requireActive?: boolean } = {},
) {
  const { requireActive = true } = options;

  const { data, error } = await supabase
    .from("payment_gateway_settings")
    .select("*")
    .eq("gateway_name", "efi")
    .single();

  if (error || !data) {
    // Fallback para variáveis de ambiente (para deploy via CLI)
    const clientId = Deno.env.get("EFI_CLIENT_ID");
    const clientSecret = Deno.env.get("EFI_CLIENT_SECRET");
    const certPem = Deno.env.get("EFI_CERTIFICATE_PEM");
    const pixKey = Deno.env.get("EFI_PIX_KEY");
    if (!clientId || !clientSecret || !certPem || !pixKey) {
      throw new Error("Configurações EFI Bank não encontradas. Configure na aba EFI Bank do sistema.");
    }
    return { clientId, clientSecret, certPem, pixKey };
  }

  if (requireActive && !data.is_active) {
    throw new GatewayDisabledError();
  }

  if (!isRowConfigured(data)) {
    throw new Error("Configurações EFI Bank incompletas. Verifique o certificado e as chaves na aba EFI Bank.");
  }

  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    certPem: data.certificate_pem,
    pixKey: data.pix_key,
  };
}

// ─── Obtém URL do Proxy Vercel ───────────────────────────────────────────────
const getProxyUrl = (req: Request): string => {
  const envProxy = Deno.env.get("VERCEL_PROXY_URL");
  if (envProxy) return envProxy;

  const origin = req.headers.get("origin");
  if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    return `${origin}/api/efi-proxy`;
  }
  return "https://p-con-sistema.vercel.app/api/efi-proxy";
};

// ─── Realiza requisição mTLS via Vercel Proxy ──────────────────────────────────
async function fetchViaProxy(
  proxyUrl: string,
  targetUrl: string,
  certPem: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<Response> {
  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: targetUrl,
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      certPem,
    }),
  });
  return response;
}

// ─── Obtém access_token OAuth2 ───────────────────────────────────────────────
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  proxyUrl: string,
  certPem: string,
): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetchViaProxy(proxyUrl, `${EFI_PIX_BASE}/oauth/token`, certPem, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: { grant_type: "client_credentials" },
  });

  const result = await response.json();

  if (!response.ok || !result.access_token) {
    console.error("[efi-pay] OAuth error:", JSON.stringify(result));
    throw new Error(result.error_description || result.error || `OAuth falhou: HTTP ${response.status}`);
  }

  return result.access_token;
}

// ─── Localiza pagamento pendente existente ───────────────────────────────────
const findExistingPendingPayment = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  body: {
    clientId?: string;
    subscriptionId?: string;
    proposalId?: string;
    proposalPaymentType?: "entry" | "total";
    amount: number;
  },
) => {
  if (body.proposalId) {
    const { data } = await supabase
      .from("payments")
      .select("id")
      .eq("proposal_id", body.proposalId)
      .eq("proposal_payment_type", body.proposalPaymentType || null)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }
  if (body.subscriptionId) {
    const { data } = await supabase
      .from("payments")
      .select("id")
      .eq("client_id", body.clientId)
      .eq("subscription_id", body.subscriptionId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }
  const { data } = await supabase
    .from("payments")
    .select("id")
    .eq("client_id", body.clientId)
    .is("subscription_id", null)
    .eq("status", "pending")
    .eq("amount", body.amount)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
};

// ─── Gera txid único (32 chars alfanumérico) ─────────────────────────────────
function generateTxid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let txid = "";
  for (let i = 0; i < 32; i++) {
    txid += chars[Math.floor(Math.random() * chars.length)];
  }
  return txid;
}

// ─── Formata CNPJ/CPF removendo caracteres especiais ────────────────────────
function formatDocument(doc: string): string {
  return doc.replace(/[^\d]/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();

    let requestBody: Record<string, any> = {};
    try {
      requestBody = await req.json();
    } catch (_) {
      // body vazio ok
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || requestBody._action || "";

    console.log("[efi-pay] action:", action, "| body keys:", Object.keys(requestBody));

    // ─── GET STATUS (público, sem segredos) ────────────────────────────────
    if (action === "get-status") {
      const { data, error } = await supabase
        .from("payment_gateway_settings")
        .select("is_active, client_id, client_secret, pix_key, certificate_pem, updated_at")
        .eq("gateway_name", "efi")
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao verificar status do gateway: ${error.message}`);
      }

      if (!data) {
        const hasEnvFallback = !!(
          Deno.env.get("EFI_CLIENT_ID") &&
          Deno.env.get("EFI_CLIENT_SECRET") &&
          Deno.env.get("EFI_CERTIFICATE_PEM") &&
          Deno.env.get("EFI_PIX_KEY")
        );
        return new Response(
          JSON.stringify({
            success: true,
            gateway: "efi",
            isActive: hasEnvFallback,
            enabled: hasEnvFallback,
            configured: hasEnvFallback,
            updatedAt: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const configured = isRowConfigured(data);
      return new Response(
        JSON.stringify({
          success: true,
          gateway: "efi",
          isActive: !!data.is_active && configured,
          enabled: !!data.is_active,
          configured,
          updatedAt: data.updated_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── TOGGLE STATUS ───────────────────────────────────────────────────────
    if (action === "toggle-status") {
      const nextActive = !!requestBody.is_active;
      const { data: existing, error: fetchErr } = await supabase
        .from("payment_gateway_settings")
        .select("id, client_id, client_secret, pix_key, certificate_pem")
        .eq("gateway_name", "efi")
        .maybeSingle();

      if (fetchErr) {
        throw new Error(`Erro ao buscar configurações: ${fetchErr.message}`);
      }

      if (!existing) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Salve as credenciais do EFI Bank antes de alterar o status do gateway.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (nextActive && !isRowConfigured(existing)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Preencha Client ID, Client Secret, Chave PIX e Certificado antes de ativar o gateway EFI Bank.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const updatedAt = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("payment_gateway_settings")
        .update({ is_active: nextActive, updated_at: updatedAt })
        .eq("id", existing.id);

      if (updateErr) {
        throw new Error(`Erro ao atualizar status do gateway: ${updateErr.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          is_active: nextActive,
          configured: isRowConfigured(existing),
          updated_at: updatedAt,
          message: nextActive
            ? "Gateway EFI Bank ativado com sucesso!"
            : "Gateway EFI Bank desativado com sucesso!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── GET SETTINGS ────────────────────────────────────────────────────────
    if (action === "get-settings") {
      console.log("[efi-pay] Fetching masked settings");
      const { data, error } = await supabase
        .from("payment_gateway_settings")
        .select("*")
        .eq("gateway_name", "efi")
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar configurações: ${error.message}`);
      }

      if (!data) {
        return new Response(
          JSON.stringify({ success: true, settings: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mascara os campos sensíveis para segurança
      const maskedSettings = {
        client_id: data.client_id || "",
        client_secret: data.client_secret ? "••••••••••••••••••••••••••••••••" : "",
        pix_key: data.pix_key || "",
        certificate_pem: data.certificate_pem || "", // Opcional: pode enviar o PEM mas ocultamos com máscara no front se quiser
        is_active: !!data.is_active,
        updated_at: data.updated_at,
      };

      return new Response(
        JSON.stringify({ success: true, settings: maskedSettings }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── SAVE SETTINGS ───────────────────────────────────────────────────────
    if (action === "save-settings") {
      const { client_id, client_secret, pix_key, certificate_pem, is_active } = requestBody;
      console.log("[efi-pay] Saving settings for gateway efi");

      const { data: existing } = await supabase
        .from("payment_gateway_settings")
        .select("id, client_id, client_secret, pix_key, certificate_pem")
        .eq("gateway_name", "efi")
        .maybeSingle();

      const updatedAt = new Date().toISOString();
      const payload: Record<string, any> = {
        gateway_name: "efi",
        client_id: client_id?.trim() || null,
        pix_key: pix_key?.trim().replace(/[^0-9]/g, "") || null,
        is_active: !!is_active,
        updated_at: updatedAt,
      };

      if (client_secret && client_secret !== "••••••••••••••••••••••••••••••••") {
        payload.client_secret = client_secret.trim();
      }

      if (certificate_pem) {
        payload.certificate_pem = certificate_pem.trim();
      }

      const effectiveConfig = {
        client_id: payload.client_id ?? existing?.client_id ?? null,
        client_secret: payload.client_secret ?? existing?.client_secret ?? null,
        pix_key: payload.pix_key ?? existing?.pix_key ?? null,
        certificate_pem: payload.certificate_pem ?? existing?.certificate_pem ?? null,
      };

      if (payload.is_active && !isRowConfigured(effectiveConfig)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Preencha Client ID, Client Secret, Chave PIX e Certificado antes de ativar o gateway EFI Bank.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let resError;
      if (existing?.id) {
        const { error } = await supabase
          .from("payment_gateway_settings")
          .update(payload)
          .eq("id", existing.id);
        resError = error;
      } else {
        const { error } = await supabase
          .from("payment_gateway_settings")
          .insert(payload);
        resError = error;
      }

      if (resError) {
        throw new Error(`Erro ao salvar no banco: ${resError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          is_active: payload.is_active,
          configured: isRowConfigured(effectiveConfig),
          updated_at: updatedAt,
          message: "Configurações salvas com sucesso!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const proxyUrl = getProxyUrl(req);

    // ─── TEST CONNECTION (OAuth + mTLS, mesmo com gateway desativado) ──────
    if (action === "test-connection") {
      const settings = await loadEfiSettings(supabase, { requireActive: false });
      console.log("[efi-pay] Testing EFI connection (OAuth + mTLS)");
      const accessToken = await getAccessToken(
        settings.clientId,
        settings.clientSecret,
        proxyUrl,
        settings.certPem,
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: "Conexão com EFI Bank estabelecida com sucesso!",
          tokenPreview: `${accessToken.slice(0, 8)}…`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CREATE PIX (exige gateway ativo) ────────────────────────────────────
    if (action === "create-pix") {
      const settings = await loadEfiSettings(supabase, { requireActive: true });
      const {
        amount,
        description,
        clientId: bodyClientId,
        clientEmail,
        clientName,
        clientDocument,
        subscriptionId,
        subscriptionLinkId,
        paymentLinkId,
        proposalId,
        proposalPaymentType,
      } = requestBody;

      if (!bodyClientId && !proposalId && !paymentLinkId) {
        throw new Error("clientId ou proposalId é obrigatório");
      }

      console.log("[efi-pay] Creating PIX:", { amount, clientName, description });

      // Obtem token OAuth2
      const accessToken = await getAccessToken(settings.clientId, settings.clientSecret, proxyUrl, settings.certPem);

      // Gera txid único
      const txid = generateTxid();

      // Monta o payload da cobrança PIX imediata (COB)
      const cobPayload: Record<string, any> = {
        calendario: {
          expiracao: 3600, // 1 hora para expirar
        },
        valor: {
          original: Number(amount).toFixed(2),
        },
        chave: settings.pixKey, // CNPJ da empresa
        solicitacaoPagador: description || "Pagamento P-CON",
      };

      // Adiciona info do pagador se disponível
      if (clientDocument) {
        const doc = formatDocument(clientDocument);
        cobPayload.devedor = {
          cpf: doc.length === 11 ? doc : undefined,
          cnpj: doc.length === 14 ? doc : undefined,
          nome: clientName || "Cliente",
        };
        // Remove chave undefined
        if (!cobPayload.devedor.cpf) delete cobPayload.devedor.cpf;
        if (!cobPayload.devedor.cnpj) delete cobPayload.devedor.cnpj;
      }

      // Configura webhook para receber notificação de pagamento
      const webhookBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/efi-webhook`;
      
      // Sufixo único para referência interna
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const infoAdicionais = paymentLinkId
        ? `paylink:${paymentLinkId}:${uniqueSuffix}`
        : proposalId
        ? `proposal:${proposalId}:${proposalPaymentType || "total"}:${uniqueSuffix}`
        : subscriptionId
        ? `sub:${subscriptionId}:${uniqueSuffix}`
        : `cl:${bodyClientId}:${uniqueSuffix}`;

      cobPayload.infoAdicionais = [
        { nome: "ref", valor: infoAdicionais.substring(0, 73) }, // EFI limita em 73 chars
      ];

      console.log("[efi-pay] PUT /v2/cob/{txid} via Proxy", txid);
      console.log("[efi-pay] payload:", JSON.stringify(cobPayload));

      // Cria a cobrança PIX na EFI via Proxy
      const cobResponse = await fetchViaProxy(proxyUrl, `${EFI_PIX_BASE}/v2/cob/${txid}`, settings.certPem, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: cobPayload,
      });

      const cobResult = await cobResponse.json();
      console.log("[efi-pay] COB response status:", cobResponse.status);
      console.log("[efi-pay] COB response:", JSON.stringify(cobResult));

      if (!cobResponse.ok) {
        throw new Error(
          cobResult.mensagem || cobResult.message || `EFI Bank HTTP ${cobResponse.status}: ${JSON.stringify(cobResult)}`
        );
      }

      // Busca o QR Code da cobrança via Proxy
      const qrResponse = await fetchViaProxy(proxyUrl, `${EFI_PIX_BASE}/v2/loc/${cobResult.loc.id}/qrcode`, settings.certPem, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      const qrResult = await qrResponse.json();
      console.log("[efi-pay] QR response:", JSON.stringify(qrResult));

      if (!qrResponse.ok) {
        throw new Error(`Erro ao gerar QR Code: ${JSON.stringify(qrResult)}`);
      }

      // Salva no banco
      const existingPayment = await findExistingPendingPayment(supabase, {
        clientId: bodyClientId,
        subscriptionId,
        proposalId,
        proposalPaymentType,
        amount,
      });

      const paymentPayload = {
        client_id: bodyClientId || null,
        subscription_id: subscriptionId || null,
        subscription_link_id: subscriptionLinkId || null,
        payment_link_id: paymentLinkId || null,
        proposal_id: proposalId || null,
        proposal_payment_type: proposalPaymentType || null,
        amount,
        status: "pending",
        payment_method: "PIX",
        description,
        transaction_id: txid,
        asaas_id: txid, // reutilizando coluna para guardar txid EFI
      };

      if (existingPayment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", existingPayment.id);
        if (updateError) console.error("[efi-pay] Error updating payment:", updateError);
      } else {
        const { error: dbError } = await supabase.from("payments").insert(paymentPayload);
        if (dbError) console.error("[efi-pay] Error inserting payment:", dbError);
      }

      // Configura webhook na EFI para receber notificações via Proxy
      try {
        await fetchViaProxy(proxyUrl, `${EFI_PIX_BASE}/v2/webhook/${settings.pixKey}`, settings.certPem, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: { webhookUrl: webhookBase },
        });
      } catch (wErr) {
        console.warn("[efi-pay] Webhook setup warning (non-fatal):", wErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: txid,
          qrCode: qrResult.qrcode,           // código copia e cola PIX
          qrCodeBase64: qrResult.imagemQrcode, // imagem base64
          qrcodeUrl: null,
          expirationDate: cobResult.calendario?.criacao
            ? new Date(
                new Date(cobResult.calendario.criacao).getTime() +
                  (cobResult.calendario.expiracao || 3600) * 1000
              ).toISOString()
            : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── SETUP WEBHOOK (exige gateway ativo) ─────────────────────────────────
    if (action === "setup-webhook") {
      const settings = await loadEfiSettings(supabase, { requireActive: true });
      console.log("[efi-pay] Setting up webhook for key:", settings.pixKey);
      const accessToken = await getAccessToken(settings.clientId, settings.clientSecret, proxyUrl, settings.certPem);
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const webhookBase = `${supabaseUrl}/functions/v1/efi-webhook`;

      console.log("[efi-pay] Registering webhookUrl:", webhookBase);

      const response = await fetchViaProxy(proxyUrl, `${EFI_PIX_BASE}/v2/webhook/${settings.pixKey}`, settings.certPem, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: { webhookUrl: webhookBase },
      });

      const result = await response.text();
      console.log("[efi-pay] Webhook setup response:", response.status, result);

      if (!response.ok) {
        throw new Error(`Erro ao configurar webhook: HTTP ${response.status} - ${result}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Webhook configurado com sucesso!", webhookUrl: webhookBase }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CHECK STATUS ────────────────────────────────────────────────────────
    if (action === "check-status") {
      const settings = await loadEfiSettings(supabase, { requireActive: false });
      const paymentId = url.searchParams.get("paymentId") || requestBody?.paymentId;
      if (!paymentId) throw new Error("paymentId é obrigatório");

      console.log("[efi-pay] Checking status for txid:", paymentId);

      const accessToken = await getAccessToken(settings.clientId, settings.clientSecret, proxyUrl, settings.certPem);

      const response = await fetchViaProxy(proxyUrl, `${EFI_PIX_BASE}/v2/cob/${paymentId}`, settings.certPem, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      console.log("[efi-pay] Status result:", JSON.stringify(result));

      if (!response.ok) {
        throw new Error(result.mensagem || `Erro ao consultar status: HTTP ${response.status}`);
      }

      // Status da EFI: ATIVA, CONCLUIDA, REMOVIDA_PELO_USUARIO_RECEBEDOR, REMOVIDA_PELO_PSP
      const efiStatus = result.status || "";
      let dbStatus = "pending";
      let isPaid = false;

      if (efiStatus === "CONCLUIDA") {
        dbStatus = "paid";
        isPaid = true;
      } else if (efiStatus.startsWith("REMOVIDA")) {
        dbStatus = "cancelled";
      }

      const paidAt = isPaid ? new Date().toISOString() : null;

      let cycleResult: { nextPayment?: string | null; newLinkToken?: string | null; newLinkUrl?: string | null } = {};

      // Atualiza banco se houve mudança de status
      if (dbStatus !== "pending") {
        const { data: paymentRecord } = await supabase
          .from("payments")
          .select("id, proposal_id, proposal_payment_type, status, subscription_id, subscription_link_id, payment_link_id, client_id, amount, description")
          .eq("transaction_id", paymentId)
          .maybeSingle();

        if (paymentRecord && paymentRecord.status !== "paid") {
          const { data: updatedRows } = await supabase
            .from("payments")
            .update({ status: dbStatus, paid_at: paidAt })
            .eq("id", paymentRecord.id)
            .neq("status", "paid")
            .select("id");

          if (isPaid && updatedRows && updatedRows.length > 0) {
            cycleResult = await completeSubscriptionPaymentCycle(supabase, {
              paymentId: paymentRecord.id,
              subscriptionId: paymentRecord.subscription_id,
              subscriptionLinkId: paymentRecord.subscription_link_id,
              paymentLinkId: paymentRecord.payment_link_id,
              proposalId: paymentRecord.proposal_id,
              proposalPaymentType: paymentRecord.proposal_payment_type,
              clientId: paymentRecord.client_id,
              amount: paymentRecord.amount,
              description: paymentRecord.description,
              paymentMethod: "PIX",
              paidAt,
            });
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: dbStatus,
          efiStatus,
          paidAt,
          nextPayment: cycleResult.nextPayment || null,
          newLinkToken: cycleResult.newLinkToken || null,
          newLinkUrl: cycleResult.newLinkUrl || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Ação desconhecida: "${action}". Passe _action no body ou ?action= na URL.`);
  } catch (error: any) {
    console.error("[efi-pay] Error:", error.message);
    if (error instanceof GatewayDisabledError) {
      return new Response(
        JSON.stringify({ success: false, error: error.message, gatewayDisabled: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

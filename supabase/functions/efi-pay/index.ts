import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ─── Carrega configurações do banco ─────────────────────────────────────────
async function loadEfiSettings(supabase: ReturnType<typeof getSupabaseAdmin>) {
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

  if (!data.client_id || !data.client_secret || !data.certificate_pem || !data.pix_key) {
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
    checkoutLinkId?: string;
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
        .select("id, client_secret, certificate_pem")
        .eq("gateway_name", "efi")
        .maybeSingle();

      const payload: Record<string, any> = {
        gateway_name: "efi",
        client_id: client_id?.trim() || null,
        pix_key: pix_key?.trim().replace(/[^0-9]/g, "") || null,
        is_active: !!is_active,
        updated_at: new Date().toISOString(),
      };

      if (client_secret && client_secret !== "••••••••••••••••••••••••••••••••") {
        payload.client_secret = client_secret.trim();
      }

      if (certificate_pem) {
        payload.certificate_pem = certificate_pem.trim();
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
        JSON.stringify({ success: true, message: "Configurações salvas com sucesso!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ações abaixo exigem configurações e mTLS configurados
    const settings = await loadEfiSettings(supabase);
    const proxyUrl = getProxyUrl(req);

    // ─── TEST CONNECTION (OAuth + mTLS apenas) ─────────────────────────────
    if (action === "test-connection") {
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

    // ─── CREATE PIX ──────────────────────────────────────────────────────────
    if (action === "create-pix") {
      const {
        amount,
        description,
        clientId: bodyClientId,
        clientEmail,
        clientName,
        clientDocument,
        subscriptionId,
        proposalId,
        proposalPaymentType,
        checkoutLinkId,
      } = requestBody;

      if (!bodyClientId && !proposalId && !checkoutLinkId) {
        throw new Error("clientId, proposalId ou checkoutLinkId é obrigatório");
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
      const infoAdicionais = proposalId
        ? `proposal:${proposalId}:${proposalPaymentType || "total"}:${uniqueSuffix}`
        : checkoutLinkId
        ? `chk:${checkoutLinkId}:${uniqueSuffix}`
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
        checkoutLinkId,
        proposalPaymentType,
        amount,
      });

      const paymentPayload = {
        client_id: bodyClientId || null,
        subscription_id: subscriptionId || null,
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

    // ─── SETUP WEBHOOK ───────────────────────────────────────────────────────
    if (action === "setup-webhook") {
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

      // Atualiza banco se houve mudança de status
      if (dbStatus !== "pending") {
        const { data: paymentRecord } = await supabase
          .from("payments")
          .select("id, proposal_id, proposal_payment_type, status, subscription_id")
          .eq("transaction_id", paymentId)
          .maybeSingle();

        if (paymentRecord && paymentRecord.status !== "paid") {
          await supabase
            .from("payments")
            .update({ status: dbStatus, paid_at: paidAt })
            .eq("id", paymentRecord.id);

          if (isPaid) {
            if (paymentRecord.proposal_id) {
              const { data: proposal } = await supabase
                .from("proposals")
                .select("status")
                .eq("id", paymentRecord.proposal_id)
                .maybeSingle();
              const nextStatus =
                paymentRecord.proposal_payment_type === "entry" && proposal?.status !== "paid"
                  ? "entry_paid"
                  : "paid";
              await supabase
                .from("proposals")
                .update(
                  paymentRecord.proposal_payment_type === "entry"
                    ? { status: nextStatus, entry_paid_at: paidAt }
                    : { status: "paid", paid_at: paidAt },
                )
                .eq("id", paymentRecord.proposal_id);
            }

            if (paymentRecord.subscription_id) {
              const { data: subscription } = await supabase
                .from("subscriptions")
                .select("next_payment, billing_cycle")
                .eq("id", paymentRecord.subscription_id)
                .maybeSingle();

              if (subscription?.next_payment) {
                const nextDate = new Date(subscription.next_payment);
                const cycle = subscription.billing_cycle || "monthly";

                if (cycle === "monthly") {
                  nextDate.setMonth(nextDate.getMonth() + 1);
                } else if (cycle === "yearly") {
                  nextDate.setFullYear(nextDate.getFullYear() + 1);
                } else if (cycle === "quarterly") {
                  nextDate.setMonth(nextDate.getMonth() + 3);
                } else if (cycle === "weekly") {
                  nextDate.setDate(nextDate.getDate() + 7);
                }

                await supabase
                  .from("subscriptions")
                  .update({ next_payment: nextDate.toISOString().split("T")[0] })
                  .eq("id", paymentRecord.subscription_id);
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, status: dbStatus, efiStatus, paidAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Ação desconhecida: "${action}". Passe _action no body ou ?action= na URL.`);
  } catch (error: any) {
    console.error("[efi-pay] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

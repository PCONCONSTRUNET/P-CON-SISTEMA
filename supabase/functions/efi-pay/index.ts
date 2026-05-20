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

// ─── Cria client HTTP com mTLS (certificado PEM) ─────────────────────────────
function createMtlsClient(certPem: string): Deno.HttpClient {
  // O PEM pode conter cert + key concatenados (formato OpenSSL padrão)
  // Extraímos separadamente se necessário
  const certMatch = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  const keyMatch = certPem.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/g);

  if (!certMatch || !keyMatch) {
    throw new Error("Certificado PEM inválido. Verifique se contém o certificado e a chave privada.");
  }

  return Deno.createHttpClient({
    certChain: certMatch.join("\n"),
    privateKey: keyMatch[0],
  });
}

// ─── Obtém access_token OAuth2 ───────────────────────────────────────────────
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  httpClient: Deno.HttpClient,
): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(`${EFI_PIX_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    client: httpClient,
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
    const settings = await loadEfiSettings(supabase);
    const httpClient = createMtlsClient(settings.certPem);

    let requestBody: Record<string, any> = {};
    try {
      requestBody = await req.json();
    } catch (_) {
      // body vazio ok
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || requestBody._action || "";

    console.log("[efi-pay] action:", action, "| body keys:", Object.keys(requestBody));

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
      const accessToken = await getAccessToken(settings.clientId, settings.clientSecret, httpClient);

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

      console.log("[efi-pay] PUT /v2/cob/{txid}", txid);
      console.log("[efi-pay] payload:", JSON.stringify(cobPayload));

      // Cria a cobrança PIX na EFI
      const cobResponse = await fetch(`${EFI_PIX_BASE}/v2/cob/${txid}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cobPayload),
        client: httpClient,
      });

      const cobResult = await cobResponse.json();
      console.log("[efi-pay] COB response status:", cobResponse.status);
      console.log("[efi-pay] COB response:", JSON.stringify(cobResult));

      if (!cobResponse.ok) {
        throw new Error(
          cobResult.mensagem || cobResult.message || `EFI Bank HTTP ${cobResponse.status}: ${JSON.stringify(cobResult)}`
        );
      }

      // Busca o QR Code da cobrança
      const qrResponse = await fetch(`${EFI_PIX_BASE}/v2/loc/${cobResult.loc.id}/qrcode`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
        client: httpClient,
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

      // Configura webhook na EFI para receber notificações
      try {
        await fetch(`${EFI_PIX_BASE}/v2/webhook/${settings.pixKey}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ webhookUrl: webhookBase }),
          client: httpClient,
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

    // ─── CHECK STATUS ────────────────────────────────────────────────────────
    if (action === "check-status") {
      const paymentId = url.searchParams.get("paymentId") || requestBody?.paymentId;
      if (!paymentId) throw new Error("paymentId é obrigatório");

      console.log("[efi-pay] Checking status for txid:", paymentId);

      const accessToken = await getAccessToken(settings.clientId, settings.clientSecret, httpClient);

      const response = await fetch(`${EFI_PIX_BASE}/v2/cob/${paymentId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
        client: httpClient,
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
          .select("id, proposal_id, proposal_payment_type")
          .eq("transaction_id", paymentId)
          .maybeSingle();

        if (paymentRecord) {
          await supabase
            .from("payments")
            .update({ status: dbStatus, paid_at: paidAt })
            .eq("id", paymentRecord.id);

          if (isPaid && paymentRecord.proposal_id) {
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

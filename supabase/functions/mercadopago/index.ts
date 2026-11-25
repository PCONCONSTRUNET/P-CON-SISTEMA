import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { completeSubscriptionPaymentCycle } from "../_shared/subscription-cycle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

const MP_DISABLED_MESSAGE =
  "Gateway Mercado Pago está desativado no momento. Ative-o nas configurações do Mercado Pago para processar pagamentos.";

class GatewayDisabledError extends Error {
  statusCode = 403;
  gatewayDisabled = true;

  constructor(message = MP_DISABLED_MESSAGE) {
    super(message);
    this.name = "GatewayDisabledError";
  }
}

function isMercadoPagoConfigured(
  data: {
    client_secret?: string | null;
  } | null,
): boolean {
  return !!data?.client_secret?.trim();
}

async function loadMercadoPagoSettings(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  options: { requireActive?: boolean } = {},
) {
  const { requireActive = true } = options;

  const { data, error } = await supabase
    .from("payment_gateway_settings")
    .select("*")
    .eq("gateway_name", "mercadopago")
    .maybeSingle();

  if (error || !data) {
    const envToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!envToken) {
      throw new Error("Configurações do Mercado Pago não encontradas. Configure na aba Mercado Pago do sistema.");
    }
    return {
      accessToken: envToken,
      publicKey: Deno.env.get("MERCADOPAGO_PUBLIC_KEY") || "",
      webhookToken: "",
    };
  }

  if (requireActive && !data.is_active) {
    throw new GatewayDisabledError();
  }

  if (!isMercadoPagoConfigured(data)) {
    const envToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (envToken && (!requireActive || data.is_active)) {
      return {
        accessToken: envToken,
        publicKey: data.client_id || "",
        webhookToken: data.webhook_token || "",
      };
    }
    throw new Error("Access Token do Mercado Pago não configurado. Preencha na aba Mercado Pago.");
  }

  return {
    accessToken: data.client_secret.trim(),
    publicKey: data.client_id?.trim() || "",
    webhookToken: data.webhook_token?.trim() || "",
  };
}

interface CreatePixPaymentRequest {
  amount: number;
  description: string;
  clientId?: string;
  clientEmail: string;
  clientName: string;
  clientPhone?: string;
  clientDocument?: string;
  subscriptionId?: string;
  subscriptionLinkId?: string;
  paymentLinkId?: string;
  proposalId?: string;
  proposalPaymentType?: "entry" | "total";
}

interface CreatePreferenceRequest {
  amount: number;
  title: string;
  description?: string;
  clientEmail: string;
  clientId?: string;
  clientName?: string;
  clientDocument?: string;
  externalReference?: string;
  subscriptionId?: string;
  subscriptionLinkId?: string;
  paymentLinkId?: string;
  proposalId?: string;
  proposalPaymentType?: "entry" | "total";
  maxInstallments?: number;
  returnUrl?: string;
}

interface CreateCardPaymentRequest {
  amount: number;
  description: string;
  clientId?: string;
  clientEmail: string;
  clientName: string;
  clientPhone?: string;
  clientDocument?: string;
  subscriptionId?: string;
  subscriptionLinkId?: string;
  paymentLinkId?: string;
  proposalId?: string;
  proposalPaymentType?: "entry" | "total";
  externalReference?: string;
  token: string;
  issuerId: string;
  installments: number;
  paymentMethodId: string;
  payerIdentificationType?: string;
  payerIdentificationNumber?: string;
}

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
};

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

const mapMercadoPagoStatus = (status: string) => {
  if (status === "approved") return "paid";
  if (status === "rejected" || status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  return "pending";
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();

    let requestBody: Record<string, any> = {};
    if (req.method !== "GET") {
      try {
        requestBody = await req.json();
      } catch (_) {
        // body vazio ok
      }
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || requestBody._action || "";

    console.log("Mercado Pago action:", action);

    // ─── GET STATUS (público, sem segredos) ────────────────────────────────
    if (action === "get-status") {
      const { data, error } = await supabase
        .from("payment_gateway_settings")
        .select("is_active, client_id, client_secret, updated_at")
        .eq("gateway_name", "mercadopago")
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao verificar status do Mercado Pago: ${error.message}`);
      }

      if (!data) {
        const hasEnvFallback = !!Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
        return new Response(
          JSON.stringify({
            success: true,
            gateway: "mercadopago",
            isActive: hasEnvFallback,
            enabled: hasEnvFallback,
            configured: hasEnvFallback,
            publicKey: Deno.env.get("MERCADOPAGO_PUBLIC_KEY") || null,
            updatedAt: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const configured = isMercadoPagoConfigured(data) || !!Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
      return new Response(
        JSON.stringify({
          success: true,
          gateway: "mercadopago",
          isActive: !!data.is_active && configured,
          enabled: !!data.is_active,
          configured,
          publicKey: data.client_id || null,
          updatedAt: data.updated_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── GET SETTINGS (mascarado para admin) ─────────────────────────────────
    if (action === "get-settings") {
      const { data, error } = await supabase
        .from("payment_gateway_settings")
        .select("*")
        .eq("gateway_name", "mercadopago")
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar configurações do Mercado Pago: ${error.message}`);
      }

      if (!data) {
        return new Response(
          JSON.stringify({ success: true, settings: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          settings: {
            public_key: data.client_id || "",
            access_token: data.client_secret ? "••••••••••••••••••••••••••••••••" : "",
            webhook_token: data.webhook_token ? "••••••••••••••••••••••••••••••••" : "",
            is_active: !!data.is_active,
            updated_at: data.updated_at,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── SAVE SETTINGS ───────────────────────────────────────────────────────
    if (action === "save-settings") {
      const { public_key, access_token, webhook_token, is_active } = requestBody;

      const { data: existing } = await supabase
        .from("payment_gateway_settings")
        .select("id, client_id, client_secret, webhook_token")
        .eq("gateway_name", "mercadopago")
        .maybeSingle();

      const updatedAt = new Date().toISOString();
      const payload: Record<string, any> = {
        gateway_name: "mercadopago",
        client_id: public_key !== undefined ? (public_key?.trim() || null) : (existing?.client_id ?? null),
        is_active: !!is_active,
        updated_at: updatedAt,
      };

      if (access_token && access_token !== "••••••••••••••••••••••••••••••••") {
        payload.client_secret = access_token.trim();
      }

      if (webhook_token !== undefined && webhook_token !== "••••••••••••••••••••••••••••••••") {
        payload.webhook_token = webhook_token?.trim() || null;
      }

      const effectiveSecret = payload.client_secret ?? existing?.client_secret ?? null;
      const configuredNow = !!effectiveSecret?.trim() || !!Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

      if (payload.is_active && !configuredNow) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Informe o Access Token antes de ativar o gateway Mercado Pago.",
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
          configured: configuredNow,
          updated_at: updatedAt,
          message: "Configurações do Mercado Pago salvas com sucesso!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── TOGGLE STATUS ───────────────────────────────────────────────────────
    if (action === "toggle-status") {
      const nextActive = !!requestBody.is_active;
      const { data: existing, error: fetchErr } = await supabase
        .from("payment_gateway_settings")
        .select("id, client_secret")
        .eq("gateway_name", "mercadopago")
        .maybeSingle();

      if (fetchErr) {
        throw new Error(`Erro ao buscar configurações: ${fetchErr.message}`);
      }

      const configuredNow = isMercadoPagoConfigured(existing) || !!Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

      if (!existing) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Salve as credenciais do Mercado Pago antes de alterar o status do gateway.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (nextActive && !configuredNow) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Informe e salve o Access Token antes de ativar o gateway Mercado Pago.",
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
          configured: configuredNow,
          updated_at: updatedAt,
          message: nextActive
            ? "Gateway Mercado Pago ativado com sucesso!"
            : "Gateway Mercado Pago desativado com sucesso!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── TEST CONNECTION (funciona mesmo com gateway desativado) ─────────────
    if (action === "test-connection") {
      const { accessToken } = await loadMercadoPagoSettings(supabase, { requireActive: false });
      const response = await fetch(`${MERCADOPAGO_API_URL}/users/me`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || `Falha na autenticação Mercado Pago (HTTP ${response.status})`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Conexão com Mercado Pago OK! Conta: ${result.nickname || result.email || result.id}`,
          account: {
            id: result.id,
            nickname: result.nickname,
            email: result.email,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create PIX payment (exige gateway ativo)
    if (action === "create-pix") {
      const { accessToken } = await loadMercadoPagoSettings(supabase, { requireActive: true });
      const body = requestBody as CreatePixPaymentRequest;

      if (!body.clientId && !body.proposalId && !body.paymentLinkId) {
        throw new Error("clientId, proposalId ou paymentLinkId é obrigatório");
      }

      console.log("Creating PIX payment:", { 
        amount: body.amount, 
        description: body.description,
        clientEmail: body.clientEmail,
        clientPhone: body.clientPhone,
      });

      const cleanDoc = (body.clientDocument || "").replace(/[^\d]/g, "");
      const cleanPhone = (body.clientPhone || "").replace(/\D/g, "");

      // Create payment via Mercado Pago API
      const paymentData = {
        transaction_amount: Number(body.amount),
        description: body.description,
        payment_method_id: "pix",
        payer: {
          email: body.clientEmail || "cliente@pconassinantes.site",
          first_name: body.clientName?.split(" ")[0] || "Cliente",
          last_name: body.clientName?.split(" ").slice(1).join(" ") || "",
          phone: cleanPhone.length >= 10
            ? {
                area_code: cleanPhone.slice(0, 2),
                number: cleanPhone.slice(2),
              }
            : undefined,
          identification: cleanDoc.length === 11 || cleanDoc.length === 14
            ? {
                type: cleanDoc.length === 11 ? "CPF" : "CNPJ",
                number: cleanDoc,
              }
            : undefined,
        },
        external_reference: body.paymentLinkId
          ? `paylink:${body.paymentLinkId}`
          : body.subscriptionLinkId
          ? `sublink:${body.subscriptionLinkId}`
          : body.subscriptionId
          ? `sub:${body.subscriptionId}`
          : body.description,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      };

      const response = await fetch(`${MERCADOPAGO_API_URL}/v1/payments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(paymentData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mercado Pago error:", result);
        throw new Error(result.message || "Erro ao criar pagamento PIX");
      }

      console.log("PIX payment created:", result.id);

      // Save to local database
      const existingPayment = await findExistingPendingPayment(supabase, body);

      if (existingPayment) {
        // Update existing payment with transaction_id
        const { error: updateError } = await supabase
          .from("payments")
          .update({
            transaction_id: result.id?.toString(),
            payment_method: "PIX",
            description: body.description,
            amount: body.amount,
            client_id: body.clientId || null,
            subscription_id: body.subscriptionId || null,
            subscription_link_id: body.subscriptionLinkId || null,
            payment_link_id: body.paymentLinkId || null,
            proposal_id: body.proposalId || null,
            proposal_payment_type: body.proposalPaymentType || null,
          })
          .eq("id", existingPayment.id);

        if (updateError) {
          console.error("Error updating existing payment:", updateError);
        } else {
          console.log("Updated existing payment:", existingPayment.id, "with transaction_id:", result.id);
        }
      } else {
        // No existing payment found, create new one
        const { error: dbError } = await supabase.from("payments").insert({
          client_id: body.clientId || null,
          subscription_id: body.subscriptionId || null,
          subscription_link_id: body.subscriptionLinkId || null,
          payment_link_id: body.paymentLinkId || null,
          proposal_id: body.proposalId || null,
          proposal_payment_type: body.proposalPaymentType || null,
          amount: body.amount,
          status: "pending",
          payment_method: "PIX",
          description: body.description,
          asaas_id: null,
          transaction_id: result.id?.toString(),
        });

        if (dbError) {
          console.error("Error saving payment to DB:", dbError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: result.id,
          qrCode: result.point_of_interaction?.transaction_data?.qr_code,
          qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
          ticketUrl: result.point_of_interaction?.transaction_data?.ticket_url,
          expirationDate: result.date_of_expiration,
          status: result.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create-card-payment") {
      const { accessToken } = await loadMercadoPagoSettings(supabase, { requireActive: true });
      const body = requestBody as CreateCardPaymentRequest;

      if (!body.clientId && !body.proposalId && !body.paymentLinkId) {
        throw new Error("clientId, proposalId ou paymentLinkId é obrigatório");
      }

      if (!body.token || !body.paymentMethodId || !body.installments) {
        throw new Error("Dados do cartão incompletos");
      }

      const identificationNumber = (body.payerIdentificationNumber || body.clientDocument || "").replace(/[^\d]/g, "");
      const identificationType = body.payerIdentificationType || (identificationNumber ? (identificationNumber.length <= 11 ? "CPF" : "CNPJ") : undefined);
      const normalizedPhone = (body.clientPhone || "").replace(/\D/g, "");
      const phoneAreaCode = normalizedPhone.length >= 10 ? normalizedPhone.slice(0, 2) : undefined;
      const phoneNumber = normalizedPhone.length >= 10 ? normalizedPhone.slice(2) : undefined;

      const paymentData = {
        transaction_amount: body.amount,
        token: body.token,
        description: body.description,
        installments: body.installments,
        issuer_id: body.issuerId,
        payment_method_id: body.paymentMethodId,
        payer: {
          email: body.clientEmail,
          first_name: body.clientName?.split(" ")[0] || "Cliente",
          last_name: body.clientName?.split(" ").slice(1).join(" ") || "",
          phone: phoneAreaCode && phoneNumber
            ? {
                area_code: phoneAreaCode,
                number: phoneNumber,
              }
            : undefined,
          identification: identificationNumber && identificationType
            ? {
                type: identificationType,
                number: identificationNumber,
              }
            : undefined,
        },
        external_reference: body.externalReference || (body.paymentLinkId ? `paylink:${body.paymentLinkId}` : body.subscriptionLinkId ? `sublink:${body.subscriptionLinkId}` : body.subscriptionId ? `sub:${body.subscriptionId}` : body.description),
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      };

      const response = await fetch(`${MERCADOPAGO_API_URL}/v1/payments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(paymentData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mercado Pago card payment error:", result);
        throw new Error(result.message || "Erro ao processar pagamento no cartão");
      }

      const existingPayment = await findExistingPendingPayment(supabase, body);
      const localStatus = mapMercadoPagoStatus(result.status);
      const paidAt = localStatus === "paid" ? result.date_approved || new Date().toISOString() : null;

      const paymentPayload = {
        client_id: body.clientId || null,
        subscription_id: body.subscriptionId || null,
        subscription_link_id: body.subscriptionLinkId || null,
        payment_link_id: body.paymentLinkId || null,
        proposal_id: body.proposalId || null,
        proposal_payment_type: body.proposalPaymentType || null,
        amount: body.amount,
        status: localStatus,
        payment_method: "CREDIT_CARD",
        description: body.description,
        asaas_id: null,
        transaction_id: result.id?.toString(),
        paid_at: paidAt,
      };

      let savedPaymentId: string | null = null;
      if (existingPayment) {
        const { data: updatedRow, error: updateError } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", existingPayment.id)
          .select("id")
          .single();

        if (updateError) {
          console.error("Error updating existing card payment:", updateError);
        } else {
          savedPaymentId = updatedRow?.id || existingPayment.id;
        }
      } else {
        const { data: insertedRow, error: insertError } = await supabase
          .from("payments")
          .insert(paymentPayload)
          .select("id")
          .single();

        if (insertError) {
          console.error("Error saving card payment to DB:", insertError);
        } else {
          savedPaymentId = insertedRow?.id || null;
        }
      }

      let cycleResult: { nextPayment?: string | null; newLinkToken?: string | null; newLinkUrl?: string | null } = {};
      if (localStatus === "paid" && savedPaymentId) {
        cycleResult = await completeSubscriptionPaymentCycle(supabase, {
          paymentId: savedPaymentId,
          subscriptionId: body.subscriptionId || null,
          subscriptionLinkId: body.subscriptionLinkId || null,
          paymentLinkId: body.paymentLinkId || null,
          proposalId: body.proposalId || null,
          proposalPaymentType: body.proposalPaymentType || null,
          clientId: body.clientId || null,
          amount: body.amount,
          description: body.description,
          paymentMethod: "CREDIT_CARD",
          paidAt,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: result.id,
          status: result.status,
          statusDetail: result.status_detail,
          paidAt: result.date_approved,
          nextPayment: cycleResult.nextPayment || null,
          newLinkToken: cycleResult.newLinkToken || null,
          newLinkUrl: cycleResult.newLinkUrl || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check payment status
    if (action === "check-status") {
      const { accessToken } = await loadMercadoPagoSettings(supabase, { requireActive: false });
      const paymentId = url.searchParams.get("paymentId") || requestBody?.paymentId;
      if (!paymentId) {
        throw new Error("paymentId é obrigatório");
      }

      console.log("Checking payment status:", paymentId);

      const response = await fetch(`${MERCADOPAGO_API_URL}/v1/payments/${paymentId}`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mercado Pago status check error:", result);
        throw new Error(result.message || "Erro ao verificar status");
      }

      const localStatus = result.status === "approved"
        ? "paid"
        : result.status === "rejected" || result.status === "cancelled"
          ? "cancelled"
          : result.status === "refunded"
            ? "refunded"
            : "pending";

      const { data: paymentRecord } = await supabase
        .from("payments")
        .select("id, proposal_id, proposal_payment_type, status, subscription_id, subscription_link_id, payment_link_id, client_id, amount, description, payment_method")
        .eq("transaction_id", paymentId)
        .maybeSingle();

      let cycleResult: { nextPayment?: string | null; newLinkToken?: string | null; newLinkUrl?: string | null } = {};

      if (paymentRecord && paymentRecord.status !== "paid") {
        const paidAt = localStatus === "paid" ? result.date_approved || new Date().toISOString() : null;
        const { data: updatedRows } = await supabase
          .from("payments")
          .update({
            status: localStatus,
            paid_at: paidAt,
          })
          .eq("id", paymentRecord.id)
          .neq("status", "paid")
          .select("id");

        if (localStatus === "paid" && updatedRows && updatedRows.length > 0) {
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
            paymentMethod: paymentRecord.payment_method || "PIX",
            paidAt,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: result.status,
          statusDetail: result.status_detail,
          paidAt: result.date_approved,
          nextPayment: cycleResult.nextPayment || null,
          newLinkToken: cycleResult.newLinkToken || null,
          newLinkUrl: cycleResult.newLinkUrl || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create preference (for Checkout Bricks)
    if (action === "create-preference") {
      const { accessToken } = await loadMercadoPagoSettings(supabase, { requireActive: true });
      const body = requestBody as CreatePreferenceRequest;
      console.log("Creating preference:", body);

      const preferenceData = {
        items: [
          {
            title: body.title,
            description: body.description || body.title,
            quantity: 1,
            currency_id: "BRL",
            unit_price: body.amount,
          },
        ],
        payer: {
          email: body.clientEmail,
          name: body.clientName,
          identification: body.clientDocument ? {
            type: body.clientDocument.length <= 11 ? "CPF" : "CNPJ",
            number: body.clientDocument.replace(/[^\d]/g, ""),
          } : undefined,
        },
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
          installments: Math.min(Math.max(body.maxInstallments || 1, 1), 4),
          default_installments: Math.min(Math.max(body.maxInstallments || 1, 1), 4),
        },
        external_reference: body.externalReference || (body.paymentLinkId ? `paylink:${body.paymentLinkId}` : body.subscriptionLinkId ? `sublink:${body.subscriptionLinkId}` : body.subscriptionId ? `sub:${body.subscriptionId}` : undefined),
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        back_urls: body.returnUrl
          ? {
              success: body.returnUrl,
              failure: body.returnUrl,
              pending: body.returnUrl,
            }
          : undefined,
        auto_return: body.returnUrl ? "approved" : undefined,
      };

      const response = await fetch(`${MERCADOPAGO_API_URL}/checkout/preferences`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferenceData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mercado Pago preference error:", result);
        throw new Error(result.message || "Erro ao criar preferência");
      }

      console.log("Preference created:", result.id);

      const existingPayment = await findExistingPendingPayment(supabase, body);

      const paymentPayload = {
        client_id: body.clientId || null,
        subscription_id: body.subscriptionId || null,
        subscription_link_id: body.subscriptionLinkId || null,
        payment_link_id: body.paymentLinkId || null,
        proposal_id: body.proposalId || null,
        proposal_payment_type: body.proposalPaymentType || null,
        amount: body.amount,
        status: "pending",
        payment_method: "CREDIT_CARD",
        description: body.description || body.title,
        asaas_id: null,
        transaction_id: null,
      };

      if (existingPayment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", existingPayment.id);

        if (updateError) {
          console.error("Error updating card payment in DB:", updateError);
        }
      } else {
        const { error: dbError } = await supabase.from("payments").insert(paymentPayload);

        if (dbError) {
          console.error("Error saving card payment to DB:", dbError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          preferenceId: result.id,
          initPoint: result.init_point,
          sandboxInitPoint: result.sandbox_init_point,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Ação desconhecida: ${action}`);

  } catch (error: any) {
    console.error("Mercado Pago function error:", error);
    if (error instanceof GatewayDisabledError) {
      return new Response(
        JSON.stringify({ success: false, error: error.message, gatewayDisabled: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

interface CreatePixPaymentRequest {
  amount: number;
  description: string;
  clientId?: string;
  clientEmail: string;
  clientName: string;
  clientPhone?: string;
  clientDocument?: string;
  subscriptionId?: string;
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
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured");
      throw new Error("Mercado Pago não configurado");
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    console.log("Mercado Pago action:", action);

    // Create PIX payment
    if (action === "create-pix") {
      const body: CreatePixPaymentRequest = await req.json();

      if (!body.clientId && !body.proposalId) {
        throw new Error("clientId ou proposalId é obrigatório");
      }

      console.log("Creating PIX payment:", { 
        amount: body.amount, 
        description: body.description,
        clientEmail: body.clientEmail,
        clientPhone: body.clientPhone,
      });

      // Create payment via Mercado Pago API
      const paymentData = {
        transaction_amount: body.amount,
        description: body.description,
        payment_method_id: "pix",
        payer: {
          email: body.clientEmail,
          first_name: body.clientName?.split(" ")[0] || "Cliente",
          last_name: body.clientName?.split(" ").slice(1).join(" ") || "",
          phone: body.clientPhone
            ? {
                area_code: body.clientPhone.replace(/\D/g, "").slice(0, 2),
                number: body.clientPhone.replace(/\D/g, "").slice(2),
              }
            : undefined,
          identification: body.clientDocument ? {
            type: body.clientDocument.length <= 11 ? "CPF" : "CNPJ",
            number: body.clientDocument.replace(/[^\d]/g, ""),
          } : undefined,
        },
        external_reference: body.description, // Shows in bank statement
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
      const supabase = getSupabaseAdmin();
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
      const body: CreateCardPaymentRequest = await req.json();

      if (!body.clientId && !body.proposalId) {
        throw new Error("clientId ou proposalId é obrigatório");
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
        external_reference: body.externalReference || body.description,
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

      const supabase = getSupabaseAdmin();
      const existingPayment = await findExistingPendingPayment(supabase, body);
      const localStatus = mapMercadoPagoStatus(result.status);
      const paidAt = localStatus === "paid" ? result.date_approved || new Date().toISOString() : null;

      const paymentPayload = {
        client_id: body.clientId || null,
        subscription_id: body.subscriptionId || null,
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

      if (existingPayment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", existingPayment.id);

        if (updateError) {
          console.error("Error updating existing card payment:", updateError);
        }
      } else {
        const { error: insertError } = await supabase
          .from("payments")
          .insert(paymentPayload);

        if (insertError) {
          console.error("Error saving card payment to DB:", insertError);
        }
      }

      if (localStatus === "paid" && body.proposalId) {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("status")
          .eq("id", body.proposalId)
          .maybeSingle();

        const nextStatus = body.proposalPaymentType === "entry" && proposal?.status !== "paid"
          ? "entry_paid"
          : "paid";

        await supabase
          .from("proposals")
          .update(
            body.proposalPaymentType === "entry"
              ? { status: nextStatus, entry_paid_at: paidAt }
              : { status: "paid", paid_at: paidAt }
          )
          .eq("id", body.proposalId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: result.id,
          status: result.status,
          statusDetail: result.status_detail,
          paidAt: result.date_approved,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check payment status
    if (action === "check-status") {
      const paymentId = url.searchParams.get("paymentId");
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

      const supabase = getSupabaseAdmin();

      const localStatus = result.status === "approved"
        ? "paid"
        : result.status === "rejected" || result.status === "cancelled"
          ? "cancelled"
          : result.status === "refunded"
            ? "refunded"
            : "pending";

      const { data: paymentRecord } = await supabase
        .from("payments")
        .select("id, proposal_id, proposal_payment_type")
        .eq("transaction_id", paymentId)
        .maybeSingle();

      if (paymentRecord) {
        await supabase
          .from("payments")
          .update({
            status: localStatus,
            paid_at: localStatus === "paid" ? result.date_approved || new Date().toISOString() : null,
          })
          .eq("id", paymentRecord.id);

        if (localStatus === "paid" && paymentRecord.proposal_id) {
          const { data: proposal } = await supabase
            .from("proposals")
            .select("status")
            .eq("id", paymentRecord.proposal_id)
            .maybeSingle();

          const paidAt = result.date_approved || new Date().toISOString();
          const nextStatus = paymentRecord.proposal_payment_type === "entry" && proposal?.status !== "paid"
            ? "entry_paid"
            : "paid";

          await supabase
            .from("proposals")
            .update(
              paymentRecord.proposal_payment_type === "entry"
                ? { status: nextStatus, entry_paid_at: paidAt }
                : { status: "paid", paid_at: paidAt }
            )
            .eq("id", paymentRecord.proposal_id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: result.status,
          statusDetail: result.status_detail,
          paidAt: result.date_approved,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create preference (for Checkout Bricks)
    if (action === "create-preference") {
      const body: CreatePreferenceRequest = await req.json();
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
        external_reference: body.externalReference,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        back_urls: body.returnUrl
          ? {
              success: body.returnUrl,
              failure: body.returnUrl,
              pending: body.returnUrl,
            }
          : undefined,
        auto_return: "approved",
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

      const supabase = getSupabaseAdmin();
      const existingPayment = await findExistingPendingPayment(supabase, body);

      const paymentPayload = {
        client_id: body.clientId || null,
        subscription_id: body.subscriptionId || null,
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
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

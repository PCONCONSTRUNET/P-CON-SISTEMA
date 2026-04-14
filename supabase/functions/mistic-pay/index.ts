import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// URL base confirmada pela documentação oficial
const MISTIC_API_URL = "https://api.misticpay.com/api";

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

/**
 * Mapeia o transactionState da Mistic Pay para o status do banco.
 * Valores reais da API: "PENDENTE", "COMPLETO", "CANCELADO", "EXPIRADO", "FALHA"
 */
const mapMisticStatus = (transactionState: string): { dbStatus: string; isPaid: boolean } => {
  const state = (transactionState || "").toUpperCase();
  if (state === "COMPLETO") return { dbStatus: "paid", isPaid: true };
  if (state === "CANCELADO" || state === "EXPIRADO" || state === "FALHA") return { dbStatus: "cancelled", isPaid: false };
  return { dbStatus: "pending", isPaid: false };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("MISTIC_CLIENT_ID");
    const clientSecret = Deno.env.get("MISTIC_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      console.error("MISTIC_CLIENT_ID ou MISTIC_CLIENT_SECRET não configurados");
      throw new Error("Mistic Pay não configurado. Configure as variáveis MISTIC_CLIENT_ID e MISTIC_CLIENT_SECRET no Supabase.");
    }

    // Headers conforme documentação oficial: ci + cs
    const misticHeaders = {
      "ci": clientId,
      "cs": clientSecret,
      "Content-Type": "application/json",
    };

    const url = new URL(req.url);
    // Suporte a ambos: ?action= (fetch direto) e x-action header (supabase.functions.invoke)
    const action = url.searchParams.get("action") || req.headers.get("x-action");

    console.log("Mistic Pay action:", action);

    // ─── CREATE PIX ────────────────────────────────────────────────────────────
    if (action === "create-pix") {
      const body: CreatePixPaymentRequest = await req.json();

      if (!body.clientId && !body.proposalId) {
        throw new Error("clientId ou proposalId é obrigatório");
      }

      console.log("Creating Mistic PIX payment:", {
        amount: body.amount,
        description: body.description,
        clientName: body.clientName,
      });

      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mistic-webhook`;

      // transactionId = referência nossa para identificar o pagamento no webhook
      // Conforme docs: "id_da_sua_aplicacao_para_identificacao"
      const externalReference = body.proposalId
        ? `proposal:${body.proposalId}:${body.proposalPaymentType || "total"}`
        : (body.subscriptionId ? `sub:${body.subscriptionId}` : `cl:${body.clientId}`);

      // Payload conforme documentação oficial da Mistic Pay
      const pixPayload = {
        amount: body.amount,
        payerName: body.clientName,
        payerDocument: body.clientDocument?.replace(/[^\d]/g, "") || undefined,
        description: body.description,
        transactionId: externalReference, // nossa referência interna
        projectWebhook: webhookUrl,
      };

      console.log("Sending to Mistic API:", `${MISTIC_API_URL}/transactions/create`);
      console.log("Payload:", JSON.stringify(pixPayload));

      const response = await fetch(`${MISTIC_API_URL}/transactions/create`, {
        method: "POST",
        headers: misticHeaders,
        body: JSON.stringify(pixPayload),
      });

      const result = await response.json();

      console.log("Mistic API raw response status:", response.status);
      console.log("Mistic API raw response:", JSON.stringify(result));

      if (!response.ok) {
        console.error("Mistic Pay error response:", result);
        throw new Error(result.message || result.error || `Erro ao criar pagamento PIX na Mistic Pay (HTTP ${response.status})`);
      }

      // Resposta real da API:
      // { message: "...", data: { transactionId, qrCodeBase64, qrcodeUrl, copyPaste, ... } }
      const data = result.data;
      if (!data) {
        console.error("Mistic API returned no data:", result);
        throw new Error("Mistic Pay não retornou dados da transação");
      }

      const misticId = data.transactionId?.toString();
      console.log("Mistic PIX transaction created:", misticId);
      console.log("copyPaste available:", !!data.copyPaste);
      console.log("qrCodeBase64 available:", !!data.qrCodeBase64);

      // ─── Salvar no Supabase ─────────────────────────────────────────────────
      const supabase = getSupabaseAdmin();
      const existingPayment = await findExistingPendingPayment(supabase, body);

      const paymentPayload = {
        client_id: body.clientId || null,
        subscription_id: body.subscriptionId || null,
        proposal_id: body.proposalId || null,
        proposal_payment_type: body.proposalPaymentType || null,
        amount: body.amount,
        status: "pending",
        payment_method: "PIX",
        description: body.description,
        transaction_id: misticId,
      };

      if (existingPayment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", existingPayment.id);

        if (updateError) console.error("Error updating existing payment:", updateError);
        else console.log("Existing payment updated:", existingPayment.id);
      } else {
        const { error: dbError } = await supabase.from("payments").insert(paymentPayload);
        if (dbError) console.error("Error saving payment to DB:", dbError);
        else console.log("New payment saved to DB");
      }

      // ─── Retornar dados do PIX ao frontend ─────────────────────────────────
      // Campos reais: data.copyPaste (copia e cola), data.qrCodeBase64 (imagem base64),
      //               data.qrcodeUrl (URL do QR code como imagem)
      return new Response(
        JSON.stringify({
          success: true,
          paymentId: misticId,
          qrCode: data.copyPaste,              // código copia e cola PIX
          qrCodeBase64: data.qrCodeBase64,     // imagem base64 do QR code
          qrcodeUrl: data.qrcodeUrl || null,   // URL da imagem do QR code
          expirationDate: data.expirationDate || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CHECK STATUS ───────────────────────────────────────────────────────
    if (action === "check-status") {
      // Suporte a paymentId via query param (fetch direto) ou via body (functions.invoke)
      let paymentId = url.searchParams.get("paymentId");
      if (!paymentId) {
        try {
          const checkBody = await req.json();
          paymentId = checkBody?.paymentId;
        } catch (_) { /* body vazio */ }
      }
      if (!paymentId) throw new Error("paymentId é obrigatório");

      console.log("Checking Mistic payment status:", paymentId);

      // Conforme docs: POST /api/transactions/check com body { transactionId }
      const response = await fetch(`${MISTIC_API_URL}/transactions/check`, {
        method: "POST",
        headers: misticHeaders,
        body: JSON.stringify({ transactionId: paymentId }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mistic status check error:", result);
        throw new Error(result.message || "Erro ao verificar status na Mistic Pay");
      }

      // Resposta real: { message, transaction: { transactionId, value, transactionState, ... } }
      const transaction = result.transaction || result.data;
      const transactionState = transaction?.transactionState || "";

      console.log("Mistic transaction state:", transactionState);

      const { dbStatus, isPaid } = mapMisticStatus(transactionState);
      const paidAt = isPaid ? (transaction?.updatedAt || new Date().toISOString()) : null;

      const supabase = getSupabaseAdmin();
      const { data: paymentRecord } = await supabase
        .from("payments")
        .select("id, proposal_id, proposal_payment_type")
        .eq("transaction_id", paymentId)
        .maybeSingle();

      if (paymentRecord && dbStatus !== "pending") {
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

      return new Response(
        JSON.stringify({
          success: true,
          status: dbStatus,
          misticStatus: transactionState,
          paidAt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (error: any) {
    console.error("Mistic Pay function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

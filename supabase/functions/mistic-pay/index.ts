import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const MISTIC_API_URL = "https://api.misticpay.com/api";

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
      throw new Error("Mistic Pay não configurado. Verifique MISTIC_CLIENT_ID e MISTIC_CLIENT_SECRET.");
    }

    const misticHeaders = {
      "ci": clientId,
      "cs": clientSecret,
      "Content-Type": "application/json",
    };

    // ─── Ler body UMA VEZ (para evitar problema de stream já consumido) ────────
    let requestBody: Record<string, any> = {};
    try {
      requestBody = await req.json();
    } catch (_) {
      // body vazio é OK para check-status via query param
    }

    // ─── Descobrir a ação ─────────────────────────────────────────────────────
    // Suporte a: ?action=xxx (fetch direto), body._action (functions.invoke)
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || requestBody._action || "";

    console.log("Mistic Pay action:", action, "| body keys:", Object.keys(requestBody));

    // ─── CREATE PIX ────────────────────────────────────────────────────────────
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
      } = requestBody;

      if (!bodyClientId && !proposalId) {
        throw new Error("clientId ou proposalId é obrigatório");
      }

      console.log("Creating PIX:", { amount, clientName, description });

      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mistic-webhook`;

      // Sufixo único por chamada garante que a Mistic Pay não rejeite
      // como transação duplicada quando o cliente gerar PIX mais de uma vez
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const externalReference = proposalId
        ? `proposal:${proposalId}:${proposalPaymentType || "total"}:${uniqueSuffix}`
        : (subscriptionId ? `sub:${subscriptionId}:${uniqueSuffix}` : `cl:${bodyClientId}:${uniqueSuffix}`);

      const pixPayload = {
        amount,
        payerName: clientName,
        payerDocument: clientDocument?.replace(/[^\d]/g, "") || undefined,
        description,
        transactionId: externalReference,
        projectWebhook: webhookUrl,
      };

      console.log("POST", `${MISTIC_API_URL}/transactions/create`);

      const response = await fetch(`${MISTIC_API_URL}/transactions/create`, {
        method: "POST",
        headers: misticHeaders,
        body: JSON.stringify(pixPayload),
      });

      const result = await response.json();
      console.log("Mistic response status:", response.status);
      console.log("Mistic response body:", JSON.stringify(result));

      if (!response.ok) {
        throw new Error(result.message || result.error || `Mistic Pay HTTP ${response.status}`);
      }

      const data = result.data;
      if (!data) throw new Error("Mistic Pay não retornou dados da transação");

      const misticId = data.transactionId?.toString();

      // ─── Salvar no banco ────────────────────────────────────────────────────
      const supabase = getSupabaseAdmin();
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
        proposal_id: proposalId || null,
        proposal_payment_type: proposalPaymentType || null,
        amount,
        status: "pending",
        payment_method: "PIX",
        description,
        transaction_id: misticId,
      };

      if (existingPayment) {
        const { error: updateError } = await supabase.from("payments").update(paymentPayload).eq("id", existingPayment.id);
        if (updateError) console.error("Error updating payment:", updateError);
      } else {
        const { error: dbError } = await supabase.from("payments").insert(paymentPayload);
        if (dbError) console.error("Error inserting payment:", dbError);
      }

      // Resposta: data.copyPaste = código PIX | data.qrCodeBase64 = imagem (já com prefixo data:image...)
      return new Response(
        JSON.stringify({
          success: true,
          paymentId: misticId,
          qrCode: data.copyPaste,
          qrCodeBase64: data.qrCodeBase64,
          qrcodeUrl: data.qrcodeUrl || null,
          expirationDate: data.expirationDate || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CHECK STATUS ───────────────────────────────────────────────────────
    if (action === "check-status") {
      const paymentId = url.searchParams.get("paymentId") || requestBody?.paymentId;
      if (!paymentId) throw new Error("paymentId é obrigatório");

      console.log("Checking status for:", paymentId);

      const response = await fetch(`${MISTIC_API_URL}/transactions/check`, {
        method: "POST",
        headers: misticHeaders,
        body: JSON.stringify({ transactionId: paymentId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Erro ao verificar status");
      }

      const transaction = result.transaction || result.data;
      const transactionState = transaction?.transactionState || "";
      const { dbStatus, isPaid } = mapMisticStatus(transactionState);
      const paidAt = isPaid ? (transaction?.updatedAt || new Date().toISOString()) : null;

      const supabase = getSupabaseAdmin();
      const { data: paymentRecord } = await supabase
        .from("payments")
        .select("id, proposal_id, proposal_payment_type")
        .eq("transaction_id", paymentId)
        .maybeSingle();

      if (paymentRecord && dbStatus !== "pending") {
        await supabase.from("payments").update({ status: dbStatus, paid_at: paidAt }).eq("id", paymentRecord.id);

        if (isPaid && paymentRecord.proposal_id) {
          const { data: proposal } = await supabase.from("proposals").select("status").eq("id", paymentRecord.proposal_id).maybeSingle();
          const nextStatus = paymentRecord.proposal_payment_type === "entry" && proposal?.status !== "paid" ? "entry_paid" : "paid";
          await supabase.from("proposals").update(
            paymentRecord.proposal_payment_type === "entry"
              ? { status: nextStatus, entry_paid_at: paidAt }
              : { status: "paid", paid_at: paidAt },
          ).eq("id", paymentRecord.proposal_id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, status: dbStatus, misticStatus: transactionState, paidAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Ação desconhecida: "${action}". Passe _action no body ou ?action= na URL.`);
  } catch (error: any) {
    console.error("Mistic Pay function error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

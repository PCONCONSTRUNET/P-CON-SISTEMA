import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MISTIC_API_URL = "https://api.mysticpay.com.br"; // ajuste se o domínio mudar

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

/** Obtém um Bearer token do Mistic Pay via client_credentials */
const getMisticToken = async (clientId: string, clientSecret: string): Promise<string> => {
  const response = await fetch(`${MISTIC_API_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Mistic auth error:", err);
    throw new Error("Falha na autenticação com Mistic Pay");
  }

  const data = await response.json();
  return data.access_token;
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
      throw new Error("Mistic Pay não configurado");
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

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
        clientEmail: body.clientEmail,
      });

      const accessToken = await getMisticToken(clientId, clientSecret);

      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mistic-webhook`;

      // Payload Mistic Pay PIX
      const pixPayload = {
        amount: body.amount,              // valor em reais (float)
        description: body.description,
        paymentMethod: "pix",
        customer: {
          name: body.clientName,
          email: body.clientEmail,
          document: body.clientDocument?.replace(/[^\d]/g, "") || undefined,
          phone: body.clientPhone?.replace(/\D/g, "") || undefined,
        },
        externalReference:
          body.proposalId
            ? `proposal:${body.proposalId}:${body.proposalPaymentType || "total"}`
            : (body.subscriptionId || body.clientId || ""),
        webhookUrl,
      };

      const response = await fetch(`${MISTIC_API_URL}/v1/transactions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pixPayload),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mistic Pay error:", result);
        throw new Error(result.message || result.error || "Erro ao criar pagamento PIX");
      }

      console.log("Mistic PIX transaction created:", result.id);

      // ─── Save to Supabase ─────────────────────────────────────────────────
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
        asaas_id: null,
        transaction_id: result.id?.toString(),
      };

      if (existingPayment) {
        const { error: updateError } = await supabase
          .from("payments")
          .update(paymentPayload)
          .eq("id", existingPayment.id);

        if (updateError) console.error("Error updating existing payment:", updateError);
        else console.log("Updated existing payment:", existingPayment.id);
      } else {
        const { error: dbError } = await supabase.from("payments").insert(paymentPayload);
        if (dbError) console.error("Error saving payment to DB:", dbError);
      }

      // ─── Return PIX data to frontend ──────────────────────────────────────
      return new Response(
        JSON.stringify({
          success: true,
          paymentId: result.id,
          // Mistic Pay fields — ajuste os paths conforme a resposta real da API
          qrCode: result.pix?.qrCode || result.qrCode || result.pix_key,
          qrCodeBase64: result.pix?.qrCodeBase64 || result.qrCodeBase64 || null,
          ticketUrl: result.pix?.ticketUrl || result.ticketUrl || null,
          expirationDate: result.expiresAt || result.expiration_date || null,
          status: result.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CHECK STATUS ───────────────────────────────────────────────────────
    if (action === "check-status") {
      const paymentId = url.searchParams.get("paymentId");
      if (!paymentId) throw new Error("paymentId é obrigatório");

      console.log("Checking Mistic payment status:", paymentId);

      const accessToken = await getMisticToken(clientId, clientSecret);

      const response = await fetch(`${MISTIC_API_URL}/v1/transactions/${paymentId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Mistic status check error:", result);
        throw new Error(result.message || "Erro ao verificar status");
      }

      const misticStatus = result.status?.toLowerCase();

      let dbStatus = "pending";
      let paidAt: string | null = null;

      if (misticStatus === "approved" || misticStatus === "paid" || misticStatus === "completed") {
        dbStatus = "paid";
        paidAt = result.paidAt || result.paid_at || new Date().toISOString();
      } else if (misticStatus === "cancelled" || misticStatus === "rejected" || misticStatus === "expired") {
        dbStatus = "cancelled";
      } else if (misticStatus === "refunded") {
        dbStatus = "refunded";
      }

      const supabase = getSupabaseAdmin();

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

        if (dbStatus === "paid" && paymentRecord.proposal_id) {
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
          misticStatus: result.status,
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

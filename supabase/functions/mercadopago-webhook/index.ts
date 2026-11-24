import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { completeSubscriptionPaymentCycle } from "../_shared/subscription-cycle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: gatewayData } = await supabase
      .from("payment_gateway_settings")
      .select("client_secret")
      .eq("gateway_name", "mercadopago")
      .maybeSingle();

    const accessToken = gatewayData?.client_secret?.trim() || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured");
      return new Response("OK", { status: 200 });
    }

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body));

    // Support both V2 webhook format AND old IPN format
    const { type, data, action, topic, resource } = body;

    let paymentId: string | null = null;

    // V2 format: { type: "payment", data: { id: "123" }, action: "payment.updated" }
    if (type === "payment" || action === "payment.created" || action === "payment.updated") {
      paymentId = data?.id?.toString() || null;
    }
    // Old IPN format: { topic: "payment", resource: "123" } or { topic: "payment", resource: "https://api.mercadopago.com/v1/payments/123" }
    else if (topic === "payment" && resource) {
      // resource can be the ID directly or a full URL
      const resourceStr = resource.toString();
      const match = resourceStr.match(/\/payments\/(\d+)/);
      paymentId = match ? match[1] : resourceStr;
    }

    if (!paymentId) {
      console.log("No payment ID extracted from webhook body");
      return new Response("OK", { status: 200 });
    }

    console.log("Processing payment webhook for ID:", paymentId);

    const response = await fetch(`${MERCADOPAGO_API_URL}/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error("Failed to fetch payment details:", response.status);
      return new Response("OK", { status: 200 });
    }

    const paymentData = await response.json();
    console.log("Payment data from MP:", {
      id: paymentData.id,
      status: paymentData.status,
      status_detail: paymentData.status_detail,
    });

    let dbStatus = "pending";
    let paidAt = null;

    switch (paymentData.status) {
      case "approved":
        dbStatus = "paid";
        paidAt = paymentData.date_approved || new Date().toISOString();
        break;
      case "pending":
      case "in_process":
        dbStatus = "pending";
        break;
      case "rejected":
      case "cancelled":
        dbStatus = "cancelled";
        break;
      case "refunded":
        dbStatus = "refunded";
        break;
    }

    const externalReference = paymentData.external_reference as string | undefined;

    let paymentQuery = supabase
      .from("payments")
      .select("id, subscription_id, subscription_link_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
      .eq("transaction_id", paymentId.toString())
      .maybeSingle();

    let { data: paymentRecord } = await paymentQuery;

    if (!paymentRecord && externalReference?.startsWith("proposal:")) {
      const [, proposalId, paymentType] = externalReference.split(":");

      const { data } = await supabase
        .from("payments")
        .select("id, subscription_id, subscription_link_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
        .eq("proposal_id", proposalId)
        .eq("proposal_payment_type", paymentType === "entry" ? "entry" : "total")
        .eq("payment_method", "CREDIT_CARD")
        .in("status", ["pending", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      paymentRecord = data;
    }

    if (!paymentRecord && externalReference?.startsWith("sublink:")) {
      const [, linkId] = externalReference.split(":");
      if (linkId) {
        const { data } = await supabase
          .from("payments")
          .select("id, subscription_id, subscription_link_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
          .eq("subscription_link_id", linkId)
          .in("status", ["pending", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        paymentRecord = data;
      }
    }

    if (!paymentRecord && externalReference?.startsWith("sub:")) {
      const [, subId] = externalReference.split(":");
      if (subId) {
        const { data } = await supabase
          .from("payments")
          .select("id, subscription_id, subscription_link_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
          .eq("subscription_id", subId)
          .in("status", ["pending", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        paymentRecord = data;
      }
    }

    if (!paymentRecord) {
      console.log("No payment record found for transaction_id:", paymentId);
      return new Response("OK", { status: 200 });
    }

    // Skip if already in the same status (avoid duplicate processing)
    if (paymentRecord.status === dbStatus) {
      console.log("Payment already in status:", dbStatus, "- skipping");
      return new Response("OK", { status: 200 });
    }

    // Atomic conditional UPDATE: only update if the status has NOT already been changed
    // by a concurrent webhook. If rowsAffected === 0, another instance already processed this.
    const { data: updatedRows, error: updateError } = await supabase
      .from("payments")
      .update({ status: dbStatus, paid_at: paidAt, transaction_id: paymentId.toString() })
      .eq("id", paymentRecord.id)
      .neq("status", dbStatus)
      .select("id");

    if (updateError) {
      console.error("Error updating payment in DB:", updateError);
    } else if (!updatedRows || updatedRows.length === 0) {
      // Another concurrent webhook already updated this payment - skip to avoid duplicates
      console.log("Payment was already updated by another concurrent webhook - skipping");
      return new Response("OK", { status: 200 });
    } else {
      console.log("Payment updated successfully:", { paymentId, status: dbStatus });
    }

    // If payment was approved, handle subscription recurrence + invoice + next link + WhatsApp
    if (dbStatus === "paid") {
      await completeSubscriptionPaymentCycle(supabase, {
        paymentId: paymentRecord.id,
        subscriptionId: paymentRecord.subscription_id,
        subscriptionLinkId: paymentRecord.subscription_link_id,
        proposalId: paymentRecord.proposal_id,
        proposalPaymentType: paymentRecord.proposal_payment_type,
        clientId: paymentRecord.client_id,
        amount: paymentRecord.amount,
        description: paymentRecord.description,
        paymentMethod: paymentRecord.payment_method || (paymentData.payment_method_id === "pix" ? "PIX" : "CREDIT_CARD"),
        paidAt,
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 });
  }
});
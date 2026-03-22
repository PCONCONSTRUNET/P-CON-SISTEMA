import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const externalReference = paymentData.external_reference as string | undefined;

    let paymentQuery = supabase
      .from("payments")
      .select("id, subscription_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
      .eq("transaction_id", paymentId.toString())
      .maybeSingle();

    let { data: paymentRecord } = await paymentQuery;

    if (!paymentRecord && externalReference?.startsWith("proposal:")) {
      const [, proposalId, paymentType] = externalReference.split(":");

      const { data } = await supabase
        .from("payments")
        .select("id, subscription_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
        .eq("proposal_id", proposalId)
        .eq("proposal_payment_type", paymentType === "entry" ? "entry" : "total")
        .eq("payment_method", "CREDIT_CARD")
        .in("status", ["pending", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      paymentRecord = data;
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

    // Update payment status
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: dbStatus, paid_at: paidAt, transaction_id: paymentId.toString() })
      .eq("id", paymentRecord.id);

    if (updateError) {
      console.error("Error updating payment in DB:", updateError);
    } else {
      console.log("Payment updated successfully:", { paymentId, status: dbStatus });
    }

    // If payment was approved, handle subscription recurrence + invoice
    if (dbStatus === "paid") {
      if (paymentRecord.proposal_id) {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("status")
          .eq("id", paymentRecord.proposal_id)
          .maybeSingle();

        const nextProposalStatus = paymentRecord.proposal_payment_type === "entry" && proposal?.status !== "paid"
          ? "entry_paid"
          : "paid";

        const proposalUpdate = paymentRecord.proposal_payment_type === "entry"
          ? { status: nextProposalStatus, entry_paid_at: paidAt }
          : { status: "paid", paid_at: paidAt };

        await supabase
          .from("proposals")
          .update(proposalUpdate)
          .eq("id", paymentRecord.proposal_id);

        console.log("Proposal updated successfully from Mercado Pago webhook:", {
          proposalId: paymentRecord.proposal_id,
          paymentType: paymentRecord.proposal_payment_type,
          status: nextProposalStatus,
        });
      }

      let subscriptionId = paymentRecord.subscription_id;

      // If payment has no subscription_id, try to find a matching active subscription
      if (!subscriptionId && paymentRecord.client_id) {
        console.log("Payment has no subscription_id, searching for matching subscription...");
        
        const { data: matchingSubscription } = await supabase
          .from("subscriptions")
          .select("id, plan_name, value, next_payment, client_id")
          .eq("client_id", paymentRecord.client_id)
          .eq("status", "active")
          .eq("value", paymentRecord.amount)
          .limit(1)
          .single();

        if (matchingSubscription) {
          subscriptionId = matchingSubscription.id;
          console.log("Found matching subscription:", subscriptionId);

          // Link the payment to the subscription
          await supabase
            .from("payments")
            .update({ subscription_id: subscriptionId })
            .eq("id", paymentRecord.id);

          console.log("Payment linked to subscription:", subscriptionId);
        } else {
          console.log("No matching subscription found for client:", paymentRecord.client_id);
        }
      }

      // Handle subscription recurrence if we have a subscription_id
      if (subscriptionId) {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .single();

        if (subscription) {
          // Calculate next payment date: same day next month
          const currentDueDate = new Date(subscription.next_payment);
          const currentDay = currentDueDate.getDate();
          const nextMonth = currentDueDate.getMonth() + 1;
          const nextYear = currentDueDate.getFullYear();

          let nextPaymentDate: Date;
          if (nextMonth > 11) {
            nextPaymentDate = new Date(nextYear + 1, 0, 1);
          } else {
            nextPaymentDate = new Date(nextYear, nextMonth, 1);
          }
          // Clamp to last day of month
          const lastDay = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 1, 0).getDate();
          nextPaymentDate.setDate(Math.min(currentDay, lastDay));
          nextPaymentDate.setHours(12, 0, 0, 0);

          console.log("Recurrence: Current due date:", currentDueDate.toISOString());
          console.log("Recurrence: Next payment date:", nextPaymentDate.toISOString());

          // Update subscription with new next_payment date
          await supabase
            .from("subscriptions")
            .update({
              status: "active",
              next_payment: nextPaymentDate.toISOString(),
            })
            .eq("id", subscriptionId);

          console.log("Subscription updated with next_payment:", nextPaymentDate.toISOString());

          // Do NOT create a new pending payment - the client generates PIX from portal
          console.log("Subscription advanced to next_payment:", nextPaymentDate.toISOString());

          // Create invoice
          const year = new Date().getFullYear();
          const month = String(new Date().getMonth() + 1).padStart(2, "0");
          const invoiceNumber = `NF-${year}${month}-${paymentRecord.id.slice(-4).toUpperCase()}`;
          const invoiceDescription = `Valor pago referente ao plano ativo: ${subscription.plan_name}`;

          if (paymentRecord.client_id) {
            await supabase
              .from("invoices")
              .insert({
                payment_id: paymentRecord.id,
                client_id: paymentRecord.client_id,
                number: invoiceNumber,
                amount: paymentRecord.amount,
                status: "issued",
                description: invoiceDescription,
              });

            console.log("Invoice created:", invoiceNumber);
          } else {
            console.log("Skipping invoice creation because payment has no client_id");
          }

          console.log("Subscription recurrence completed for payment:", paymentId);
        }
      } else {
        // Single charge - create invoice without subscription linkage
        if (paymentRecord.client_id) {
          const year = new Date().getFullYear();
          const month = String(new Date().getMonth() + 1).padStart(2, "0");
          const invoiceNumber = `NF-${year}${month}-${paymentRecord.id.slice(-4).toUpperCase()}`;

          await supabase
            .from("invoices")
            .insert({
              payment_id: paymentRecord.id,
              client_id: paymentRecord.client_id,
              number: invoiceNumber,
              amount: paymentRecord.amount,
              status: "issued",
              description: paymentRecord.description || "Pagamento avulso",
            });

          console.log("Single charge invoice created:", invoiceNumber);
        } else {
          console.log("Skipping single charge invoice creation because payment has no client_id");
        }
      }

      // Send WhatsApp payment confirmation (with idempotency guard)
      if (paymentRecord.client_id) {
        try {
          // Check if a confirmation was already sent for this payment (prevent duplicate webhooks)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: existingMsg } = await supabase
            .from("whatsapp_messages")
            .select("id")
            .eq("client_id", paymentRecord.client_id)
            .eq("message_type", "payment_confirmed_auto")
            .gte("created_at", fiveMinutesAgo)
            .limit(1)
            .maybeSingle();

          if (existingMsg) {
            console.log("WhatsApp confirmation already sent recently for this client, skipping duplicate");
          } else {
          const { data: client } = await supabase
            .from("clients")
            .select("id, name, phone")
            .eq("id", paymentRecord.client_id)
            .single();

          if (client?.phone) {
            let phone = client.phone.replace(/\D/g, "");
            if (!phone.startsWith("55")) phone = "55" + phone;

            const formattedAmount = `R$ ${Number(paymentRecord.amount).toFixed(2).replace(".", ",")}`;
            
            // Get plan name from subscription or description
            let planName = "Pagamento";
            if (subscriptionId) {
              const { data: sub } = await supabase
                .from("subscriptions")
                .select("plan_name")
                .eq("id", subscriptionId)
                .single();
              planName = sub?.plan_name || planName;
            } else {
              planName = paymentRecord.description?.replace("Cobrança - ", "") || planName;
            }

            // Fetch template from DB
            const { data: templateData } = await supabase
              .from("whatsapp_templates")
              .select("*")
              .eq("template_key", "payment_confirmed")
              .eq("is_active", true)
              .single();

            let confirmMessage: string;
            let sendImage = true;
            let sendButton = true;
            let imageUrl: string | undefined;
            let buttonText: string | undefined;
            let buttonUrl: string | undefined;

            if (templateData) {
              confirmMessage = templateData.message_template
                .replace(/\{\{client_name\}\}/g, client.name)
                .replace(/\{\{plan_name\}\}/g, planName)
                .replace(/\{\{amount\}\}/g, formattedAmount);
              sendButton = templateData.button_enabled;
              sendImage = !!templateData.image_url;
              imageUrl = templateData.image_url || undefined;
              buttonText = templateData.button_text || undefined;
              buttonUrl = templateData.button_url || undefined;
            } else {
              confirmMessage = `Ola ${client.name}! 💈\n\n` +
                `✅ *Pagamento confirmado!*\n\n` +
                `Recebemos seu pagamento de *${formattedAmount}* referente ao plano *${planName}* com sucesso.\n\n` +
                `Obrigado por manter sua assinatura em dia!\n\n` +
                `Qualquer duvida, estamos a disposicao.`;
            }

            const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

            await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseAnonKey}`,
              },
              body: JSON.stringify({
                phone,
                message: confirmMessage,
                clientId: client.id,
                type: "payment_confirmed_auto",
                sendImage,
                imageUrl,
                sendButton,
                buttonText,
                buttonUrl,
              }),
            });

            console.log("WhatsApp payment confirmation sent");
          }
          }
        } catch (whatsappErr: any) {
          console.error("Error sending WhatsApp confirmation:", whatsappErr.message);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 });
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Mapeia o status da Mistic Pay para o status interno do banco.
 * Conforme documentação oficial, os estados possíveis são:
 * "COMPLETO", "PENDENTE", "CANCELADO", "EXPIRADO", "FALHA"
 */
const mapMisticStatus = (status: string): { dbStatus: string; isPaid: boolean } => {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETO") return { dbStatus: "paid", isPaid: true };
  if (s === "CANCELADO" || s === "EXPIRADO" || s === "FALHA") return { dbStatus: "cancelled", isPaid: false };
  return { dbStatus: "pending", isPaid: false };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log("Mistic Pay webhook received:", JSON.stringify(body));

    // Estrutura real do webhook de depósito conforme documentação:
    // {
    //   transactionId: 31484480,
    //   transactionType: "DEPOSITO",
    //   transactionMethod: "PIX",
    //   clientName: "Nome do cliente",
    //   clientDocument: "12345678909",
    //   status: "COMPLETO",
    //   value: 455,
    //   fee: 23,
    //   e2e: "..."
    // }
    const {
      transactionId,
      status,
      value,
    } = body;

    if (!transactionId) {
      console.log("No transactionId in webhook body — ignoring");
      return new Response("OK", { status: 200 });
    }

    const transactionIdStr = transactionId?.toString();
    const { dbStatus, isPaid } = mapMisticStatus(status);
    const paidAt = isPaid ? new Date().toISOString() : null;

    console.log(`Processing webhook: transactionId=${transactionIdStr} status=${status} -> dbStatus=${dbStatus}`);

    // ─── Buscar pagamento pelo transaction_id (que é o ID da Mistic) ──────────
    let { data: paymentRecord } = await supabase
      .from("payments")
      .select("id, subscription_id, client_id, amount, description, status, proposal_id, proposal_payment_type, payment_method")
      .eq("transaction_id", transactionIdStr)
      .maybeSingle();

    // ─── Fallback: buscar pelo clientTransactionId da Mistic ─────────────────
    // O campo "transactionId" que enviamos na criação fica no campo "clientTransactionId"
    // da Mistic. No webhook, o campo "transactionId" é o ID INTERNO da Mistic.
    // Precisamos buscar também pelo externalReference que enviamos (sub:, cl:, proposal:)
    if (!paymentRecord) {
      console.log("Payment not found by transaction_id, trying clientTransactionId lookup...");
      // Não temos acesso ao clientTransactionId no webhook de depósito padrão,
      // mas o valor (value) pode nos ajudar a encontrar o pagamento pendente mais recente.
      // Registramos o ID da Mistic quando criamos — então o campo transaction_id deve funcionar.
      console.log("No payment record found for transactionId:", transactionIdStr);
      return new Response("OK", { status: 200 });
    }

    // ─── Ignorar se já está no mesmo status ──────────────────────────────────
    if (paymentRecord.status === dbStatus) {
      console.log("Payment already in status:", dbStatus, "- skipping");
      return new Response("OK", { status: 200 });
    }

    // ─── Atualizar pagamento (atomic update para evitar duplicatas) ───────────
    const { data: updatedRows, error: updateError } = await supabase
      .from("payments")
      .update({ status: dbStatus, paid_at: paidAt, transaction_id: transactionIdStr })
      .eq("id", paymentRecord.id)
      .neq("status", dbStatus)
      .select("id");

    if (updateError) {
      console.error("Error updating payment in DB:", updateError);
    } else if (!updatedRows || updatedRows.length === 0) {
      console.log("Payment was already updated by another concurrent webhook - skipping");
      return new Response("OK", { status: 200 });
    } else {
      console.log("Payment updated successfully:", { transactionIdStr, status: dbStatus });
    }

    // ─── Processar lógica pós-pagamento ──────────────────────────────────────
    if (isPaid) {
      // Atualizar proposta se vinculada
      if (paymentRecord.proposal_id) {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("status")
          .eq("id", paymentRecord.proposal_id)
          .maybeSingle();

        const nextProposalStatus =
          paymentRecord.proposal_payment_type === "entry" && proposal?.status !== "paid"
            ? "entry_paid"
            : "paid";

        const proposalUpdate =
          paymentRecord.proposal_payment_type === "entry"
            ? { status: nextProposalStatus, entry_paid_at: paidAt }
            : { status: "paid", paid_at: paidAt };

        await supabase
          .from("proposals")
          .update(proposalUpdate)
          .eq("id", paymentRecord.proposal_id);

        console.log("Proposal updated from Mistic webhook:", paymentRecord.proposal_id);
      }

      let subscriptionId = paymentRecord.subscription_id;

      // Tentar vincular assinatura se não estiver vinculada
      if (!subscriptionId && paymentRecord.client_id) {
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
          await supabase
            .from("payments")
            .update({ subscription_id: subscriptionId })
            .eq("id", paymentRecord.id);
          console.log("Payment linked to subscription:", subscriptionId);
        }
      }

      // Avançar assinatura para próximo mês
      if (subscriptionId) {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .single();

        if (subscription) {
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
          const lastDay = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 1, 0).getDate();
          nextPaymentDate.setDate(Math.min(currentDay, lastDay));
          nextPaymentDate.setHours(12, 0, 0, 0);

          await supabase
            .from("subscriptions")
            .update({ status: "active", next_payment: nextPaymentDate.toISOString() })
            .eq("id", subscriptionId);

          console.log("Subscription advanced to next_payment:", nextPaymentDate.toISOString());

          // Criar NF
          if (paymentRecord.client_id) {
            const year = new Date().getFullYear();
            const month = String(new Date().getMonth() + 1).padStart(2, "0");
            const invoiceNumber = `NF-${year}${month}-${paymentRecord.id.slice(-4).toUpperCase()}`;

            await supabase.from("invoices").insert({
              payment_id: paymentRecord.id,
              client_id: paymentRecord.client_id,
              number: invoiceNumber,
              amount: paymentRecord.amount,
              status: "issued",
              description: `Valor pago referente ao plano ativo: ${subscription.plan_name}`,
            });

            console.log("Invoice created:", invoiceNumber);
          }
        }
      } else if (paymentRecord.client_id) {
        // Cobrança avulsa — criar NF
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, "0");
        const invoiceNumber = `NF-${year}${month}-${paymentRecord.id.slice(-4).toUpperCase()}`;

        await supabase.from("invoices").insert({
          payment_id: paymentRecord.id,
          client_id: paymentRecord.client_id,
          number: invoiceNumber,
          amount: paymentRecord.amount,
          status: "issued",
          description: paymentRecord.description || "Pagamento avulso",
        });

        console.log("Single charge invoice created:", invoiceNumber);
      }

      // ─── Enviar confirmação WhatsApp (dedup atômico) ──────────────────────
      if (paymentRecord.client_id) {
        try {
          const { data: claimedRows } = await supabase
            .from("payments")
            .update({ notification_sent_at: new Date().toISOString() })
            .eq("id", paymentRecord.id)
            .is("notification_sent_at", null)
            .select("id");

          if (!claimedRows || claimedRows.length === 0) {
            console.log("WhatsApp confirmation already sent - skipping duplicate");
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

              const { data: templateData } = await supabase
                .from("whatsapp_templates")
                .select("*")
                .eq("template_key", "payment_confirmed")
                .eq("is_active", true)
                .single();

              let confirmMessage: string;
              let sendImage = false;
              let sendButton = false;
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
                confirmMessage =
                  `Ola ${client.name}! 💈\n\n` +
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
                  paymentId: paymentRecord.id,
                  sendImage,
                  imageUrl,
                  sendButton,
                  buttonText,
                  buttonUrl,
                }),
              });

              console.log("WhatsApp payment confirmation sent for payment", paymentRecord.id);
            }
          }
        } catch (whatsappErr: any) {
          console.error("Error sending WhatsApp confirmation:", whatsappErr.message);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Mistic webhook error:", error);
    return new Response("OK", { status: 200 });
  }
});

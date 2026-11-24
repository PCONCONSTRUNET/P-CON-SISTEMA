import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PUBLIC_APP_URL = "https://www.pconassinantes.site";

export function buildSubscriptionPaymentUrl(token: string): string {
  return `${PUBLIC_APP_URL}/pagar-assinatura/${token}`;
}

export function computeNextMonthlyDueDateISO(currentNextPayment: string): string {
  const d = new Date(currentNextPayment || new Date().toISOString());
  // Usa data calendário em America/Sao_Paulo para evitar desvio de fuso
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const [yStr, mStr, dayStr] = ymd.split("-");
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1; // 0..11
  const day = Number(dayStr);

  const nextMonthIndex = monthIndex + 1;
  const targetYear = nextMonthIndex > 11 ? year + 1 : year;
  const targetMonth = nextMonthIndex > 11 ? 0 : nextMonthIndex;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  // 12:00 BRT = 15:00 UTC
  const mm = String(targetMonth + 1).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}T15:00:00.000Z`;
}

export async function ensurePendingSubscriptionLink(
  supabase: SupabaseClient,
  subscription: {
    id: string;
    client_id: string;
    value: number;
    next_payment: string;
    status?: string;
  },
): Promise<{ id: string; token: string; url: string } | null> {
  try {
    const { data: existing } = await supabase
      .from("subscription_payment_links")
      .select("id, token")
      .eq("subscription_id", subscription.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) {
      return {
        id: existing.id,
        token: existing.token,
        url: buildSubscriptionPaymentUrl(existing.token),
      };
    }

    if (subscription.status && subscription.status !== "active") {
      return null;
    }

    const { data: created, error } = await supabase
      .from("subscription_payment_links")
      .insert({
        subscription_id: subscription.id,
        client_id: subscription.client_id,
        amount: subscription.value,
        due_date: subscription.next_payment,
        status: "pending",
      })
      .select("id, token")
      .single();

    if (error || !created) {
      console.error("[subscription-cycle] Failed to create pending link:", error);
      return null;
    }

    return {
      id: created.id,
      token: created.token,
      url: buildSubscriptionPaymentUrl(created.token),
    };
  } catch (err) {
    console.error("[subscription-cycle] ensurePendingSubscriptionLink error:", err);
    return null;
  }
}

export interface CompletePaymentParams {
  paymentId: string;
  subscriptionId?: string | null;
  subscriptionLinkId?: string | null;
  proposalId?: string | null;
  proposalPaymentType?: string | null;
  clientId?: string | null;
  amount?: number | null;
  description?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
}

export interface CompletePaymentResult {
  advanced: boolean;
  nextPayment?: string | null;
  newLinkId?: string | null;
  newLinkToken?: string | null;
  newLinkUrl?: string | null;
}

export async function completeSubscriptionPaymentCycle(
  supabase: SupabaseClient,
  params: CompletePaymentParams,
): Promise<CompletePaymentResult> {
  const paidAt = params.paidAt || new Date().toISOString();
  const paymentMethod = params.paymentMethod || "PIX";
  let subscriptionId = params.subscriptionId || null;

  // 1. Atualiza proposta se houver
  if (params.proposalId) {
    const { data: proposal } = await supabase
      .from("proposals")
      .select("status")
      .eq("id", params.proposalId)
      .maybeSingle();

    const nextProposalStatus =
      params.proposalPaymentType === "entry" && proposal?.status !== "paid"
        ? "entry_paid"
        : "paid";

    await supabase
      .from("proposals")
      .update(
        params.proposalPaymentType === "entry"
          ? { status: nextProposalStatus, entry_paid_at: paidAt }
          : { status: "paid", paid_at: paidAt },
      )
      .eq("id", params.proposalId);
  }

  // 2. Se pagamento veio sem subscription_id mas tem client_id e amount, tenta casar assinatura ativa
  if (!subscriptionId && params.clientId && params.amount != null) {
    const { data: matchingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("client_id", params.clientId)
      .eq("status", "active")
      .eq("value", params.amount)
      .limit(1)
      .maybeSingle();

    if (matchingSub?.id) {
      subscriptionId = matchingSub.id;
      await supabase
        .from("payments")
        .update({ subscription_id: subscriptionId })
        .eq("id", params.paymentId);
    }
  }

  let result: CompletePaymentResult = { advanced: false };

  // 3. Se for assinatura, executa RPC idempotente que:
  //    - marca link atual como paid
  //    - avança assinatura para o mês seguinte
  //    - emite fatura (NF)
  //    - gera o novo link pendente do próximo mês
  if (subscriptionId) {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "advance_subscription_cycle",
      {
        p_subscription_id: subscriptionId,
        p_payment_id: params.paymentId,
        p_subscription_link_id: params.subscriptionLinkId || null,
        p_payment_method: paymentMethod,
        p_paid_at: paidAt,
      },
    );

    if (!rpcError && rpcData) {
      const token = (rpcData as any).new_link_token || null;
      result = {
        advanced: !!(rpcData as any).advanced,
        nextPayment: (rpcData as any).next_payment || null,
        newLinkId: (rpcData as any).new_link_id || null,
        newLinkToken: token,
        newLinkUrl: token ? buildSubscriptionPaymentUrl(token) : null,
      };
    } else {
      console.warn("[subscription-cycle] RPC fallback:", rpcError?.message);
      // Fallback caso RPC ainda não tenha sido aplicada no banco
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, client_id, plan_name, value, next_payment")
        .eq("id", subscriptionId)
        .maybeSingle();

      if (sub?.next_payment) {
        const nextPayment = computeNextMonthlyDueDateISO(sub.next_payment);
        await supabase
          .from("subscriptions")
          .update({ next_payment: nextPayment, status: "active" })
          .eq("id", subscriptionId);

        if (params.clientId) {
          const { data: existingInv } = await supabase
            .from("invoices")
            .select("id")
            .eq("payment_id", params.paymentId)
            .maybeSingle();

          if (!existingInv) {
            const now = new Date();
            const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
            await supabase.from("invoices").insert({
              payment_id: params.paymentId,
              client_id: params.clientId,
              number: `NF-${ym}-${params.paymentId.slice(-4).toUpperCase()}`,
              amount: params.amount ?? sub.value,
              status: "issued",
              description: `Valor pago referente ao plano ativo: ${sub.plan_name}`,
            });
          }
        }
        result = { advanced: true, nextPayment };
      }
    }
  } else if (params.clientId) {
    // Cobrança avulsa: garante emissão de fatura se ainda não existir
    const { data: existingInv } = await supabase
      .from("invoices")
      .select("id")
      .eq("payment_id", params.paymentId)
      .maybeSingle();

    if (!existingInv) {
      const now = new Date();
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      await supabase.from("invoices").insert({
        payment_id: params.paymentId,
        client_id: params.clientId,
        number: `NF-${ym}-${params.paymentId.slice(-4).toUpperCase()}`,
        amount: params.amount ?? 0,
        status: "issued",
        description: params.description || "Pagamento avulso",
      });
    }
  }

  // 4. Confirmação WhatsApp + notificação administrativa (com mutex atômico em notification_sent_at)
  if (params.clientId) {
    try {
      const { data: claimedRows } = await supabase
        .from("payments")
        .update({ notification_sent_at: new Date().toISOString() })
        .eq("id", params.paymentId)
        .is("notification_sent_at", null)
        .select("id");

      if (claimedRows && claimedRows.length > 0) {
        const { data: client } = await supabase
          .from("clients")
          .select("id, name, phone")
          .eq("id", params.clientId)
          .maybeSingle();

        let planName = "Pagamento";
        if (subscriptionId) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("plan_name")
            .eq("id", subscriptionId)
            .maybeSingle();
          planName = sub?.plan_name || planName;
        } else {
          planName = params.description?.replace("Cobrança - ", "") || planName;
        }

        const formattedAmount = `R$ ${Number(params.amount || 0).toFixed(2).replace(".", ",")}`;

        // Cria notificação para o painel admin
        try {
          await supabase.from("admin_notifications").insert({
            category: "payments",
            type: "payment_received",
            title: `Pagamento confirmado - ${client?.name || "Cliente"}`,
            message: `${client?.name || "Cliente"} pagou ${formattedAmount} (${paymentMethod}) referente a ${planName}.`,
            metadata: {
              payment_id: params.paymentId,
              subscription_id: subscriptionId,
              client_id: params.clientId,
              amount: params.amount,
              payment_method: paymentMethod,
            },
          });
        } catch (notifErr) {
          console.warn("[subscription-cycle] Admin notification warning:", notifErr);
        }

        // Envia WhatsApp de confirmação
        if (client?.phone) {
          let phone = client.phone.replace(/\D/g, "");
          if (!phone.startsWith("55")) phone = "55" + phone;

          const { data: templateData } = await supabase
            .from("whatsapp_templates")
            .select("*")
            .eq("template_key", "payment_confirmed")
            .eq("is_active", true)
            .maybeSingle();

          const linkToShare = result.newLinkUrl || `${PUBLIC_APP_URL}/cliente`;

          let confirmMessage: string;
          let sendImage = true;
          let sendButton = true;
          let imageUrl: string | undefined;
          let buttonText: string | undefined;
          let buttonUrl: string | undefined;

          if (templateData) {
            confirmMessage = (templateData.message_template as string)
              .replace(/\{\{client_name\}\}/g, client.name)
              .replace(/\{\{plan_name\}\}/g, planName)
              .replace(/\{\{amount\}\}/g, formattedAmount)
              .replace(/\{\{payment_link\}\}/g, linkToShare);
            sendButton = templateData.button_enabled;
            sendImage = !!templateData.image_url;
            imageUrl = templateData.image_url || undefined;
            buttonText = templateData.button_text || undefined;
            buttonUrl = templateData.button_url || undefined;
          } else {
            confirmMessage =
              `Olá ${client.name}! 💈\n\n` +
              `✅ *Pagamento confirmado!*\n\n` +
              `Recebemos seu pagamento de *${formattedAmount}* referente ao plano *${planName}* com sucesso.\n\n` +
              `Obrigado por manter sua assinatura em dia!\n\n` +
              `Qualquer dúvida, estamos à disposição.`;
          }

          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
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
              paymentId: params.paymentId,
              sendImage,
              imageUrl,
              sendButton,
              buttonText,
              buttonUrl,
            }),
          });
        }
      }
    } catch (notifyErr) {
      console.error("[subscription-cycle] Error sending notification/WhatsApp:", notifyErr);
    }
  }

  return result;
}

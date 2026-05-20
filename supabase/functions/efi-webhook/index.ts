import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();

    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch (_) {
      // corpo vazio ok
    }

    console.log("[efi-webhook] Received notification:", JSON.stringify(body));

    // A EFI Bank envia notificações de Pix no formato:
    // { pix: [ { txid, valor, horario, endToEndId, infoPagador, ... } ] }
    const pixList: any[] = body.pix || [];

    if (pixList.length === 0) {
      console.log("[efi-webhook] No pix in notification body");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const pix of pixList) {
      const txid = pix.txid;
      if (!txid) {
        console.warn("[efi-webhook] PIX sem txid:", JSON.stringify(pix));
        continue;
      }

      console.log("[efi-webhook] Processing txid:", txid, "| valor:", pix.valor);

      // Busca o pagamento pelo transaction_id (txid da EFI)
      const { data: paymentRecord, error: fetchError } = await supabase
        .from("payments")
        .select("id, proposal_id, proposal_payment_type, subscription_id, client_id, status")
        .eq("transaction_id", txid)
        .maybeSingle();

      if (fetchError) {
        console.error("[efi-webhook] Error fetching payment:", fetchError);
        continue;
      }

      if (!paymentRecord) {
        console.warn("[efi-webhook] Payment not found for txid:", txid);
        continue;
      }

      if (paymentRecord.status === "paid") {
        console.log("[efi-webhook] Payment already paid, skipping:", txid);
        continue;
      }

      const paidAt = pix.horario || new Date().toISOString();

      // Marca o pagamento como pago
      const { error: updateError } = await supabase
        .from("payments")
        .update({ status: "paid", paid_at: paidAt })
        .eq("id", paymentRecord.id);

      if (updateError) {
        console.error("[efi-webhook] Error updating payment:", updateError);
        continue;
      }

      console.log("[efi-webhook] Payment marked as paid:", paymentRecord.id);

      // Se for uma assinatura, atualiza a data do próximo pagamento
      if (paymentRecord.subscription_id) {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("next_payment, billing_cycle")
          .eq("id", paymentRecord.subscription_id)
          .maybeSingle();

        if (subscription?.next_payment) {
          const nextDate = new Date(subscription.next_payment);
          const cycle = subscription.billing_cycle || "monthly";

          if (cycle === "monthly") {
            nextDate.setMonth(nextDate.getMonth() + 1);
          } else if (cycle === "yearly") {
            nextDate.setFullYear(nextDate.getFullYear() + 1);
          } else if (cycle === "quarterly") {
            nextDate.setMonth(nextDate.getMonth() + 3);
          } else if (cycle === "weekly") {
            nextDate.setDate(nextDate.getDate() + 7);
          }

          await supabase
            .from("subscriptions")
            .update({ next_payment: nextDate.toISOString().split("T")[0] })
            .eq("id", paymentRecord.subscription_id);

          console.log("[efi-webhook] Subscription next_payment updated:", nextDate.toISOString());
        }
      }

      // Se for uma proposta, atualiza o status da proposta
      if (paymentRecord.proposal_id) {
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

        console.log("[efi-webhook] Proposal updated:", paymentRecord.proposal_id, "→", nextStatus);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[efi-webhook] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { completeSubscriptionPaymentCycle } from "../_shared/subscription-cycle.ts";

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
        .select("id, proposal_id, proposal_payment_type, subscription_id, subscription_link_id, client_id, amount, description, status")
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

      // Marca o pagamento como pago atomicamente (evita corrida com check-status)
      const { data: updatedRows, error: updateError } = await supabase
        .from("payments")
        .update({ status: "paid", paid_at: paidAt })
        .eq("id", paymentRecord.id)
        .neq("status", "paid")
        .select("id");

      if (updateError) {
        console.error("[efi-webhook] Error updating payment:", updateError);
        continue;
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.log("[efi-webhook] Payment already marked paid concurrently:", txid);
        continue;
      }

      console.log("[efi-webhook] Payment marked as paid:", paymentRecord.id);

      await completeSubscriptionPaymentCycle(supabase, {
        paymentId: paymentRecord.id,
        subscriptionId: paymentRecord.subscription_id,
        subscriptionLinkId: paymentRecord.subscription_link_id,
        proposalId: paymentRecord.proposal_id,
        proposalPaymentType: paymentRecord.proposal_payment_type,
        clientId: paymentRecord.client_id,
        amount: paymentRecord.amount,
        description: paymentRecord.description,
        paymentMethod: "PIX",
        paidAt,
      });
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

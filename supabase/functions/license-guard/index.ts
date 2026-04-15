// supabase/functions/license-guard/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) throw new Error("Token não fornecido.");

    // MODO DE TESTE: Se usar o token TEST_BLOCK, bloqueia na hora!
    if (token === "TEST_BLOCK") {
      console.log("Token de teste detectado. Bloqueando acesso.");
      return new Response(
        JSON.stringify({ blocked: true, reason: "test_mode", message: "BLOQUEIO DE TESTE ATIVADO" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Verificando licença para o token: ${token}`);

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, status")
      .eq("license_token", token)
      .maybeSingle();

    if (clientError || !client) {
      console.log(`Token inválido: ${token}`);
      return new Response(
        JSON.stringify({ blocked: true, reason: "invalid_token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (client.status === "inactive") {
      return new Response(
        JSON.stringify({ blocked: true, reason: "client_inactive" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verificar se a ASSINATURA está vencida (next_billing_date)
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("next_billing_date, status")
      .eq("client_id", client.id)
      .maybeSingle();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let blockedBySubscription = false;
    if (subscription && subscription.next_billing_date) {
      const nextBilling = new Date(subscription.next_billing_date);
      const diffTime = today.getTime() - nextBilling.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`Assinatura | Próximo vencimento: ${subscription.next_billing_date} | Dias de atraso: ${diffDays}`);
      
      // Bloqueia se a data de renovação passou há mais de 7 dias E não está cancelada
      if (diffDays > 7 && subscription.status !== 'canceled') {
        blockedBySubscription = true;
      }
    }

    // 3. Verificar se existem PAGAMENTOS gerados e não pagos
    const { data: allPending, error: paymentError } = await supabase
      .from("payments")
      .select("id, due_date")
      .eq("client_id", client.id)
      .neq("status", "paid");

    const blockedByPayment = allPending?.some(p => {
      const dueDate = new Date(p.due_date);
      const diffTime = today.getTime() - dueDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 7;
    });

    const isBlocked = blockedBySubscription || blockedByPayment;
    
    console.log(`Cliente: ${client.name} | Bloqueado: ${isBlocked} (Sub: ${blockedBySubscription}, Pay: ${blockedByPayment})`);

    return new Response(
      JSON.stringify({
        blocked: isBlocked,
        clientName: client.name,
        reason: isBlocked ? (blockedBySubscription ? "subscription_overdue" : "payment_overdue") : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get token from URL or Body
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Token de licença não fornecido.");
    }

    // 1. Encontrar o cliente pelo token
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, status")
      .eq("license_token", token)
      .maybeSingle();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ 
          blocked: true, 
          reason: "invalid_token",
          message: "Licença inválida ou não encontrada." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se o cliente estiver inativo manualmente no P-CON, bloqueia direto
    if (client.status === "inactive") {
      return new Response(
        JSON.stringify({ 
          blocked: true, 
          reason: "client_inactive",
          message: "Seu acesso foi desativado pelo administrador." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verificar pagamentos atrasados há mais de 7 dias
    // Buscamos qualquer pagamento 'pending' onde due_date < (hoje - 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: overduePayments, error: paymentError } = await supabase
      .from("payments")
      .select("id, amount, due_date")
      .eq("client_id", client.id)
      .eq("status", "pending")
      .lt("due_date", sevenDaysAgo.toISOString());

    if (paymentError) {
      console.error("Erro ao consultar pagamentos:", paymentError);
      throw new Error("Erro interno ao verificar faturas.");
    }

    const isBlocked = overduePayments && overduePayments.length > 0;

    return new Response(
      JSON.stringify({
        blocked: isBlocked,
        reason: isBlocked ? "overdue" : null,
        clientName: client.name,
        overdueCount: overduePayments?.length || 0,
        message: isBlocked 
          ? "Sistema bloqueado por inadimplência superior a 7 dias." 
          : "Acesso liberado."
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

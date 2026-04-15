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

    // Régua de 7 dias - Garantindo comparação apenas por DATA (ignorando horas)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const toleranceDate = new Date(today);
    toleranceDate.setDate(toleranceDate.getDate() - 7);
    
    const toleranceISO = toleranceDate.toISOString().split('T')[0]; // Pega apenas AAAA-MM-DD
    
    console.log(`Buscando faturas pendentes com vencimento anterior a: ${toleranceISO}`);

    const { data: overdue, error } = await supabase
      .from("payments")
      .select("id, due_date")
      .eq("client_id", client.id)
      .eq("status", "pending")
      .lt("due_date", toleranceISO);

    const isBlocked = overdue && overdue.length > 0;
    
    console.log(`Cliente: ${client.name} | Bloqueado: ${isBlocked} | Faturas: ${overdue?.length}`);

    return new Response(
      JSON.stringify({
        blocked: isBlocked,
        clientName: client.name,
        reason: isBlocked ? "overdue" : null,
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

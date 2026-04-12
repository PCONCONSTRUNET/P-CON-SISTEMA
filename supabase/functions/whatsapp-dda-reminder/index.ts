import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UAZAPI_BASE_URL = "https://btzap.uazapi.com";
const ADMIN_PHONE = "5548996915303";

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiToken = Deno.env.get("BTZAP_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!apiToken) {
      console.error("BTZAP_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "API do Whatsapp não configurada" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Compute boundaries for exactly 10 days from now in BRT timezone
    const toYMDInSaoPaulo = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

    const now = new Date();
    const todayBrt = toYMDInSaoPaulo(now);
    
    // Day 10 boundaries
    const inTenDays = new Date(new Date(`${todayBrt}T12:00:00-03:00`).getTime() + 10 * 86400000);
    const inTenDaysBrt = toYMDInSaoPaulo(inTenDays);
    const startOfInTenDaysUtc = new Date(`${inTenDaysBrt}T00:00:00-03:00`).toISOString();
    const startOfInElevenDaysUtc = new Date(
      new Date(`${inTenDaysBrt}T00:00:00-03:00`).getTime() + 86400000
    ).toISOString();

    console.log(`Checking contracts expiring in 10 DAYS (BRT): ${inTenDaysBrt}`);

    // Fetch active subscriptions expiring in 10 days
    const { data: subs10Days, error } = await supabase
      .from("subscriptions")
      .select(`
        id, value, next_payment, status, plan_name,
        client:clients(name)
      `)
      .eq("status", "active")
      .gte("next_payment", startOfInTenDaysUtc)
      .lt("next_payment", startOfInElevenDaysUtc);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      throw error;
    }

    const subscriptions = subs10Days || [];
    console.log(`Found ${subscriptions.length} subscriptions expiring in 10 days`);

    if (subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura vencendo em 10 dias" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Connect to Whatsapp API
    const uazapiAuthHeaders = { token: apiToken };
    const results = { sent: 0, errors: [] as string[] };

    for (const sub of subscriptions) {
      const clientName = (sub.client as any)?.name || "Cliente Base";
      const planName = sub.plan_name || "Assinatura";
      const formattedValue = `R$ ${sub.value.toFixed(2).replace(".", ",")}`;

      const messageText = `⚠️ *LEMBRETE DE EMISSÃO DDA* ⚠️\n\nA fatura do cliente *${clientName}* vence daqui a exatamente 10 dias (${inTenDaysBrt.replace(/-/g, "/")}).\n\n- Plano: ${planName}\n- Valor: ${formattedValue}\n\n*Acesse o painel administrativao (Aba Emissão DDA) para gerar o boleto.*`;

      try {
        console.log(`Sending DDA reminder to Admin for client ${clientName}`);

        const response = await fetch(`${UAZAPI_BASE_URL}/send/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...uazapiAuthHeaders },
          body: JSON.stringify({ 
            number: ADMIN_PHONE, 
            body: messageText 
          }),
        });

        const responseText = await response.text();
        let resultData;
        try { resultData = JSON.parse(responseText); } catch { resultData = { raw: responseText }; }

        const isSuccess = response.status === 200 && (resultData.key || resultData.messageId || resultData.messageid || resultData.status === "PENDING" || resultData.status === "SUCCESS");

        if (isSuccess) {
          results.sent++;
        } else {
          results.errors.push(`Admin Alert for ${clientName}: HTTP ${response.status}`);
        }
      } catch (err: any) {
        console.error(`Error sending message for ${clientName}:`, err.message);
        results.errors.push(`Admin Alert for ${clientName}: ${err.message}`);
      }
    }

    console.log("Admin DDA Reminders completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in admin reminders:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

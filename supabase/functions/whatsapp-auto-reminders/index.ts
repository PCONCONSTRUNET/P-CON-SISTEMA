import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fallback values
const DEFAULT_IMAGE_URL = "https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg";
const DEFAULT_CLIENT_AREA_URL = "https://www.assinaturaspcon.sbs/cliente";
const UAZAPI_BASE_URL = "https://btzap.uazapi.com";

const AUTO_REMINDERS_ENABLED = true;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!AUTO_REMINDERS_ENABLED) {
    console.log("Auto reminders are temporarily disabled");
    return new Response(
      JSON.stringify({ success: true, message: "Auto reminders temporarily disabled", results: { due_today_sent: 0, errors: [] } }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const apiToken = Deno.env.get("BTZAP_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!apiToken) {
      console.error("UAZAPI not configured");
      return new Response(
        JSON.stringify({ success: false, error: "UAZAPI não configurado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the template from DB
    const { data: templateData } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("template_key", "due_today")
      .eq("is_active", true)
      .single();

    if (!templateData) {
      console.log("Template 'due_today' not found or inactive");
      return new Response(
        JSON.stringify({ success: true, message: "Template inactive", results: { due_today_sent: 0, errors: [] } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const messageTemplate = templateData.message_template;
    const imageUrl = templateData.image_url || DEFAULT_IMAGE_URL;
    const buttonEnabled = templateData.button_enabled;
    const buttonText = templateData.button_text || "Acessar Área do Cliente";
    const buttonUrl = templateData.button_url || DEFAULT_CLIENT_AREA_URL;

    // Compute date boundaries in America/Sao_Paulo (BRT, UTC-03)
    const toYMDInSaoPaulo = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

    const now = new Date();
    const todayBrt = toYMDInSaoPaulo(now);

    const startOfTodayUtc = new Date(`${todayBrt}T00:00:00-03:00`).toISOString();
    const startOfTomorrowUtc = new Date(
      new Date(`${todayBrt}T00:00:00-03:00`).getTime() + 86400000
    ).toISOString();

    console.log(`Checking payments due TODAY (D-0) in BRT: ${todayBrt}`);

    const { data: dueTodayPayments, error: dueError } = await supabase
      .from("payments")
      .select(`
        id, amount, due_date, status, description, subscription_id,
        client:clients(id, name, phone, email),
        subscription:subscriptions(plan_name)
      `)
      .eq("status", "pending")
      .gte("due_date", startOfTodayUtc)
      .lt("due_date", startOfTomorrowUtc);

    if (dueError) {
      console.error("Error fetching due payments:", dueError);
    }

    console.log(`Found ${dueTodayPayments?.length || 0} pending payments due today`);

    const results = {
      due_today_sent: 0,
      skipped_no_phone: 0,
      errors: [] as string[],
    };

    const uazapiAuthHeaders = { token: apiToken };

    const sendMessageWithImageAndButton = async (phone: string, message: string) => {
      const finalImageUrl = `${imageUrl}?v=${Date.now()}`;

      const mediaResponse = await fetch(`${UAZAPI_BASE_URL}/send/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...uazapiAuthHeaders },
        body: JSON.stringify({ number: phone, type: "image", file: finalImageUrl, text: message }),
      });

      const mediaResponseText = await mediaResponse.text();
      console.log(`UAZAPI /send/media response for ${phone}:`, mediaResponseText);

      let mediaResult;
      try { mediaResult = JSON.parse(mediaResponseText); } catch { mediaResult = { raw: mediaResponseText }; }

      const imageSuccess = mediaResponse.status === 200 && (mediaResult.key || mediaResult.chatid || mediaResult.messageid);

      if (imageSuccess && buttonEnabled) {
        const menuPayload = {
          number: phone,
          type: "button",
          text: "📱 Acesse sua área do cliente:",
          choices: [`${buttonText} | ${buttonUrl}`],
        };

        const menuResponse = await fetch(`${UAZAPI_BASE_URL}/send/menu`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...uazapiAuthHeaders },
          body: JSON.stringify(menuPayload),
        });

        const menuResponseText = await menuResponse.text();
        console.log(`UAZAPI /send/menu response for ${phone}:`, menuResponseText);
      }

      return { ...mediaResult, httpStatus: mediaResponse.status };
    };

    if (dueTodayPayments && dueTodayPayments.length > 0) {
      for (const payment of dueTodayPayments) {
        const client = payment.client as any;

        if (!client?.phone) {
          results.skipped_no_phone++;
          continue;
        }

        const planName = (payment.subscription as any)?.plan_name ||
                        payment.description?.replace("Cobrança - ", "") ||
                        "Assinatura";

        const formattedValue = `R$ ${payment.amount.toFixed(2).replace(".", ",")}`;

        // Replace placeholders in template
        const message = messageTemplate
          .replace(/\{\{client_name\}\}/g, client.name)
          .replace(/\{\{plan_name\}\}/g, planName)
          .replace(/\{\{amount\}\}/g, formattedValue);

        try {
          let phone = client.phone.replace(/\D/g, "");
          if (!phone.startsWith("55")) phone = "55" + phone;

          console.log(`Sending D-0 reminder to ${client.name} (${phone})`);

          const result = await sendMessageWithImageAndButton(phone, message);
          const isSuccess = result.httpStatus === 200 && (result.key || result.chatid || result.messageid);

          if (isSuccess) {
            results.due_today_sent++;
            await supabase.from("whatsapp_messages").insert({
              client_id: client.id,
              phone: phone,
              message: message,
              message_type: "auto_due_today",
              btzap_message_id: result.key?.id || result.messageId || null,
              remote_jid: result.key?.remoteJid || null,
              status: "sent",
            });
          } else {
            results.errors.push(`${client.name}: HTTP ${result.httpStatus}`);
          }
        } catch (err: any) {
          console.error(`Error sending to ${client.name}:`, err.message);
          results.errors.push(`${client.name}: ${err.message}`);
        }
      }
    }

    console.log("Auto reminders D-0 completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in auto reminders:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

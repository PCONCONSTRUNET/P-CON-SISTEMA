import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fallback values
const DEFAULT_IMAGE_URL = "https://bevahgtmcdicyhjnrylk.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg";
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

    // Fetch templates from DB
    const { data: templatesData } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .in("template_key", ["due_today", "subscription_reminder"])
      .eq("is_active", true);

    const dueTodayTemplate = templatesData?.find((t: any) => t.template_key === "due_today");
    const d1Template = templatesData?.find((t: any) => t.template_key === "subscription_reminder");

    if (!dueTodayTemplate && !d1Template) {
      console.log("No active templates found");
      return new Response(
        JSON.stringify({ success: true, message: "Templates inactive", results: { due_today_sent: 0, due_in_1_sent: 0, errors: [] } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Compute date boundaries in America/Sao_Paulo (BRT, UTC-03)
    const toYMDInSaoPaulo = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

    const now = new Date();
    const todayBrt = toYMDInSaoPaulo(now);

    const startOfTodayUtc = new Date(`${todayBrt}T00:00:00-03:00`).toISOString();
    const startOfTomorrowUtc = new Date(
      new Date(`${todayBrt}T00:00:00-03:00`).getTime() + 86400000
    ).toISOString();

    // Boundaries for D-1
    const inOneDay = new Date(new Date(`${todayBrt}T12:00:00-03:00`).getTime() + 1 * 86400000);
    const inOneDayBrt = toYMDInSaoPaulo(inOneDay);
    const startOfInOneDayUtc = new Date(`${inOneDayBrt}T00:00:00-03:00`).toISOString();
    const startOfInTwoDaysUtc = new Date(
      new Date(`${inOneDayBrt}T00:00:00-03:00`).getTime() + 86400000
    ).toISOString();

    console.log(`Checking payments due TODAY (D-0) in BRT: ${todayBrt}`);
    console.log(`Checking payments due in 1 DAY (D-1) in BRT: ${inOneDayBrt}`);

    let dueTodayPayments: any[] = [];
    if (dueTodayTemplate) {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id, amount, due_date, status, description, subscription_id,
          client:clients(id, name, phone, email),
          subscription:subscriptions(plan_name)
        `)
        .eq("status", "pending")
        .gte("due_date", startOfTodayUtc)
        .lt("due_date", startOfTomorrowUtc);

      if (error) console.error("Error fetching due today payments:", error);
      else dueTodayPayments = data || [];
    }

    console.log(`Found ${dueTodayPayments.length} pending payments due today`);

    let d1Payments: any[] = [];
    if (d1Template) {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id, amount, due_date, status, description, subscription_id,
          client:clients(id, name, phone, email),
          subscription:subscriptions(plan_name)
        `)
        .eq("status", "pending")
        .gte("due_date", startOfInOneDayUtc)
        .lt("due_date", startOfInTwoDaysUtc);

      if (error) console.error("Error fetching D-1 payments:", error);
      else d1Payments = data || [];
    }

    console.log(`Found ${d1Payments.length} pending payments due in 1 day`);

    const results = {
      due_today_sent: 0,
      due_in_1_sent: 0,
      skipped_no_phone: 0,
      errors: [] as string[],
    };

    const uazapiAuthHeaders = { token: apiToken };

    const sendMessageWithImageAndButton = async (phone: string, message: string, template: any) => {
      const tImageUrl = template.image_url || DEFAULT_IMAGE_URL;
      const tButtonEnabled = template.button_enabled;
      const tButtonText = template.button_text || "Acessar Área do Cliente";
      const tButtonUrl = template.button_url || DEFAULT_CLIENT_AREA_URL;

      const finalImageUrl = `${tImageUrl}?v=${Date.now()}`;

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

      if (imageSuccess && tButtonEnabled) {
        const menuPayload = {
          number: phone,
          type: "button",
          text: "📱 Acesse sua área do cliente:",
          choices: [`${tButtonText} | ${tButtonUrl}`],
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

    const processPayments = async (payments: any[], template: any, messageType: string) => {
      for (const payment of payments) {
        const client = payment.client as any;

        if (!client?.phone) {
          results.skipped_no_phone++;
          continue;
        }

        const planName = (payment.subscription as any)?.plan_name ||
                        payment.description?.replace("Cobrança - ", "") ||
                        "Assinatura";

        const formattedValue = `R$ ${payment.amount.toFixed(2).replace(".", ",")}`;

        const message = template.message_template
          .replace(/\{\{client_name\}\}/g, client.name)
          .replace(/\{\{plan_name\}\}/g, planName)
          .replace(/\{\{amount\}\}/g, formattedValue);

        try {
          let phone = client.phone.replace(/\D/g, "");
          if (!phone.startsWith("55")) phone = "55" + phone;

          console.log(`Sending ${messageType} reminder to ${client.name} (${phone})`);

          const result = await sendMessageWithImageAndButton(phone, message, template);
          const isSuccess = result.httpStatus === 200 && (result.key || result.chatid || result.messageid);

          if (isSuccess) {
            if (messageType === "auto_due_today") results.due_today_sent++;
            else if (messageType === "auto_due_in_1_day") results.due_in_1_sent++;

            await supabase.from("whatsapp_messages").insert({
              client_id: client.id,
              phone: phone,
              message: message,
              message_type: messageType,
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
    };

    if (dueTodayTemplate && dueTodayPayments.length > 0) {
      await processPayments(dueTodayPayments, dueTodayTemplate, "auto_due_today");
    }

    if (d1Template && d1Payments.length > 0) {
      await processPayments(d1Payments, d1Template, "auto_due_in_1_day");
    }

    console.log("Auto reminders completed:", results);

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


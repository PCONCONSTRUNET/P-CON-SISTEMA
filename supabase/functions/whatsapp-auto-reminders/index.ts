import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Fallback values
const DEFAULT_IMAGE_URL = "https://bevahgtmcdicyhjnrylk.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg";
const DEFAULT_CLIENT_AREA_URL = "https://www.pconassinantes.site/cliente";
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

    // Parse body for forceRun
    let body: any = {};
    try {
      if (req.body) {
        body = await req.json();
      }
    } catch (e) {
      // Body might be empty
    }

    const forceRun = body?.forceRun === true;

    // Get current schedule settings from DB
    const { data: settings } = await supabase
      .from('whatsapp_settings')
      .select('send_hour, send_minute')
      .maybeSingle();

    const scheduledHour = settings?.send_hour ?? 9;
    const scheduledMinute = settings?.send_minute ?? 0;

    // Get current time in Sao Paulo (BRT timezone)
    const nowBrtParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(new Date());

    const currentHour = parseInt(nowBrtParts.find(p => p.type === 'hour')?.value || "0");
    const currentMinute = parseInt(nowBrtParts.find(p => p.type === 'minute')?.value || "0");

    console.log(`Current time BRT: ${currentHour}:${currentMinute.toString().padStart(2, '0')} | Scheduled at: ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')} | forceRun: ${forceRun}`);

    if (!forceRun && (currentHour !== scheduledHour || currentMinute !== scheduledMinute)) {
      console.log('Skipping auto reminders: Not the scheduled time.');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Skipped: scheduled time is ${scheduledHour}:${scheduledMinute.toString().padStart(2, '0')}, but current time is ${currentHour}:${currentMinute.toString().padStart(2, '0')} (BRT)`, 
          results: { due_today_sent: 0, due_in_5_sent: 0, errors: [] } 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch templates from DB
    const { data: templatesData } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .in("template_key", ["due_today", "subscription_reminder", "overdue_1_day"])
      .eq("is_active", true);

    const dueTodayTemplate = templatesData?.find((t: any) => t.template_key === "due_today");
    const d1Template = templatesData?.find((t: any) => t.template_key === "subscription_reminder");
    const overdue1Template = templatesData?.find((t: any) => t.template_key === "overdue_1_day");

    if (!dueTodayTemplate && !d1Template && !overdue1Template) {
      console.log("No active templates found");
      return new Response(
        JSON.stringify({ success: true, message: "Templates inactive", results: { due_today_sent: 0, due_in_5_sent: 0, overdue_1_sent: 0, errors: [] } }),
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

    // Boundaries for D-5 (5 days from today)
    const inFiveDays = new Date(new Date(`${todayBrt}T12:00:00-03:00`).getTime() + 5 * 86400000);
    const inFiveDaysBrt = toYMDInSaoPaulo(inFiveDays);
    const startOfInFiveDaysUtc = new Date(`${inFiveDaysBrt}T00:00:00-03:00`).toISOString();
    const startOfInSixDaysUtc = new Date(
      new Date(`${inFiveDaysBrt}T00:00:00-03:00`).getTime() + 86400000
    ).toISOString();

    // Boundaries for D+1 (Overdue 1 day: exactly 1 day ago)
    const overdue1Day = new Date(new Date(`${todayBrt}T12:00:00-03:00`).getTime() - 1 * 86400000);
    const overdue1DayBrt = toYMDInSaoPaulo(overdue1Day);
    const startOfOverdue1DayUtc = new Date(`${overdue1DayBrt}T00:00:00-03:00`).toISOString();
    const startOfOverdueZeroDaysUtc = new Date(
      new Date(`${overdue1DayBrt}T00:00:00-03:00`).getTime() + 86400000
    ).toISOString();

    console.log(`Checking payments due TODAY (D-0) in BRT: ${todayBrt}`);
    console.log(`Checking payments due in 5 DAYS (D-5) in BRT: ${inFiveDaysBrt}`);
    console.log(`Checking payments OVERDUE 1 DAY (D+1) in BRT: ${overdue1DayBrt}`);

    let dueTodaySubs: any[] = [];
    if (dueTodayTemplate) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id, value, next_payment, status, plan_name,
          client:clients(id, name, phone, email)
        `)
        .eq("status", "active")
        .gte("next_payment", startOfTodayUtc)
        .lt("next_payment", startOfTomorrowUtc);

      if (error) console.error("Error fetching due today subs:", error);
      else dueTodaySubs = data || [];
    }

    console.log(`Found ${dueTodaySubs.length} active subscriptions due today`);

    let d5Subs: any[] = [];
    if (d1Template) { // Using the same subscription_reminder template object, but logic is D-5
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id, value, next_payment, status, plan_name,
          client:clients(id, name, phone, email)
        `)
        .eq("status", "active")
        .gte("next_payment", startOfInFiveDaysUtc)
        .lt("next_payment", startOfInSixDaysUtc);

      if (error) console.error("Error fetching D-5 subs:", error);
      else d5Subs = data || [];
    }

    console.log(`Found ${d5Subs.length} active subscriptions due in 5 days`);

    let overdue1Subs: any[] = [];
    if (overdue1Template) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id, value, next_payment, status, plan_name,
          client:clients(id, name, phone, email)
        `)
        .eq("status", "active")
        .gte("next_payment", startOfOverdue1DayUtc)
        .lt("next_payment", startOfOverdueZeroDaysUtc);

      if (error) console.error("Error fetching Overdue 1 day subs:", error);
      else overdue1Subs = data || [];
    }

    console.log(`Found ${overdue1Subs.length} active subscriptions overdue by 1 day`);

    const results = {
      due_today_sent: 0,
      due_in_5_sent: 0,
      overdue_1_sent: 0,
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

    const processSubs = async (subs: any[], template: any, messageType: string) => {
      for (const sub of subs) {
        const client = sub.client as any;

        if (!client?.phone) {
          results.skipped_no_phone++;
          continue;
        }

        const planName = sub.plan_name || "Assinatura";
        const formattedValue = `R$ ${sub.value.toFixed(2).replace(".", ",")}`;

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
            else if (messageType === "auto_due_in_5_days") results.due_in_5_sent++;
            else if (messageType === "auto_overdue_1_day") results.overdue_1_sent++;

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

    if (dueTodayTemplate && dueTodaySubs.length > 0) {
      await processSubs(dueTodaySubs, dueTodayTemplate, "auto_due_today");
    }

    if (d1Template && d5Subs.length > 0) {
      await processSubs(d5Subs, d1Template, "auto_due_in_5_days");
    }

    if (overdue1Template && overdue1Subs.length > 0) {
      await processSubs(overdue1Subs, overdue1Template, "auto_overdue_1_day");
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



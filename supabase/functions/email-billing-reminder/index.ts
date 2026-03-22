import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGO_URL = "https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg";
const CLIENT_AREA_URL = "https://www.assinaturaspcon.sbs/cliente";

const generateEmailHTML = (
  clientName: string,
  planName: string,
  amount: string,
  dueDate: string,
) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lembrete de Assinatura - P-CON CONSTRUNET</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header com logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d1b3e 0%, #1E4FA3 100%);padding:32px 40px;text-align:center;">
              <img src="https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/assets%2Flogo-pcon-white.png" alt="P-CON CONSTRUNET" width="180" style="display:block;margin:0 auto;" />
            </td>
          </tr>

          <!-- Badge de Cobrança -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#DBEAFE;border-left:4px solid #3B82F6;padding:12px 16px;border-radius:6px;">
                    <p style="margin:0;font-size:14px;color:#1E40AF;font-weight:600;">
                      📋 Sua assinatura vence amanhã — efetue o pagamento para manter tudo em dia
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo do email -->
          <tr>
            <td style="padding:28px 40px;">
              <p style="font-size:16px;color:#1a1a2e;margin:0 0 16px;">
                Olá <strong>${clientName}</strong>,
              </p>
              <p style="font-size:15px;color:#4a4a5a;line-height:1.6;margin:0 0 24px;">
                Passando para lembrar que a fatura referente à sua assinatura <strong>vence amanhã</strong>. Confira os detalhes abaixo e efetue o pagamento para manter sua assinatura em dia.
              </p>

              <!-- Detalhes da fatura -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:13px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Plano</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                          <span style="font-size:15px;color:#1a1a2e;font-weight:600;">${planName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:13px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Valor</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                          <span style="font-size:17px;color:#1E4FA3;font-weight:700;">${amount}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:13px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Vencimento</span>
                        </td>
                        <td style="padding:8px 0;text-align:right;">
                          <span style="font-size:15px;color:#F59E0B;font-weight:600;">${dueDate}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Botão CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${CLIENT_AREA_URL}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#1E4FA3 0%,#2A3F86 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
                      Acessar Área do Cliente
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#94a3b8;text-align:center;margin:16px 0 0;">
                Caso já tenha efetuado o pagamento, desconsidere este e-mail.
              </p>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="background-color:#0d1b3e;padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <p style="margin:0;font-size:15px;color:#ffffff;font-weight:600;">P-CON CONSTRUNET</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Criação de Sistemas</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:8px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:0 8px;">
                          <a href="https://wa.me/5511999999999" style="font-size:13px;color:#60a5fa;text-decoration:none;">📱 WhatsApp</a>
                        </td>
                        <td style="color:#475569;">|</td>
                        <td style="padding:0 8px;">
                          <a href="mailto:contato@assinaturaspcon.sbs" style="font-size:13px;color:#60a5fa;text-decoration:none;">✉️ contato@assinaturaspcon.sbs</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:12px;border-top:1px solid #1e3a5f;">
                    <p style="margin:0;font-size:11px;color:#64748b;">
                      © ${new Date().getFullYear()} P-CON CONSTRUNET. Todos os direitos reservados.
                    </p>
                    <p style="margin:4px 0 0;font-size:11px;color:#64748b;">
                      <a href="${CLIENT_AREA_URL}" style="color:#60a5fa;text-decoration:none;">Área do Cliente</a> · 
                      <a href="https://www.assinaturaspcon.sbs" style="color:#60a5fa;text-decoration:none;">Site</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const sendEmailForSubscription = async (sub: any, client: any, resendApiKey: string) => {
  if (!client?.email) return { skipped: true };

  const planName = sub.plan_name || "Assinatura";
  const formattedAmount = `R$ ${sub.value.toFixed(2).replace(".", ",")}`;
  const dueDate = new Date(sub.next_payment);
  const formattedDueDate = dueDate.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
  });

  const emailHTML = generateEmailHTML(client.name, planName, formattedAmount, formattedDueDate);

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "P-CON CONSTRUNET <cobranca@assinaturaspcon.sbs>",
      to: [client.email],
      subject: `📋 Lembrete: ${planName} vence amanhã | P-CON CONSTRUNET`,
      html: emailHTML,
    }),
  });

  const resendResult = await resendResponse.json();
  if (resendResponse.ok) {
    return { sent: true, id: resendResult.id };
  } else {
    return { error: resendResult.message || "Erro Resend" };
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Resend API key não configurada" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // no body = scheduled automatic mode
    }

    const forceRun = body?.forceRun === true;

    // ====== MANUAL MODE: send to specific client ======
    if (body.clientId) {
      console.log(`Manual email send for client ${body.clientId}`);

      // Get client's active subscriptions
      const { data: subs, error: queryError } = await supabase
        .from("subscriptions")
        .select(`id, plan_name, value, next_payment, client:clients(id, name, phone, email)`)
        .eq("client_id", body.clientId)
        .eq("status", "active")
        .order("next_payment", { ascending: true })
        .limit(1);

      if (queryError) {
        return new Response(
          JSON.stringify({ success: false, error: queryError.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!subs || subs.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma assinatura ativa encontrada para este cliente" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const sub = subs[0];
      const client = sub.client as any;

      if (!client?.email) {
        return new Response(
          JSON.stringify({ success: false, error: "Cliente não possui email cadastrado" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      try {
        const result = await sendEmailForSubscription(sub, client, resendApiKey);
        if (result.sent) {
          return new Response(
            JSON.stringify({ success: true, results: { emails_sent: 1, skipped_no_email: 0, errors: [], client_name: client.name, client_email: client.email } }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        } else {
          return new Response(
            JSON.stringify({ success: false, error: result.error || "Erro ao enviar email" }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // ====== AUTOMATIC MODE: D-1 subscription reminder ======
    const { data: rawSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["auto_send_enabled", "reminder_hour", "reminder_minute"]);

    if (settingsError) {
      return new Response(
        JSON.stringify({ success: false, error: settingsError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const settings = new Map((rawSettings ?? []).map((row) => [row.setting_key, row.setting_value]));
    const autoSendEnabled = settings.get("auto_send_enabled") === "true";

    const parsedHour = Number.parseInt(settings.get("reminder_hour") ?? "8", 10);
    const parsedMinute = Number.parseInt(settings.get("reminder_minute") ?? "0", 10);
    const configuredHour = Number.isFinite(parsedHour) && parsedHour >= 0 && parsedHour <= 23 ? parsedHour : 8;
    const configuredMinute = Number.isFinite(parsedMinute) && parsedMinute >= 0 && parsedMinute <= 59 ? parsedMinute : 0;

    const now = new Date();
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now).split(":");

    const currentHour = Number.parseInt(timeParts[0] ?? "0", 10);
    const currentMinute = Number.parseInt(timeParts[1] ?? "0", 10);

    if (!forceRun) {
      if (!autoSendEnabled) {
        return new Response(
          JSON.stringify({
            success: true,
            results: { emails_sent: 0, skipped_no_email: 0, errors: [] },
            skipped_reason: "auto_send_disabled",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const isScheduledMinute = currentHour === configuredHour && currentMinute === configuredMinute;
      if (!isScheduledMinute) {
        return new Response(
          JSON.stringify({
            success: true,
            results: { emails_sent: 0, skipped_no_email: 0, errors: [] },
            skipped_reason: "outside_scheduled_minute",
            schedule: { hour: configuredHour, minute: configuredMinute },
            now: { hour: currentHour, minute: currentMinute },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const toYMDInSaoPaulo = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

    const todayBrt = toYMDInSaoPaulo(now);
    // Tomorrow = subscription due date (D-1 means we send 1 day before)
    const tomorrow = new Date(new Date(`${todayBrt}T12:00:00-03:00`).getTime() + 86400000);
    const tomorrowStr = toYMDInSaoPaulo(tomorrow);

    const startOfTomorrowUtc = new Date(`${tomorrowStr}T00:00:00-03:00`).toISOString();
    const endOfTomorrowUtc = new Date(`${tomorrowStr}T23:59:59-03:00`).toISOString();

    console.log(`Checking subscriptions due tomorrow (D-1 reminder) in BRT: ${tomorrowStr} | forceRun=${forceRun}`);

    const { data: dueSubs, error: queryError } = await supabase
      .from("subscriptions")
      .select(`id, plan_name, value, next_payment, client:clients(id, name, phone, email)`)
      .eq("status", "active")
      .gte("next_payment", startOfTomorrowUtc)
      .lte("next_payment", endOfTomorrowUtc);

    if (queryError) {
      return new Response(
        JSON.stringify({ success: false, error: queryError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${dueSubs?.length || 0} subscriptions due tomorrow (D-1)`);

    const results = { emails_sent: 0, skipped_no_email: 0, errors: [] as string[] };

    if (dueSubs && dueSubs.length > 0) {
      for (const sub of dueSubs) {
        const client = sub.client as any;
        try {
          const result = await sendEmailForSubscription(sub, client, resendApiKey);
          if (result.skipped) { results.skipped_no_email++; }
          else if (result.sent) { results.emails_sent++; }
          else { results.errors.push(`${client?.name || 'Desconhecido'}: ${result.error}`); }
        } catch (err: any) {
          results.errors.push(`${client?.name || 'Desconhecido'}: ${err.message}`);
        }
      }
    }

    console.log("D-1 subscription email results:", results);

    return new Response(
      JSON.stringify({ success: true, results, forceRun }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in email billing reminder:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

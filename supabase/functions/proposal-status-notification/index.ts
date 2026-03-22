import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://pconassinaturas.lovable.app";
const EMAIL_FALLBACK = "contato@assinaturaspcon.sbs";
const WHATSAPP_FALLBACK = "11978363600";

type EventType = "viewed" | "approved" | "rejected";

const eventConfig: Record<EventType, { subject: string; heading: string; accent: string; column: string }> = {
  viewed: {
    subject: "👀 Proposta visualizada pelo cliente",
    heading: "Sua proposta foi visualizada",
    accent: "#1E4FA3",
    column: "view_notification_sent_at",
  },
  approved: {
    subject: "✅ Proposta aprovada pelo cliente",
    heading: "Sua proposta foi aprovada",
    accent: "#16A34A",
    column: "approved_notification_sent_at",
  },
  rejected: {
    subject: "❌ Proposta recusada pelo cliente",
    heading: "Sua proposta foi recusada",
    accent: "#DC2626",
    column: "rejected_notification_sent_at",
  },
};

const formatCurrency = (value: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const formatDateTime = (value: string | null) => {
  if (!value) return "Agora";

  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizePhone = (value: string | null | undefined) => {
  const digits = (value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;

  return `55${digits}`;
};

const buildWhatsAppMessage = (proposal: any, eventType: EventType, publicUrl: string) => {
  const eventText =
    eventType === "viewed"
      ? "foi visualizado pelo cliente"
      : eventType === "approved"
        ? "foi aprovado pelo cliente"
        : "foi recusado pelo cliente";

  const monthlyLine = proposal.monthly_amount
    ? `\n• Mensalidade: ${formatCurrency(proposal.monthly_amount)}`
    : "";

  return `📄 *Alerta de Orçamento*\n\nO orçamento *${proposal.project_title}* ${eventText}.\n\n*Cliente:* ${proposal.client_name}\n*Valor:* ${formatCurrency(proposal.total_amount)}${monthlyLine}\n*Status atual:* ${proposal.status}\n*Visualizações:* ${proposal.view_count || 0}\n*Data:* ${formatDateTime(
    eventType === "approved" ? proposal.approved_at : eventType === "rejected" ? proposal.rejected_at : proposal.last_viewed_at,
  )}\n\n🔗 Acompanhar proposta:\n${publicUrl}`;
};

const generateEmailHTML = (proposal: any, eventType: EventType, publicUrl: string) => {
  const config = eventConfig[eventType];
  const statusLabel =
    eventType === "viewed" ? "Visualizado" : eventType === "approved" ? "Aprovado" : "Recusado";
  const monthlyBlock = proposal.monthly_amount
    ? `
      <tr>
        <td style="padding:8px 0;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Mensalidade</td>
        <td style="padding:8px 0;border-top:1px solid #E2E8F0;text-align:right;color:#0F172A;font-size:15px;font-weight:600;">${formatCurrency(proposal.monthly_amount)}</td>
      </tr>`
    : "";

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${config.heading}</title>
    </head>
    <body style="margin:0;padding:0;background:#F8FAFC;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;">
        <tr>
          <td align="center">
            <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.10);">
              <tr>
                <td style="padding:32px 40px;background:linear-gradient(135deg,#0B1C3A 0%,${config.accent} 100%);">
                  <p style="margin:0;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1.8px;text-transform:uppercase;">P-CON CONSTRUNET</p>
                  <h1 style="margin:12px 0 0;color:#FFFFFF;font-size:28px;line-height:1.2;">${config.heading}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 40px 20px;">
                  <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.7;">
                    O cliente interagiu com um orçamento do módulo comercial. Confira os detalhes abaixo.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:0 24px;">
                    <tr>
                      <td style="padding:18px 0 10px;border-bottom:1px solid #E2E8F0;color:#64748B;font-size:13px;">Projeto</td>
                      <td style="padding:18px 0 10px;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-size:15px;font-weight:600;">${proposal.project_title}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Cliente</td>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;text-align:right;color:#0F172A;font-size:15px;font-weight:600;">${proposal.client_name}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Status</td>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;text-align:right;color:${config.accent};font-size:15px;font-weight:700;">${statusLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Valor total</td>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;text-align:right;color:#0F172A;font-size:15px;font-weight:600;">${formatCurrency(proposal.total_amount)}</td>
                    </tr>
                    ${monthlyBlock}
                    <tr>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Visualizações</td>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;text-align:right;color:#0F172A;font-size:15px;font-weight:600;">${proposal.view_count || 0}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Data do evento</td>
                      <td style="padding:8px 0;border-top:1px solid #E2E8F0;text-align:right;color:#0F172A;font-size:15px;font-weight:600;">${formatDateTime(
                        eventType === "approved" ? proposal.approved_at : eventType === "rejected" ? proposal.rejected_at : proposal.last_viewed_at,
                      )}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 40px 36px;">
                  <a href="${publicUrl}" target="_blank" style="display:inline-block;background:${config.accent};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:10px;">Abrir proposta</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposalId, eventType, skipWhatsapp = false } = await req.json();

    if (!proposalId || !eventType || !(eventType in eventConfig)) {
      return new Response(JSON.stringify({ error: "Dados inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("*")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return new Response(JSON.stringify({ error: "Orçamento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = eventConfig[eventType as EventType];
    if (proposal[config.column]) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("email_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["proposal_notification_email", "proposal_notification_phone"]);

    const notificationEmail = settings?.find((item) => item.setting_key === "proposal_notification_email")?.setting_value?.trim() || EMAIL_FALLBACK;
    const configuredPhone = settings?.find((item) => item.setting_key === "proposal_notification_phone")?.setting_value?.trim() || "";
    const notificationPhone = normalizePhone(configuredPhone || WHATSAPP_FALLBACK);
    const publicUrl = `${APP_URL}/proposta/${proposal.public_slug}`;

    const shouldSendEmail = Boolean(notificationEmail);
    const shouldSendWhatsapp = !skipWhatsapp && Boolean(notificationPhone);

    let emailSent = false;
    let whatsappSent = false;
    let emailError: string | null = null;
    let whatsappError: string | null = null;

    if (!resendApiKey && shouldSendEmail) {
      emailError = "Integração de email indisponível";
      console.error("proposal-status-notification email unavailable: RESEND_API_KEY missing");
    }

    if (resendApiKey && shouldSendEmail) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "P-CON Orçamentos <cobranca@assinaturaspcon.sbs>",
          to: [notificationEmail],
          subject: `${config.subject} • ${proposal.project_title}`,
          html: generateEmailHTML(proposal, eventType as EventType, publicUrl),
        }),
      });

      if (emailResponse.ok) {
        emailSent = true;
      } else {
        const result = await emailResponse.text();
        emailError = result;
        console.error("proposal-status-notification email failed:", {
          proposalId,
          eventType,
          status: emailResponse.status,
          body: result,
          notificationEmail,
        });
      }
    }

    if (shouldSendWhatsapp) {
      const whatsappResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          phone: notificationPhone,
          message: buildWhatsAppMessage(proposal, eventType as EventType, publicUrl),
          clientId: proposal.id,
          type: `proposal_${eventType}`,
          sendImage: false,
          sendButton: true,
          buttonText: "Abrir proposta",
          buttonUrl: publicUrl,
        }),
      });

      const whatsappResult = await whatsappResponse.json().catch(() => null);
      if (whatsappResponse.ok && whatsappResult?.success) {
        whatsappSent = true;
      } else {
        whatsappError = whatsappResult?.error || "Erro ao enviar WhatsApp";
      }
    }

    const emailRequired = shouldSendEmail;
    const canMarkNotificationAsSent = emailSent || !emailRequired;

    if (!emailSent && !whatsappSent) {
      return new Response(JSON.stringify({
        success: false,
        error: "Nenhuma notificação enviada",
        details: { emailError, whatsappError },
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (canMarkNotificationAsSent) {
      await supabase
        .from("proposals")
        .update({ [config.column]: new Date().toISOString() })
        .eq("id", proposal.id);
    }

    if (!canMarkNotificationAsSent) {
      return new Response(JSON.stringify({
        success: false,
        partial: true,
        error: "WhatsApp enviado, mas o email falhou",
        details: { emailError, whatsappError },
        emailSent,
        whatsappSent,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      emailSent,
      whatsappSent,
      skipWhatsapp,
      skippedWhatsapp: !notificationPhone,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("proposal-status-notification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
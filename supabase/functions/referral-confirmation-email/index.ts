import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOGO_URL = "https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/email%2Flogo-pcon-pdf.png";
const MASCOTE_URL = "https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/email%2Fmascote-pcon.png";

const generateEmailHTML = (referrerName: string, referredName: string) => `
<!DOCTYPE html>
<html lang="pt-BR" translate="no">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google" content="notranslate">
  <meta http-equiv="Content-Language" content="pt-BR">
  <title>Indicação Enviada - P-CON CONSTRUNET</title>
</head>
<body class="notranslate" style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(11,28,58,0.12);">
          
          <!-- Header com gradiente azul -->
          <tr>
            <td style="background:linear-gradient(135deg,#0B1C3A 0%,#1E4FA3 50%,#2A63C8 100%);padding:32px 40px 24px;text-align:center;">
              <img src="${LOGO_URL}" alt="P-CON CONSTRUNET" width="180" style="display:block;margin:0 auto 8px;" />
              <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0;letter-spacing:1px;">CRIAÇÃO DE SISTEMAS</p>
            </td>
          </tr>

          <!-- Mascote -->
          <tr>
            <td style="text-align:center;padding:24px 0 0;">
              <img src="${MASCOTE_URL}" alt="Mascote P-CON" width="140" style="display:block;margin:0 auto;" />
            </td>
          </tr>

          <!-- Conteúdo principal -->
          <tr>
            <td style="padding:24px 40px 16px;">
              <h1 style="color:#0B1C3A;font-size:24px;text-align:center;margin:0 0 8px;font-weight:700;">
                🎉 Indicação Enviada!
              </h1>
              <p style="color:#1E4FA3;font-size:16px;text-align:center;margin:0 0 24px;font-weight:500;">
                Obrigado pela sua confiança!
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 24px;">
              <p style="color:#3a3f47;font-size:15px;line-height:1.7;margin:0 0 16px;">
                Olá, <strong style="color:#0B1C3A;">${referrerName}</strong>! 👋
              </p>
              <p style="color:#3a3f47;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Recebemos sua indicação com sucesso! Nossa equipe já foi notificada e entrará em contato com <strong style="color:#1E4FA3;">${referredName}</strong> em breve.
              </p>

              <!-- Card de confirmação -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#EBF2FF 0%,#F0F7FF 100%);border-radius:12px;border:1px solid #D0E2FF;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:0 0 8px;">
                          <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">Indicador</p>
                          <p style="color:#0B1C3A;font-size:15px;font-weight:600;margin:4px 0 0;">${referrerName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="border-top:1px solid #D0E2FF;padding:8px 0 0;">
                          <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">Indicado</p>
                          <p style="color:#1E4FA3;font-size:15px;font-weight:600;margin:4px 0 0;">${referredName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="border-top:1px solid #D0E2FF;padding:8px 0 0;">
                          <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">Status</p>
                          <p style="color:#16a34a;font-size:15px;font-weight:600;margin:4px 0 0;">✅ Recebida com sucesso</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Mensagem de agradecimento -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="color:#3a3f47;font-size:14px;line-height:1.7;margin:0;text-align:center;">
                Agradecemos por recomendar nossos serviços! 💙<br/>
                Você será informado sobre o andamento da sua indicação.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0B1C3A;padding:24px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.9);font-size:14px;font-weight:600;margin:0 0 4px;">
                P-CON CONSTRUNET
              </p>
              <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0;">
                Criação de Sistemas • www.assinaturaspcon.sbs
              </p>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0;text-align:center;">
              <p style="color:#9ca3af;font-size:11px;margin:0;">
                Este é um e-mail automático. Por favor, não responda.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { referrerName, referrerEmail, referredName } = await req.json();

    if (!referrerEmail || !referrerName || !referredName) {
      return new Response(
        JSON.stringify({ error: "Dados incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Serviço de e-mail não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHTML = generateEmailHTML(referrerName, referredName);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "P-CON Indicações <indicacoes@assinaturaspcon.sbs>",
        to: [referrerEmail],
        subject: "🎉 Sua indicação foi recebida! - P-CON CONSTRUNET",
        html: emailHTML,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      return new Response(
        JSON.stringify({ error: "Erro ao enviar e-mail", details: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Referral confirmation email sent to:", referrerEmail);

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

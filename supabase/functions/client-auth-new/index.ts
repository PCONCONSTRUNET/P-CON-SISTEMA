import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    let body: Record<string, string> = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    console.log('New DB — Client Auth Action:', action);

    // ── LOGIN ──────────────────────────────────────────────────────────────
    if (action === 'login') {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email e senha são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const passwordHash = await hashPassword(password);
      const { data: clientUser, error } = await supabase
        .from('client_users')
        .select('*, clients(*)')
        .eq('email', email.toLowerCase())
        .eq('password_hash', passwordHash)
        .maybeSingle();

      if (error || !clientUser) {
        return new Response(JSON.stringify({ error: 'Email ou senha incorretos' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error: sessionError } = await supabase.from('client_sessions').insert({
        client_user_id: clientUser.id, token, expires_at: expiresAt.toISOString()
      });

      if (sessionError) {
        return new Response(JSON.stringify({ error: 'Erro ao criar sessão' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await supabase.from('client_users').update({ last_login: new Date().toISOString() }).eq('id', clientUser.id);

      return new Response(JSON.stringify({ token, client: clientUser.clients, expiresAt: expiresAt.toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── VERIFY ─────────────────────────────────────────────────────────────
    if (action === 'verify') {
      const { token } = body;
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token não fornecido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: session, error } = await supabase
        .from('client_sessions')
        .select('*, client_users(*, clients(*))')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error || !session) {
        return new Response(JSON.stringify({ error: 'Sessão inválida ou expirada' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(
        JSON.stringify({ client: session.client_users.clients, clientUser: { id: session.client_users.id, email: session.client_users.email } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── LOGOUT ─────────────────────────────────────────────────────────────
    if (action === 'logout') {
      const { token } = body;
      if (token) await supabase.from('client_sessions').delete().eq('token', token);
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── REGISTER (admin) ───────────────────────────────────────────────────
    if (action === 'register') {
      const { clientId, email, password } = body;
      if (!clientId || !email || !password) {
        return new Response(JSON.stringify({ error: 'Dados incompletos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: client, error: clientError } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
      if (clientError || !client) {
        return new Response(JSON.stringify({ error: 'Cliente não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: existingUser } = await supabase.from('client_users').select('id').eq('email', email.toLowerCase()).maybeSingle();
      if (existingUser) {
        return new Response(JSON.stringify({ error: 'Email já cadastrado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const passwordHash = await hashPassword(password);
      const { data: newUser, error: createError } = await supabase
        .from('client_users').insert({ client_id: clientId, email: email.toLowerCase(), password_hash: passwordHash }).select().single();

      if (createError) {
        return new Response(JSON.stringify({ error: 'Erro ao criar usuário' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, userId: newUser.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── SELF-REGISTER ──────────────────────────────────────────────────────
    if (action === 'self-register') {
      const { name, email, phone, document, password } = body;
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ error: 'Nome, email e senha são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: existingUser } = await supabase.from('client_users').select('id').eq('email', email.toLowerCase()).maybeSingle();
      if (existingUser) {
        return new Response(JSON.stringify({ error: 'Este email já está cadastrado. Faça login.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: newClient, error: clientCreateError } = await supabase
        .from('clients')
        .insert({ name: name.trim(), email: email.toLowerCase().trim(), phone: phone || null, document: document || null, status: 'active' })
        .select().single();

      if (clientCreateError) {
        return new Response(JSON.stringify({ error: 'Erro ao criar cadastro do cliente' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const passwordHash = await hashPassword(password);
      const { data: newUser, error: userCreateError } = await supabase
        .from('client_users')
        .insert({ client_id: newClient.id, email: email.toLowerCase().trim(), password_hash: passwordHash })
        .select().single();

      if (userCreateError) {
        await supabase.from('clients').delete().eq('id', newClient.id);
        return new Response(JSON.stringify({ error: 'Erro ao criar conta de acesso' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log('Self-registration (new db):', email);
      return new Response(
        JSON.stringify({ success: true, clientId: newClient.id, userId: newUser.id, message: 'Cadastro realizado com sucesso!' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── REQUEST-RESET (sends email with reset link) ──────────────────────
    if (action === 'request-reset') {
      const { email, origin } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Always return success to prevent email enumeration
      const { data: clientUser } = await supabase
        .from('client_users')
        .select('id, email, client_id, clients(name)')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (!clientUser) {
        // Don't reveal that the email doesn't exist
        console.log('Reset requested for non-existent email:', email);
        return new Response(JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Generate a secure reset token
      const resetToken = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token valid for 1 hour

      // Store the token in client_users
      const { error: updateError } = await supabase
        .from('client_users')
        .update({
          reset_token: resetToken,
          reset_token_expires: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientUser.id);

      if (updateError) {
        console.error('Error saving reset token:', updateError);
        return new Response(JSON.stringify({ error: 'Erro interno' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Send email via Resend
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY not configured');
        return new Response(JSON.stringify({ error: 'Serviço de email não configurado' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const siteOrigin = origin || 'https://www.pconassinantes.site';
      const resetLink = `${siteOrigin}/cliente/nova-senha?token=${resetToken}`;
      const clientName = (clientUser.clients as any)?.name || 'Cliente';

      const emailHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha - P-CON CONSTRUNET</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d1b3e 0%, #1E4FA3 100%);padding:32px 40px;text-align:center;">
              <img src="https://bevahgtmcdicyhjnrylk.supabase.co/storage/v1/object/public/contracts/assets%2Flogo-pcon-white.png" alt="P-CON CONSTRUNET" width="180" style="display:block;margin:0 auto;" />
            </td>
          </tr>

          <!-- Badge -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:6px;">
                    <p style="margin:0;font-size:14px;color:#92400E;font-weight:600;">
                      🔐 Solicitação de redefinição de senha
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 40px;">
              <p style="font-size:16px;color:#1a1a2e;margin:0 0 16px;">
                Olá <strong>${clientName}</strong>,
              </p>
              <p style="font-size:15px;color:#4a4a5a;line-height:1.6;margin:0 0 24px;">
                Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${resetLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#1E4FA3 0%,#2A3F86 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#94a3b8;text-align:center;margin:0 0 16px;">
                Este link expira em <strong>1 hora</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0;font-size:12px;color:#64748B;line-height:1.5;">
                      Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanecerá a mesma.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
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
                  <td align="center" style="padding-top:12px;border-top:1px solid #1e3a5f;">
                    <p style="margin:0;font-size:11px;color:#64748b;">
                      © ${new Date().getFullYear()} P-CON CONSTRUNET. Todos os direitos reservados.
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
</html>`;

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'P-CON CONSTRUNET <noreply@pconassinantes.site>',
          to: [clientUser.email],
          subject: '🔐 Redefinição de Senha | P-CON CONSTRUNET',
          html: emailHTML,
        }),
      });

      const resendData = await resendResponse.json();
      if (!resendResponse.ok) {
        console.error('Resend error:', resendData);
        return new Response(JSON.stringify({ error: 'Erro ao enviar email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log('Reset email sent to:', clientUser.email, 'Resend ID:', resendData.id);
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── VERIFY-RESET-TOKEN ─────────────────────────────────────────────────
    if (action === 'verify-reset-token') {
      const { token } = body;
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token não fornecido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: clientUser } = await supabase
        .from('client_users')
        .select('id, email, reset_token_expires')
        .eq('reset_token', token)
        .maybeSingle();

      if (!clientUser) {
        return new Response(JSON.stringify({ error: 'Token inválido ou expirado', valid: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check expiration
      if (clientUser.reset_token_expires && new Date(clientUser.reset_token_expires) < new Date()) {
        return new Response(JSON.stringify({ error: 'Token expirado', valid: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ valid: true, email: clientUser.email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── RESET-PASSWORD (with token) ────────────────────────────────────────
    if (action === 'reset-password') {
      const { token, password, clientId } = body;

      // Legacy flow: admin resets by clientId
      if (clientId && password && !token) {
        const { data: existingUser } = await supabase.from('client_users').select('id').eq('client_id', clientId).maybeSingle();
        if (!existingUser) {
          return new Response(JSON.stringify({ error: 'Usuário não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const passwordHash = await hashPassword(password);
        await supabase.from('client_users').update({ password_hash: passwordHash, updated_at: new Date().toISOString() }).eq('id', existingUser.id);
        return new Response(JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Token-based flow: client resets via email link
      if (!token || !password) {
        return new Response(JSON.stringify({ error: 'Token e senha são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: clientUser } = await supabase
        .from('client_users')
        .select('id, reset_token_expires')
        .eq('reset_token', token)
        .maybeSingle();

      if (!clientUser) {
        return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (clientUser.reset_token_expires && new Date(clientUser.reset_token_expires) < new Date()) {
        return new Response(JSON.stringify({ error: 'Token expirado. Solicite um novo link.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const passwordHash = await hashPassword(password);
      await supabase.from('client_users').update({
        password_hash: passwordHash,
        reset_token: null,
        reset_token_expires: null,
        updated_at: new Date().toISOString(),
      }).eq('id', clientUser.id);

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Client Auth Error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

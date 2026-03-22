import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // ── RESET-PASSWORD ─────────────────────────────────────────────────────
    if (action === 'reset-password') {
      const { clientId, password } = body;
      if (!clientId || !password) {
        return new Response(JSON.stringify({ error: 'Dados incompletos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

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

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Client Auth Error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

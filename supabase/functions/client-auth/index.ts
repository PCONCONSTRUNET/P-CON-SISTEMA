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

// ─── Helpers para instanciar os clientes de cada banco ───────────────────────

function getOldSupabase() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

function getNewSupabase() {
  // Essas variáveis são configuradas manualmente em:
  // Supabase (banco antigo) → Project Settings → Edge Functions → Secrets
  const url = Deno.env.get('NEW_SUPABASE_URL')!;
  const key = Deno.env.get('NEW_SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

// ─── Helpers de login por banco ──────────────────────────────────────────────

async function tryLogin(supabase: ReturnType<typeof createClient>, email: string, passwordHash: string) {
  const { data: clientUser, error } = await supabase
    .from('client_users')
    .select('*, clients(*)')
    .eq('email', email.toLowerCase())
    .eq('password_hash', passwordHash)
    .maybeSingle();

  if (error || !clientUser) return null;
  return clientUser;
}

async function createSession(supabase: ReturnType<typeof createClient>, clientUserId: string) {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await supabase
    .from('client_sessions')
    .insert({ client_user_id: clientUserId, token, expires_at: expiresAt.toISOString() });

  if (error) return null;
  return { token, expiresAt };
}

// ─── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    let body: Record<string, string> = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    console.log('Client Auth Action:', action);

    // ── LOGIN: tenta banco antigo, se falhar tenta banco novo ──────────────
    if (action === 'login') {
      const { email, password } = body;

      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: 'Email e senha são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const passwordHash = await hashPassword(password);

      // 1. Tenta no banco antigo
      const oldSupa = getOldSupabase();
      let clientUser = await tryLogin(oldSupa, email, passwordHash);
      let db: 'old' | 'new' = 'old';
      let activeSupa = oldSupa;

      // 2. Se não achou no banco antigo, tenta no banco novo
      if (!clientUser) {
        const newSupa = getNewSupabase();
        clientUser = await tryLogin(newSupa, email, passwordHash);
        if (clientUser) {
          db = 'new';
          activeSupa = newSupa;
        }
      }

      if (!clientUser) {
        console.log('Login failed for:', email);
        return new Response(
          JSON.stringify({ error: 'Email ou senha incorretos' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const session = await createSession(activeSupa, clientUser.id);

      if (!session) {
        return new Response(
          JSON.stringify({ error: 'Erro ao criar sessão' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await activeSupa
        .from('client_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', clientUser.id);

      console.log(`Login successful: ${email} (db: ${db})`);
      return new Response(
        JSON.stringify({ token: session.token, db, client: clientUser.clients, expiresAt: session.expiresAt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── VERIFY: usa o banco indicado pelo campo `db` ───────────────────────
    if (action === 'verify') {
      const { token, db } = body;

      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Token não fornecido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = db === 'new' ? getNewSupabase() : getOldSupabase();

      const { data: session, error } = await supabase
        .from('client_sessions')
        .select('*, client_users(*, clients(*))')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error || !session) {
        return new Response(
          JSON.stringify({ error: 'Sessão inválida ou expirada' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          client: session.client_users.clients,
          clientUser: { id: session.client_users.id, email: session.client_users.email }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── LOGOUT: usa o banco indicado pelo campo `db` ───────────────────────
    if (action === 'logout') {
      const { token, db } = body;

      if (token) {
        const supabase = db === 'new' ? getNewSupabase() : getOldSupabase();
        await supabase.from('client_sessions').delete().eq('token', token);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── REGISTER (admin cria usuário para cliente existente) ──────────────
    // Sempre grava no BANCO NOVO
    if (action === 'register') {
      const { clientId, email, password } = body;

      if (!clientId || !email || !password) {
        return new Response(
          JSON.stringify({ error: 'Dados incompletos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = getNewSupabase();

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: 'Cliente não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existingUser } = await supabase
        .from('client_users')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: 'Email já cadastrado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const passwordHash = await hashPassword(password);

      const { data: newUser, error: createError } = await supabase
        .from('client_users')
        .insert({ client_id: clientId, email: email.toLowerCase(), password_hash: passwordHash })
        .select()
        .single();

      if (createError) {
        console.error('User creation error:', createError);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar usuário' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('User registered (new db):', email);
      return new Response(
        JSON.stringify({ success: true, userId: newUser.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── SELF-REGISTER (cliente se cadastra sozinho) ───────────────────────
    // Sempre grava no BANCO NOVO
    if (action === 'self-register') {
      const { name, email, phone, document, password } = body;

      if (!name || !email || !password) {
        return new Response(
          JSON.stringify({ error: 'Nome, email e senha são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = getNewSupabase();

      // Verifica duplicidade no banco novo
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingClient) {
        const { data: existingUser } = await supabase
          .from('client_users')
          .select('id')
          .eq('client_id', existingClient.id)
          .maybeSingle();

        if (existingUser) {
          return new Response(
            JSON.stringify({ error: 'Este email já possui uma conta. Faça login.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Também verifica duplicidade no banco antigo
      const oldSupa = getOldSupabase();
      const { data: existingOldUser } = await oldSupa
        .from('client_users')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingOldUser) {
        return new Response(
          JSON.stringify({ error: 'Este email já está cadastrado. Faça login.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: newClient, error: clientCreateError } = await supabase
        .from('clients')
        .insert({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone || null,
          document: document || null,
          status: 'active'
        })
        .select()
        .single();

      if (clientCreateError) {
        console.error('Client creation error:', clientCreateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar cadastro do cliente' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const passwordHash = await hashPassword(password);

      const { data: newUser, error: userCreateError } = await supabase
        .from('client_users')
        .insert({
          client_id: newClient.id,
          email: email.toLowerCase().trim(),
          password_hash: passwordHash
        })
        .select()
        .single();

      if (userCreateError) {
        console.error('User creation error:', userCreateError);
        await supabase.from('clients').delete().eq('id', newClient.id);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar conta de acesso' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Self-registration (new db):', email, 'Client ID:', newClient.id);

      return new Response(
        JSON.stringify({
          success: true,
          clientId: newClient.id,
          userId: newUser.id,
          message: 'Cadastro realizado com sucesso!'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── RESET-PASSWORD ────────────────────────────────────────────────────
    if (action === 'reset-password') {
      const { clientId, password, db } = body;

      if (!clientId || !password) {
        return new Response(
          JSON.stringify({ error: 'Dados incompletos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = db === 'new' ? getNewSupabase() : getOldSupabase();

      const { data: existingUser, error: findError } = await supabase
        .from('client_users')
        .select('id')
        .eq('client_id', clientId)
        .maybeSingle();

      if (findError || !existingUser) {
        return new Response(
          JSON.stringify({ error: 'Usuário não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const passwordHash = await hashPassword(password);

      const { error: updateError } = await supabase
        .from('client_users')
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq('id', existingUser.id);

      if (updateError) {
        console.error('Password update error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao atualizar senha' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Password reset for client:', clientId, `(db: ${db || 'old'})`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação desconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Client Auth Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

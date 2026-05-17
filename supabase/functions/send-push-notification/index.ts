// ================================================================
// Supabase Edge Function: send-push-notification
// ================================================================
// Chamada por Database Webhook quando há INSERT em admin_notifications.
// Envia push real via OneSignal REST API para o player 'admin-user'.
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ONESIGNAL_APP_ID   = Deno.env.get('ONESIGNAL_APP_ID')   ?? '';
const ONESIGNAL_REST_KEY = Deno.env.get('ONESIGNAL_REST_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Emoji por categoria ────────────────────────────────────────
const categoryEmojis: Record<string, string> = {
  implementations: '🚀',
  referrals:       '🎁',
  payments:        '💰',
  affiliates:      '👥',
  general:         '🔔',
};

// ── URL de destino por categoria ──────────────────────────────
const categoryUrls: Record<string, string> = {
  implementations: '/implementations',
  referrals:       '/referrals',
  payments:        '/payments',
};

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();

    // O webhook do Supabase envia { type, table, record, old_record }
    const record = body?.record;

    if (!record) {
      return new Response(
        JSON.stringify({ error: 'Payload inválido: campo "record" ausente.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const {
      title    = 'P-CON Admin',
      message  = 'Nova notificação recebida.',
      category = 'general',
    } = record;

    const emoji      = categoryEmojis[category] ?? '🔔';
    const targetUrl  = categoryUrls[category]   ?? '/notifications';

    // ── Payload OneSignal ────────────────────────────────────
    const payload = {
      app_id: ONESIGNAL_APP_ID,

      // Enviar para todos os devices do usuário 'admin-user'
      include_aliases: {
        external_id: ['admin-user'],
      },
      target_channel: 'push',

      // Conteúdo
      headings: { en: `${emoji} ${title}` },
      contents: { en: message },

      // Ícone e badge
      chrome_web_icon:  'https://p-con.vercel.app/pwa-192x192.png',
      chrome_web_badge: 'https://p-con.vercel.app/pwa-192x192.png',
      firefox_icon:     'https://p-con.vercel.app/pwa-192x192.png',

      // Click action → abre a rota correta
      url: targetUrl,
      web_url: targetUrl,

      // Metadados extras
      data: {
        category,
        notification_id: record.id ?? null,
      },

      // Não substituir notificações anteriores (cada uma é única)
      collapse_id: `pcon-${record.id ?? Date.now()}`,

      // TTL: 24 horas
      ttl: 86400,
    };

    // ── Chamada à API OneSignal ──────────────────────────────
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${ONESIGNAL_REST_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[send-push] OneSignal API error:', result);
      return new Response(
        JSON.stringify({ error: 'OneSignal API error', details: result }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[send-push] Push enviado com sucesso:', result);

    return new Response(
      JSON.stringify({ ok: true, onesignal: result }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[send-push] Erro interno:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno da função', message: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

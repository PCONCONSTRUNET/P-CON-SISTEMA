// Vercel Serverless Function — chamada pelo Cron às 09:00 BRT (12:00 UTC)
// Dispara os lembretes automáticos do WhatsApp (D-0 e D-1)
// A Edge Function whatsapp-auto-reminders tem verify_jwt=false, então a anon key é suficiente.

const SUPABASE_URL = 'https://lcnaptefceboratxhzox.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';

export default async function handler(req, res) {
  // Aceita GET (Vercel Cron) ou POST (chamada manual)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const timestamp = new Date().toISOString();
    console.log('[Cron 09h BRT] Disparando whatsapp-auto-reminders às', timestamp);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/whatsapp-auto-reminders`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ source: 'vercel-cron-09h' }),
      }
    );

    const data = await response.json();
    console.log('[Cron 09h BRT] Resultado:', JSON.stringify(data));

    return res.status(200).json({
      success: true,
      timestamp,
      result: data,
    });
  } catch (err) {
    console.error('[Cron 09h BRT] Erro:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

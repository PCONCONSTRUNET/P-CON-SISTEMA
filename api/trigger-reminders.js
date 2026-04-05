// Vercel Serverless Function — chamada pelo Cron às 09:00 BRT (12:00 UTC)
// Dispara os lembretes automáticos do WhatsApp (D-0 e D-1)

export default async function handler(req, res) {
  // Segurança: aceita apenas chamadas do Vercel Cron ou com o token correto
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://lcnaptefceboratxhzox.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('[Cron] SUPABASE_SERVICE_ROLE_KEY não configurado no Vercel');
    return res.status(500).json({ error: 'Service role key not configured' });
  }

  try {
    console.log('[Cron] Disparando whatsapp-auto-reminders às', new Date().toISOString());

    const response = await fetch(
      `${supabaseUrl}/functions/v1/whatsapp-auto-reminders`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ source: 'vercel-cron' }),
      }
    );

    const data = await response.json();
    console.log('[Cron] Resultado:', JSON.stringify(data));

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      result: data,
    });
  } catch (err) {
    console.error('[Cron] Erro ao chamar whatsapp-auto-reminders:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

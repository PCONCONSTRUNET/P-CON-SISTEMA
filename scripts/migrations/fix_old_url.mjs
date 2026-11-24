// Script para corrigir URLs antigas no banco lcnaptefceboratxhzox via REST API
const SUPABASE_URL = 'https://lcnaptefceboratxhzox.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';

const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function main() {
  console.log('=== Verificando templates no banco lcnaptefceboratxhzox ===\n');

  // 1. Buscar todos os templates
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?select=id,template_key,button_url,message_template`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });

  if (!res.ok) {
    console.error('Erro ao buscar templates:', res.status, await res.text());
    return;
  }

  const templates = await res.json();
  console.log(`Encontrados ${templates.length} templates:\n`);

  for (const t of templates) {
    const hasOldInMsg = t.message_template?.includes('assinaturaspcon.sbs');
    const hasOldInBtn = t.button_url?.includes('assinaturaspcon.sbs');
    console.log(`  ${t.template_key}:`);
    console.log(`    button_url: ${t.button_url}`);
    console.log(`    msg tem URL antiga: ${hasOldInMsg ? '⚠️ SIM' : '✅ NÃO'}`);
    console.log(`    btn tem URL antiga: ${hasOldInBtn ? '⚠️ SIM' : '✅ NÃO'}`);
    console.log();

    // Corrigir se necessário
    if (hasOldInMsg || hasOldInBtn) {
      const updates = {};
      if (hasOldInMsg) {
        updates.message_template = t.message_template.replace(/assinaturaspcon\.sbs/g, 'pconassinantes.site');
      }
      if (hasOldInBtn) {
        updates.button_url = t.button_url.replace(/assinaturaspcon\.sbs/g, 'pconassinantes.site');
      }
      updates.updated_at = new Date().toISOString();

      console.log(`    🔧 Corrigindo ${t.template_key}...`);
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?id=eq.${t.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      });

      if (patchRes.ok) {
        console.log(`    ✅ Corrigido com sucesso!`);
      } else {
        console.error(`    ❌ Erro:`, patchRes.status, await patchRes.text());
      }
    }
  }

  console.log('\n=== Verificação final ===\n');
  
  // Re-fetch para confirmar
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?select=template_key,button_url`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  const final = await res2.json();
  for (const t of final) {
    console.log(`  ${t.template_key}: ${t.button_url}`);
  }
}

main().catch(console.error);

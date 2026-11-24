// Script para adicionar "(Mensagem Automática)" no topo de todos os templates no banco antigo
const SUPABASE_URL = 'https://lcnaptefceboratxhzox.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';

const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function main() {
  console.log('=== Adicionando prefixo nos templates do banco antigo ===\n');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?select=*`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });

  const templates = await res.json();
  const prefix = '*(Mensagem Automática)*\n\n';

  for (const t of templates) {
    if (!t.message_template.startsWith('*(Mensagem Automática)*')) {
      console.log(`  🔧 Atualizando ${t.template_key}...`);
      const newMsg = prefix + t.message_template;
      
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?id=eq.${t.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ 
          message_template: newMsg,
          updated_at: new Date().toISOString()
        })
      });

      if (patchRes.ok) console.log(`    ✅ Sucesso!`);
      else console.error(`    ❌ Erro:`, await patchRes.text());
    } else {
      console.log(`  ✅ ${t.template_key} já tem o prefixo.`);
    }
  }
}

main().catch(console.error);

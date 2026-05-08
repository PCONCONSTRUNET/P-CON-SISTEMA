// Script para corrigir links e IMAGENS no banco antigo lcnaptefceboratxhzox
const SUPABASE_URL = 'https://lcnaptefceboratxhzox.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';

// URL da imagem nova (do banco novo)
const NEW_IMAGE_URL = 'https://bevahgtmcdicyhjnrylk.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg';

const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function main() {
  console.log('=== Corrigindo Imagens e Links no banco lcnaptefceboratxhzox ===\n');

  // 1. Buscar templates atuais
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?select=*`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });

  const templates = await res.json();

  for (const t of templates) {
    console.log(`Checking ${t.template_key}...`);
    
    const updates = {};
    let needsUpdate = false;

    // Corrigir Image URL se for a antiga do lcn... ou se estiver diferente da nova
    if (t.image_url && t.image_url.includes('lcnaptefceboratxhzox')) {
      console.log(`  🔧 Atualizando imagem para a nova logo...`);
      updates.image_url = NEW_IMAGE_URL;
      needsUpdate = true;
    }

    // Garantir link do botão (reforço)
    if (t.button_url && t.button_url.includes('assinaturaspcon.sbs')) {
      console.log(`  🔧 Corrigindo link do botão...`);
      updates.button_url = t.button_url.replace(/assinaturaspcon\.sbs/g, 'pconassinantes.site');
      needsUpdate = true;
    }

    if (needsUpdate) {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates?id=eq.${t.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      });
      if (patchRes.ok) console.log(`  ✅ ${t.template_key} atualizado!`);
    } else {
      console.log(`  ✅ ${t.template_key} já está correto.`);
    }
  }

  // 2. Verificar se o template overdue_1_day existe, se não, criar
  const hasOverdue = templates.find(t => t.template_key === 'overdue_1_day');
  if (!hasOverdue) {
    console.log('\n➕ Criando template overdue_1_day (Atraso de 1 dia)...');
    const newTemplate = {
      template_key: 'overdue_1_day',
      name: 'Atraso de 1 Dia (D+1)',
      description: 'Enviado automaticamente 1 dia após o vencimento',
      message_template: 'Ola {{client_name}}! 💈\n\n⚠️ A fatura referente a sua assinatura ativa de *{{amount}}* (*{{plan_name}}*) esta vencida.\n\nRegularize o pagamento para manter sua assinatura em dia.\n\nQualquer duvida, estamos a disposicao.',
      image_url: NEW_IMAGE_URL,
      button_enabled: true,
      button_text: 'Pagar Fatura Agora',
      button_url: 'https://www.pconassinantes.site/cliente',
      is_active: true
    };

    const postRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(newTemplate)
    });
    if (postRes.ok) console.log('✅ Template overdue_1_day criado!');
  }

  console.log('\n=== Tudo pronto! Clientes antigos agora receberão a logo e link novos. ===');
}

main().catch(console.error);

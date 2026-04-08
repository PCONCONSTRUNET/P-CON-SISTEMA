/**
 * ============================================================
 * SCRIPT DE MIGRAÇÃO: Banco Antigo → Banco Novo
 * P-CON SISTEMA
 * ============================================================
 *
 * Usa:
 *  - Banco ANTIGO: anon key (para leitura pública)
 *  - Banco NOVO:   service_role key (para escrita ignorando RLS)
 *
 * Execute: node scripts/migrate-old-to-new.mjs
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

// ── Banco ANTIGO ─────────────────────────────────────────────
const OLD_URL = 'https://lcnaptefceboratxhzox.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmFwdGVmY2Vib3JhdHhoem94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODM2ODksImV4cCI6MjA4MTA1OTY4OX0.0VYNRkLGDPGdum2sGLAWPDZJlR7ZWNOCuxhwKmr3bW4';

// ── Banco NOVO ───────────────────────────────────────────────
const NEW_URL = 'https://bevahgtmcdicyhjnrylk.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJldmFoZ3RtY2RpY3loam5yeWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE1ODI1NywiZXhwIjoyMDg5NzM0MjU3fQ.SeYyVF6I-IEZA_Ejk8_5gyVXiNE2tVl0Yb9glBdGw2E';

const oldDb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

const BATCH_SIZE = 100;

// ── LOG ──────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
function log(msg)   { console.log(`${c.gray}  →${c.reset} ${msg}`); }
function ok(msg)    { console.log(`${c.green}  ✓${c.reset} ${msg}`); }
function warn(msg)  { console.log(`${c.yellow}  ⚠${c.reset}  ${msg}`); }
function err(msg)   { console.error(`${c.red}  ✗${c.reset} ${msg}`); }
function title(msg) { console.log(`\n${c.bold}${c.cyan}── ${msg}${c.reset}`); }

// ── MIGRAÇÃO GENÉRICA ────────────────────────────────────────
async function migrateTable(tableName, options = {}) {
  const {
    transform = (rows) => rows,
    idColumn  = 'id',
    orderBy   = 'created_at',
    skip      = false,
  } = options;

  if (skip) { warn(`${tableName} — pulada`); return { inserted: 0, skipped: 0, errors: 0 }; }

  title(tableName);

  // 1. IDs já existentes no banco novo
  const { data: existing, error: eErr } = await newDb.from(tableName).select(idColumn);
  if (eErr) { err(`Erro ao checar existentes: ${eErr.message}`); return { inserted: 0, skipped: 0, errors: 1 }; }
  const existingIds = new Set((existing || []).map(r => String(r[idColumn])));
  if (existingIds.size > 0) log(`${existingIds.size} já existem no banco novo`);

  // 2. Buscar todos do banco antigo (paginação)
  let allRows = [];
  let page = 0;
  while (true) {
    const { data, error: fErr } = await oldDb
      .from(tableName).select('*')
      .order(orderBy, { ascending: true })
      .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);
    if (fErr) { err(`Erro ao ler banco antigo: ${fErr.message}`); break; }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < BATCH_SIZE) break;
    page++;
  }
  log(`${allRows.length} registros no banco antigo`);

  // 3. Filtrar novos
  const toInsert = allRows.filter(r => !existingIds.has(String(r[idColumn])));
  const skipped  = allRows.length - toInsert.length;
  if (toInsert.length === 0) { ok(`Nenhum novo para inserir (${skipped} já existiam)`); return { inserted: 0, skipped, errors: 0 }; }

  // 4. Transformar + inserir em lotes
  const transformed = transform(toInsert);
  let inserted = 0, errors = 0;

  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE);
    const { error: iErr } = await newDb.from(tableName).insert(batch);
    if (iErr) {
      errors++;
      err(`Lote ${i / BATCH_SIZE + 1}: ${iErr.message}`);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  → ${inserted}/${transformed.length} inseridos...     `);
    }
  }
  console.log('');
  ok(`${inserted} inseridos, ${skipped} já existiam${errors ? `, ${errors} lote(s) com erro` : ''}`);
  return { inserted, skipped, errors };
}

// ══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.bold}╔══════════════════════════════════════╗`);
  console.log(`║   MIGRAÇÃO P-CON: Antigo → Novo      ║`);
  console.log(`╚══════════════════════════════════════╝${c.reset}`);

  // Testar conexões
  console.log('\nTestando conexões...');
  const { error: oldErr } = await oldDb.from('clients').select('id').limit(1);
  if (oldErr) { err(`Banco ANTIGO inacessível (anon key): ${oldErr.message}`); process.exit(1); }
  ok('Banco ANTIGO OK (Leitura)');

  const { error: newErr } = await newDb.from('clients').select('id').limit(1);
  if (newErr) { err(`Banco NOVO inacessível (service_role): ${newErr.message}`); process.exit(1); }
  ok('Banco NOVO OK (Escrita)');

  const summary = {};

  // 1. clients
  summary.clients = await migrateTable('clients');

  // 2. client_users
  summary.client_users = await migrateTable('client_users');

  // 3. subscriptions
  summary.subscriptions = await migrateTable('subscriptions', {
    transform: rows => rows.map(r => ({
      id: r.id,
      client_id: r.client_id,
      plan_name: r.plan_name,
      value: r.value,
      status: r.status,
      start_date: r.start_date,
      next_payment: r.next_payment,
      created_at: r.created_at,
      updated_at: r.updated_at,
      asaas_id: r.asaas_id ?? null,
    })),
  });

  // 4. payments
  summary.payments = await migrateTable('payments', {
    transform: rows => rows.map(r => ({
      id: r.id, subscription_id: r.subscription_id ?? null,
      amount: r.amount, status: r.status,
      payment_method: r.payment_method ?? null,
      transaction_id: r.transaction_id ?? null,
      paid_at: r.paid_at ?? null, created_at: r.created_at,
      client_id: r.client_id ?? null,
      asaas_id: null, description: null,
      due_date: null, proposal_id: null, proposal_payment_type: null,
    })),
  });

  // 5. invoices
  summary.invoices = await migrateTable('invoices', {
    orderBy: 'issued_at',
    transform: rows => rows.map(r => ({
      id: r.id, payment_id: r.payment_id ?? null, client_id: r.client_id,
      number: r.number, amount: r.amount, status: r.status,
      issued_at: r.issued_at, description: r.description ?? null,
    })),
  });

  // 6. contracts
  summary.contracts = await migrateTable('contracts', {
    transform: rows => rows.map(r => ({
      ...r,
      file_path: r.file_path ?? null,
    })),
  });

  // 7. notifications
  summary.notifications = await migrateTable('notifications', { orderBy: 'sent_at' });

  // 8. affiliates
  summary.affiliates = await migrateTable('affiliates', {
    transform: rows => rows.map(r => ({
      ...r,
      approved_by: r.approved_by ?? null,
    })),
  });

  // 9. affiliate_users
  summary.affiliate_users = await migrateTable('affiliate_users');

  // 10. affiliate_links
  summary.affiliate_links = await migrateTable('affiliate_links');

  // 11. affiliate_clicks
  summary.affiliate_clicks = await migrateTable('affiliate_clicks');

  // 12. affiliate_leads
  summary.affiliate_leads = await migrateTable('affiliate_leads', { orderBy: 'expires_at' });

  // 13. affiliate_rewards
  summary.affiliate_rewards = await migrateTable('affiliate_rewards', {
    transform: rows => rows.map(r => ({
      ...r, reward_type: 'cash', description: null,
    })),
  });

  // 14. referral_settings
  summary.referral_settings = await migrateTable('referral_settings', {
    idColumn: 'id',
    transform: rows => rows.map(r => ({
      ...r,
      client_reward_description: 'Crédito na próxima fatura',
      client_reward_value: r.reward_value ?? 100,
    })),
  });

  // 15. referral_links
  summary.referral_links = await migrateTable('referral_links');

  // 16. referral_clicks
  summary.referral_clicks = await migrateTable('referral_clicks');

  // 17. referral_leads
  summary.referral_leads = await migrateTable('referral_leads', { orderBy: 'expires_at' });

  // 18. referral_rewards
  summary.referral_rewards = await migrateTable('referral_rewards', {
    transform: rows => rows.map(r => ({
      ...r, reward_type: 'cash', description: null,
    })),
  });

  // 19. whatsapp_templates
  summary.whatsapp_templates = await migrateTable('whatsapp_templates', {
    idColumn: 'template_key',
  });

  // 20. whatsapp_messages
  summary.whatsapp_messages = await migrateTable('whatsapp_messages', {
    transform: rows => rows.map(({ payment_id, ...r }) => ({
      ...r, payment_id: payment_id ?? null,
    })),
  });

  // 21. email_settings
  summary.email_settings = await migrateTable('email_settings', {
    idColumn: 'setting_key',
  });

  // 22. proposals
  summary.proposals = await migrateTable('proposals', {
    transform: rows => rows.map(r => ({
      ...r,
      monthly_amount:                r.monthly_amount                ?? null,
      approved_notification_sent_at: r.approved_notification_sent_at ?? null,
      rejected_notification_sent_at: r.rejected_notification_sent_at ?? null,
      view_notification_sent_at:     r.view_notification_sent_at     ?? null,
    })),
  });

  console.log(`\n${c.bold}╔══════════════════════════════════════╗`);
  console.log(`║         RESUMO DA MIGRAÇÃO           ║`);
  console.log(`╚══════════════════════════════════════╝${c.reset}`);

  for (const [table, r] of Object.entries(summary)) {
    const { inserted = 0, skipped = 0, errors = 0 } = r;
    const color = errors > 0 ? c.red : inserted > 0 ? c.green : c.gray;
    console.log(`  ${color}${table.padEnd(26)}${c.reset} +${String(inserted).padStart(5)}  (${skipped} já existiam)${errors ? `  ${c.red}⚠ ${errors} erros${c.reset}` : ''}`);
  }

  console.log(`\n${c.green}${c.bold}✓ Processo finalizado!${c.reset}\n`);
}

main().catch(e => { err(`Erro fatal: ${e.message}`); console.error(e); process.exit(1); });

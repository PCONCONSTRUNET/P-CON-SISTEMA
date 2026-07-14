import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id, plan_name, value, status, next_payment,
      clients!inner (id, name, email, document, phone)
    `)
    .ilike('clients.name', `Lucas%`)
    .limit(1)
    .maybeSingle();

  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
  if (data) {
    console.log('Is array?', Array.isArray(data.clients));
  }
}

test();

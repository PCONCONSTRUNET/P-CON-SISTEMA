import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bevahgtmcdicyhjnrylk.supabase.co";
const supabaseKey = "sb_publishable_ziYHN3SayMmRYxusCm7qQQ_-rqQG7gM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id, client_id, message_type, payment_id, created_at')
    .eq('message_type', 'payment_confirmed_auto')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Messages:");
    console.table(data);
  }
}

check();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://bevahgtmcdicyhjnrylk.supabase.co', 'sb_publishable_ziYHN3SayMmRYxusCm7qQQ_-rqQG7gM');

async function listBuckets() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) console.log('ERROR:', error);
  else console.log('BUCKETS:', data.map(b => b.name));
}
listBuckets();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://bevahgtmcdicyhjnrylk.supabase.co', 'sb_publishable_ziYHN3SayMmRYxusCm7qQQ_-rqQG7gM');

async function testInsert() {
  console.log('Testing insert into implementations...');
  const { data, error } = await supabase
    .from('implementations')
    .insert({
      name: 'teste',
      value: 33,
      status: 'active',
      availability: 'available'
    });

  if (error) {
    console.log('ERROR:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS:', data);
  }
}

testInsert();

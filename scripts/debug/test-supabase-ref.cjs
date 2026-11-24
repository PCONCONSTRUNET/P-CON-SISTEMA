const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('', '');

async function testQuery() {
  console.log('Testing select from referral_links...');
  const { data, error } = await supabase.from('referral_links').select('*');
  if (error) {
    console.log('ERROR:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS:', data);
  }
}
testQuery();

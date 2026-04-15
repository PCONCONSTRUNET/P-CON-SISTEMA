const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://bevahgtmcdicyhjnrylk.supabase.co', 'sb_publishable_ziYHN3SayMmRYxusCm7qQQ_-rqQG7gM');

async function checkColumn() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .limit(1);

  if (error) {
    console.log('ERROR:', error);
  } else if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]));
    if (Object.keys(data[0]).includes('license_token')) {
      console.log('LICENSE_TOKEN_EXISTS: TRUE');
    } else {
      console.log('LICENSE_TOKEN_EXISTS: FALSE');
    }
  } else {
    console.log('No clients found to check columns.');
  }
}

checkColumn();

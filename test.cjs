const { createClient } = require('@supabase/supabase-js');
const url = 'https://iquibawtbpamhaottlbr.supabase.co';
const key = 'sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ'; // anon_key
const supabase = createClient(url, key);

async function run() {
  const { data: bookings } = await supabase.from('bookings').select('id, payment_type, split_paid, status, created_at, date, time_slot').order('created_at', {ascending: false}).limit(3);
  console.log('BOOKINGS:', JSON.stringify(bookings, null, 2));

  const { data: tokens } = await supabase.from('shared_payment_tokens').select('*').order('created_at', {ascending: false}).limit(5);
  console.log('TOKENS:', JSON.stringify(tokens, null, 2));
}
run();

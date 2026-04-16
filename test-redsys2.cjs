const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://iquibawtbpamhaottlbr.supabase.co';
const ANON_KEY = 'sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ';
const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError) {
    console.log('Auth error:', authError);
  }
  
  const token = authData?.session?.access_token || 'bad-token';
  
  const res = await fetch(`${SUPABASE_URL}/functions/v1/redsys-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ amount: 10, courtId: 1, userId: 'test-user', date: '2023-10-10', timeSlot: '10:00', successUrl: 'http://localhost/success', failUrl: 'http://localhost/fail', notifyUrl: 'http://localhost/api/notify', paymentMethod: 'card' })
  });
  
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}
test();

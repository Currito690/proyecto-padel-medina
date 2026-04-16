const SUPABASE_URL = 'https://iquibawtbpamhaottlbr.supabase.co';
const ANON_KEY = 'sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ';

fetch(`${SUPABASE_URL}/functions/v1/redsys-create`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 10,
    courtId: 1,
    userId: 'test-user',
    date: '2023-10-10',
    timeSlot: '10:00',
    successUrl: 'http://localhost/success',
    failUrl: 'http://localhost/fail',
    notifyUrl: 'http://localhost/api/notify',
    paymentMethod: 'card'
  })
}).then(async r => {
  console.log('Status:', r.status);
  console.log('Text:', await r.text());
}).catch(console.error);

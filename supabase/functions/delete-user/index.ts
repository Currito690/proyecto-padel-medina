const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { userId } = await req.json();
    if (!userId) return json({ error: 'Missing userId' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    };

    const del = async (table: string, col: string) => {
      const r = await fetch(`${url}/rest/v1/${table}?${col}=eq.${userId}`, {
        method: 'DELETE',
        headers,
      });
      if (!r.ok) {
        const body = await r.text().catch(() => r.statusText);
        console.warn(`delete ${table} warn:`, body);
      }
    };

    // Delete child rows first, then profile
    await del('tournament_registrations', 'user_id');
    await del('push_subscriptions', 'user_id');
    await del('bookings', 'user_id');
    await del('profiles', 'id');

    // Delete auth user via Admin API
    const authRes = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers,
    });
    if (!authRes.ok) {
      const body = await authRes.text().catch(() => authRes.statusText);
      console.warn('auth delete warn:', body);
    }

    return json({ success: true });

  } catch (err) {
    console.error('delete-user fatal:', err);
    return json({ error: String(err) }, 500);
  }
});

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

// Solo puede llamar el propio backend (service role) o un ADMIN con sesión:
// sin esto, cualquiera con la anon key podía borrar la cuenta de cualquier
// jugador (misma comprobación que admin-update-user).
type AuthResult = { ok: true } | { ok: false; status: number; error: string };
async function callerAutorizado(req: Request): Promise<AuthResult> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'No autenticado' };
  if (serviceKey && token === serviceKey) return { ok: true };
  if (!url || !serviceKey) return { ok: false, status: 500, error: 'Función mal configurada' };
  const meRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) return { ok: false, status: 401, error: 'Sesión inválida' };
  const me = await meRes.json().catch(() => null);
  if (!me?.id) return { ok: false, status: 401, error: 'Sesión inválida' };
  const roleRes = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(me.id)}&select=role`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const rows = await roleRes.json().catch(() => []);
  if (!Array.isArray(rows) || rows[0]?.role !== 'admin') {
    return { ok: false, status: 403, error: 'Solo un administrador puede hacer esto' };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = await callerAutorizado(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

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

    // Delete child rows first, then profile (las inscripciones a torneos no
    // llevan user_id: se identifican por email/nombre y se conservan)
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

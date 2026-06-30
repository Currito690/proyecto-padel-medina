// supabase/functions/admin-update-user/index.ts
// Permite a un ADMIN modificar los datos (nombre, email, teléfono) y la
// contraseña de cualquier jugador. Cambiar email/contraseña de otro usuario
// requiere la Admin API (service_role), por eso va en una Edge Function.
// Seguridad: verifica que QUIEN LLAMA es admin (su JWT -> profiles.role).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

    // ── 1. Verificar que el llamante es admin ────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return json({ error: 'No autenticado' }, 401);

    const meRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${callerToken}` },
    });
    if (!meRes.ok) return json({ error: 'Sesión inválida' }, 401);
    const me = await meRes.json();
    const callerId = me?.id;
    if (!callerId) return json({ error: 'Sesión inválida' }, 401);

    const roleRes = await fetch(`${url}/rest/v1/profiles?id=eq.${callerId}&select=role`, { headers: svcHeaders });
    const roleRows = await roleRes.json().catch(() => []);
    if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
      return json({ error: 'Solo un administrador puede hacer esto' }, 403);
    }

    // ── 2. Datos a modificar ─────────────────────────────────────────────────
    const { userId, name, email, phone, password } = await req.json();
    if (!userId) return json({ error: 'Falta userId' }, 400);
    if (password && String(password).length < 6) {
      return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }

    // ── 3. auth.users (email / password) vía Admin API ───────────────────────
    const authPayload: Record<string, unknown> = {};
    if (email) { authPayload.email = email; authPayload.email_confirm = true; }
    if (password) authPayload.password = password;
    if (Object.keys(authPayload).length) {
      const r = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
        method: 'PUT', headers: svcHeaders, body: JSON.stringify(authPayload),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => r.statusText);
        return json({ error: 'No se pudo actualizar email/contraseña: ' + body }, 400);
      }
    }

    // ── 4. profiles (nombre / teléfono / email) ──────────────────────────────
    const profilePayload: Record<string, unknown> = {};
    if (name !== undefined) profilePayload.name = name;
    if (phone !== undefined) profilePayload.phone = phone;
    if (email !== undefined) profilePayload.email = email;
    if (Object.keys(profilePayload).length) {
      const r = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(profilePayload),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => r.statusText);
        return json({ error: 'No se pudo actualizar el perfil: ' + body }, 400);
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error('admin-update-user fatal:', err);
    return json({ error: String(err) }, 500);
  }
});

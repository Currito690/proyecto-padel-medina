// Supabase Edge Function: send-push
// Deploy with: npx supabase functions deploy send-push
//
// Body: { title, body, url, audiencia? }
// - audiencia 'admins' (por defecto): SOLO los dispositivos de los
//   administradores (nueva reserva, cancelación, cobros de redsys-notify...).
// - audiencia 'jugadores': todos los dispositivos (anuncio de un evento). Solo
//   la puede pedir el backend (service role) o un usuario administrador.
// Llega a la web/Android (web push) y al iPhone (APNs), y borra los
// dispositivos caducados (ver _shared/envioPush.ts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarAFilas, esCorreoAdmin, esFilaIos, esPerfilAdmin, idsAdministradores, type FilaPush } from '../_shared/envioPush.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

// Solo el propio backend (service role) o un usuario con sesión válida:
// sin esto, cualquiera con la anon key podía mandar notificaciones push a
// todos los móviles suscritos. Devolvemos también quién llama, para decidir
// si puede avisar a todos los jugadores.
type AuthResult =
    | { ok: true; serviceRole: true; userId: null; email: null }
    | { ok: true; serviceRole: false; userId: string; email: string | null }
    | { ok: false; status: number; error: string };
async function callerAutorizado(req: Request): Promise<AuthResult> {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return { ok: false, status: 401, error: 'No autenticado' };
    if (serviceKey && token === serviceKey) return { ok: true, serviceRole: true, userId: null, email: null };
    if (!url || !serviceKey) return { ok: false, status: 500, error: 'Función mal configurada' };
    const meRes = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return { ok: false, status: 401, error: 'Sesión inválida' };
    const me = await meRes.json().catch(() => null);
    if (!me?.id) return { ok: false, status: 401, error: 'Sesión inválida' };
    return { ok: true, serviceRole: false, userId: me.id, email: typeof me.email === 'string' ? me.email : null };
}

function json(datos: unknown, status = 200): Response {
    return new Response(JSON.stringify(datos), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const auth = await callerAutorizado(req);
    if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    try {
        const body = await req.json();
        const { title, body: message, url } = body;
        const audiencia = body.audiencia ?? 'admins';

        if (audiencia !== 'admins' && audiencia !== 'jugadores') {
            return json({ error: 'Audiencia no válida' }, 400);
        }

        // Avisar a TODOS los jugadores es cosa del club: lo decide profiles.role
        // (o el correo de admin histórico SEGÚN GoTrue, nunca el de profiles,
        // que cada usuario puede cambiar) en el servidor, nunca el navegador.
        if (audiencia === 'jugadores' && !auth.serviceRole) {
            const { data: perfil } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', auth.userId)
                .maybeSingle();
            if (!esPerfilAdmin(perfil) && !esCorreoAdmin(auth.email)) {
                return json({ error: 'Solo un administrador puede avisar a todos los jugadores' }, 403);
            }
        }

        let subs: FilaPush[] | null;
        if (audiencia === 'jugadores') {
            const { data, error } = await supabase.from('push_subscriptions').select('*');
            if (error) throw error;
            // Los anuncios (eventos) NO van al iPhone: allí el jugador solo aceptó
            // "recordatorios de su pista", y Apple (norma 4.5.4) prohíbe avisos
            // promocionales sin un consentimiento aparte y una forma de darse de baja.
            subs = (data || []).filter((f: FilaPush) => !esFilaIos(f));
        } else {
            const admins = await idsAdministradores(supabase);
            subs = [];
            if (admins.length > 0) {
                const { data, error } = await supabase
                    .from('push_subscriptions')
                    .select('*')
                    .in('user_id', admins);
                if (error) throw error;
                subs = data;
            }
        }

        if (!subs || subs.length === 0) {
            console.log(`No subscriptions found (${audiencia})`);
            return json({ sent: 0, message: 'No subscriptions found' });
        }

        const r = await enviarAFilas(supabase, subs, {
            title: title || 'Padel Medina',
            body: message || '',
            url: url || '/',
        });

        console.log(`Push (${audiencia}) enviado a ${r.enviados}/${r.total} dispositivos` +
            (r.borrados ? `, ${r.borrados} caducados borrados` : '') +
            (r.omitidos ? `, ${r.omitidos} omitidos` : ''));

        return json({
            sent: r.enviados,
            total: r.total,
            failed: r.fallidos,
            removed: r.borrados,
            skipped: r.omitidos,
            audiencia,
        });

    } catch (err) {
        console.error('send-push error:', err);
        return json({ error: String((err as { message?: string })?.message ?? err) }, 500);
    }
});

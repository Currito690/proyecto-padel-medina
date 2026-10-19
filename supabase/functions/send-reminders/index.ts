// Supabase Edge Function: send-reminders
// Deploy with: npx supabase functions deploy send-reminders
//
// La llama el cron del servidor cada 30 min:
//   POST http://127.0.0.1:8000/functions/v1/send-reminders  (Bearer SERVICE_ROLE_KEY)
// Sin la service role key EXACTA devuelve 401 y no sale ningún recordatorio:
// tras desplegar, lanzar a mano la línea del crontab sin el ">/dev/null" (con
// -w '%{http_code}') y comprobar que da 200 y un JSON con "revisadas".
// Recuerda a cada jugador su pista unas horas antes o la víspera, nunca de
// madrugada (reglas y textos en _shared/recordatorio.ts). Llega al móvil por
// web push (web y app Android) y por APNs (app de iPhone), y además manda el
// correo de recordatorio de siempre.
//
// Modos extra (solo con la service role key), con body JSON:
// - {"simular": true}: devuelve el plan sin enviar ni marcar nada. Admite
//   "ahora": "2026-10-15 21:00" (hora de Madrid) para ver otra pasada.
// - {"prueba": {"userId": "..."}} (o {"email": "..."}): manda YA un aviso de
//   prueba a los dispositivos de ese usuario.
// - {"diagnostico": "apns"} (o "apns-sandbox"): comprueba que el servidor
//   habla HTTP/2 con Apple y que la clave .p8 es válida.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    caducidadAviso,
    construirAviso,
    decidir,
    fechaPared,
    instanteDesdePared,
    leerPared,
    paredMadrid,
    planificar,
    textoPared,
    DIA,
    HORA,
    MINUTO,
    URL_AVISO,
    type Decision,
    type Plan,
} from '../_shared/recordatorio.ts';
import {
    enviarAFilas,
    esCorreoAdmin,
    esFilaAndroid,
    esFilaIos,
    esPerfilAdmin,
    resultadoVacio,
    sumarResultados,
    type FilaPush,
} from '../_shared/envioPush.ts';
import { configApns, diagnosticoApns } from '../_shared/apns.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TROZO = 100; // ids por petición en los .in() (URLs cortas)
const USUARIOS_A_LA_VEZ = 10;

type Reserva = {
    id: string;
    date: string;
    time_slot: string;
    user_id: string | null;
    created_at: string | null;
    courts: { name?: string | null } | { name?: string | null }[] | null;
};
type Perfil = { id: string; name: string | null; email: string | null; role: string | null };
type Evaluada = { b: Reserva; plan: Plan | null; decision: Decision | 'admin' };

// deno-lint-ignore no-explicit-any
type Cliente = any;

function json(datos: unknown, status = 200): Response {
    return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });
}

function nombrePista(b: Reserva): string | null {
    const c = Array.isArray(b.courts) ? b.courts[0] : b.courts;
    return c?.name ?? null;
}

function textoError(err: unknown): string {
    return String((err as { message?: string })?.message ?? err);
}

// .in() con muchos ids, en trozos.
async function enTrozos<T>(
    ids: string[],
    consulta: (trozo: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
    const todo: T[] = [];
    for (let i = 0; i < ids.length; i += TROZO) {
        const { data, error } = await consulta(ids.slice(i, i + TROZO));
        if (error) throw error;
        todo.push(...(data || []));
    }
    return todo;
}

// Pone reminder_sent=true SOLO en las que seguían en false y devuelve las que
// ha marcado esta pasada. Sirve para "reclamar" antes de enviar: si dos pasadas
// del cron se solapan, cada reserva la envía solo una.
async function marcar(supabase: Cliente, ids: string[]): Promise<string[]> {
    const filas = await enTrozos<{ id: string }>(ids, (trozo) =>
        supabase.from('bookings')
            .update({ reminder_sent: true })
            .in('id', trozo)
            .eq('reminder_sent', false)
            .select('id'));
    return filas.map((f) => f.id);
}

function agruparPorUsuario(evaluadas: Evaluada[]): Map<string, Evaluada[]> {
    const porUsuario = new Map<string, Evaluada[]>();
    for (const e of evaluadas) {
        if (!e.b.user_id) continue;
        const lista = porUsuario.get(e.b.user_id) ?? [];
        lista.push(e);
        porUsuario.set(e.b.user_id, lista);
    }
    return porUsuario;
}

// Reservas del club (las del cliente de paso van a nombre del admin): sin
// recordatorio. Aquí sí vale el correo de profiles: quien se lo cambie solo se
// quita sus propios avisos (para decidir quién es admin no se usa nunca).
function esDelClub(perfil?: Perfil): boolean {
    return esPerfilAdmin(perfil) || esCorreoAdmin(perfil?.email);
}

function avisoDe(items: Evaluada[], hoy: string) {
    return construirAviso(items.map((e) => ({ date: e.b.date, time_slot: e.b.time_slot, pista: nombrePista(e.b) })), hoy);
}

async function dispositivosDe(supabase: Cliente, userIds: string[]): Promise<Map<string, FilaPush[]>> {
    const filas = await enTrozos<FilaPush>(userIds, (trozo) =>
        supabase.from('push_subscriptions').select('*').in('user_id', trozo));
    const porUsuario = new Map<string, FilaPush[]>();
    for (const f of filas) {
        if (!f.user_id) continue;
        const lista = porUsuario.get(f.user_id) ?? [];
        lista.push(f);
        porUsuario.set(f.user_id, lista);
    }
    return porUsuario;
}

// ── Aviso de prueba ─────────────────────────────────────────────────────────
async function avisoDePrueba(supabase: Cliente, prueba: Record<string, unknown>): Promise<Response> {
    let userId = typeof prueba?.userId === 'string' ? prueba.userId.trim() : '';
    if (!userId && typeof prueba?.email === 'string') {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', prueba.email.trim().toLowerCase())
            .limit(1);
        if (error) throw error;
        userId = data?.[0]?.id ?? '';
    }
    if (!UUID_RE.test(userId)) {
        return json({ error: 'Indica prueba.userId (uuid) o prueba.email de un usuario existente' }, 400);
    }

    const { data: filas, error } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
    if (error) throw error;
    if (!filas || filas.length === 0) {
        return json({ prueba: true, userId, sent: 0, message: 'Ese usuario no tiene dispositivos registrados' });
    }
    const r = await enviarAFilas(supabase, filas, {
        title: '🔔 Avisos activados',
        body: 'Así te avisaremos antes de tus partidos.',
        url: URL_AVISO,
    });
    console.log(`Aviso de prueba a ${userId}: ${r.enviados}/${r.total}`);
    return json({
        prueba: true,
        userId,
        ...r,
        dispositivos: filas.map((f: FilaPush & { created_at?: string; updated_at?: string }) => ({
            plataforma: esFilaIos(f) ? 'ios' : esFilaAndroid(f) ? 'android' : 'web',
            registrado: f.updated_at ?? f.created_at ?? null,
        })),
    });
}

// ── Pasada del cron (o simulación) ──────────────────────────────────────────
async function pasada(
    supabase: Cliente,
    supabaseUrl: string,
    supabaseKey: string,
    opciones: Record<string, unknown>,
): Promise<Response> {
    const simular = opciones.simular === true;
    // Al minuto: la pasada de las 09:00 que arranca a las 09:00:02 tiene que
    // contar como las 09:00 (si no, una pista a las 09:30 ya no "cabe").
    let ahora = Math.floor(paredMadrid(Date.now()) / MINUTO) * MINUTO;
    if (simular && opciones.ahora != null) {
        const otra = leerPared(opciones.ahora);
        if (otra === null) return json({ error: '"ahora" debe ser "YYYY-MM-DD HH:MM" (hora de Madrid)' }, 400);
        ahora = otra;
    }
    const hoy = fechaPared(ahora);
    // El aviso sale como pronto la víspera: basta con mirar hasta pasado mañana.
    const hasta = fechaPared(ahora + 2 * DIA);

    // 1. Reservas confirmadas sin recordatorio, de hoy a pasado mañana.
    const { data: reservas, error: reservasError } = await supabase
        .from('bookings')
        .select('id, date, time_slot, user_id, created_at, courts ( name )')
        .eq('status', 'confirmed')
        .eq('reminder_sent', false)
        .gte('date', hoy)
        .lte('date', hasta)
        .order('date', { ascending: true });
    if (reservasError) throw reservasError;

    const lista: Reserva[] = reservas || [];
    if (lista.length === 0) {
        return json({ ...(simular ? { simulacion: true } : {}), ahora: textoPared(ahora), revisadas: 0, message: 'No pending reminders' });
    }

    // 2. Perfiles: el correo para el email y el rol para no recordarle al club
    //    sus propias reservas (las del cliente de paso van a nombre del admin).
    const userIds = [...new Set(lista.map((b) => b.user_id).filter((id): id is string => !!id))];
    const perfiles = new Map<string, Perfil>();
    for (const p of await enTrozos<Perfil>(userIds, (trozo) =>
        supabase.from('profiles').select('id, name, email, role').in('id', trozo))) {
        perfiles.set(p.id, p);
    }

    // 3. Qué hacer con cada una en esta pasada. Las 'manual' de clientes
    //    registrados SÍ se recuerdan; las de los administradores no.
    const evaluadas = lista.map((b): Evaluada => {
        if (b.user_id && esDelClub(perfiles.get(b.user_id))) return { b, plan: null, decision: 'admin' };
        const plan = planificar(b);
        return { b, plan, decision: decidir(ahora, plan) };
    });
    const aEnviar = evaluadas.filter((e) => e.decision === 'enviar');
    const aCerrar = evaluadas.filter((e) => e.decision === 'descartar' || e.decision === 'admin');
    const esperando = evaluadas.filter((e) => e.decision === 'esperar').length;

    if (simular) {
        const porUsuario = agruparPorUsuario(aEnviar);
        const dispositivos = await dispositivosDe(supabase, [...porUsuario.keys()]);
        return json({
            simulacion: true,
            ahora: textoPared(ahora),
            revisadas: lista.length,
            esperando,
            sinRecordatorio: aCerrar.length,
            tocan: aEnviar.length,
            reservas: evaluadas.map((e) => ({
                id: e.b.id,
                user_id: e.b.user_id,
                date: e.b.date,
                time_slot: e.b.time_slot,
                pista: nombrePista(e.b),
                envio: e.plan ? textoPared(e.plan.envio) : null,
                decision: e.decision,
            })),
            avisos: [...porUsuario].map(([uid, items]) => {
                const filas = dispositivos.get(uid) ?? [];
                return {
                    user_id: uid,
                    nombre: perfiles.get(uid)?.name ?? null,
                    dispositivos: { web: filas.filter((f) => !esFilaIos(f)).length, ios: filas.filter(esFilaIos).length },
                    correo: !!perfiles.get(uid)?.email,
                    ...avisoDe(items, hoy),
                };
            }),
        });
    }

    // 4. Las que ya no llevan recordatorio (sin hueco, pasadas o del club) se
    //    marcan para no volver a evaluarlas en cada pasada.
    const cerradas = await marcar(supabase, aCerrar.map((e) => e.b.id));

    // 5. Dispositivos ANTES de reclamar: si esta consulta falla, aún no se ha
    //    marcado nada y la siguiente pasada lo reintenta.
    const dispositivos = await dispositivosDe(supabase, [...agruparPorUsuario(aEnviar).keys()]);

    // 6. Reclamar las que tocan y enviar SOLO las reclamadas.
    const reclamadas = new Set(await marcar(supabase, aEnviar.map((e) => e.b.id)));
    const mias = aEnviar.filter((e) => reclamadas.has(e.b.id));

    // 7. Un solo aviso por usuario con todas sus reservas de esta pasada. Ya
    //    están reclamadas: si algo revienta aquí, el correo tiene que salir igual.
    const porUsuario = agruparPorUsuario(mias);
    let resultado = resultadoVacio();
    let avisados = 0;
    try {
        const usuarios = [...porUsuario];
        for (let i = 0; i < usuarios.length; i += USUARIOS_A_LA_VEZ) {
            const tanda = await Promise.all(usuarios.slice(i, i + USUARIOS_A_LA_VEZ).map(async ([uid, items]) => {
                const filas = dispositivos.get(uid) ?? [];
                if (filas.length === 0) return resultadoVacio();
                // Si el móvil está apagado, el aviso caduca a las 22:00 o al empezar
                // su primera pista. En instantes reales: la noche del cambio de hora
                // restar horas de pared falla en 1 h.
                const primerInicio = Math.min(...items.map((e) => e.plan!.inicio));
                const caduca = instanteDesdePared(caducidadAviso(ahora, primerInicio));
                const ttlSegundos = Math.max(60, Math.round((caduca - Date.now()) / 1000));
                return await enviarAFilas(supabase, filas, avisoDe(items, hoy), { ttlSegundos });
            }));
            for (const r of tanda) {
                resultado = sumarResultados(resultado, r);
                if (r.enviados > 0) avisados++;
            }
        }
    } catch (err) {
        console.error('send-reminders: fallo enviando los avisos push:', err);
    }

    // 8. Correo de recordatorio (best-effort, uno por reserva), como antes. Uno
    //    detrás de otro para no pasarnos del límite de envíos de Resend.
    const correos = { enviados: 0, fallidos: 0 };
    const emailFnUrl = `${supabaseUrl}/functions/v1/send-booking-email`;
    for (const e of mias) {
        const perfil = e.b.user_id ? perfiles.get(e.b.user_id) : undefined;
        if (!perfil?.email) continue;
        try {
            const emailRes = await fetch(emailFnUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                    type: 'reminder',
                    email: perfil.email,
                    userName: perfil.name || 'jugador/a',
                    courtName: nombrePista(e.b) || 'tu pista',
                    date: e.b.date,
                    timeSlot: e.b.time_slot,
                    hoursLeft: Math.max(1, Math.round((instanteDesdePared(e.plan!.inicio) - Date.now()) / HORA)),
                    isToday: e.b.date === hoy,
                }),
            });
            await emailRes.text().catch(() => '');
            if (emailRes.status === 200) {
                correos.enviados++;
            } else {
                correos.fallidos++;
                console.warn('Reminder email non-200:', e.b.id, emailRes.status);
            }
        } catch (err) {
            correos.fallidos++;
            console.warn('Reminder email error:', err);
        }
    }

    const resumen = {
        ahora: textoPared(ahora),
        revisadas: lista.length,
        esperando,
        sinRecordatorio: cerradas.length,
        tocaban: aEnviar.length,
        enviadas: mias.length,
        usuariosAvisados: avisados,
        dispositivos: resultado,
        correos,
    };
    console.log('send-reminders:', JSON.stringify(resumen));
    return json(resumen);
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Defensa extra (nginx ya cierra esta ruta desde fuera): solo el cron del
    // servidor o el propio backend, con la service role key.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!supabaseKey || token !== supabaseKey) {
        return json({ error: 'No autorizado' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // El cron llama sin body; los modos extra mandan JSON.
        const texto = await req.text().catch(() => '');
        let opciones: Record<string, unknown> = {};
        if (texto.trim()) {
            try {
                const leido = JSON.parse(texto);
                if (leido && typeof leido === 'object' && !Array.isArray(leido)) opciones = leido;
            } catch (_e) {
                return json({ error: 'Body JSON no válido' }, 400);
            }
        }

        if (opciones.diagnostico === 'apns' || opciones.diagnostico === 'apns-sandbox') {
            const diagnostico = await diagnosticoApns(
                configApns((k) => Deno.env.get(k)),
                opciones.diagnostico === 'apns-sandbox' ? 'sandbox' : 'produccion',
            );
            console.log('Diagnóstico APNs:', JSON.stringify(diagnostico));
            return json({ diagnostico });
        }

        if (opciones.prueba && typeof opciones.prueba === 'object') {
            return await avisoDePrueba(supabase, opciones.prueba as Record<string, unknown>);
        }

        return await pasada(supabase, supabaseUrl, supabaseKey, opciones);
    } catch (err) {
        console.error('send-reminders error:', err);
        return json({ error: textoError(err) }, 500);
    }
});

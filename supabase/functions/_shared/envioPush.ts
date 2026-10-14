// Envío de un aviso a una lista de dispositivos (filas de push_subscriptions):
// - plataforma 'web': web push con VAPID (navegador y app Android, que es la web).
// - plataforma 'ios': APNs (app de iPhone; allí no hay web push).
// Las filas de dispositivos que ya no existen (web 404/410, APNs dado de baja)
// se borran para no reintentarlas en cada aviso.
// Lo usan send-push (avisos al club / a todos) y send-reminders (recordatorios).
import webpush from 'npm:web-push';
import { configApns, enviarApns } from './apns.ts';

export interface FilaPush {
  id: string;
  user_id?: string | null;
  endpoint: string;
  subscription: unknown;
  plataforma?: string | null;
}

export interface AvisoPush {
  title: string;
  body: string;
  url: string;
}

export interface ResultadoEnvio {
  total: number;
  enviados: number;
  fallidos: number;
  borrados: number; // filas caducadas eliminadas
  omitidos: number; // sin secretos para su plataforma
}

// Administradores: profiles.role = 'admin' (el trigger profiles_bloquea_cambio_role
// impide que un jugador se lo ponga). profiles.email NO sirve para esto: cada
// usuario puede cambiarlo desde su perfil. El correo histórico del club solo
// cuenta si viene de GoTrue (/auth/v1/user), y la migración 20261014100000 deja
// a esa cuenta con role = 'admin'.
export const EMAILS_ADMIN = ['admin@padelmedina.com'];

export function esPerfilAdmin(perfil?: { role?: string | null } | null): boolean {
  return perfil?.role === 'admin';
}

// Solo con un correo que no pueda falsear el usuario (el de GoTrue).
export function esCorreoAdmin(email?: string | null): boolean {
  return EMAILS_ADMIN.includes(String(email || '').trim().toLowerCase());
}

// ids de los usuarios administradores (para avisar solo a sus dispositivos).
// deno-lint-ignore no-explicit-any
export async function idsAdministradores(supabase: any): Promise<string[]> {
  const { data, error } = await supabase.from('profiles').select('id').eq('role', 'admin');
  if (error) throw error;
  return [...new Set<string>((data || []).map((p: { id: string }) => p.id))];
}

export function esFilaIos(fila: FilaPush): boolean {
  return fila.plataforma === 'ios' || String(fila.endpoint || '').startsWith('apns:');
}

function tokenIos(fila: FilaPush): string {
  const sub = typeof fila.subscription === 'string' ? safeJson(fila.subscription) : fila.subscription;
  const token = (sub as { token?: unknown } | null)?.token;
  return typeof token === 'string' && token ? token : String(fila.endpoint || '').replace(/^apns:/, '');
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch (_e) {
    return null;
  }
}

// VAPID se configura una sola vez y solo si hay claves (antes, sin ellas la
// función reventaba al arrancar).
let vapidListo: boolean | null = null;
function prepararVapid(): boolean {
  if (vapidListo !== null) return vapidListo;
  const publica = Deno.env.get('VAPID_PUBLIC_KEY');
  const privada = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publica || !privada) {
    console.warn('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: no se envían avisos web.');
    vapidListo = false;
    return false;
  }
  try {
    webpush.setVapidDetails(`mailto:${Deno.env.get('VAPID_EMAIL') || 'admin@padelmedina.com'}`, publica, privada);
    vapidListo = true;
  } catch (e) {
    console.error('Claves VAPID no válidas:', e);
    vapidListo = false;
  }
  return vapidListo;
}

export function resultadoVacio(): ResultadoEnvio {
  return { total: 0, enviados: 0, fallidos: 0, borrados: 0, omitidos: 0 };
}

export function sumarResultados(a: ResultadoEnvio, b: ResultadoEnvio): ResultadoEnvio {
  return {
    total: a.total + b.total,
    enviados: a.enviados + b.enviados,
    fallidos: a.fallidos + b.fallidos,
    borrados: a.borrados + b.borrados,
    omitidos: a.omitidos + b.omitidos,
  };
}

// Manda `aviso` a cada fila. opciones.ttlSegundos: cuánto tiempo puede esperar
// el aviso si el móvil está apagado (por defecto, lo que diga cada servicio).
export async function enviarAFilas(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  filas: FilaPush[],
  aviso: AvisoPush,
  opciones: { ttlSegundos?: number } = {},
): Promise<ResultadoEnvio> {
  const res = resultadoVacio();
  res.total = filas.length;
  if (filas.length === 0) return res;

  const cuerpoWeb = JSON.stringify({ title: aviso.title, body: aviso.body, url: aviso.url });
  const ttl = opciones.ttlSegundos && opciones.ttlSegundos > 0 ? Math.round(opciones.ttlSegundos) : undefined;
  const caducaEn = ttl ? Date.now() + ttl * 1000 : undefined;

  const nIos = filas.filter(esFilaIos).length;
  const apns = nIos > 0 ? configApns((k) => Deno.env.get(k)) : null;
  if (nIos > 0 && !apns) {
    console.warn(`Faltan los secretos APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY: se omiten ${nIos} iPhone.`);
  }
  const vapid = filas.length > nIos ? prepararVapid() : false;

  const muertas: string[] = [];
  await Promise.all(filas.map(async (fila) => {
    if (esFilaIos(fila)) {
      if (!apns) {
        res.omitidos++;
        return;
      }
      const r = await enviarApns(apns, tokenIos(fila), aviso, { caducaEn });
      if (r.ok) {
        res.enviados++;
      } else {
        res.fallidos++;
        if (r.borrar) muertas.push(fila.id);
        else console.warn(`Aviso iPhone fallido (${r.status} ${r.reason ?? ''}) fila ${fila.id}`);
      }
      return;
    }

    if (!vapid) {
      res.omitidos++;
      return;
    }
    try {
      const sub = typeof fila.subscription === 'string' ? JSON.parse(fila.subscription) : fila.subscription;
      await webpush.sendNotification(sub, cuerpoWeb, ttl ? { TTL: ttl } : undefined);
      res.enviados++;
    } catch (e) {
      res.fallidos++;
      const status = (e as { statusCode?: number })?.statusCode;
      // 404/410: el navegador dio de baja la suscripción; no volverá a funcionar.
      if (status === 404 || status === 410) muertas.push(fila.id);
      else console.warn(`Aviso web fallido (${status ?? 'sin respuesta'}) fila ${fila.id}:`, String((e as Error)?.message ?? e));
    }
  }));

  if (muertas.length > 0) {
    const { error } = await supabase.from('push_subscriptions').delete().in('id', muertas);
    if (error) console.warn('No se pudieron borrar los dispositivos caducados:', error.message);
    else res.borrados = muertas.length;
  }
  return res;
}

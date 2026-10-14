// Avisos a la app de iPhone por APNs (el servicio de notificaciones de Apple),
// sin librerías externas. No usa Deno ni imports: solo fetch y crypto.subtle.
//
// Autenticación por token: un JWT ES256 firmado con la clave .p8 que se
// descarga de Apple Developer (secretos APNS_KEY_ID, APNS_TEAM_ID,
// APNS_PRIVATE_KEY y, opcional, APNS_TOPIC = Bundle ID de la app).
// Apple pide no regenerar el JWT más de una vez cada 20 min y lo da por
// caducado a la hora: su "iat" va por ventanas fijas de 30 min (el mismo en
// todos los workers de esa media hora) y nunca tiene más de 30 min.
// APNs SOLO habla HTTP/2: diagnosticoApns() comprueba que el runtime lo hace.

export interface ConfigApns {
  keyId: string;
  teamId: string;
  clavePem: string; // contenido del .p8 (puede venir con "\n" literales)
  topic: string; // Bundle ID de la app
}

export interface AvisoApns {
  title: string;
  body: string;
  url: string;
}

export interface ResultadoApns {
  ok: boolean;
  status: number; // 0 = no hubo respuesta (error de red)
  reason: string | null; // motivo que da Apple (BadDeviceToken, Unregistered...)
  borrar: boolean; // el dispositivo ya no existe: borrar su fila
  entorno: 'produccion' | 'sandbox';
}

const HOST_PRODUCCION = 'https://api.push.apple.com';
// Los tokens de una app instalada desde Xcode son del entorno de pruebas.
const HOST_SANDBOX = 'https://api.sandbox.push.apple.com';
const VENTANA_JWT_S = 30 * 60;
const TIEMPO_MAXIMO_MS = 15_000;
export const TOPIC_POR_DEFECTO = 'com.padelmedina.app';

// Lee los secretos con la función que se le pase (en Deno: k => Deno.env.get(k)).
// Devuelve null si falta alguno: los iPhone se omiten sin romper nada.
export function configApns(leer: (clave: string) => string | undefined): ConfigApns | null {
  const keyId = (leer('APNS_KEY_ID') || '').trim();
  const teamId = (leer('APNS_TEAM_ID') || '').trim();
  const clavePem = (leer('APNS_PRIVATE_KEY') || '').trim();
  if (!keyId || !teamId || !clavePem) return null;
  return { keyId, teamId, clavePem, topic: (leer('APNS_TOPIC') || '').trim() || TOPIC_POR_DEFECTO };
}

// ── JWT ES256 ───────────────────────────────────────────────────────────────

function base64url(datos: Uint8Array | string): string {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PEM del .p8 ("-----BEGIN PRIVATE KEY----- ...") → bytes DER (PKCS#8).
// Acepta "\n" literales (así suele quedar al pegarlo en un .env) y comillas.
function pemADer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace(/^["']|["']$/g, '')
    .replace(/-----(BEGIN|END)[^-]*-----/g, '')
    .replace(/\s+/g, '');
  const binario = atob(base64);
  const der = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) der[i] = binario.charCodeAt(i);
  return der;
}

let claveCache: { pem: string; clave: CryptoKey } | null = null;
// Guarda la PROMESA de firma: los envíos simultáneos (Promise.all) esperan a la
// misma en vez de firmar cada uno su JWT.
let jwtCache: { id: string; iat: number; jwt: Promise<string> } | null = null;

async function importarClave(pem: string): Promise<CryptoKey> {
  if (claveCache && claveCache.pem === pem) return claveCache.clave;
  const clave = await crypto.subtle.importKey(
    'pkcs8',
    pemADer(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  claveCache = { pem, clave };
  return clave;
}

// JWT para la cabecera authorization. La firma de WebCrypto ya sale en formato
// r||s de 64 bytes, que es justo el que pide JWT (no DER).
export function jwtApns(cfg: ConfigApns, ahora = Date.now()): Promise<string> {
  const id = `${cfg.teamId}:${cfg.keyId}`;
  const iat = Math.floor(ahora / 1000 / VENTANA_JWT_S) * VENTANA_JWT_S;
  if (jwtCache && jwtCache.id === id && jwtCache.iat === iat) return jwtCache.jwt;

  const jwt = (async () => {
    const clave = await importarClave(cfg.clavePem);
    const cabecera = base64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
    const datos = base64url(JSON.stringify({ iss: cfg.teamId, iat }));
    const firma = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      clave,
      new TextEncoder().encode(`${cabecera}.${datos}`),
    );
    return `${cabecera}.${datos}.${base64url(new Uint8Array(firma))}`;
  })();
  const entrada = { id, iat, jwt };
  jwtCache = entrada;
  // Si la firma falla (clave mal pegada), que la próxima llamada lo reintente.
  jwt.catch(() => {
    if (jwtCache === entrada) jwtCache = null;
  });
  return jwt;
}

export function olvidarJwtApns(): void {
  jwtCache = null;
}

// ── Envío ───────────────────────────────────────────────────────────────────

// Apple contesta los errores con JSON {"reason": "..."}. esApple = la respuesta
// tenía ese formato (si no, reason lleva el principio del texto recibido).
async function leerMotivo(res: Response): Promise<{ reason: string | null; esApple: boolean }> {
  const texto = await res.text().catch(() => '');
  if (!texto) return { reason: null, esApple: false };
  try {
    const motivo = JSON.parse(texto)?.reason;
    if (typeof motivo === 'string') return { reason: motivo, esApple: true };
  } catch (_e) {
    // no era JSON
  }
  return { reason: texto.slice(0, 200), esApple: false };
}

async function peticion(
  host: string,
  cfg: ConfigApns,
  token: string,
  cuerpo: string,
  caducaEn?: number,
): Promise<{ ok: boolean; status: number; reason: string | null }> {
  const cabeceras: Record<string, string> = {
    authorization: `bearer ${await jwtApns(cfg)}`,
    'apns-topic': cfg.topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  };
  // Si el móvil está apagado, Apple guarda el aviso hasta aquí (no tiene sentido
  // recordar un partido que ya ha pasado).
  if (caducaEn && Number.isFinite(caducaEn)) cabeceras['apns-expiration'] = String(Math.floor(caducaEn / 1000));

  const res = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: cabeceras,
    body: cuerpo,
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
  });
  if (res.ok) {
    await res.arrayBuffer().catch(() => null);
    return { ok: true, status: res.status, reason: null };
  }
  return { ok: false, status: res.status, reason: (await leerMotivo(res)).reason };
}

// Manda un aviso a un iPhone. `token` es el hex que da Capacitor.
// opciones.caducaEn: instante real (ms) a partir del cual Apple lo descarta.
export async function enviarApns(
  cfg: ConfigApns,
  token: string,
  aviso: AvisoApns,
  opciones: { caducaEn?: number } = {},
): Promise<ResultadoApns> {
  const limpio = String(token || '').replace(/[^0-9a-fA-F]/g, '');
  if (limpio.length < 64) {
    // Un token así nunca va a funcionar: fuera.
    return { ok: false, status: 0, reason: 'TokenMalFormado', borrar: true, entorno: 'produccion' };
  }
  const cuerpo = JSON.stringify({
    aps: { alert: { title: aviso.title, body: aviso.body }, sound: 'default' },
    url: aviso.url,
  });

  try {
    let r = await peticion(HOST_PRODUCCION, cfg, limpio, cuerpo, opciones.caducaEn);
    if (r.status === 403 && r.reason === 'ExpiredProviderToken') {
      // El JWT guardado caducó antes de tiempo: uno nuevo y otra vez.
      olvidarJwtApns();
      r = await peticion(HOST_PRODUCCION, cfg, limpio, cuerpo, opciones.caducaEn);
    }
    if (r.status === 400 && r.reason === 'BadDeviceToken') {
      // Puede ser un iPhone con la app instalada desde Xcode (entorno sandbox).
      const s = await peticion(HOST_SANDBOX, cfg, limpio, cuerpo, opciones.caducaEn);
      return {
        ok: s.ok,
        status: s.status,
        reason: s.reason,
        borrar: !s.ok && (s.status === 410 || s.reason === 'BadDeviceToken'),
        entorno: 'sandbox',
      };
    }
    return { ok: r.ok, status: r.status, reason: r.reason, borrar: r.status === 410, entorno: 'produccion' };
  } catch (e) {
    return { ok: false, status: 0, reason: String(e), borrar: false, entorno: 'produccion' };
  }
}

// ── Diagnóstico ─────────────────────────────────────────────────────────────

export interface DiagnosticoApns {
  http2: boolean; // Apple contestó (JSON con "reason"): el runtime habla HTTP/2
  status: number;
  reason: string | null;
  conCredenciales: boolean;
  errorClave: string | null;
  error: string | null;
  entorno: 'produccion' | 'sandbox';
  explicacion: string;
}

// Petición a Apple con un token de dispositivo falso a propósito. Si hay
// secretos, va firmada: así se comprueba también que la clave .p8, el Key ID y
// el Team ID son buenos. No llega ningún aviso a nadie.
export async function diagnosticoApns(
  cfg: ConfigApns | null,
  entorno: 'produccion' | 'sandbox' = 'produccion',
): Promise<DiagnosticoApns> {
  const host = entorno === 'sandbox' ? HOST_SANDBOX : HOST_PRODUCCION;
  const cabeceras: Record<string, string> = {
    'apns-topic': cfg?.topic || TOPIC_POR_DEFECTO,
    'apns-push-type': 'alert',
    'content-type': 'application/json',
  };
  let conCredenciales = false;
  let errorClave: string | null = null;
  if (cfg) {
    try {
      olvidarJwtApns();
      cabeceras.authorization = `bearer ${await jwtApns(cfg)}`;
      conCredenciales = true;
    } catch (e) {
      errorClave = `No se pudo firmar con APNS_PRIVATE_KEY: ${String(e)}`;
    }
  }

  const base = { conCredenciales, errorClave, entorno };
  try {
    const res = await fetch(`${host}/3/device/0000`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({ aps: { alert: 'diagnostico' } }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const { reason, esApple: http2 } = await leerMotivo(res);
    let explicacion: string;
    if (!http2) {
      explicacion = 'Apple no ha contestado como APNs: puede que este runtime no hable HTTP/2.';
    } else if (reason === 'BadDeviceToken' && conCredenciales) {
      explicacion = 'Todo bien: HTTP/2 con Apple funciona y la clave .p8 es válida (el token de prueba es falso a propósito).';
    } else if (reason === 'InvalidProviderToken') {
      explicacion = 'HTTP/2 con Apple funciona, pero Apple rechaza la clave: revisa APNS_KEY_ID, APNS_TEAM_ID y APNS_PRIVATE_KEY.';
    } else if (reason === 'MissingProviderToken') {
      explicacion = 'HTTP/2 con Apple funciona; faltan los secretos APNS_* para poder enviar.';
    } else if (reason === 'TopicDisallowed' || reason === 'BadTopic') {
      explicacion = 'HTTP/2 con Apple funciona, pero el Bundle ID (APNS_TOPIC) no corresponde a esa clave.';
    } else {
      explicacion = `HTTP/2 con Apple funciona. Respuesta de Apple: ${reason}.`;
    }
    return { ...base, http2, status: res.status, reason, error: null, explicacion };
  } catch (e) {
    return {
      ...base,
      http2: false,
      status: 0,
      reason: null,
      error: String(e),
      explicacion: 'No se ha podido hablar con Apple (sin respuesta). Puede ser la red del servidor o que el runtime no use HTTP/2.',
    };
  }
}

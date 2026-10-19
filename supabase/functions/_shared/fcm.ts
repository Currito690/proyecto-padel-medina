// Avisos a la app de Android por FCM (Firebase Cloud Messaging, API HTTP v1),
// sin librerías externas. No usa Deno ni imports: solo fetch y crypto.subtle.
//
// Autenticación: la "cuenta de servicio" de Firebase (el .json que se descarga en
// Firebase > Configuración del proyecto > Cuentas de servicio), guardada entera,
// en UNA línea, en el secreto FCM_SERVICE_ACCOUNT. Con su clave privada se firma
// un JWT RS256 que Google cambia por un token de acceso (dura 1 h; se guarda 50 min).

export interface ConfigFcm {
  projectId: string;
  clientEmail: string;
  clavePem: string; // private_key del .json (puede venir con "\n" literales)
}

export interface AvisoFcm {
  title: string;
  body: string;
  url: string;
}

export interface ResultadoFcm {
  ok: boolean;
  status: number; // 0 = no hubo respuesta (error de red)
  reason: string | null; // motivo que da Google (UNREGISTERED, INVALID_ARGUMENT...)
  borrar: boolean; // el dispositivo ya no existe: borrar su fila
}

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const ALCANCE = 'https://www.googleapis.com/auth/firebase.messaging';
const TIEMPO_MAXIMO_MS = 15_000;
const VIDA_TOKEN_MS = 50 * 60 * 1000;

// Lee el secreto con la función que se le pase (en Deno: k => Deno.env.get(k)).
// Devuelve null si falta o está mal: los Android se omiten sin romper nada.
export function configFcm(leer: (clave: string) => string | undefined): ConfigFcm | null {
  const crudo = (leer('FCM_SERVICE_ACCOUNT') || '').trim();
  if (!crudo) return null;
  try {
    const j = JSON.parse(crudo);
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    return { projectId: j.project_id, clientEmail: j.client_email, clavePem: j.private_key };
  } catch (_e) {
    console.warn('FCM_SERVICE_ACCOUNT no es un JSON válido: no se envían avisos a Android.');
    return null;
  }
}

function base64url(datos: Uint8Array | string): string {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PEM de la clave privada ("-----BEGIN PRIVATE KEY----- ...") → bytes DER (PKCS#8).
function pemADer(pem: string): Uint8Array {
  const limpio = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binario = atob(limpio);
  const der = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) der[i] = binario.charCodeAt(i);
  return der;
}

let tokenGuardado: { valor: string; caduca: number; email: string } | null = null;
let tokenEnCurso: Promise<string> | null = null;

// Token de acceso OAuth2 de la cuenta de servicio (compartido por envíos simultáneos).
export function tokenAccesoFcm(cfg: ConfigFcm, ahora = Date.now()): Promise<string> {
  if (tokenGuardado && tokenGuardado.email === cfg.clientEmail && tokenGuardado.caduca > ahora) {
    return Promise.resolve(tokenGuardado.valor);
  }
  if (tokenEnCurso) return tokenEnCurso;
  tokenEnCurso = (async () => {
    const iat = Math.floor(ahora / 1000);
    const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const datos = base64url(JSON.stringify({ iss: cfg.clientEmail, scope: ALCANCE, aud: URL_TOKEN, iat, exp: iat + 3600 }));
    const clave = await crypto.subtle.importKey(
      'pkcs8', pemADer(cfg.clavePem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
    );
    const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(`${cabecera}.${datos}`)));
    const jwt = `${cabecera}.${datos}.${base64url(firma)}`;
    const res = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(`Google no dio el token de FCM (${res.status} ${j.error || ''})`);
    tokenGuardado = { valor: j.access_token, caduca: ahora + VIDA_TOKEN_MS, email: cfg.clientEmail };
    return j.access_token as string;
  })().finally(() => { tokenEnCurso = null; });
  return tokenEnCurso;
}

// Manda un aviso a un dispositivo Android (token FCM). opciones.caducaEn: hasta
// cuándo puede esperar el aviso si el móvil está apagado (ms desde 1970).
export async function enviarFcm(
  cfg: ConfigFcm,
  token: string,
  aviso: AvisoFcm,
  opciones: { caducaEn?: number } = {},
): Promise<ResultadoFcm> {
  if (!token || token.length < 20) return { ok: false, status: 0, reason: 'token no válido', borrar: true };
  try {
    const acceso = await tokenAccesoFcm(cfg);
    const ttlS = opciones.caducaEn ? Math.max(0, Math.round((opciones.caducaEn - Date.now()) / 1000)) : undefined;
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: aviso.title, body: aviso.body },
          data: { url: aviso.url },
          android: {
            priority: 'HIGH',
            ...(ttlS !== undefined ? { ttl: `${ttlS}s` } : {}),
          },
        },
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    if (res.ok) return { ok: true, status: res.status, reason: null, borrar: false };
    const j = await res.json().catch(() => ({}));
    const detalle = (j?.error?.details || []).map((d: { errorCode?: string }) => d.errorCode).find(Boolean);
    const reason = detalle || j?.error?.status || null;
    // UNREGISTERED (404) = la app se desinstaló o el token caducó. INVALID_ARGUMENT
    // con un token mal formado tampoco volverá a funcionar.
    const borrar = res.status === 404 || reason === 'UNREGISTERED'
      || (res.status === 400 && /registration token/i.test(j?.error?.message || ''));
    if (res.status === 401) tokenGuardado = null; // token de acceso caducado: el próximo lo renueva
    return { ok: false, status: res.status, reason, borrar };
  } catch (e) {
    return { ok: false, status: 0, reason: String((e as Error)?.message ?? e), borrar: false };
  }
}

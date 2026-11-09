// Envío de correos de la app (reservas, torneos, avisos al club).
//
// Principal: el SMTP del correo de IONOS (donde está el correo de padelmedina.com),
// con el cliente propio de _shared/smtp.ts.
// Secretos (volumes/functions/.env.secrets en el servidor):
//   CORREO_SMTP_HOST     smtp.ionos.es
//   CORREO_SMTP_PUERTO   465 (SSL/TLS; con 587 se usa STARTTLS)
//   CORREO_SMTP_SEGURIDAD opcional: "ssl" o "starttls" (por defecto, según el puerto)
//   CORREO_SMTP_USUARIO  el buzón completo, p. ej. reservas@padelmedina.com
//   CORREO_SMTP_CLAVE    la contraseña de ese buzón
//   CORREO_REMITENTE     opcional: "Padel Medina <reservas@padelmedina.com>".
//                        IONOS solo deja enviar como el propio buzón (o un alias
//                        suyo); por defecto se usa el buzón del usuario SMTP.
//   CORREO_RESPONDER_A   opcional: a dónde van las respuestas (info@padelmedina.com)
//
// Reserva: si el SMTP no está configurado o falla, y sigue existiendo
// RESEND_API_KEY, el correo sale por Resend como antes (y queda en el log).
// Para dejar de usar Resend del todo basta con quitar RESEND_API_KEY.
import { type ConfigSmtp, enviarSmtp } from './smtp.ts';

export interface Correo {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface ResultadoCorreo {
  ok: boolean;
  id: string | null;
  via: 'smtp' | 'resend' | null;
  error: string | null;
}

const REMITENTE_RESEND = 'Padel Medina <reservas@padelmedina.com>';
const RESPONDER_A_DEFECTO = 'info@padelmedina.com';
const TIEMPO_MAXIMO_MS = 20_000;

const env = (k: string) => (Deno.env.get(k) || '').trim();

function configSmtp(): ConfigSmtp | null {
  const host = env('CORREO_SMTP_HOST');
  const usuario = env('CORREO_SMTP_USUARIO');
  const clave = Deno.env.get('CORREO_SMTP_CLAVE') || '';
  if (!host || !usuario || !clave) return null;
  const puerto = Number(env('CORREO_SMTP_PUERTO') || '465') || 465;
  // SSL directo en el 465; STARTTLS en el resto, salvo que se diga otra cosa.
  const seguridad = env('CORREO_SMTP_SEGURIDAD').toLowerCase();
  const ssl = seguridad ? seguridad === 'ssl' : puerto === 465;
  return { host, puerto, usuario, clave, ssl };
}

function responderA(): string {
  return env('CORREO_RESPONDER_A') || RESPONDER_A_DEFECTO;
}

// ¿Hay alguna forma de mandar correos? (las funciones contestan 500 si no).
export function correoConfigurado(): boolean {
  return configSmtp() !== null || env('RESEND_API_KEY') !== '';
}

async function porSmtp(cfg: ConfigSmtp, c: Correo): Promise<ResultadoCorreo> {
  try {
    const r = await enviarSmtp(cfg, {
      remitente: env('CORREO_REMITENTE') || `Padel Medina <${cfg.usuario}>`,
      // El remite del sobre tiene que ser el buzón autenticado (IONOS lo exige).
      sobreDe: cfg.usuario,
      para: c.to,
      responderA: responderA(),
      asunto: c.subject,
      html: c.html,
      texto: c.text,
      cabeceras: c.headers,
    }, TIEMPO_MAXIMO_MS);
    if (r.rechazados.length > 0) console.warn(`IONOS no aceptó a: ${r.rechazados.join('; ')}`);
    return { ok: true, id: r.id, via: 'smtp', error: null };
  } catch (e) {
    const err = e as { codigo?: number; message?: string };
    return { ok: false, id: null, via: 'smtp', error: err?.message || String(e) };
  }
}

async function porResend(c: Correo): Promise<ResultadoCorreo> {
  const clave = env('RESEND_API_KEY');
  if (!clave) return { ok: false, id: null, via: null, error: 'sin RESEND_API_KEY' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE_RESEND,
        reply_to: responderA(),
        to: c.to,
        subject: c.subject,
        html: c.html,
        ...(c.text ? { text: c.text } : {}),
        ...(c.headers ? { headers: c.headers } : {}),
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, id: null, via: 'resend', error: `HTTP ${res.status} ${JSON.stringify(j)}` };
    return { ok: true, id: String(j?.id || ''), via: 'resend', error: null };
  } catch (e) {
    return { ok: false, id: null, via: 'resend', error: String((e as Error)?.message ?? e) };
  }
}

// Manda un correo. Nunca lanza: devuelve ok/error y por dónde salió.
export async function enviarCorreo(c: Correo): Promise<ResultadoCorreo> {
  const cfg = configSmtp();
  if (cfg) {
    const r = await porSmtp(cfg, c);
    if (r.ok) return r;
    console.error(`Correo por IONOS fallido (${c.to.join(',')}): ${r.error}`);
    if (!env('RESEND_API_KEY')) return r;
    const r2 = await porResend(c);
    if (r2.ok) console.warn(`Correo enviado por Resend como reserva (${c.to.join(',')})`);
    return r2.ok ? r2 : { ...r, error: `${r.error} | Resend: ${r2.error}` };
  }
  return porResend(c);
}

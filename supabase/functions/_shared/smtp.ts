// Cliente SMTP mínimo con las funciones propias de Deno (Deno.connectTls /
// Deno.startTls). nodemailer (npm) se queda colgado al abrir el TLS dentro de
// Deno, así que no se usa.
//
// Hace lo justo para un servidor de correo normal (el del Plesk): SSL directo (465) o STARTTLS (587),
// AUTH PLAIN/LOGIN, varios destinatarios y un mensaje HTML (con texto plano
// opcional) en UTF-8. Una conexión por mensaje.

export interface ConfigSmtp {
  host: string;
  puerto: number;
  usuario: string;
  clave: string;
  ssl: boolean; // true: SSL desde el principio (465); false: STARTTLS (587)
}

export interface MensajeSmtp {
  remitente: string; // "Nombre <buzon@dominio>" o "buzon@dominio" (cabecera From)
  sobreDe: string; // MAIL FROM (el servidor exige el buzón autenticado)
  para: string[];
  responderA?: string;
  asunto: string;
  html: string;
  texto?: string;
  cabeceras?: Record<string, string>;
}

export interface ResultadoSmtp {
  id: string; // Message-ID
  rechazados: string[]; // destinatarios que el servidor no aceptó
}

const CRLF = '\r\n';
// SMTP_TRAZA=1 escribe la conversación en el log (sin la contraseña).
const TRAZA = (() => { try { return Deno.env.get('SMTP_TRAZA') === '1'; } catch (_e) { return false; } })();
const enc = new TextEncoder();
const dec = new TextDecoder();

export class ErrorSmtp extends Error {
  constructor(public codigo: number, mensaje: string) {
    super(mensaje);
  }
}

// --- Utilidades de formato -------------------------------------------------

const sinSaltos = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

function base64Utf8(texto: string): string {
  const bytes = enc.encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Base64 en líneas de 76 caracteres (RFC 2045).
const base64Lineas = (texto: string) => (base64Utf8(texto).match(/.{1,76}/g) || ['']).join(CRLF);

// Cabecera con caracteres no ASCII → encoded-word UTF-8 (RFC 2047), troceada
// para no pasar de ~75 caracteres por palabra.
function cabeceraUtf8(valor: string): string {
  const v = sinSaltos(valor);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  const trozos: string[] = [];
  let actual = '';
  for (const ch of v) {
    if (enc.encode(actual + ch).length > 42) {
      trozos.push(actual);
      actual = '';
    }
    actual += ch;
  }
  if (actual) trozos.push(actual);
  return trozos.map((t) => `=?UTF-8?B?${base64Utf8(t)}?=`).join(`${CRLF} `);
}

const RE_CORREO = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/;

// "Nombre <a@b.c>" → cabecera con el nombre codificado si hace falta.
export function direccion(valor: string): { cabecera: string; correo: string } {
  const v = sinSaltos(valor);
  const m = v.match(/^(.*)<([^<>]+)>$/);
  const correo = (m ? m[2] : v).trim();
  if (!RE_CORREO.test(correo)) throw new ErrorSmtp(0, `Dirección no válida: ${correo}`);
  const nombre = m ? m[1].trim().replace(/^"|"$/g, '') : '';
  if (!nombre) return { cabecera: correo, correo };
  const nombreCab = /^[\x20-\x7e]*$/.test(nombre) ? `"${nombre.replace(/["\\]/g, '')}"` : cabeceraUtf8(nombre);
  return { cabecera: `${nombreCab} <${correo}>`, correo };
}

export function construirMensaje(m: MensajeSmtp, ahora = new Date()): { datos: string; id: string } {
  const de = direccion(m.remitente);
  const dominio = de.correo.split('@')[1];
  const id = `<${crypto.randomUUID()}@${dominio}>`;
  const para = m.para.map((p) => direccion(p).cabecera);
  const lineas = [
    `From: ${de.cabecera}`,
    `To: ${para.join(', ')}`,
    ...(m.responderA ? [`Reply-To: ${direccion(m.responderA).cabecera}`] : []),
    `Subject: ${cabeceraUtf8(m.asunto)}`,
    `Date: ${ahora.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
  ];
  for (const [k, v] of Object.entries(m.cabeceras || {})) {
    if (/^[A-Za-z0-9-]+$/.test(k)) lineas.push(`${k}: ${cabeceraUtf8(v)}`);
  }
  const parteHtml = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lineas(m.html)];
  if (m.texto) {
    const limite = `pm-${crypto.randomUUID()}`;
    lineas.push(`Content-Type: multipart/alternative; boundary="${limite}"`, '');
    lineas.push(
      `--${limite}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lineas(m.texto),
      `--${limite}`, ...parteHtml,
      `--${limite}--`,
    );
  } else {
    lineas.push(...parteHtml.slice(0, 2), '', parteHtml[3]);
  }
  return { datos: lineas.join(CRLF), id };
}

// --- Conversación SMTP -----------------------------------------------------

type Conexion = Deno.Conn | Deno.TlsConn;

class Sesion {
  private resto = '';
  constructor(public conn: Conexion) {}

  private async linea(): Promise<string> {
    while (true) {
      const i = this.resto.indexOf('\n');
      if (i >= 0) {
        const l = this.resto.slice(0, i).replace(/\r$/, '');
        this.resto = this.resto.slice(i + 1);
        return l;
      }
      const buf = new Uint8Array(4096);
      const n = await this.conn.read(buf);
      if (n === null) throw new ErrorSmtp(0, 'El servidor cerró la conexión');
      this.resto += dec.decode(buf.subarray(0, n));
    }
  }

  // Respuesta (también las de varias líneas "250-...").
  async respuesta(): Promise<{ codigo: number; texto: string; lineas: string[] }> {
    const lineas: string[] = [];
    while (true) {
      const l = await this.linea();
      const codigo = Number(l.slice(0, 3));
      lineas.push(l.slice(4));
      if (TRAZA) console.log('SMTP <', l.slice(0, 120));
      if (l[3] !== '-') return { codigo, texto: lineas.join(' '), lineas };
    }
  }

  async escribir(texto: string) {
    if (TRAZA) console.log('SMTP >', /^AUTH|^[A-Za-z0-9+/=]{8,}\r\n$/.test(texto) ? '(credenciales)' : texto.slice(0, 80).trim());
    const datos = enc.encode(texto);
    let escritos = 0;
    while (escritos < datos.length) escritos += await this.conn.write(datos.subarray(escritos));
  }

  async comando(cmd: string, esperados: number[], mostrar = cmd): Promise<{ codigo: number; texto: string; lineas: string[] }> {
    await this.escribir(cmd + CRLF);
    const r = await this.respuesta();
    if (!esperados.includes(r.codigo)) throw new ErrorSmtp(r.codigo, `${mostrar.split(' ')[0]} → ${r.codigo} ${r.texto}`);
    return r;
  }
}

async function conversar(cfg: ConfigSmtp, m: MensajeSmtp, s: Sesion, cambiarTls: () => Promise<Sesion>): Promise<ResultadoSmtp> {
  const saludo = await s.respuesta();
  if (saludo.codigo !== 220) throw new ErrorSmtp(saludo.codigo, `Saludo → ${saludo.codigo} ${saludo.texto}`);
  let ehlo = await s.comando('EHLO padelmedina.com', [250]);
  if (!cfg.ssl) {
    await s.comando('STARTTLS', [220]);
    s = await cambiarTls();
    ehlo = await s.comando('EHLO padelmedina.com', [250]);
  }
  // PLAIN salvo que el servidor solo ofrezca LOGIN.
  const auth = ehlo.lineas.find((l) => /^AUTH[ =]/i.test(l)) || '';
  if (/\bPLAIN\b/i.test(auth) || !/\bLOGIN\b/i.test(auth)) {
    await s.comando(`AUTH PLAIN ${base64Utf8(`\0${cfg.usuario}\0${cfg.clave}`)}`, [235], 'AUTH PLAIN');
  } else {
    await s.comando('AUTH LOGIN', [334]);
    await s.comando(base64Utf8(cfg.usuario), [334], 'AUTH usuario');
    await s.comando(base64Utf8(cfg.clave), [235], 'AUTH clave');
  }

  const { datos, id } = construirMensaje(m);
  await s.comando(`MAIL FROM:<${direccion(m.sobreDe).correo}>`, [250]);
  const rechazados: string[] = [];
  for (const p of m.para) {
    const correo = direccion(p).correo;
    await s.escribir(`RCPT TO:<${correo}>${CRLF}`);
    const r = await s.respuesta();
    if (r.codigo !== 250 && r.codigo !== 251) rechazados.push(`${correo} (${r.codigo} ${r.texto})`);
  }
  if (rechazados.length === m.para.length) {
    throw new ErrorSmtp(550, `Destinatarios rechazados: ${rechazados.join('; ')}`);
  }
  await s.comando('DATA', [354]);
  // Ninguna línea empieza por "." (cabeceras y base64), pero por si acaso:
  const cuerpo = datos.split(CRLF).map((l) => (l.startsWith('.') ? '.' + l : l)).join(CRLF);
  await s.comando(`${cuerpo}${CRLF}.`, [250], 'DATA (mensaje)');
  try { await s.comando('QUIT', [221]); } catch (_e) { /* da igual */ }
  return { id, rechazados };
}

// Manda un mensaje. Lanza ErrorSmtp (con el código del servidor) si falla.
export async function enviarSmtp(cfg: ConfigSmtp, m: MensajeSmtp, tiempoMaximoMs = 20_000): Promise<ResultadoSmtp> {
  let conn: Conexion | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      try { conn?.close(); } catch (_e) { /* ya cerrada */ }
      rechazar(new ErrorSmtp(0, `Sin respuesta de ${cfg.host}:${cfg.puerto} en ${tiempoMaximoMs / 1000} s`));
    }, tiempoMaximoMs);
  });
  const trabajo = (async () => {
    if (cfg.ssl) {
      conn = await Deno.connectTls({ hostname: cfg.host, port: cfg.puerto });
    } else {
      conn = await Deno.connect({ hostname: cfg.host, port: cfg.puerto });
    }
    const cambiarTls = async () => {
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: cfg.host });
      return new Sesion(conn);
    };
    return await conversar(cfg, m, new Sesion(conn), cambiarTls);
  })();
  try {
    return await Promise.race([trabajo, limite]);
  } finally {
    clearTimeout(temporizador);
    try { (conn as Conexion | null)?.close(); } catch (_e) { /* ya cerrada */ }
    trabajo.catch(() => {}); // si ganó el tiempo máximo, que no quede un rechazo suelto
  }
}

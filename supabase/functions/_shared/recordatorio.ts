// Lógica PURA del recordatorio de pista (sin Deno ni imports): la usa la
// función send-reminders y se prueba en el PC con
//   node --test supabase/functions/_shared/recordatorio.test.ts
//
// Todo se calcula en hora de pared de Madrid, guardada como milisegundos de
// "hora de pared tratada como UTC" (Date.UTC(...)). Así sumar horas, mirar la
// hora del día o pasar a la víspera es aritmética simple y no depende de la
// zona del servidor (que corre en UTC). Los cambios de hora caen de madrugada,
// dentro del silencio, y no afectan a los envíos.
//
// Reglas (lo que pidió el club: unas horas antes o la víspera, nunca de madrugada):
// - inicio = fecha + primera hora de la franja; ideal = inicio - 3 h.
// - Silencio de 22:00 (incluida) a 09:00 (excluida). Si el ideal cae ahí, se
//   adelanta a las 21:00: de ese mismo día si es >= 22:00, o de la víspera si
//   es < 09:00.
// - Reservas hechas tarde: nunca antes de 2 h después de reservar. Si ese
//   momento cae en silencio, se pasa a las 09:00 siguientes.
// - El cron pasa a las :00 y a las :30, así que la última pasada antes del
//   silencio es la de las 21:30: un envío entre las 21:30 y las 22:00 se
//   adelanta a las 21:30 (si no, no saldría hasta las 09:00, o nunca si la
//   pista es a primera hora).
// - Si el envío quedaría a menos de 1 h del partido, esa reserva no lleva aviso.
// - En cada pasada del cron se envía si ya es la hora, no es de noche y faltan
//   al menos 30 min; si ya no da tiempo, se da por hecha sin enviar.

export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;

export const SILENCIO_DESDE = 22; // 22:00 incluida
export const SILENCIO_HASTA = 9; //  09:00 excluida
export const HORA_VISPERA = 21;
const ANTELACION = 3 * HORA;
const MARGEN_TRAS_RESERVAR = 2 * HORA;
const MINIMO_ANTES = 1 * HORA;
const ULTIMO_ENVIO = 30 * MINUTO;
const PASO_CRON = 30 * MINUTO; // el cron pasa a las :00 y a las :30

export const URL_AVISO = '/mis-reservas';

export interface DatosReserva {
  date: string; // 'YYYY-MM-DD' (hora de Madrid)
  time_slot: string; // 'HH:MM - HH:MM' (hora de Madrid)
  created_at?: string | null; // timestamptz tal cual lo devuelve la API
}

export interface Plan {
  inicio: number; // hora de pared del partido
  envio: number; // hora de pared a partir de la cual toca avisar
}

export type Decision = 'esperar' | 'enviar' | 'descartar';

export interface ReservaAviso {
  date: string;
  time_slot: string;
  pista?: string | null;
}

export interface AvisoPush {
  title: string;
  body: string;
  url: string;
}

// ── Hora de pared de Madrid ─────────────────────────────────────────────────

let formatoMadrid: Intl.DateTimeFormat | null = null;

// Instante real (Date o ms) → hora de pared de Madrid como ms "tratados como UTC".
export function paredMadrid(instante: Date | number): number {
  formatoMadrid ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const parte of formatoMadrid.formatToParts(new Date(instante))) p[parte.type] = parte.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}

// Inversa aproximada: hora de pared de Madrid → instante real (ms desde 1970).
// Dos pasadas por si la primera cruza un cambio de hora.
export function instanteDesdePared(pared: number): number {
  let instante = pared - (paredMadrid(pared) - pared);
  instante = pared - (paredMadrid(instante) - instante);
  return instante;
}

export function fechaPared(pared: number): string {
  return new Date(pared).toISOString().slice(0, 10);
}

export function horaPared(pared: number): string {
  return new Date(pared).toISOString().slice(11, 16);
}

export function textoPared(pared: number): string {
  return `${fechaPared(pared)} ${horaPared(pared)}`;
}

// 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM' (también con 'T') → hora de pared, o null.
export function leerPared(texto: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const hh = m[4] ? +m[4] : 0;
  const mm = m[5] ? +m[5] : 0;
  if (hh > 23 || mm > 59) return null;
  const pared = Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mm);
  // Rechaza fechas imposibles (2026-02-30 se "desbordaría" a marzo).
  return fechaPared(pared) === `${m[1]}-${m[2]}-${m[3]}` ? pared : null;
}

// timestamptz de Postgres ('2026-10-14T21:30:00.123456+00:00' o con espacio y
// '+00') → instante real en ms, o null.
export function leerInstante(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? valor.getTime() : null;
  const texto = String(valor).trim()
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(texto);
  return Number.isFinite(ms) ? ms : null;
}

// ── Reserva ─────────────────────────────────────────────────────────────────

// 'HH:MM - HH:MM' → { desde: 'HH:MM', hasta: 'HH:MM' | null }
export function horasFranja(franja: string): { desde: string; hasta: string | null } {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(?:-\s*(\d{1,2}):(\d{2}))?/.exec(String(franja ?? ''));
  if (!m) return { desde: String(franja ?? '').trim(), hasta: null };
  return {
    desde: `${m[1].padStart(2, '0')}:${m[2]}`,
    hasta: m[3] ? `${m[3].padStart(2, '0')}:${m[4]}` : null,
  };
}

// Hora de pared del comienzo del partido, o null si la fecha/franja no se entiende.
export function inicioReserva(fecha: string, franja: string): number | null {
  const soloFecha = String(fecha ?? '').trim();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(soloFecha) ? leerPared(soloFecha) : null;
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(franja ?? ''));
  if (dia === null || !m) return null;
  const hh = +m[1];
  const mm = +m[2];
  if (hh > 23 || mm > 59) return null;
  return dia + hh * HORA + mm * MINUTO;
}

// ── Silencio nocturno ───────────────────────────────────────────────────────

function horaDelDia(pared: number): number {
  return new Date(pared).getUTCHours();
}

// El mismo día de `pared` desplazado `dias` días, a la hora en punto `hora`.
// Date.UTC corrige el desbordamiento (día 0 = último del mes anterior).
function aLas(pared: number, hora: number, dias: number): number {
  const d = new Date(pared);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dias, hora, 0, 0, 0);
}

export function estaEnSilencio(pared: number): boolean {
  const h = horaDelDia(pared);
  return h >= SILENCIO_DESDE || h < SILENCIO_HASTA;
}

// ── Plan y decisión ─────────────────────────────────────────────────────────

// Cuándo avisar de una reserva, o null si no lleva recordatorio.
export function planificar(reserva: DatosReserva): Plan | null {
  const inicio = inicioReserva(reserva.date, reserva.time_slot);
  if (inicio === null) return null;

  // 1) Lo ideal: 3 h antes. De noche no: a las 21:00 de ese día (si es tarde)
  //    o de la víspera (si es de madrugada o primera hora).
  let ideal = inicio - ANTELACION;
  if (estaEnSilencio(ideal)) {
    ideal = aLas(ideal, HORA_VISPERA, horaDelDia(ideal) >= SILENCIO_DESDE ? 0 : -1);
  }

  // 2) Reserva hecha tarde: no avisamos nada más reservar, sino 2 h después.
  //    Si eso cae de noche, a las 09:00 siguientes.
  let envio = ideal;
  const creada = leerInstante(reserva.created_at);
  if (creada !== null) {
    const primero = paredMadrid(creada) + MARGEN_TRAS_RESERVAR;
    if (ideal < primero) {
      envio = primero;
      if (estaEnSilencio(envio)) {
        envio = aLas(envio, SILENCIO_HASTA, horaDelDia(envio) >= SILENCIO_DESDE ? 1 : 0);
      }
    }
  }

  // 3) Entre las 21:30 y las 22:00 ya no pasa el cron antes del silencio: se
  //    avisa en la pasada de las 21:30 (como pronto 1 h 30 min tras reservar).
  const ultimaPasada = aLas(envio, SILENCIO_DESDE, 0) - PASO_CRON;
  if (!estaEnSilencio(envio) && envio > ultimaPasada) envio = ultimaPasada;

  // 4) A menos de 1 h del partido el aviso ya no aporta: no hay recordatorio.
  if (envio > inicio - MINIMO_ANTES) return null;
  return { inicio, envio };
}

// Hasta cuándo puede esperar el aviso enviado en `ahora` si el móvil está
// apagado: hasta las 22:00 de ese día (que no llegue de madrugada ni al día
// siguiente diciendo "mañana") o, si es antes, hasta que empiece el partido.
export function caducidadAviso(ahora: number, inicio: number): number {
  return Math.min(inicio, aLas(ahora, SILENCIO_DESDE, 0));
}

// Qué hacer con una reserva en esta pasada del cron (`ahora` en hora de pared).
export function decidir(ahora: number, plan: Plan | null): Decision {
  if (!plan) return 'descartar';
  if (ahora > plan.inicio - ULTIMO_ENVIO) return 'descartar'; // ya no da tiempo
  if (ahora < plan.envio) return 'esperar';
  if (estaEnSilencio(ahora)) return 'esperar'; // se retrasó y es de noche: a las 09:00
  return 'enviar';
}

// ── Texto del aviso ─────────────────────────────────────────────────────────

// 'hoy', 'mañana' o 'el 16/10' según la fecha del partido y la de hoy (Madrid).
export function cuandoEs(fecha: string, hoy: string): string {
  const a = leerPared(fecha);
  const b = leerPared(hoy);
  if (a !== null && b !== null) {
    const dias = Math.round((a - b) / DIA);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    const [, m, d] = fecha.split('-');
    return `el ${d}/${m}`;
  }
  return `el ${fecha}`;
}

function capitalizar(texto: string): string {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}

function nombrePista(nombre?: string | null): string {
  return (nombre ?? '').trim() || 'tu pista';
}

// "la Pista 1" / "la pista Cristal" / "tu pista"
function laPista(nombre?: string | null): string {
  const n = (nombre ?? '').trim();
  if (!n) return 'tu pista';
  return /^pista\b/i.test(n) ? `la ${n}` : `la pista ${n}`;
}

// ['a', 'b', 'c'] → 'a, b y c'
function enumerar(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

// Un solo aviso para todas las reservas de un usuario que tocan en esta pasada.
export function construirAviso(reservas: ReservaAviso[], hoy: string): AvisoPush {
  const ordenadas = [...reservas].sort((a, b) =>
    (inicioReserva(a.date, a.time_slot) ?? 0) - (inicioReserva(b.date, b.time_slot) ?? 0));
  const primera = ordenadas[0];
  if (!primera) return { title: '🎾 Padel Medina', body: 'Tienes una pista reservada. ¡Te esperamos!', url: URL_AVISO };

  const { desde, hasta } = horasFranja(primera.time_slot);
  const cuando = cuandoEs(primera.date, hoy);
  const title = `🎾 ${capitalizar(cuando)} juegas a las ${desde}`;

  if (ordenadas.length === 1) {
    const tramo = hasta ? `de ${desde} a ${hasta}` : `a las ${desde}`;
    const dia = cuando === 'hoy' ? '' : ` ${cuando}`;
    return { title, body: `Tienes ${laPista(primera.pista)} reservada${dia} ${tramo}. ¡Te esperamos!`, url: URL_AVISO };
  }

  // Varias: una frase por día, en orden ("Hoy tienes 2 pistas: Pista 1 a las
  // 18:00 y Pista 2 a las 19:30").
  const porDia = new Map<string, ReservaAviso[]>();
  for (const r of ordenadas) {
    const lista = porDia.get(r.date) ?? [];
    lista.push(r);
    porDia.set(r.date, lista);
  }
  const frases = [...porDia].map(([fecha, lista]) => {
    const dia = capitalizar(cuandoEs(fecha, hoy));
    if (lista.length === 1) {
      return `${dia} tienes ${laPista(lista[0].pista)} a las ${horasFranja(lista[0].time_slot).desde}`;
    }
    const items = lista.map((r) => `${nombrePista(r.pista)} a las ${horasFranja(r.time_slot).desde}`);
    return `${dia} tienes ${lista.length} pistas: ${enumerar(items)}`;
  });
  return { title, body: `${frases.join('. ')}. ¡Te esperamos!`, url: URL_AVISO };
}

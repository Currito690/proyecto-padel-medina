// Parrilla de horarios del club, configurable por el admin
// (site_settings.schedule_config). El día se divide en TRAMOS (mañana/tarde):
// la mañana acaba a su tope (14:00) y la tarde empieza a las 16:00.
// LAS HORAS NO CAMBIAN SOLAS: si un entreno o reserva pisa un hueco, ese hueco
// queda ocupado y no se ofrece — nada se desplaza automáticamente. Cualquier
// ajuste lo hace el admin A MANO (editor de horario o huecos personalizados).

export const DEFAULT_SCHEDULE_CONFIG = {
  slot_minutes: 90,
  periods: [
    { start: '09:00', end: '14:00' },
    { start: '16:00', end: '22:00' },
  ],
};

export const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export const fmtMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const parseSlot = (slotStr) => { const [a, b] = slotStr.split(' - '); return [toMin(a), toMin(b)]; };

const HHMM = /^\d{1,2}:\d{2}$/;

// Sanea lo que venga de la BD (columna aún sin migrar, JSON a medias, tramos
// desordenados o solapados). Si no hay nada usable, cae a la parrilla clásica.
export function normalizeScheduleConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const slotMinutes = parseInt(cfg.slot_minutes, 10);
  const sorted = (Array.isArray(cfg.periods) ? cfg.periods : [])
    .filter(p => p && HHMM.test(p.start || '') && HHMM.test(p.end || '') && toMin(p.end) > toMin(p.start))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  // Tramos solapados: el siguiente empieza como pronto donde acabó el anterior
  const periods = [];
  for (const p of sorted) {
    const prevEnd = periods.length ? toMin(periods[periods.length - 1].end) : 0;
    const start = Math.max(toMin(p.start), prevEnd);
    if (toMin(p.end) > start) periods.push({ start: fmtMin(start), end: p.end });
  }
  if (!Number.isFinite(slotMinutes) || slotMinutes < 15 || periods.length === 0) {
    return DEFAULT_SCHEDULE_CONFIG;
  }
  return { slot_minutes: slotMinutes, periods };
}

// Huecos base de un día: cada tramo se rellena con sesiones consecutivas de
// slot_minutes; la sesión que no cabe ENTERA en su tramo no existe.
export function buildScheduleTimes(config) {
  const { slot_minutes, periods } = normalizeScheduleConfig(config);
  const times = [];
  for (const p of periods) {
    for (let s = toMin(p.start); s + slot_minutes <= toMin(p.end); s += slot_minutes) {
      times.push(`${fmtMin(s)} - ${fmtMin(s + slot_minutes)}`);
    }
  }
  return times;
}

// Huecos DISPONIBLES de un día: la parrilla base a sus horas fijas, SIN
// recolocación automática. Un hueco base pisado por algo ocupado (entreno,
// reserva, bloqueo) simplemente no se ofrece — se queda ocupado a su hora
// real. Si el admin quiere ofrecer otra hora, la crea a mano ("+ Hueco" o
// "Editar hora"): esos huecos personalizados se ofrecen tal cual (salvo que
// estén pisados) y tapan al hueco base que se solape con ellos, para que
// nunca haya dos opciones solapadas a elegir.
// occupiedIvs: intervalos ocupados en minutos [[ini, fin], ...].
// hiddenTimes: huecos base sustituidos ese día por un "Editar hora" del admin
// (custom_slots.hides) — no se ofrecen aunque estén libres.
// Devuelve la lista de huecos DISPONIBLES ("HH:MM - HH:MM").
export function rebuildAvailableTimes(config, occupiedIvs, customTimes = [], hiddenTimes = []) {
  const overlaps = (ivs, ini, fin) => ivs.some(([a, b]) => ini < b && a < fin);
  const anclas = [...new Set(customTimes)].filter(t => { const [i, f] = parseSlot(t); return !overlaps(occupiedIvs, i, f); });
  const anclaIvs = anclas.map(parseSlot);
  const disponibles = [...anclas];
  for (const time of buildScheduleTimes(config)) {
    if (hiddenTimes.includes(time)) continue;      // sustituido por un "Editar hora"
    const [ini, fin] = parseSlot(time);
    if (overlaps(occupiedIvs, ini, fin)) continue; // pisado: queda ocupado, no se mueve
    if (overlaps(anclaIvs, ini, fin)) continue;    // el hueco manual del admin manda
    if (!disponibles.includes(time)) disponibles.push(time);
  }
  return disponibles;
}

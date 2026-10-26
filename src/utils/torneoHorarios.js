// Parrilla y agenda del programador de partidos de un torneo (panel del admin).
//
// Antes el programador contaba cada partido como UNA hora de pista aunque
// durase hora y media (dos partidos de 90 min a las 16:00 y a las 17:00 en la
// misma pista se pisaban), trataba las horas en las que una pareja dijo que
// NO podía como simple preferencia, y si no encontraba hueco mandaba el
// partido a la semana siguiente sin avisar. Aquí todo va en MINUTOS de verdad:
//   · un partido ocupa su duración entera en la pista;
//   · los bloqueos y reservas del club (SNP, entrenos, socios) cuentan con sus
//     minutos exactos;
//   · una pareja nunca juega a una hora que marcó como no disponible, ni dos
//     partidos solapados en categorías distintas, ni sin su descanso;
//   · solo se programa DENTRO de los días y horas del torneo; si un partido no
//     cabe, se devuelve null y el panel lo dice (sinHueco).
//
// Formatos (los mismos que guarda la app): slot "dd/mm HH:00", hora de partido
// "dd/mm HH:00 - Pista N", reglas de no disponibilidad { day, slots: ['dd/mm HH:00'] }.

export const HORAS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

export const toMin = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export const etiquetaDia = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

// Días del torneo ("dd/mm"), de startDate a endDate inclusive.
export function diasActivos(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const out = [];
  const d = new Date(startDate + 'T12:00:00');
  const fin = new Date(endDate + 'T12:00:00');
  while (d <= fin && out.length < 60) {
    out.push(etiquetaDia(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const esParejaReal = (p) => !!p && !p.isBye && !p.isPlaceholder && !p.isPrelimPlaceholder;

// "dd/mm HH:00 - Pista N" → { slot, dia, hora, pista } (null si no hay hora).
export function parsearTiempo(time) {
  if (!time || typeof time !== 'string') return null;
  const m = time.match(/^(\d{2}\/\d{2}) (\d{2}:\d{2}) - Pista (\d+)$/);
  if (!m) return null;
  return { slot: `${m[1]} ${m[2]}`, dia: m[1], hora: m[2], pista: parseInt(m[3], 10) };
}

export const textoTiempo = (hueco) => `${hueco.slot} - Pista ${hueco.pista}`;

// Parrilla: los huecos de inicio posibles (horas enteras) de cada día del torneo.
export function crearParrilla(tConfig) {
  const dias = diasActivos(tConfig.startDate, tConfig.endDate);
  const idxDe = Object.fromEntries(dias.map((d, i) => [d, i]));
  const finDia = toMin(tConfig.endHour || '22:00');
  const inicioDia = (idx) => toMin(idx === 0 && tConfig.firstDayStartHour ? tConfig.firstDayStartHour : (tConfig.startHour || '09:00'));
  const abs = (dia, hora) => (idxDe[dia] == null ? null : idxDe[dia] * 1440 + toMin(hora));
  const slots = [];
  dias.forEach((dia, idx) => {
    for (let h = Math.ceil(inicioDia(idx) / 60); h < 24 && h * 60 < finDia; h++) {
      slots.push({ slot: `${dia} ${HORAS[h]}`, dia, idxDia: idx, hora: HORAS[h], ini: h * 60, abs: idx * 1440 + h * 60 });
    }
  });
  return {
    dias, idxDe, slots, finDia, inicioDia, abs,
    // Minuto absoluto de una hora de partido guardada (null si no es de un día del torneo).
    absDeTiempo(time) {
      const t = parsearTiempo(time);
      return t ? abs(t.dia, t.hora) : null;
    },
    // Primer minuto del día idx (para "la final no antes del último día").
    absInicioDia(idx) {
      const dia = dias[idx];
      return dia == null ? 0 : idx * 1440 + inicioDia(idx);
    },
  };
}

// Horas "dd/mm HH:00" en las que una pareja NO puede jugar.
export const horasBloqueadas = (p) => new Set((p?.prefRules || []).flatMap((r) => r?.slots || []));

// ¿Puede la pareja jugar de ini a fin (minutos del día) ese día? Se miran
// TODAS las horas que pisa el partido, no solo la de inicio.
export function disponibleEn(bloqueadas, dia, ini, fin) {
  if (!bloqueadas || bloqueadas.size === 0) return true;
  for (let h = Math.floor(ini / 60); h < 24 && h * 60 < fin; h++) {
    if (bloqueadas.has(`${dia} ${HORAS[h]}`)) return false;
  }
  return true;
}

// Nº de huecos de la parrilla en los que pueden las dos parejas (para
// programar primero a quien menos opciones tiene).
export function huecosComunes(parrilla, dur, ...parejas) {
  const sets = parejas.filter(esParejaReal).map(horasBloqueadas);
  return parrilla.slots.filter((s) => s.ini + dur <= parrilla.finDia && sets.every((b) => disponibleEn(b, s.dia, s.ini, s.ini + dur))).length;
}

// Bloqueos y reservas del club → { 'dd/mm': { pista: [[ini, fin]] } } con sus
// minutos exactos. filas: [{ date:'YYYY-MM-DD', time_slot:'HH:MM - HH:MM', pistas:[n] }].
export function intervalosExternos(filas) {
  const out = {};
  for (const f of filas || []) {
    const [, mm, dd] = String(f.date || '').split('-');
    const [ini, fin] = String(f.time_slot || '').split(' - ');
    if (!dd || !mm || !ini) continue;
    const a = toMin(ini);
    const b = fin ? toMin(fin) : a + 60;
    if (!(b > a)) continue;
    const dia = `${dd}/${mm}`;
    for (const pista of f.pistas || []) {
      ((out[dia] = out[dia] || {})[pista] = out[dia][pista] || []).push([a, b]);
    }
  }
  return out;
}

const solapa = (a1, b1, a2, b2) => a1 < b2 && a2 < b1;

// Agenda: qué hay en cada pista (minutos del día) y cuándo juega cada pareja
// (minutos absolutos del torneo). externos = intervalosExternos(...).
export function crearAgenda(externos = {}) {
  const pistas = {};
  Object.entries(externos || {}).forEach(([dia, porPista]) => {
    Object.entries(porPista || {}).forEach(([pista, ivs]) => {
      pistas[`${dia}|${pista}`] = (ivs || []).map(([a, b]) => [a, b, 'club']);
    });
  });
  return { pistas, parejas: {} };
}

export const pistaLibre = (agenda, dia, pista, ini, fin) =>
  !(agenda.pistas[`${dia}|${pista}`] || []).some(([a, b]) => solapa(ini, fin, a, b));

export const parejaLibre = (agenda, id, absIni, absFin, descanso = 0) =>
  !(agenda.parejas[id] || []).some(([a, b]) => absIni < b + descanso && a < absFin + descanso);

// Apunta un partido en la agenda. etiqueta: id del partido (para poder liberarlo).
export function ocupar(agenda, parrilla, { dia, hora, pista, dur, parejas = [], etiqueta = null }) {
  const ini = toMin(hora);
  const fin = ini + dur;
  (agenda.pistas[`${dia}|${pista}`] = agenda.pistas[`${dia}|${pista}`] || []).push([ini, fin, etiqueta]);
  const abs = parrilla.abs(dia, hora);
  if (abs == null) return;
  parejas.filter(esParejaReal).forEach((p) => {
    (agenda.parejas[p.id] = agenda.parejas[p.id] || []).push([abs, abs + dur, etiqueta]);
  });
}

export function liberar(agenda, etiqueta) {
  if (!etiqueta) return;
  Object.keys(agenda.pistas).forEach((k) => { agenda.pistas[k] = agenda.pistas[k].filter((iv) => iv[2] !== etiqueta); });
  Object.keys(agenda.parejas).forEach((k) => { agenda.parejas[k] = agenda.parejas[k].filter((iv) => iv[2] !== etiqueta); });
}

// Apunta un partido ya programado (con su hora guardada) si la tiene.
export function ocuparPartido(agenda, parrilla, match, dur) {
  const t = parsearTiempo(match?.time);
  if (!t) return false;
  ocupar(agenda, parrilla, { dia: t.dia, hora: t.hora, pista: t.pista, dur, parejas: [match.p1, match.p2], etiqueta: match.id });
  return true;
}

// Agenda con todo lo ya programado en varios cuadros ({ cat: [[match]] }).
//   cuadros: [{ obj: rounds, cons: false }, { obj: consRounds, cons: true }]
//   durDe(cat): minutos por partido de la categoría.
//   omitir(cat, cons): true para no contar ese cuadro (p. ej. el que se regenera).
//   incluir(match): false para no contar un partido (p. ej. los provisionales
//   entre parejas aún desconocidas, que solo reservan sitio).
export function agendaDeCuadros(parrilla, externos, cuadros, durDe, omitir = () => false, incluir = () => true) {
  const agenda = crearAgenda(externos);
  for (const { obj, cons } of cuadros) {
    Object.entries(obj || {}).forEach(([cat, catRounds]) => {
      if (omitir(cat, cons)) return;
      (catRounds || []).forEach((round) => (round || []).forEach((m) => { if (incluir(m)) ocuparPartido(agenda, parrilla, m, durDe(cat)); }));
    });
  }
  return agenda;
}

// El primer hueco válido: dentro del torneo, en orden cronológico y en la
// pista de número más bajo. Devuelve { slot, dia, hora, pista, abs } o null.
//   desdeAbs:  no antes de este minuto absoluto (orden entre rondas)
//   dur:       duración del partido; descanso: mínimo entre partidos de una pareja
//   pistas:    nº de pista permitidos, en orden de preferencia
//   parejas:   [p1, p2] (las no reales no restringen nada)
//   courtStartHours: { pista: 'HH:00' } hora de apertura de cada pista
export function elegirHueco(agenda, parrilla, { desdeAbs = 0, dur, descanso = 0, pistas, parejas = [], courtStartHours = {} }) {
  const reales = parejas.filter(esParejaReal);
  const bloq = reales.map((p) => horasBloqueadas(p));
  for (const s of parrilla.slots) {
    if (s.abs < desdeAbs) continue;
    const fin = s.ini + dur;
    if (fin > parrilla.finDia) continue;
    if (bloq.some((b) => !disponibleEn(b, s.dia, s.ini, fin))) continue;
    if (reales.some((p) => !parejaLibre(agenda, p.id, s.abs, s.abs + dur, descanso))) continue;
    for (const c of pistas) {
      const abre = courtStartHours?.[c] || courtStartHours?.[String(c)];
      if (abre && s.hora < abre) continue;
      if (!pistaLibre(agenda, s.dia, c, s.ini, fin)) continue;
      return { slot: s.slot, dia: s.dia, hora: s.hora, pista: c, abs: s.abs };
    }
  }
  return null;
}

// Como elegirHueco, pero para un partido entre parejas aún POR DECIDIR (una
// semifinal cuyos cuartos no se han jugado): de los huecos válidos devuelve
// el que más `candidatas` (las parejas que pueden acabar jugándolo) tienen
// libre; a igualdad, el más temprano. Así la hora provisional tiene muchas
// más papeletas de valer cuando se sepa quién juega.
export function elegirHuecoCobertura(agenda, parrilla, opts, candidatas = []) {
  const { desdeAbs = 0, dur, descanso = 0, pistas, parejas = [], courtStartHours = {} } = opts;
  const reales = parejas.filter(esParejaReal);
  const bloq = reales.map((p) => horasBloqueadas(p));
  const cand = candidatas.filter(esParejaReal).map((c) => [c, horasBloqueadas(c)]);
  let mejor = null;
  for (const s of parrilla.slots) {
    if (s.abs < desdeAbs) continue;
    const fin = s.ini + dur;
    if (fin > parrilla.finDia) continue;
    if (bloq.some((b) => !disponibleEn(b, s.dia, s.ini, fin))) continue;
    if (reales.some((p) => !parejaLibre(agenda, p.id, s.abs, s.abs + dur, descanso))) continue;
    let pista = null;
    for (const c of pistas) {
      const abre = courtStartHours?.[c] || courtStartHours?.[String(c)];
      if (abre && s.hora < abre) continue;
      if (!pistaLibre(agenda, s.dia, c, s.ini, fin)) continue;
      pista = c;
      break;
    }
    if (pista == null) continue;
    const cobertura = cand.filter(([c, b]) => disponibleEn(b, s.dia, s.ini, fin) && parejaLibre(agenda, c.id, s.abs, s.abs + dur, descanso)).length;
    if (!mejor || cobertura > mejor.cobertura) mejor = { slot: s.slot, dia: s.dia, hora: s.hora, pista, abs: s.abs, cobertura };
    if (mejor.cobertura === cand.length) break; // no se puede mejorar
  }
  return mejor;
}

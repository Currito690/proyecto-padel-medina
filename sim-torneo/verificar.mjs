// Verifica el horario de un torneo generado por el panel: pistas sin solapes,
// bloqueos del club respetados, parejas nunca a una hora que marcaron como no
// disponible, descansos, orden de rondas, horario del torneo…
//
//   node sim-torneo/verificar.mjs <config.json> [datos.json]
//
// config.json = tournaments.config (tal cual se guarda). datos.json = el de
// generar-datos.mjs (de ahí salen blocked_slots, bookings y courts). Sale con
// código 1 si hay errores.
import { readFileSync } from 'node:fs';

const [, , rutaConfig, rutaDatos = new URL('./datos.json', import.meta.url)] = process.argv;
if (!rutaConfig) { console.error('Uso: node verificar.mjs <config.json> [datos.json]'); process.exit(2); }
const config = JSON.parse(readFileSync(rutaConfig, 'utf8'));
const datos = JSON.parse(readFileSync(rutaDatos, 'utf8'));

const errores = [];
const avisos = [];
const error = (m) => errores.push(m);
const aviso = (m) => avisos.push(m);

// ── Helpers ───────────────────────────────────────────────────────────────
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const categorias = String(config.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
const dur = (cat) => Number(config.matchDurationByCategory?.[cat]) || 90;
const descanso = parseInt(config.restMinutesBetweenMatches ?? 30, 10) || 0;
const gapEstricto = (cat) => dur(cat) + descanso;
const gapScheduler = (cat) => Math.ceil(gapEstricto(cat) / 60) * 60;
const esReal = (p) => !!p && !p.isBye && !p.isPlaceholder && !p.isPrelimPlaceholder;
const normaliza = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const catsDe = (p) => {
  const c = String(p?.category || '').trim();
  if (categorias.some((k) => k.toLowerCase() === c.toLowerCase())) return [c];
  return c.split(/\s+y\s+|\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
};

// Días activos y minutos absolutos (con calendario de verdad).
const [y0, m0, d0] = config.startDate.split('-').map(Number);
const [y1, m1, d1] = config.endDate.split('-').map(Number);
const diasActivos = [];
for (let t = Date.UTC(y0, m0 - 1, d0); t <= Date.UTC(y1, m1 - 1, d1); t += 86400000) {
  const d = new Date(t);
  diasActivos.push(`${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
}
const idxDia = Object.fromEntries(diasActivos.map((d, i) => [d, i]));
const minutosAbs = (dia, hora) => {
  const [dd, mm] = dia.split('/').map(Number);
  const anio = mm < m0 ? y0 + 1 : y0;
  return Math.round(Date.UTC(anio, mm - 1, dd) / 60000) + toMin(hora);
};
const inicioDia = (dia) => (idxDia[dia] === 0 && config.firstDayStartHour ? config.firstDayStartHour : config.startHour);

function parseHora(t) {
  if (t == null || t === 'Sin horario' || t === 'A convenir') return null;
  const m = String(t).match(/^(\d{2})\/(\d{2}) (\d{2}):(\d{2}) - Pista (\d+)$/);
  if (!m) return { malformada: t };
  const dia = `${m[1]}/${m[2]}`, hora = `${m[3]}:${m[4]}`;
  return { dia, hora, pista: Number(m[5]), inicio: minutosAbs(dia, hora) };
}

// Bloqueos externos → intervalos por pista y día (minutos del día) + slots de hora.
const nombrePista = (k) => (config.courtNames?.[k] && String(config.courtNames[k]).trim()) || `Pista ${k}`;
const numPista = {};
(datos.courts || []).forEach((c, i) => {
  const nombre = String(c.name || '').trim().toLowerCase();
  let k = null;
  for (let j = 1; j <= (config.courtsCount || 1); j++) if (nombrePista(j).toLowerCase() === nombre) { k = j; break; }
  if (k == null) { const m = nombre.match(/(\d+)/); k = m ? Number(m[1]) : i + 1; }
  numPista[c.id] = k;
});
const bloqueos = {}; // `${dia}|${pista}` → [[ini, fin, etiqueta]]
const filasExternas = [
  ...(datos.blocked_slots || []).map((b) => ({ ...b, etiqueta: `bloqueo ${b.tipo || ''}`.trim() })),
  ...(datos.bookings || []).filter((b) => b.status === 'confirmed').map((b) => ({ ...b, etiqueta: 'reserva' })),
];
for (const b of filasExternas) {
  const pista = numPista[b.court_id];
  if (!pista || pista > (config.courtsCount || 1)) continue;
  const [, mm, dd] = String(b.date).split('-');
  const [ini, fin] = String(b.time_slot).split(' - ');
  const a = toMin(ini), z = fin ? toMin(fin) : a + 60;
  const clave = `${dd}/${mm}|${pista}`;
  (bloqueos[clave] = bloqueos[clave] || []).push([a, z, `${b.etiqueta} ${ini}-${fin || ''}`]);
}

// ── Enumerar partidos ─────────────────────────────────────────────────────
const partidos = [];
for (const [cuadro, esCons] of [[config.rounds || {}, false], [config.consRounds || {}, true]]) {
  for (const [cat, rondas] of Object.entries(cuadro)) {
    (rondas || []).forEach((ronda, r) => (ronda || []).forEach((m, idx) => {
      const h = parseHora(m.time);
      if (h?.malformada) error(`${cat} r${r}#${idx}: hora malformada "${m.time}"`);
      partidos.push({ cat, esCons, r, idx, m, h: h && !h.malformada ? h : null, nombre: `${esCons ? 'cons ' : ''}${cat} r${r}#${idx} (${m.p1?.name || '—'} vs ${m.p2?.name || '—'})` });
    }));
  }
}
const programados = partidos.filter((p) => p.h);

// 1. Todo partido jugable tiene hora; byes sin hora y avanzados.
for (const p of partidos) {
  const { m } = p;
  const reales = [m.p1, m.p2].filter(esReal).length;
  const conBye = m.p1?.isBye || m.p2?.isBye;
  if (conBye) {
    if (m.time) aviso(`${p.nombre}: partido con bye lleva hora (${m.time})`);
    continue;
  }
  if (m.isRR && !p.h) error(`${p.nombre}: partido de liguilla sin hora`);
  if (reales === 2 && !p.h) {
    if (p.r === 0 || !p.esCons) error(`${p.nombre}: sin hora${m.sinHueco ? ' (marcado sin hueco)' : ''}`);
    else aviso(`${p.nombre}: sin hora`);
  }
  if (reales < 2 && !p.esCons && p.r > 0 && !p.h) aviso(`${p.nombre}: ronda ${p.r} sin hora preasignada`);
}

// 2. Pistas: sin solapes entre partidos y con los bloqueos del club.
const porPista = {};
for (const p of programados) {
  if (p.h.pista < 1 || p.h.pista > (config.courtsCount || 1)) error(`${p.nombre}: pista ${p.h.pista} fuera de 1..${config.courtsCount}`);
  (porPista[`${p.h.dia}|${p.h.pista}`] = porPista[`${p.h.dia}|${p.h.pista}`] || []).push(p);
}
for (const [clave, lista] of Object.entries(porPista)) {
  lista.sort((a, b) => a.h.inicio - b.h.inicio);
  for (let i = 1; i < lista.length; i++) {
    const a = lista[i - 1], b = lista[i];
    if (b.h.inicio < a.h.inicio + dur(a.cat)) error(`Pista ${clave.split('|')[1]} ${a.h.dia}: "${a.nombre}" (${a.h.hora}, ${dur(a.cat)}') pisa a "${b.nombre}" (${b.h.hora})`);
  }
  for (const p of lista) {
    const ini = toMin(p.h.hora), fin = ini + dur(p.cat);
    for (const [bi, bf, et] of bloqueos[clave] || []) {
      if (ini < bf && bi < fin) {
        const arranca = ini >= bi && ini < bf;
        (arranca || !p.m.timeManual ? error : aviso)(`${p.nombre}: ${p.h.dia} ${p.h.hora} Pista ${p.h.pista} ${arranca ? 'empieza dentro de' : 'se solapa por la cola con'} un ${et}`);
      }
    }
  }
}

// 3. Parejas: nada solapado y descanso suficiente (todas las categorías juntas).
const porPareja = {};
const porNombre = {};
for (const p of programados) {
  for (const j of [p.m.p1, p.m.p2]) {
    if (!esReal(j)) continue;
    (porPareja[j.id] = porPareja[j.id] || { nombre: j.name, lista: [] }).lista.push(p);
    const nn = normaliza(j.name);
    (porNombre[nn] = porNombre[nn] || new Set()).add(j.id);
  }
}
for (const [ids] of Object.entries(porNombre).map((e) => [e[1]])) {
  if (ids.size > 1) aviso(`La pareja "${[...ids].join(', ')}" aparece con varios ids (inscrita aparte en dos categorías): se comprueba por nombre también`);
}
function comprobarAgenda(nombre, lista) {
  const orden = [...lista].sort((a, b) => a.h.inicio - b.h.inicio);
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1], b = orden[i];
    const d = b.h.inicio - a.h.inicio;
    if (d < dur(a.cat)) error(`${nombre}: dos partidos solapados — "${a.nombre}" ${a.h.dia} ${a.h.hora} y "${b.nombre}" ${b.h.dia} ${b.h.hora}`);
    else if (d < gapEstricto(a.cat)) error(`${nombre}: descanso insuficiente (${d}' < ${gapEstricto(a.cat)}') entre "${a.nombre}" ${a.h.dia} ${a.h.hora} y "${b.nombre}" ${b.h.dia} ${b.h.hora}`);
    else if (d < gapScheduler(a.cat)) aviso(`${nombre}: descanso ${d}' (el programador prometía ${gapScheduler(a.cat)}') entre "${a.nombre}" y "${b.nombre}"`);
  }
}
for (const { nombre, lista } of Object.values(porPareja)) comprobarAgenda(nombre, lista);
for (const [nn, ids] of Object.entries(porNombre)) {
  if (ids.size > 1) comprobarAgenda(`[${nn}]`, [...ids].flatMap((id) => porPareja[id]?.lista || []));
}

// 4. Disponibilidad de las parejas (regla DURA: ninguna hora del partido bloqueada).
const reglasDe = (j) => {
  const enLista = (config.participants || []).find((x) => x.id === j.id);
  return (enLista?.prefRules || j.prefRules || []).flatMap((r) => r.slots || []);
};
let conflictosDisp = 0;
for (const p of programados) {
  for (const j of [p.m.p1, p.m.p2]) {
    if (!esReal(j)) continue;
    const bloq = new Set(reglasDe(j));
    const ini = toMin(p.h.hora);
    for (let h = Math.floor(ini / 60); h * 60 < ini + dur(p.cat); h++) {
      const slot = `${p.h.dia} ${String(h).padStart(2, '0')}:00`;
      if (!bloq.has(slot)) continue;
      conflictosDisp++;
      const arranque = h * 60 === ini;
      (arranque || !p.m.timeManual ? error : aviso)(`${p.nombre}: ${j.name} NO puede ${arranque ? 'a esa hora' : 'durante el partido'} (${slot})`);
      break;
    }
  }
}

// 5. Dentro del horario del torneo, de las pistas y de sus horas de apertura.
for (const p of programados) {
  if (idxDia[p.h.dia] == null) { error(`${p.nombre}: ${p.h.dia} está fuera de las fechas del torneo`); continue; }
  const ini = toMin(p.h.hora);
  if (ini < toMin(inicioDia(p.h.dia)) || ini >= toMin(config.endHour)) error(`${p.nombre}: ${p.h.dia} ${p.h.hora} fuera del horario (${inicioDia(p.h.dia)}-${config.endHour})`);
  else if (ini + dur(p.cat) > toMin(config.endHour)) (config.permiteAcabarTarde ? aviso : error)(`${p.nombre}: empieza a las ${p.h.hora} y acaba después del cierre (${config.endHour})`);
  const apertura = config.courtStartHours?.[p.h.pista] || config.courtStartHours?.[String(p.h.pista)];
  if (apertura && p.h.hora < apertura) error(`${p.nombre}: Pista ${p.h.pista} abre a las ${apertura}`);
  const permitidas = (config.courtsByCategory?.[p.cat]?.[p.esCons ? 'cons' : 'main'] || []).filter((c) => c >= 1 && c <= config.courtsCount);
  if (permitidas.length && !permitidas.includes(p.h.pista)) error(`${p.nombre}: Pista ${p.h.pista} no está entre las permitidas (${permitidas.join(', ')})`);
}

// 6. Orden entre rondas (eliminatoria) y reparto por días.
for (const [cuadro, esCons] of [[config.rounds || {}, false], [config.consRounds || {}, true]]) {
  for (const [cat, R] of Object.entries(cuadro)) {
    if (!Array.isArray(R) || !R.length || R[0]?.[0]?.isRR) continue;
    const conPrevia = !!R[0]?.[0]?.isPrelim;
    const numRondas = R.length, numDias = diasActivos.length;
    for (let r = 1; r < R.length; r++) {
      const previos = (R[r - 1] || []).map((m) => parseHora(m.time)).filter((h) => h && !h.malformada);
      const barrera = previos.length ? Math.max(...previos.map((h) => h.inicio)) : null;
      (R[r] || []).forEach((m, idx) => {
        const h = parseHora(m.time);
        if (!h || h.malformada || m.timeManual) return;
        const preds = (r === 1 && conPrevia)
          ? (R[0] || []).filter((x) => x.isPrelim && [2 * idx, 2 * idx + 1].includes(x.nextSlot))
          : [R[r - 1]?.[2 * idx], R[r - 1]?.[2 * idx + 1]].filter(Boolean);
        const predsH = preds.map((x) => parseHora(x?.time)).filter((x) => x && !x.malformada);
        const nombre = `${esCons ? 'cons ' : ''}${cat} r${r}#${idx}`;
        if (predsH.length && h.inicio < Math.max(...predsH.map((x) => x.inicio)) + gapEstricto(cat)) error(`${nombre}: ${h.dia} ${h.hora} va antes de que acaben sus partidos previos (+${gapEstricto(cat)}')`);
        if (barrera != null && h.inicio < barrera + gapScheduler(cat)) aviso(`${nombre}: ${h.dia} ${h.hora} empieza antes de que termine toda la ronda anterior`);
        if (!esCons && numRondas > 1 && idxDia[h.dia] != null && idxDia[h.dia] < Math.round(r * (numDias - 1) / (numRondas - 1))) aviso(`${nombre}: ${h.dia} es antes del día previsto para esa ronda`);
      });
    }
  }
}

// 7. Cobertura: cada pareja una vez por categoría; byes bien avanzados.
const ids = new Set();
for (const p of config.participants || []) {
  if (ids.has(p.id)) error(`participants: id repetido ${p.id}`);
  ids.add(p.id);
}
for (const cat of categorias) {
  const R = config.rounds?.[cat];
  const inscritas = (config.participants || []).filter((p) => catsDe(p).some((c) => c.toLowerCase() === cat.toLowerCase()));
  if (!R || !R.length) { if (inscritas.length >= 2) error(`${cat}: no se ha generado cuadro (${inscritas.length} parejas)`); continue; }
  const vistas = {};
  const primera = R[0] || [];
  const conPrevia = !!primera[0]?.isPrelim;
  const enPrimera = (m) => [m.p1, m.p2].filter(esReal).forEach((j) => { vistas[j.id] = (vistas[j.id] || 0) + 1; });
  primera.forEach(enPrimera);
  if (conPrevia) (R[1] || []).forEach(enPrimera);
  for (const p of inscritas) {
    const v = vistas[p.id] || 0;
    if (v === 0) error(`${cat}: la pareja "${p.name}" no está en el cuadro`);
    if (v > 1 && !conPrevia) error(`${cat}: la pareja "${p.name}" aparece ${v} veces en la primera ronda`);
  }
  // Un bye avanza a la pareja real a la siguiente ronda.
  (R[0] || []).forEach((m, idx) => {
    const real = [m.p1, m.p2].find(esReal);
    const bye = m.p1?.isBye || m.p2?.isBye;
    if (!bye || !real) return;
    const sig = m.isPrelim ? R[1]?.[Math.floor(m.nextSlot / 2)] : R[1]?.[Math.floor(idx / 2)];
    const lado = m.isPrelim ? (m.nextSlot % 2 === 0 ? 'p1' : 'p2') : (idx % 2 === 0 ? 'p1' : 'p2');
    if (!sig || sig[lado]?.id !== real.id) error(`${cat} r0#${idx}: el bye de "${real.name}" no la ha avanzado a la siguiente ronda`);
  });
}

// ── Resumen ───────────────────────────────────────────────────────────────
const porDia = {};
for (const p of programados) (porDia[p.h.dia] = porDia[p.h.dia] || []).push(`${p.h.hora} P${p.h.pista} ${p.cat.replace('Masculino', 'M').replace('Femenino', 'F')} r${p.r}`);
console.log(`Partidos: ${partidos.length} · con hora: ${programados.length} · sin hora (jugables): ${partidos.filter((p) => !p.h && [p.m.p1, p.m.p2].filter(esReal).length === 2 && !(p.m.p1?.isBye || p.m.p2?.isBye)).length}`);
for (const d of Object.keys(porDia).sort()) console.log(`  ${d}: ${porDia[d].sort().join(' · ')}`);
console.log(`\nERRORES (${errores.length}):`);
errores.forEach((e) => console.log('  ✗ ' + e));
console.log(`\nAVISOS (${avisos.length}):`);
avisos.forEach((e) => console.log('  ⚠ ' + e));
process.exit(errores.length ? 1 : 0);

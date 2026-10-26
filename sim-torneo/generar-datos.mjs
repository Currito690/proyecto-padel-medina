// Genera los datos del SUPER TORNEO de prueba (5 categorías, un fin de semana
// con partidos de SNP en las pistas y parejas con muy pocas horas libres).
//
//   node sim-torneo/generar-datos.mjs
//
// Escribe sim-torneo/datos.js (lo carga el simulador local) y
// sim-torneo/datos.json (lo usan el verificador y la carga en producción).
//
// Diseño (todo a 90 minutos por partido, horas enteras de inicio):
//   · Viernes 06/11 16:00-22:00, sábado y domingo 09:00-22:00, 2 pistas.
//   · SNP: sábado 10:30-13:30 en las DOS pistas y domingo 17:30-19:00 en la
//     Pista 2 → se meten como bloqueos del Horario del club (blocked_slots).
//   · Cada pareja solo puede en DOS ventanas: una corta el viernes o el sábado
//     (según su categoría) y una parte del domingo. El resto está bloqueado.
//   · Dos parejas juegan en dos categorías a la vez ("Masculino C y Masculino D",
//     "Femenino B y Femenino C").
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

export const TORNEO_ID = '7a1f2c3d-5e6b-4a7c-8d9e-0f1a2b3c4d5e';
export const ADMIN_ID = '9fc542a4-0f66-4c8b-9cf8-5b04feffb5b5';
export const PISTAS = {
  'Pista 1': '13fb4ae3-aca6-4e06-97e5-1c014a782fc9',
  'Pista 2': '1aa5bf14-1615-43b8-bd45-a9b1b13f96bd',
  'Pista 3': '87781eea-6d8f-45da-897c-9164953d3aaf',
};

const VIE = '06/11', SAB = '07/11', DOM = '08/11';
const FECHA = { [VIE]: '2026-11-06', [SAB]: '2026-11-07', [DOM]: '2026-11-08' };
const HORAS_DIA = { [VIE]: rango(16, 22), [SAB]: rango(9, 22), [DOM]: rango(9, 22) };

function rango(a, b) { return Array.from({ length: b - a }, (_, i) => a + i); }
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

// Generador determinista (misma simulación cada vez).
let semilla = 20261106;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const elige = (lista) => lista[Math.floor(azar() * lista.length)];

// Regla de horas BLOQUEADAS de un día, con la forma que guarda la app.
function regla(dia, horasBloqueadas) {
  const horas = [...horasBloqueadas].sort((a, b) => a - b);
  // "dd/mm: HH:00-HH:00, …" como hoursToRanges de la app
  const tramos = [];
  for (const h of horas) {
    const t = tramos[tramos.length - 1];
    if (t && t[1] === h) t[1] = h + 1; else tramos.push([h, h + 1]);
  }
  return {
    id: `${dia}-${Math.floor(azar() * 1e9)}`,
    day: dia,
    label: `${dia}: ${tramos.map(([a, b]) => `${hh(a)}-${hh(b)}`).join(', ')}`,
    slots: horas.map((h) => `${dia} ${hh(h)}`),
  };
}

// Disponible SOLO en las ventanas dadas {dia: [horaInicio, horaFin)}: todo lo demás, bloqueado.
function soloDisponible(ventanas) {
  const reglas = [];
  for (const dia of [VIE, SAB, DOM]) {
    const libres = new Set();
    for (const [a, b] of ventanas[dia] || []) rango(a, b).forEach((h) => libres.add(h));
    const bloqueadas = HORAS_DIA[dia].filter((h) => !libres.has(h));
    if (bloqueadas.length) reglas.push(regla(dia, bloqueadas));
  }
  return reglas;
}

// Trozos del domingo para que la disponibilidad sea escasa también ese día.
const DOM_MANANA = [[9, 14]], DOM_TARDE = [[14, 22]], DOM_CENTRO = [[11, 18]], DOM_TODO = [[9, 22]];
const DOMINGOS = [DOM_MANANA, DOM_TARDE, DOM_CENTRO, DOM_TODO];

let n = 0;
function pareja(nombre, categoria, ventanas, extra = {}) {
  n += 1;
  return {
    id: `sim-${String(n).padStart(2, '0')}`,
    name: nombre,
    category: categoria,
    prefRules: soloDisponible(ventanas),
    get prefNames() { return this.prefRules.map((r) => r.label); },
    ...extra,
  };
}

const participantes = [];
// Masculino B: solo el viernes por la tarde (4 cuartos) y un trozo del domingo.
[
  ['Carlos Ruiz y Pedro Gómez', { seedByCat: { 'Masculino B': 1 } }],
  ['Miguel Ángel Soto y Javier Prieto', { seedByCat: { 'Masculino B': 2 } }],
  ['Antonio Benítez y Luis Moreno'], ['Fernando Castro y Diego Ortega'],
  ['Raúl Jiménez y Sergio Vidal'], ['David Romero y Nicolás Pardo'],
  ['Jorge Medina y Manuel Cabrera'], ['Víctor Herrera y Daniel Reyes'],
].forEach(([nombre, extra], i) => participantes.push(pareja(nombre, 'Masculino B', { [VIE]: [[16, 22]], [DOM]: DOMINGOS[i % 4] }, extra)));

// Masculino C: sábado 14-18 (previa) y domingo a trozos.
['Pablo Serrano y Andrés Molina', 'Roberto Núñez y Álvaro Ibáñez', 'Marcos Peña y Iván Lozano', 'Adrián Vega y Óscar Navarro', 'Rubén Gil y Gonzalo Marín']
  .forEach((nombre, i) => participantes.push(pareja(nombre, 'Masculino C', { [SAB]: [[14, 18]], [DOM]: DOMINGOS[(i + 1) % 4] })));
// Pareja en DOS categorías (C y D): sábado 14-22 y domingo entero.
participantes.push(pareja('Enrique Fuentes y Felipe Carmona', 'Masculino C y Masculino D', { [SAB]: [[14, 22]], [DOM]: DOM_TODO }));

// Masculino D: sábado 16-20 (previa) y domingo a trozos.
['Tomás Delgado y Rodrigo Campos', 'Samuel Aguilar y Cristian León', 'Joaquín Flores y Mario Santana', 'Hugo Blanco y Bruno Garrido', 'Álex Domínguez y Aitor Lara']
  .forEach((nombre, i) => participantes.push(pareja(nombre, 'Masculino D', { [SAB]: [[16, 20]], [DOM]: DOMINGOS[(i + 2) % 4] })));

// Femenino B: viernes 19-22 (semifinales) y sábado por la tarde-noche, poco domingo.
['María López y Laura Sánchez', 'Ana Martín y Sofía Torres', 'Carmen Ramos y Lucía Ortiz']
  .forEach((nombre, i) => participantes.push(pareja(nombre, 'Femenino B', { [VIE]: [[19, 22]], [SAB]: [[18, 22]], [DOM]: DOMINGOS[i % 2 ? 0 : 1] })));
// Pareja en DOS categorías (Femenino B y C).
participantes.push(pareja('Elena Crespo y Paula Iglesias', 'Femenino B y Femenino C', { [VIE]: [[19, 22]], [SAB]: [[18, 22]], [DOM]: DOM_TODO }));

// Femenino C: sábado 18-22 (semifinales) y domingo a trozos.
['Marta Rubio y Isabel Calvo', 'Rocío Pascual y Nuria Esteban', 'Claudia Ferrer y Alba Mora']
  .forEach((nombre, i) => participantes.push(pareja(nombre, 'Femenino C', { [SAB]: [[18, 22]], [DOM]: DOMINGOS[(i + 3) % 4] })));

// Materializar prefNames (el getter no sobrevive a JSON.stringify).
const participants = participantes.map((p) => ({ ...p, prefNames: p.prefRules.map((r) => r.label) }));

const CATEGORIAS = ['Masculino B', 'Masculino C', 'Masculino D', 'Femenino B', 'Femenino C'];
const tConfig = {
  name: 'Super Torneo Noviembre (simulación)',
  categories: CATEGORIAS.join(', '),
  startDate: FECHA[VIE],
  endDate: FECHA[DOM],
  registrationDeadline: '2026-11-04',
  registrationDeadlineTime: '23:59',
  startHour: '09:00',
  endHour: '22:00',
  firstDayStartHour: '16:00',
  courtsCount: 2,
  courtNames: { 1: 'Pista 1', 2: 'Pista 2' },
  courtStartHours: {},
  matchDurationByCategory: Object.fromEntries(CATEGORIAS.map((c) => [c, 90])),
  formatByCategory: Object.fromEntries(CATEGORIAS.map((c) => [c, 'eliminatoria'])),
  dualCategoryMaxMatches: 1,
  restMinutesBetweenMatches: 30,
  registrationClosed: true,
};

const config = { ...tConfig, rounds: {}, consRounds: {}, participants, phase: 'setup' };

// Partidos de SNP ese fin de semana: bloqueos del Horario del club, con los
// mismos tramos de 90 min que usa la parrilla (así el admin los ve igual).
const bloqueo = (pista, fecha, tramo) => ({
  id: `snp-${pista.replace(' ', '').toLowerCase()}-${fecha}-${tramo.slice(0, 5).replace(':', '')}`,
  court_id: PISTAS[pista], date: fecha, time_slot: tramo, created_by: ADMIN_ID, created_at: '2026-10-26T10:00:00Z', tipo: 'bloqueado', entreno_grupo: null,
});
const blocked_slots = [
  bloqueo('Pista 1', FECHA[SAB], '10:30 - 12:00'), bloqueo('Pista 1', FECHA[SAB], '12:00 - 13:30'),
  bloqueo('Pista 2', FECHA[SAB], '10:30 - 12:00'), bloqueo('Pista 2', FECHA[SAB], '12:00 - 13:30'),
  bloqueo('Pista 2', FECHA[DOM], '17:30 - 19:00'),
];

const datos = {
  courts: Object.entries(PISTAS).map(([name, id]) => ({ id, name, sport: name === 'Pista 3' ? 'Pickleball' : 'Pádel', location: name === 'Pista 2' ? 'Nave 2' : 'Nave 1', price: name === 'Pista 1' ? 18 : null, active: name !== 'Pista 3' })),
  bookings: [],
  blocked_slots,
  tournament_registrations: [],
  tournaments: [{ id: TORNEO_ID, admin_id: ADMIN_ID, name: tConfig.name, status: 'draft', created_at: '2026-10-26T10:00:00Z', config }],
};

writeFileSync(join(AQUI, 'datos.json'), JSON.stringify(datos, null, 2));
writeFileSync(join(AQUI, 'datos.js'), `// Generado por generar-datos.mjs. No editar a mano.\nwindow.__SIM_DATOS = ${JSON.stringify(datos)};\n`);

const porCat = {};
participants.forEach((p) => p.category.split(/\s+y\s+/).forEach((c) => { porCat[c] = (porCat[c] || 0) + 1; }));
console.log('Parejas por categoría:', porCat, '| total objetos:', participants.length);
console.log('Horas libres por pareja:', participants.map((p) => {
  const bloqueadas = p.prefRules.reduce((s, r) => s + r.slots.length, 0);
  return `${p.name.split(' y ')[0]}: ${32 - bloqueadas}h`;
}).join(' · '));
console.log('Bloqueos SNP:', blocked_slots.map((b) => `${b.date} ${b.time_slot} (${Object.keys(PISTAS).find((k) => PISTAS[k] === b.court_id)})`).join(' | '));

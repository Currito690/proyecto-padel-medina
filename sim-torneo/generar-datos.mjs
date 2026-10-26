// Genera los datos del SUPER TORNEO de prueba: 64 parejas en 5 categorías,
// 10 días (dos fines de semana y las tardes entre semana), partidos de SNP en
// las pistas y parejas con muy pocas horas libres.
//
//   node sim-torneo/generar-datos.mjs
//
// Escribe sim-torneo/datos.js (lo carga el simulador local) y
// sim-torneo/datos.json (lo usan el verificador y la carga en producción).
//
// Diseño (todo a 90 minutos por partido, horas enteras de inicio):
//   · Viernes 06/11 16:00-22:00, del sábado 07/11 al domingo 15/11 09:00-22:00
//     (entre semana la gente solo puede por la tarde), 2 pistas.
//   · SNP: sábado 07/11 10:30-13:30 en las DOS pistas y domingo 08/11
//     17:30-19:00 en la Pista 2 → bloqueos del Horario del club (blocked_slots).
//   · Cada pareja puede en unas pocas ventanas: una "de su categoría" el primer
//     fin de semana, una tarde entre semana, y trozos del segundo fin de semana.
//     El resto (unas 80 de 110 horas) está bloqueado.
//   · Dos parejas juegan en dos categorías a la vez.
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

// Días del torneo (dd/mm → fecha ISO)
const DIAS = ['06/11', '07/11', '08/11', '09/11', '10/11', '11/11', '12/11', '13/11', '14/11', '15/11'];
const FECHA = Object.fromEntries(DIAS.map((d) => [d, `2026-${d.split('/')[1]}-${d.split('/')[0]}`]));
const [VIE1, SAB1, DOM1, LUN, MAR, MIE, JUE, VIE2, SAB2, DOM2] = DIAS;
const HORAS_DIA = Object.fromEntries(DIAS.map((d) => [d, d === VIE1 ? rango(16, 22) : rango(9, 22)]));

function rango(a, b) { return Array.from({ length: b - a }, (_, i) => a + i); }
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

// Generador determinista (misma simulación cada vez).
let semilla = 20261106;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const elige = (lista) => lista[Math.floor(azar() * lista.length)];

// Regla de horas BLOQUEADAS de un día, con la forma que guarda la app.
function regla(dia, horasBloqueadas) {
  const horas = [...horasBloqueadas].sort((a, b) => a - b);
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

// Disponible SOLO en las ventanas dadas {dia: [[horaInicio, horaFin), …]}: todo lo demás, bloqueado.
function soloDisponible(ventanas) {
  const reglas = [];
  for (const dia of DIAS) {
    const libres = new Set();
    for (const [a, b] of ventanas[dia] || []) rango(a, b).forEach((h) => libres.add(h));
    const bloqueadas = HORAS_DIA[dia].filter((h) => !libres.has(h));
    if (bloqueadas.length) reglas.push(regla(dia, bloqueadas));
  }
  return reglas;
}

// Une varias listas de ventanas por día.
const unir = (...vs) => {
  const out = {};
  for (const v of vs) for (const [d, w] of Object.entries(v)) out[d] = [...(out[d] || []), ...w];
  return out;
};

// Ventana "de su categoría" el primer fin de semana (así cualquier cruce de
// primera ronda tiene horas en común) y una tarde entre semana.
const NUCLEO = {
  'Masculino B': { [VIE1]: [[16, 22]], [MAR]: [[17, 22]] },
  'Masculino C': { [SAB1]: [[14, 22]], [MIE]: [[17, 22]] },
  'Masculino D': { [DOM1]: [[9, 22]], [JUE]: [[17, 22]] },
  'Femenino B': { [VIE1]: [[19, 22]], [LUN]: [[17, 22]] },
  'Femenino C': { [SAB1]: [[14, 22]], [VIE2]: [[17, 22]] },
};
// Una tarde extra entre semana (al azar) y trozos del segundo fin de semana
// (todas las parejas coinciden en algún momento del domingo 15 para la final).
const TARDES = [LUN, MAR, MIE, JUE, VIE2];
const TARDE = [[[17, 22]], [[18, 22]], [[16, 20]], [[19, 22]]];
const SABADO2 = [[[9, 14]], [[14, 22]], [[9, 22]], [[11, 18]]];
const DOMINGO2 = [[[9, 16]], [[12, 20]], [[9, 22]], [[11, 17]]];
const ventanasDe = (cat) => unir(
  NUCLEO[cat],
  { [elige(TARDES)]: elige(TARDE) },
  { [SAB2]: elige(SABADO2), [DOM2]: elige(DOMINGO2) },
);

// Nombres (64 parejas distintas).
const NOMBRES_M = ['Carlos', 'Pedro', 'Miguel', 'Javier', 'Antonio', 'Luis', 'Fernando', 'Diego', 'Raúl', 'Sergio', 'David', 'Nicolás', 'Jorge', 'Manuel', 'Víctor', 'Daniel', 'Pablo', 'Andrés', 'Roberto', 'Álvaro', 'Marcos', 'Iván', 'Adrián', 'Óscar', 'Rubén', 'Gonzalo', 'Enrique', 'Felipe', 'Tomás', 'Rodrigo', 'Samuel', 'Cristian', 'Joaquín', 'Mario', 'Hugo', 'Bruno', 'Álex', 'Aitor', 'Juan', 'José', 'Francisco', 'Rafael', 'Ismael', 'Jaime', 'Guillermo', 'Alberto', 'Lucas', 'Martín', 'Gabriel', 'Emilio'];
const NOMBRES_F = ['María', 'Laura', 'Ana', 'Sofía', 'Carmen', 'Lucía', 'Elena', 'Paula', 'Marta', 'Isabel', 'Rocío', 'Nuria', 'Claudia', 'Alba', 'Sara', 'Irene', 'Cristina', 'Patricia', 'Beatriz', 'Raquel', 'Silvia', 'Noelia', 'Lorena', 'Mónica', 'Teresa', 'Inés', 'Julia', 'Eva', 'Natalia', 'Andrea', 'Carla', 'Celia', 'Miriam', 'Verónica', 'Alicia'];
const APELLIDOS = ['Ruiz', 'Gómez', 'Soto', 'Prieto', 'Benítez', 'Moreno', 'Castro', 'Ortega', 'Jiménez', 'Vidal', 'Romero', 'Pardo', 'Medina', 'Cabrera', 'Herrera', 'Reyes', 'Serrano', 'Molina', 'Núñez', 'Ibáñez', 'Peña', 'Lozano', 'Vega', 'Navarro', 'Gil', 'Marín', 'Fuentes', 'Carmona', 'Delgado', 'Campos', 'Aguilar', 'León', 'Flores', 'Santana', 'Blanco', 'Garrido', 'Domínguez', 'Lara', 'López', 'Sánchez', 'Martín', 'Torres', 'Ramos', 'Ortiz', 'Crespo', 'Iglesias', 'Rubio', 'Calvo', 'Pascual', 'Esteban', 'Ferrer', 'Mora', 'Guerrero', 'Salas', 'Cano', 'Pérez', 'Vargas', 'Rey', 'Barroso', 'Macías', 'Cordero', 'Galán'];
const usados = new Set();
function nombrePareja(femenino) {
  for (;;) {
    const pila = femenino ? NOMBRES_F : NOMBRES_M;
    const n = `${elige(pila)} ${elige(APELLIDOS)} y ${elige(pila)} ${elige(APELLIDOS)}`;
    const [a, b] = n.split(' y ');
    if (a === b || usados.has(n)) continue;
    usados.add(n);
    return n;
  }
}

let n = 0;
function pareja(categoria, ventanas, extra = {}) {
  n += 1;
  const prefRules = soloDisponible(ventanas);
  return { id: `sim-${String(n).padStart(2, '0')}`, name: nombrePareja(categoria.startsWith('Femenino')), category: categoria, prefRules, prefNames: prefRules.map((r) => r.label), ...extra };
}

const participants = [];
const TAMANOS = { 'Masculino B': 16, 'Masculino C': 16, 'Masculino D': 15, 'Femenino B': 8, 'Femenino C': 7 };
for (const [cat, cuantas] of Object.entries(TAMANOS)) {
  for (let i = 0; i < cuantas; i++) {
    const extra = i < 2 && cuantas >= 8 ? { seedByCat: { [cat]: i + 1 } } : {};
    participants.push(pareja(cat, ventanasDe(cat), extra));
  }
}
// Dos parejas en DOS categorías a la vez (suman las ventanas de las dos).
participants.push(pareja('Masculino C y Masculino D', unir(ventanasDe('Masculino C'), ventanasDe('Masculino D'))));
participants.push(pareja('Femenino B y Femenino C', unir(ventanasDe('Femenino B'), ventanasDe('Femenino C'))));

const CATEGORIAS = ['Masculino B', 'Masculino C', 'Masculino D', 'Femenino B', 'Femenino C'];
const tConfig = {
  name: 'Super Torneo Noviembre (simulación)',
  categories: CATEGORIAS.join(', '),
  startDate: FECHA[VIE1],
  endDate: FECHA[DOM2],
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

// Partidos de SNP: bloqueos del Horario del club, con los mismos tramos de
// 90 min que usa la parrilla (así el admin los ve igual).
const bloqueo = (pista, fecha, tramo) => ({
  id: `snp-${pista.replace(' ', '').toLowerCase()}-${fecha}-${tramo.slice(0, 5).replace(':', '')}`,
  court_id: PISTAS[pista], date: fecha, time_slot: tramo, created_by: ADMIN_ID, created_at: '2026-10-26T10:00:00Z', tipo: 'bloqueado', entreno_grupo: null,
});
const blocked_slots = [
  bloqueo('Pista 1', FECHA[SAB1], '10:30 - 12:00'), bloqueo('Pista 1', FECHA[SAB1], '12:00 - 13:30'),
  bloqueo('Pista 2', FECHA[SAB1], '10:30 - 12:00'), bloqueo('Pista 2', FECHA[SAB1], '12:00 - 13:30'),
  bloqueo('Pista 2', FECHA[DOM1], '17:30 - 19:00'),
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
const totalHoras = DIAS.reduce((s, d) => s + HORAS_DIA[d].length, 0);
const libres = participants.map((p) => totalHoras - p.prefRules.reduce((s, r) => s + r.slots.length, 0));
console.log('Parejas por categoría:', porCat, '| total parejas:', participants.length, '| partidos:', Object.values(porCat).reduce((s, k) => s + k - 1, 0));
console.log(`Horas libres por pareja: mín ${Math.min(...libres)}, media ${(libres.reduce((a, b) => a + b, 0) / libres.length).toFixed(1)}, máx ${Math.max(...libres)} de ${totalHoras}`);
console.log('Bloqueos SNP:', blocked_slots.map((b) => `${b.date} ${b.time_slot} (${Object.keys(PISTAS).find((k) => PISTAS[k] === b.court_id)})`).join(' | '));

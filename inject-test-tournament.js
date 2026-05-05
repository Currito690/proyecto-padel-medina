// ============================================
// SCRIPT DE PRUEBA: Super torneo multi-categoría con disponibilidades complicadas
// Categorías: B, C, D y Femenino · 28 parejas · Vie-Dom
//
// Uso:
//   1. Inicia sesión en padelmedina.com como admin@padelmedina.com
//   2. Abre DevTools (F12) → Console
//   3. Pega este script entero y pulsa Enter
//   4. El torneo aparecerá en "Mis Torneos" dentro del panel admin
// ============================================

(async () => {
  const SUPABASE_URL = 'https://iquibawtbpamhaottlbr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ';

  // ── Obtener JWT del admin actual ──────────────────────────────────────────
  const authKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  if (!authKey) { alert('⚠️ No hay sesión activa. Inicia sesión como admin@padelmedina.com antes de ejecutar este script.'); return; }
  let session;
  try { session = JSON.parse(localStorage.getItem(authKey)); } catch { alert('⚠️ No se pudo leer la sesión.'); return; }
  const jwt = session?.access_token;
  if (!jwt) { alert('⚠️ No se encontró el access_token de sesión.'); return; }

  // ── Config del torneo ─────────────────────────────────────────────────────
  const tConfig = {
    name: 'Super Torneo Multi-Categoría',
    categories: 'Cat B, Cat C, Cat D, Femenino',
    startDate: '2026-05-01',      // Viernes
    endDate: '2026-05-03',        // Domingo
    registrationDeadline: '2026-04-30',
    startHour: '09:00',
    endHour: '23:00',
    firstDayStartHour: '16:00',   // Viernes arranca a las 16:00
    courtsCount: 3,
    courtStartHours: { 1: '09:00', 2: '09:00', 3: '16:00' }, // Pista 3 solo desde las 16:00
    matchDurationByCategory: {
      'Cat B': 90,
      'Cat C': 90,
      'Cat D': 75,
      'Femenino': 90,
    },
    formatByCategory: {
      'Cat B': 'eliminatoria',
      'Cat C': 'eliminatoria',
      'Cat D': 'eliminatoria',
      'Femenino': 'eliminatoria',
    },
    dualCategoryMaxMatches: 1,
  };

  // ── Helpers para generar preferencias horarias ────────────────────────────
  const rule = (day, hours) => ({
    id: `${day}-${Math.random().toString(36).slice(2, 9)}`,
    day,
    label: `${day}: ${hours.join(', ')}`,
    slots: hours.map(h => `${day} ${h}`),
  });

  // Días del torneo (formato dd/mm que usa la app)
  const D_VIE = '01/05';
  const D_SAB = '02/05';
  const D_DOM = '03/05';

  // Franjas reutilizables
  const MAÑANA = ['09:00','10:00','11:00','12:00'];
  const MEDIODIA = ['12:00','13:00','14:00','15:00'];
  const TARDE = ['16:00','17:00','18:00','19:00'];
  const NOCHE = ['20:00','21:00','22:00'];
  const VIE_ENTERO = ['16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
  const DIA_ENTERO = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];

  // ── 28 parejas repartidas en 4 categorías ─────────────────────────────────
  const participants = [
    // ===== CAT B — 8 parejas · competitivas, agendas apretadas =====
    { id: 'b1', name: 'Carlos y Pedro', category: 'Cat B', prefRules: [
        rule(D_SAB, MAÑANA),
        rule(D_DOM, NOCHE),
    ]},
    { id: 'b2', name: 'Miguel y Javier', category: 'Cat B', prefRules: [
        rule(D_VIE, ['16:00','17:00','18:00','19:00']),
    ]},
    { id: 'b3', name: 'Antonio y Luis', category: 'Cat B', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_SAB, MAÑANA),
    ]},
    { id: 'b4', name: 'Fernando y Diego', category: 'Cat B', prefRules: [
        rule(D_DOM, DIA_ENTERO),
    ]},
    { id: 'b5', name: 'Raúl y Sergio', category: 'Cat B', prefRules: [
        rule(D_VIE, ['16:00','17:00','18:00']),
        rule(D_SAB, [...MAÑANA, ...MEDIODIA, ...TARDE]),
        rule(D_DOM, [...MAÑANA, ...MEDIODIA, ...TARDE]),
    ]},
    { id: 'b6', name: 'David y Nicolás', category: 'Cat B', prefRules: [] },
    { id: 'b7', name: 'Jorge y Manuel', category: 'Cat B', prefRules: [
        rule(D_VIE, ['17:00','19:00','21:00']),
        rule(D_SAB, ['09:00','11:00','13:00','15:00','17:00','19:00','21:00']),
        rule(D_DOM, ['10:00','12:00','14:00','16:00','18:00','20:00','22:00']),
    ]},
    { id: 'b8', name: 'Víctor y Daniel', category: 'Cat B', prefRules: [
        rule(D_SAB, MEDIODIA),
        rule(D_DOM, MEDIODIA),
    ]},

    // ===== CAT C — 6 parejas · nivel medio =====
    { id: 'c1', name: 'Pablo y Andrés', category: 'Cat C', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_DOM, MAÑANA),
    ]},
    { id: 'c2', name: 'Roberto y Álvaro', category: 'Cat C', prefRules: [
        rule(D_VIE, ['17:00']),
        rule(D_SAB, ['11:00','15:00','19:00']),
        rule(D_DOM, ['10:00','14:00','20:00']),
    ]},
    { id: 'c3', name: 'Marcos y Iván', category: 'Cat C', prefRules: [
        rule(D_SAB, MAÑANA),
        rule(D_DOM, NOCHE),
    ]},
    { id: 'c4', name: 'Adrián y Óscar', category: 'Cat C', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_DOM, DIA_ENTERO),
    ]},
    { id: 'c5', name: 'Rubén y Gonzalo', category: 'Cat C', prefRules: [] },
    { id: 'c6', name: 'Enrique y Felipe', category: 'Cat C', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_SAB, ['21:00','22:00']),
    ]},

    // ===== CAT D — 6 parejas · amateurs =====
    { id: 'd1', name: 'Tomás y Rodrigo', category: 'Cat D', prefRules: [
        rule(D_SAB, [...MAÑANA, ...MEDIODIA]),
        rule(D_DOM, [...MAÑANA, ...MEDIODIA]),
    ]},
    { id: 'd2', name: 'Samuel y Cristian', category: 'Cat D', prefRules: [
        rule(D_SAB, TARDE),
    ]},
    { id: 'd3', name: 'Joaquín y Mario', category: 'Cat D', prefRules: [] },
    { id: 'd4', name: 'Hugo y Bruno', category: 'Cat D', prefRules: [
        rule(D_DOM, MAÑANA),
    ]},
    { id: 'd5', name: 'Álex y Aitor', category: 'Cat D', prefRules: [
        rule(D_VIE, ['18:00','20:00','22:00']),
        rule(D_SAB, ['10:00','14:00','18:00','22:00']),
        rule(D_DOM, ['09:00','13:00','17:00','21:00']),
    ]},
    { id: 'd6', name: 'Javi y Sergio', category: 'Cat D', prefRules: [
        rule(D_SAB, [...MAÑANA, ...MEDIODIA, ...TARDE]),
        rule(D_DOM, [...MAÑANA, ...MEDIODIA, ...TARDE]),
    ]},

    // ===== FEMENINO — 8 parejas =====
    { id: 'f1', name: 'María y Laura', category: 'Femenino', prefRules: [
        rule(D_SAB, MAÑANA),
        rule(D_DOM, NOCHE),
    ]},
    { id: 'f2', name: 'Ana y Sofía', category: 'Femenino', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_SAB, [...MEDIODIA, ...TARDE, ...NOCHE]),
        rule(D_DOM, [...MEDIODIA, ...TARDE, ...NOCHE]),
    ]},
    { id: 'f3', name: 'Elena y Paula', category: 'Femenino', prefRules: [] },
    { id: 'f4', name: 'Carmen y Lucía', category: 'Femenino', prefRules: [
        rule(D_VIE, ['16:00','17:00']),
        rule(D_SAB, NOCHE),
    ]},
    { id: 'f5', name: 'Marta y Isabel', category: 'Femenino', prefRules: [
        rule(D_SAB, DIA_ENTERO),
    ]},
    { id: 'f6', name: 'Rocío y Nuria', category: 'Femenino', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_DOM, MAÑANA),
    ]},
    { id: 'f7', name: 'Claudia y Alba', category: 'Femenino', prefRules: [
        rule(D_SAB, ['10:00','12:00','14:00','16:00','18:00','20:00','22:00']),
        rule(D_DOM, ['09:00','11:00','13:00','15:00','17:00','19:00','21:00']),
    ]},
    { id: 'f8', name: 'Teresa y Inés', category: 'Femenino', prefRules: [
        rule(D_VIE, VIE_ENTERO),
        rule(D_SAB, DIA_ENTERO),
    ]},
  ];

  participants.forEach(p => { p.prefNames = p.prefRules.map(r => r.label); });

  const config = {
    ...tConfig,
    rounds: {},
    consRounds: {},
    participants,
    phase: 'setup',
  };

  // ── Insertar en Supabase ─────────────────────────────────────────────────
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tournaments`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name: tConfig.name, config, status: 'draft' }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('❌ Error creando el torneo:', res.status, txt);
    alert('❌ Error creando el torneo (' + res.status + '):\n' + txt + '\n\nRecuerda:\n1. Estar logeado como admin@padelmedina.com\n2. Tener aplicada la migración 20260422_tournaments_admin_write.sql en Supabase');
    return;
  }

  const [row] = await res.json();
  console.log('✅ Torneo creado en Supabase:', row);
  console.log(`   · ${participants.length} parejas`);
  console.log(`   · Categorías: ${tConfig.categories}`);
  console.log(`   · Fechas: ${tConfig.startDate} → ${tConfig.endDate}`);
  console.log(`   · ID: ${row.id}`);

  // Abrir el editor directamente
  localStorage.setItem('adminActiveTournamentId', row.id);
  localStorage.setItem('adminActiveTab', 'tournaments');

  alert(`✅ Torneo "${tConfig.name}" creado con ${participants.length} parejas en Cat B (8), Cat C (6), Cat D (6) y Femenino (8).\n\nRecarga la página (F5) para abrirlo desde "Mis Torneos".`);
})();

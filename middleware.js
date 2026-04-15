/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PADEL MEDINA – API Gateway · Rate Limit + DDoS + Circuit Breaker
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  CAPA 1 – Rate limiting por IP
 *    · 100 req/min por IP → HTTP 429
 *    · 3 infracciones     → blacklist permanente → HTTP 403
 *
 *  CAPA 2 – Detección de ataque distribuido (DDoS)
 *    · 50+ IPs distintas superando el límite al mismo tiempo → LOCKDOWN 10 min
 *    · 5 000+ req/min globales                              → LOCKDOWN 10 min
 *    · 1 000+ IPs únicas/min                               → LOCKDOWN 10 min
 *    · Todas las IPs ofensoras → blacklist automática
 *
 *  CAPA 3 – Circuit Breaker
 *    · Estados: CLOSED → OPEN → HALF-OPEN → CLOSED
 *    · Cada lockdown DDoS = 1 "disparo" del circuito
 *    · 5 disparos en 30 min → circuito OPEN → HTTP 503 total (solo admin pasa)
 *    · Tras 30 min en OPEN → HALF-OPEN (tráfico limitado de prueba)
 *    · Sin nuevos ataques en HALF-OPEN → circuito CLOSED
 *
 *  BYPASS ADMINISTRADOR
 *    · Header X-Admin-Bypass: <ADMIN_BYPASS_SECRET> → siempre pasa
 */

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  // Rate limit por IP
  WINDOW_MS:    60_000,
  MAX_REQ:      100,
  MAX_OFFENSES: 3,

  // DDoS (cualquier condición activa lockdown)
  DDOS_OFFENDING_IPS: 50,
  DDOS_TOTAL_REQ:     5_000,
  DDOS_UNIQUE_IPS:    1_000,
  LOCKDOWN_MS:        10 * 60_000,   // 10 min

  // Circuit Breaker
  CB_TRIP_THRESHOLD:  5,              // disparos antes de OPEN
  CB_TRIP_WINDOW_MS:  30 * 60_000,   // ventana donde se cuentan los disparos (30 min)
  CB_OPEN_DURATION:   30 * 60_000,   // tiempo en estado OPEN (30 min)
  CB_HALFOPEN_MAX:    10,             // req. permitidas en HALF-OPEN para testear
};

// ─────────────────────────────────────────────────────────────────────────────
//  ESTADO
// ─────────────────────────────────────────────────────────────────────────────

/** Blacklist permanente */
const blacklist = new Set();

/** @type {Map<string, { count: number, start: number, offenses: number }>} */
const ipMap = new Map();

/** Ventana de tráfico global */
let gWin = newGlobalWindow();

/** Lockdown DDoS activo hasta este timestamp (0 = inactivo) */
let lockdownUntil = 0;

// ── Circuit Breaker ───────────────────────────────────────────────────────────
const CB = {
  state:          'CLOSED',   // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  trips:          [],         // timestamps de cada disparo
  openUntil:      0,          // cuando expira el estado OPEN
  halfOpenCount:  0,          // peticiones permitidas en HALF-OPEN
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function newGlobalWindow() {
  return { start: Date.now(), totalReq: 0, uniqueIPs: new Set(), offendingIPs: new Set() };
}

function getClientIP(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function isAdminBypass(req) {
  const secret = (typeof process !== 'undefined' && process.env?.ADMIN_BYPASS_SECRET) ?? '';
  if (!secret) return false;
  return req.headers.get('x-admin-bypass') === secret;
}

function cleanupIPMap(now) {
  for (const [k, v] of ipMap) {
    if (now - v.start > CFG.WINDOW_MS * 2) ipMap.delete(k);
  }
}

function detectDDoS() {
  return (
    gWin.offendingIPs.size >= CFG.DDOS_OFFENDING_IPS ||
    gWin.totalReq          >= CFG.DDOS_TOTAL_REQ     ||
    gWin.uniqueIPs.size    >= CFG.DDOS_UNIQUE_IPS
  );
}

/** Registra un disparo en el Circuit Breaker y evalúa si debe abrirse */
function cbTrip(now) {
  // Añadir disparo y limpiar los fuera de ventana
  CB.trips.push(now);
  CB.trips = CB.trips.filter(t => now - t < CFG.CB_TRIP_WINDOW_MS);

  if (CB.trips.length >= CFG.CB_TRIP_THRESHOLD && CB.state !== 'OPEN') {
    CB.state     = 'OPEN';
    CB.openUntil = now + CFG.CB_OPEN_DURATION;
    console.error(
      `[CIRCUIT BREAKER] Estado → OPEN. ` +
      `${CB.trips.length} ataques en ${CFG.CB_TRIP_WINDOW_MS / 60_000} min. ` +
      `Se reabrirá a las ${new Date(CB.openUntil).toISOString()}`
    );
  }
}

/** Evalúa si el Circuit Breaker debe transicionar de estado */
function cbEvaluate(now) {
  if (CB.state === 'OPEN' && now >= CB.openUntil) {
    CB.state        = 'HALF_OPEN';
    CB.halfOpenCount = 0;
    console.warn('[CIRCUIT BREAKER] Estado → HALF_OPEN. Probando recuperación...');
  }
}

function cbClose() {
  CB.state = 'CLOSED';
  CB.trips = [];
  console.warn('[CIRCUIT BREAKER] Estado → CLOSED. Servicio recuperado.');
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESPUESTAS
// ─────────────────────────────────────────────────────────────────────────────
function resp403(ip) {
  return new Response(
    JSON.stringify({ error: 'Forbidden', mensaje: 'Tu IP ha sido bloqueada permanentemente.', ip }),
    { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}

function resp429(data, resetIn) {
  return new Response(
    JSON.stringify({
      error:      'Too Many Requests',
      mensaje:    `Límite superado. Infracción ${data.offenses}/${CFG.MAX_OFFENSES - 1}. Al 3.º serás bloqueado.`,
      retryAfter: resetIn,
    }),
    {
      status: 429,
      headers: {
        'Content-Type':          'application/json; charset=utf-8',
        'Retry-After':           String(resetIn),
        'X-RateLimit-Limit':     String(CFG.MAX_REQ),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset':     new Date(data.start + CFG.WINDOW_MS).toUTCString(),
      },
    }
  );
}

function resp503lockdown(until) {
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return new Response(
    JSON.stringify({
      error:      'Service Unavailable',
      mensaje:    'Servidor en modo protección por ataque masivo. Inténtalo en unos minutos.',
      retryAfter: remaining,
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(remaining), 'X-Lockdown': 'ddos' },
    }
  );
}

function resp503circuit(until) {
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return new Response(
    JSON.stringify({
      error:      'Service Unavailable',
      mensaje:    'El servicio está temporalmente detenido para protegerse de ataques repetidos. Vuelve en 30 minutos.',
      retryAfter: remaining,
      circuitBreaker: CB.state,
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(remaining), 'X-Circuit-Breaker': CB.state },
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
export default function middleware(request) {
  const ip  = getClientIP(request);
  const now = Date.now();

  // ── BYPASS ADMIN ────────────────────────────────────────────────────────────
  if (isAdminBypass(request)) return;

  // ── CAPA 1: Blacklist permanente ────────────────────────────────────────────
  if (blacklist.has(ip)) return resp403(ip);

  // ── CAPA 3: Circuit Breaker – evaluar transición de estado ─────────────────
  cbEvaluate(now);

  if (CB.state === 'OPEN') {
    return resp503circuit(CB.openUntil);
  }

  if (CB.state === 'HALF_OPEN') {
    CB.halfOpenCount += 1;
    if (CB.halfOpenCount > CFG.CB_HALFOPEN_MAX) {
      // Demasiado tráfico en HALF-OPEN → volver a OPEN
      CB.state     = 'OPEN';
      CB.openUntil = now + CFG.CB_OPEN_DURATION;
      return resp503circuit(CB.openUntil);
    }
    // Si llegamos a CB_HALFOPEN_MAX sin problemas, cerramos el circuito
    if (CB.halfOpenCount === CFG.CB_HALFOPEN_MAX) cbClose();
  }

  // ── CAPA 2: Lockdown DDoS activo ────────────────────────────────────────────
  if (now < lockdownUntil) return resp503lockdown(lockdownUntil);

  // Resetear ventana global si expiró
  if (now - gWin.start > CFG.WINDOW_MS) gWin = newGlobalWindow();

  // Actualizar contadores globales
  gWin.totalReq += 1;
  gWin.uniqueIPs.add(ip);

  if (ipMap.size > 10_000) cleanupIPMap(now);

  // ── CAPA 1: Rate limiting por IP ────────────────────────────────────────────
  const data = ipMap.get(ip) ?? { count: 0, start: now, offenses: 0 };

  if (now - data.start > CFG.WINDOW_MS) {
    data.count = 1;
    data.start = now;
  } else {
    data.count += 1;
  }

  ipMap.set(ip, data);

  if (data.count > CFG.MAX_REQ) {
    data.offenses += 1;
    gWin.offendingIPs.add(ip);

    // Blacklist individual
    if (data.offenses >= CFG.MAX_OFFENSES) {
      blacklist.add(ip);
      ipMap.delete(ip);
      console.warn(`[BLACKLIST] ${ip} bloqueada permanentemente`);
    }

    // Detección DDoS
    if (detectDDoS()) {
      // → Blacklist masiva + lockdown
      for (const offIp of gWin.offendingIPs) blacklist.add(offIp);
      lockdownUntil = now + CFG.LOCKDOWN_MS;

      // → Disparar circuit breaker
      cbTrip(now);

      console.error(
        `[DDOS] Lockdown activado | ` +
        `IPs ofensoras: ${gWin.offendingIPs.size} | ` +
        `IPs únicas: ${gWin.uniqueIPs.size} | ` +
        `Total req: ${gWin.totalReq} | ` +
        `CB trips: ${CB.trips.length}/${CFG.CB_TRIP_THRESHOLD} | ` +
        `CB state: ${CB.state}`
      );

      return resp503lockdown(lockdownUntil);
    }

    if (blacklist.has(ip)) return resp403(ip);

    const resetIn = Math.ceil((data.start + CFG.WINDOW_MS - now) / 1000);
    return resp429(data, resetIn);
  }

  // Petición dentro del límite → continúa normalmente
}

export const config = {
  matcher: ['/((?!assets/|_next/|favicon|logo|icons|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|google).*)'],
};

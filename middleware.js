/**
 * Vercel Edge Middleware – Rate Limiter + Blacklist automática
 *
 * Reglas:
 *  1. Máximo 100 peticiones/minuto por IP  → HTTP 429
 *  2. Si una IP supera el límite 3 veces   → entra en blacklist permanente → HTTP 403
 *  3. IPs en blacklist nunca vuelven a entrar (mientras el worker esté activo)
 *
 * El estado vive en memoria del edge worker de Vercel.
 * Para hacerlo 100% persistente entre reinicios habría que añadir Upstash Redis,
 * pero para protección contra ataques activos esto es más que suficiente.
 */

const WINDOW_MS    = 60 * 1000; // ventana deslizante: 1 minuto
const MAX_REQUESTS = 100;        // peticiones máximas por ventana
const MAX_OFFENSES = 3;          // infracciones antes de blacklist permanente

/**
 * Blacklist permanente.
 * @type {Set<string>}
 */
const blacklist = new Set();

/**
 * Contador de peticiones por IP.
 * @type {Map<string, { count: number, start: number, offenses: number }>}
 */
const ipMap = new Map();

function getClientIP(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function cleanup(now) {
  for (const [key, val] of ipMap) {
    if (now - val.start > WINDOW_MS * 2) ipMap.delete(key);
  }
}

export default function middleware(request) {
  const ip  = getClientIP(request);
  const now = Date.now();

  // ── 1. Comprobar blacklist ──────────────────────────────────────────────────
  if (blacklist.has(ip)) {
    return new Response(
      JSON.stringify({
        error:   'Forbidden',
        mensaje: 'Tu dirección IP ha sido bloqueada permanentemente por comportamiento abusivo.',
        ip,
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Blocked-IP': ip,
        },
      }
    );
  }

  // ── 2. Rate limiting ────────────────────────────────────────────────────────
  const data = ipMap.get(ip) ?? { count: 0, start: now, offenses: 0 };

  if (now - data.start > WINDOW_MS) {
    // Ventana expirada → nueva ventana (mantenemos el contador de infracciones)
    data.count = 1;
    data.start = now;
  } else {
    data.count += 1;
  }

  ipMap.set(ip, data);

  // Limpieza periódica
  if (ipMap.size > 5000) cleanup(now);

  if (data.count > MAX_REQUESTS) {
    data.offenses += 1;

    // ── 3. Blacklist automática al superar MAX_OFFENSES ────────────────────
    if (data.offenses >= MAX_OFFENSES) {
      blacklist.add(ip);
      ipMap.delete(ip); // ya no necesitamos su entrada en el Map

      console.warn(`[BLACKLIST] IP bloqueada permanentemente: ${ip} (${data.offenses} infracciones)`);

      return new Response(
        JSON.stringify({
          error:   'Forbidden',
          mensaje: 'Tu dirección IP ha sido bloqueada permanentemente por comportamiento abusivo.',
          ip,
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Blocked-IP': ip,
          },
        }
      );
    }

    // Todavía en período de aviso (429)
    const resetIn = Math.ceil((data.start + WINDOW_MS - now) / 1000);
    console.warn(`[RATE LIMIT] ${ip} → infracción ${data.offenses}/${MAX_OFFENSES - 1}`);

    return new Response(
      JSON.stringify({
        error:      'Too Many Requests',
        mensaje:    `Has superado el límite de ${MAX_REQUESTS} peticiones por minuto. Infracción ${data.offenses} de ${MAX_OFFENSES - 1}. Si continúas serás bloqueado permanentemente.`,
        retryAfter: resetIn,
        infraccion: data.offenses,
        limite:     MAX_OFFENSES - 1,
      }),
      {
        status: 429,
        headers: {
          'Content-Type':          'application/json; charset=utf-8',
          'Retry-After':           String(resetIn),
          'X-RateLimit-Limit':     String(MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset':     new Date(data.start + WINDOW_MS).toUTCString(),
        },
      }
    );
  }

  // Petición dentro del límite → continúa normalmente
}

export const config = {
  matcher: ['/((?!assets/|_next/|favicon|logo|icons|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|google).*)'],
};

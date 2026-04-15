/**
 * Vercel Edge Middleware – Rate Limiter
 * Máximo 100 peticiones por minuto por IP.
 * La petición 101+ recibe HTTP 429 Too Many Requests.
 *
 * Nota: el Map vive en memoria del edge worker. Es suficiente para
 * proteger contra abuso básico / bots en este tipo de aplicación.
 */

const WINDOW_MS   = 60 * 1000; // ventana de 1 minuto
const MAX_REQUESTS = 100;       // límite por IP por ventana

/** @type {Map<string, { count: number, start: number }>} */
const ipMap = new Map();

function getClientIP(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Limpia entradas caducadas cuando el Map crece demasiado */
function cleanup(now) {
  for (const [key, val] of ipMap) {
    if (now - val.start > WINDOW_MS) ipMap.delete(key);
  }
}

export default function middleware(request) {
  const ip  = getClientIP(request);
  const now = Date.now();

  // Obtener o crear entrada para esta IP
  const data = ipMap.get(ip) ?? { count: 0, start: now };

  if (now - data.start > WINDOW_MS) {
    // Ventana expirada → reiniciar
    data.count = 1;
    data.start = now;
  } else {
    data.count += 1;
  }

  ipMap.set(ip, data);

  // Limpiar Map si crece mucho
  if (ipMap.size > 5000) cleanup(now);

  if (data.count > MAX_REQUESTS) {
    const resetIn = Math.ceil((data.start + WINDOW_MS - now) / 1000);

    return new Response(
      JSON.stringify({
        error:      'Too Many Requests',
        mensaje:    'Has superado el límite de 100 peticiones por minuto. Por favor, espera un momento.',
        retryAfter: resetIn,
      }),
      {
        status: 429,
        headers: {
          'Content-Type':      'application/json; charset=utf-8',
          'Retry-After':       String(resetIn),
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(data.start + WINDOW_MS).toUTCString(),
        },
      }
    );
  }

  // Petición dentro del límite → continúa normalmente
}

export const config = {
  // Aplica a todas las rutas excepto assets estáticos compilados
  // (que se cargan muchos a la vez en el primer render)
  matcher: ['/((?!assets/|_next/|favicon|logo|icons|manifest\\.json|sw\\.js|robots\\.txt|sitemap\\.xml|google).*)'],
};

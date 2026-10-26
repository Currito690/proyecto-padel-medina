// Vista previa del enlace de un torneo para WhatsApp, Facebook, Telegram, X…
// Los rastreadores no ejecutan JavaScript, así que el .htaccess de la web les
// manda aquí cuando piden /torneos/:id (o /torneos/:id/cuadro) y reciben un
// HTML con el título, las fechas, las categorías y el cartel del torneo.
// Es una función PÚBLICA (sin JWT): está en PUBLIC_FUNCTIONS del main del
// servidor. Si una persona llega aquí, se la manda a la página normal.

const ORIGEN = 'https://padelmedina.com';
const IMAGEN_POR_DEFECTO = `${ORIGEN}/og-padelmedina.png`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fecha = (iso?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  return `${parseInt(m[3], 10)} de ${MESES[parseInt(m[2], 10) - 1] || ''}`;
};

const escapar = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

type Torneo = { name: string; status: string; config: Record<string, any> | null };

async function cargarTorneo(id: string): Promise<Torneo | null> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !clave) return null;
  try {
    const r = await fetch(`${url}/rest/v1/tournaments?id=eq.${id}&select=name,status,config`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}` },
    });
    if (!r.ok) return null;
    const filas = (await r.json()) as Torneo[];
    const t = filas[0] || null;
    // Un borrador no se enseña a nadie.
    return t && t.status !== 'draft' ? t : null;
  } catch (e) {
    console.error('og-torneo: no se pudo leer el torneo', e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const id = (u.searchParams.get('id') || '').trim();
  const esCuadro = /cuadro/.test(u.searchParams.get('ruta') || '');
  const canonica = UUID.test(id) ? `${ORIGEN}/torneos/${id}${esCuadro ? '/cuadro' : ''}` : `${ORIGEN}/torneos`;

  const torneo = UUID.test(id) ? await cargarTorneo(id) : null;
  const cfg = (torneo?.config || {}) as Record<string, any>;

  let titulo = 'Torneos · Padel Medina';
  let descripcion = 'Torneos de pádel en Medina Sidonia (Cádiz). Inscríbete online.';
  let imagen = IMAGEN_POR_DEFECTO;
  let imagenPropia = false;
  if (torneo) {
    titulo = `${torneo.name}${esCuadro ? ' · Cuadro' : ''}`;
    const partes: string[] = [];
    if (cfg.startDate && cfg.endDate) {
      partes.push(cfg.startDate === cfg.endDate ? fecha(cfg.startDate) : `Del ${fecha(cfg.startDate)} al ${fecha(cfg.endDate)}`);
    }
    const categorias = String(cfg.categories || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (categorias.length) partes.push(categorias.join(', '));
    if (esCuadro) partes.unshift('Cuadro y resultados en vivo');
    else {
      if (cfg.registrationDeadline) partes.push(`Inscripciones hasta el ${fecha(cfg.registrationDeadline)}`);
      partes.push('Inscríbete desde el enlace');
    }
    descripcion = partes.join(' · ');
    if (cfg.posterOgUrl || cfg.posterUrl) {
      imagen = String(cfg.posterOgUrl || cfg.posterUrl);
      imagenPropia = !!cfg.posterOgUrl;
    }
  }

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · Padel Medina</title>
<meta name="description" content="${escapar(descripcion)}">
<link rel="canonical" href="${escapar(canonica)}">
<meta property="og:site_name" content="Padel Medina">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:url" content="${escapar(canonica)}">
<meta property="og:title" content="${escapar(titulo)}">
<meta property="og:description" content="${escapar(descripcion)}">
<meta property="og:image" content="${escapar(imagen)}">
<meta property="og:image:secure_url" content="${escapar(imagen)}">
<meta property="og:image:type" content="${imagen.endsWith('.png') ? 'image/png' : 'image/jpeg'}">
${imagenPropia || imagen === IMAGEN_POR_DEFECTO ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''}
<meta property="og:image:alt" content="${escapar(titulo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapar(titulo)}">
<meta name="twitter:description" content="${escapar(descripcion)}">
<meta name="twitter:image" content="${escapar(imagen)}">
<script>location.replace(${JSON.stringify(canonica)});</script>
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;color:#0F172A">
<h1>${escapar(titulo)}</h1>
<p>${escapar(descripcion)}</p>
<p><a href="${escapar(canonica)}">Abrir en Padel Medina</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
});

// Título, descripción y canónica de cada página. Google lee el <head> después
// de que cargue la web: sin esto todas las rutas se quedaban con el título y la
// canónica de la portada (y /login aparecía como si fuera la portada).

const DOMINIO = 'https://padelmedina.com';

const PORTADA = {
  titulo: 'Padel Medina · Club de pádel en Medina Sidonia (Cádiz) | Reserva online',
  descripcion: 'Club de pádel en Medina Sidonia (Cádiz). Reserva tu pista online en segundos: 18 € la hora y media, abierto todos los días. Paga con tarjeta, Bizum o en el club.',
};

const PAGINAS = {
  '/': PORTADA,
  '/login': {
    titulo: 'Entrar o crear cuenta · Padel Medina',
    descripcion: 'Entra en tu cuenta de Padel Medina o regístrate gratis para reservar pista de pádel en Medina Sidonia.',
  },
  '/privacidad': {
    titulo: 'Política de privacidad · Padel Medina',
    descripcion: 'Cómo trata Padel Medina tus datos personales al reservar pistas y apuntarte a torneos.',
  },
  '/aviso-legal': {
    titulo: 'Aviso legal · Padel Medina',
    descripcion: 'Datos del titular y condiciones de uso de padelmedina.com.',
  },
  '/eliminar-cuenta': {
    titulo: 'Eliminar tu cuenta · Padel Medina',
    descripcion: 'Cómo borrar tu cuenta de Padel Medina y qué datos se eliminan.',
  },
};

// Páginas que no deben salir en Google (pagos, recuperar contraseña y todo lo
// que exige haber iniciado sesión).
const PRIVADA = { titulo: 'Padel Medina', descripcion: PORTADA.descripcion, noindex: true };

export function metaDeRuta(pathname) {
  if (PAGINAS[pathname]) return { ...PAGINAS[pathname], ruta: pathname };
  if (/^\/torneos\/[^/]+\/cuadro$/.test(pathname)) {
    return { titulo: 'Cuadro del torneo · Padel Medina', descripcion: 'Cuadro y resultados del torneo de pádel en Padel Medina, Medina Sidonia.', ruta: pathname };
  }
  if (/^\/torneos\/[^/]+$/.test(pathname)) {
    return { titulo: 'Inscripción al torneo · Padel Medina', descripcion: 'Apúntate al torneo de pádel de Padel Medina en Medina Sidonia (Cádiz).', ruta: pathname };
  }
  return { ...PRIVADA, ruta: pathname };
}

const ponerEnHead = (selector, crear, attr, valor) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = crear();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, valor);
};

const meta = (atributo, nombre) => () => {
  const el = document.createElement('meta');
  el.setAttribute(atributo, nombre);
  return el;
};

export function aplicarMeta({ titulo, descripcion, ruta, noindex }) {
  const url = DOMINIO + ruta;
  document.title = titulo;
  ponerEnHead('meta[name="description"]', meta('name', 'description'), 'content', descripcion);
  ponerEnHead('meta[property="og:title"]', meta('property', 'og:title'), 'content', titulo);
  ponerEnHead('meta[property="og:description"]', meta('property', 'og:description'), 'content', descripcion);
  ponerEnHead('meta[property="og:url"]', meta('property', 'og:url'), 'content', url);
  ponerEnHead('meta[name="robots"]', meta('name', 'robots'), 'content',
    noindex ? 'noindex, follow' : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
  ponerEnHead('link[rel="canonical"]', () => {
    const el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    return el;
  }, 'href', url);
}

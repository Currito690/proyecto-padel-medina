import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { TITULAR } from '../utils/legal';
import { normalizeScheduleConfig, DEFAULT_SCHEDULE_CONFIG } from '../utils/schedule';

// Portada pública (web, sin sesión): lo que ve Google y quien llega buscando
// "pádel Medina Sidonia". Antes la web mandaba directamente a /login y Google
// no veía nada del club. Las apps siguen yendo a /login (ver App.jsx).
// Precio, horario, pistas y torneos salen de la base de datos (lectura pública);
// mientras cargan se muestran los valores de siempre.

const URL_PLAY = 'https://play.google.com/store/apps/details?id=com.padelmedina.app';
const URL_MAPA = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Padel Medina, Calle Alemania 4, 11170 Medina Sidonia, Cádiz');
const WHATSAPP = 'https://wa.me/' + TITULAR.telefono.replace(/\D/g, '');

const INICIAL = {
  pistas: [
    { id: 'p1', name: 'Pista 1', sport: 'Pádel', location: 'Nave 1' },
    { id: 'p2', name: 'Pista 2', sport: 'Pádel', location: 'Nave 2' },
  ],
  precio: 18,
  horario: DEFAULT_SCHEDULE_CONFIG,
  diasAntelacion: 2,
  horaApertura: '09:00',
  cancelarHoras: 24,
  torneos: [],
  eventos: [],
};

const euros = (n) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const hora = (t) => String(t).slice(0, 5).replace(/^0/, '');
const duracion = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

const Icono = ({ d, color = '#16A34A' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const Inicio = () => {
  const [datos, setDatos] = useState(INICIAL);

  useEffect(() => {
    let vivo = true;
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    Promise.all([
      supabase.from('courts').select('id, name, sport, location, price').eq('active', true).order('name'),
      supabase.from('site_settings').select('court_price, schedule_config, booking_window_days, slots_release_time, cancellation_enabled, cancellation_hours').eq('id', 1).maybeSingle(),
      supabase.from('tournaments').select('id, name').eq('status', 'open'),
      supabase.from('events').select('id, title, event_date, registration_url').eq('published', true).gte('event_date', hoy).order('event_date').limit(4),
    ]).then(([pistas, ajustes, torneos, eventos]) => {
      if (!vivo) return;
      setDatos((prev) => {
        const s = ajustes.data;
        const lista = pistas.data?.length ? pistas.data : prev.pistas;
        const precioBase = Number(s?.court_price) || prev.precio;
        const precios = lista.map((p) => (p.price != null ? Number(p.price) : precioBase)).filter((n) => n > 0);
        return {
          pistas: lista,
          precio: precios.length ? Math.min(...precios) : precioBase,
          horario: s ? normalizeScheduleConfig(s.schedule_config) : prev.horario,
          diasAntelacion: parseInt(s?.booking_window_days, 10) || prev.diasAntelacion,
          horaApertura: s?.slots_release_time || prev.horaApertura,
          cancelarHoras: s ? (s.cancellation_enabled === false ? null : (s.cancellation_hours ?? 24)) : prev.cancelarHoras,
          torneos: torneos.data || [],
          eventos: eventos.data || [],
        };
      });
    }).catch(() => { /* sin conexión: se quedan los valores de siempre */ });
    return () => { vivo = false; };
  }, []);

  const { pistas, precio, horario, diasAntelacion, horaApertura, cancelarHoras, torneos, eventos } = datos;
  const pistasPadel = pistas.filter((p) => /p[aá]del/i.test(p.sport || ''));
  const deportes = [...new Set(pistas.map((p) => p.sport).filter(Boolean))];
  const horarioTxt = horario.periods.map((p) => `${hora(p.start)} a ${hora(p.end)}`).join(' y de ');
  const sesion = duracion(horario.slot_minutes);
  const porJugador = euros(Math.round((precio / 4) * 100) / 100);
  const numPistas = pistasPadel.length || pistas.length;

  const preguntas = [
    ['¿Cuánto cuesta alquilar una pista de pádel?',
      `${euros(precio)} la pista por ${sesion} de juego. Si sois cuatro, sale a ${porJugador} por jugador.`],
    ['¿Cómo reservo?',
      'Crea tu cuenta gratis aquí o en la app, elige pista, día y hora, y paga. Te llega la confirmación al correo y la reserva queda en "Mis reservas".'],
    ['¿Con cuánta antelación puedo reservar?',
      `Las horas de cada día se abren a las ${hora(horaApertura)}, ${diasAntelacion === 1 ? 'un día' : `${diasAntelacion} días`} antes.`],
    cancelarHoras != null
      ? ['¿Puedo cancelar una reserva?', `Sí, desde "Mis reservas", hasta ${cancelarHoras} horas antes de la hora de la pista.`]
      : null,
    ['¿Cómo se paga?',
      'Con tarjeta, con Bizum o en el club. También podéis dividir el pago: cada jugador paga su parte desde su móvil.'],
    ['¿Dónde está el club?',
      `En ${TITULAR.domicilio} (Polígono Industrial Prado de la Feria).`],
  ].filter(Boolean);

  return (
    <div className="inicio">
      <style>{estilos}</style>

      <header className="inicio-cabecera">
        <Link to="/" aria-label="Padel Medina, inicio" className="inicio-logo">
          <img src="/logo.png" alt="Padel Medina" width="132" height="72" />
        </Link>
        <Link to="/login" className="inicio-entrar">Entrar</Link>
      </header>

      <main className="inicio-contenido">
        <section className="inicio-hero">
          <p className="inicio-chip">
            <Icono color="white" d={<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>} />
            Medina Sidonia, Cádiz
          </p>
          <h1>Club de pádel en Medina&nbsp;Sidonia</h1>
          <p className="inicio-hero-texto">
            {numPistas} {numPistas === 1 ? 'pista' : 'pistas'} de {deportes.length > 1 ? deportes.map((d) => d.toLowerCase()).join(' y ') : 'pádel'} con reserva online.
            Elige día y hora, paga desde el móvil y a jugar.
          </p>
          <div className="inicio-botones">
            <Link to="/login?registro" className="inicio-cta">Reservar pista</Link>
            <a href="#donde-estamos" className="inicio-cta-sec">Cómo llegar</a>
          </div>
        </section>

        <section aria-label="Datos del club" className="inicio-datos">
          <div className="inicio-dato">
            <Icono d={<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>} />
            <strong>{euros(precio)}</strong>
            <span>la pista · {sesion}</span>
          </div>
          <div className="inicio-dato">
            <Icono color="#1B3A6E" d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />
            <strong>Todos los días</strong>
            <span>de {horarioTxt}</span>
          </div>
          <div className="inicio-dato">
            <Icono color="#2563EB" d={<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>} />
            <strong>Reserva online</strong>
            <span>desde la web o la app</span>
          </div>
          <div className="inicio-dato">
            <Icono color="#9333EA" d={<><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></>} />
            <strong>Tarjeta o Bizum</strong>
            <span>o paga en el club</span>
          </div>
        </section>

        <section className="inicio-bloque" id="pistas">
          <h2>Nuestras pistas</h2>
          <ul className="inicio-pistas">
            {pistas.map((p) => (
              <li key={p.id}>
                <span className="inicio-pista-nombre">{p.name}</span>
                <span className="inicio-pista-info">{p.sport}{p.location ? ` · ${p.location}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>

        {(torneos.length > 0 || eventos.length > 0) && (
          <section className="inicio-bloque">
            <h2>Torneos y eventos</h2>
            <ul className="inicio-lista">
              {torneos.map((t) => (
                <li key={`t-${t.id}`}>
                  <span>{t.name}</span>
                  <Link to={`/torneos/${t.id}`} className="inicio-enlace">Inscribirse</Link>
                </li>
              ))}
              {eventos.map((ev) => (
                <li key={`e-${ev.id}`}>
                  <span>{ev.title}<small>{fechaLarga(ev.event_date)}</small></span>
                  {ev.registration_url && <a href={ev.registration_url} className="inicio-enlace" rel="noopener">Más info</a>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="inicio-bloque">
          <h2>Cómo reservar</h2>
          <ol className="inicio-pasos">
            <li><strong>Crea tu cuenta</strong> con tu correo o con Google. Es gratis.</li>
            <li><strong>Elige pista, día y hora</strong> entre las que quedan libres.</li>
            <li><strong>Paga</strong> con tarjeta, Bizum o en el club, y listo.</li>
          </ol>
          <Link to="/login?registro" className="inicio-cta inicio-cta-verde">Crear cuenta y reservar</Link>
        </section>

        <section className="inicio-bloque">
          <h2>Descarga la app</h2>
          <p>Reserva desde el móvil, mira tus pistas y recibe un aviso unas horas antes de jugar.</p>
          <a href={URL_PLAY} className="inicio-tienda" rel="noopener">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.6 1.8c-.3.3-.5.8-.5 1.4v17.6c0 .6.2 1.1.5 1.4l9.8-10.2L3.6 1.8zm11.1 11.5 2.8 2.9-11.6 6.6 8.8-9.5zm0-2.6L5.9 1.2l11.6 6.6-2.8 2.9zm3.9-1.7 3.1 1.8c.9.5.9 1.9 0 2.4l-3.1 1.8-3.1-3 3.1-3z" /></svg>
            <span><small>Disponible en</small>Google Play</span>
          </a>
        </section>

        <section className="inicio-bloque" id="donde-estamos">
          <h2>Dónde estamos</h2>
          <address>
            {TITULAR.domicilio}<br />
            Polígono Industrial Prado de la Feria
          </address>
          <div className="inicio-contacto">
            <a href={URL_MAPA} rel="noopener" className="inicio-boton">Abrir en Google Maps</a>
            <a href={`tel:${TITULAR.telefono.replace(/\s/g, '')}`} className="inicio-boton">Llamar · {TITULAR.telefono.replace('+34 ', '')}</a>
            <a href={WHATSAPP} rel="noopener" className="inicio-boton">WhatsApp</a>
            <a href={`mailto:${TITULAR.email}`} className="inicio-boton">{TITULAR.email}</a>
          </div>
        </section>

        <section className="inicio-bloque">
          <h2>Preguntas frecuentes</h2>
          {preguntas.map(([p, r]) => (
            <details key={p} className="inicio-pregunta">
              <summary>{p}</summary>
              <p>{r}</p>
            </details>
          ))}
        </section>
      </main>

      <footer className="inicio-pie">
        <p>© {new Date().getFullYear()} Padel Medina · Medina Sidonia (Cádiz)</p>
        <p>
          <Link to="/aviso-legal">Aviso legal</Link> · <Link to="/privacidad">Privacidad</Link> · <Link to="/login">Entrar</Link>
        </p>
      </footer>
    </div>
  );
};

const estilos = `
  .inicio { min-height: 100vh; background: #F8FAFC; color: #0F172A; padding-top: var(--sa-top); }
  .inicio-cabecera { display: flex; align-items: center; justify-content: space-between; gap: 1rem; max-width: 960px; margin: 0 auto; padding: 0.75rem 1rem; }
  .inicio-logo img { display: block; height: 72px; width: auto; margin: -0.5rem 0 -0.5rem -1.25rem; }
  .inicio-entrar { padding: 0.55rem 1.1rem; min-height: 44px; display: inline-flex; align-items: center; border-radius: 0.75rem; border: 1.5px solid #E2E8F0; background: white; color: #0F2550; font-weight: 800; font-size: 0.9rem; text-decoration: none; }
  .inicio-contenido { max-width: 960px; margin: 0 auto; padding: 0 1rem 2rem; }
  .inicio-hero { position: relative; overflow: hidden; border-radius: 1.5rem; padding: 1.75rem 1.375rem 1.625rem; background: linear-gradient(150deg, #1B3A6E 0%, #0F2550 100%); color: white; box-shadow: 0 12px 32px rgba(15,37,80,0.25); }
  .inicio-chip { display: inline-flex; align-items: center; gap: 0.4rem; margin: 0 0 1rem; padding: 0.35rem 0.75rem; border-radius: 2rem; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); color: white; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
  .inicio-chip svg { width: 14px; height: 14px; }
  .inicio-hero h1 { margin: 0 0 0.6rem; color: white; font-size: 1.85rem; font-weight: 900; letter-spacing: -0.03em; line-height: 1.1; }
  .inicio-hero-texto { margin: 0 0 1.25rem; font-size: 0.95rem; line-height: 1.55; color: rgba(255,255,255,0.85); max-width: 34rem; }
  .inicio-botones { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  .inicio-cta { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 1.4rem; border-radius: 0.875rem; background: white; color: #0F2550; font-weight: 900; font-size: 0.95rem; text-decoration: none; box-shadow: 0 4px 14px rgba(0,0,0,0.18); }
  .inicio-cta-sec { display: inline-flex; align-items: center; min-height: 48px; padding: 0 1.2rem; border-radius: 0.875rem; border: 1.5px solid rgba(255,255,255,0.35); color: white; font-weight: 700; font-size: 0.9rem; text-decoration: none; }
  .inicio-cta-verde { background: #16A34A; color: white; box-shadow: 0 4px 14px rgba(22,163,74,0.3); margin-top: 0.5rem; }
  .inicio-datos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin: 1rem 0 0.5rem; }
  .inicio-dato { display: flex; flex-direction: column; gap: 0.2rem; padding: 1rem; border-radius: 1.125rem; background: white; border: 1px solid #E2E8F0; box-shadow: 0 1px 3px rgba(15,23,42,0.05); }
  .inicio-dato svg { margin-bottom: 0.3rem; }
  .inicio-dato strong { font-size: 1rem; font-weight: 800; color: #0F172A; }
  .inicio-dato span { font-size: 0.8rem; color: #64748B; line-height: 1.35; }
  .inicio-bloque { margin-top: 1rem; padding: 1.25rem; border-radius: 1.25rem; background: white; border: 1px solid #E2E8F0; }
  .inicio-bloque h2 { margin: 0 0 0.75rem; font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; color: #0F2550; }
  .inicio-bloque p, .inicio-bloque address { margin: 0 0 0.9rem; font-size: 0.92rem; line-height: 1.55; color: #475569; font-style: normal; }
  .inicio-pistas { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
  .inicio-pistas li { padding: 0.9rem 1rem; border-radius: 1rem; background: linear-gradient(135deg, #16A34A, #15803D); color: white; }
  .inicio-pista-nombre { display: block; font-size: 1.05rem; font-weight: 900; }
  .inicio-pista-info { display: block; font-size: 0.78rem; opacity: 0.85; margin-top: 0.15rem; }
  .inicio-lista { list-style: none; margin: 0; padding: 0; }
  .inicio-lista li { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 0; border-top: 1px solid #F1F5F9; font-weight: 700; font-size: 0.92rem; }
  .inicio-lista li:first-child { border-top: none; padding-top: 0; }
  .inicio-lista small { display: block; font-weight: 500; color: #64748B; font-size: 0.78rem; text-transform: capitalize; }
  .inicio-enlace { flex-shrink: 0; color: #16A34A; font-weight: 800; font-size: 0.85rem; text-decoration: none; }
  .inicio-pasos { margin: 0 0 0.75rem; padding-left: 1.25rem; color: #475569; font-size: 0.92rem; line-height: 1.55; }
  .inicio-pasos li { margin-bottom: 0.45rem; }
  .inicio-pasos strong { color: #0F172A; }
  .inicio-tienda { display: inline-flex; align-items: center; gap: 0.6rem; min-height: 52px; padding: 0 1.2rem; border-radius: 0.875rem; background: #0F172A; color: white; text-decoration: none; }
  .inicio-tienda span { display: flex; flex-direction: column; font-weight: 800; font-size: 1.05rem; line-height: 1.1; }
  .inicio-tienda small { font-weight: 500; font-size: 0.68rem; opacity: 0.8; }
  .inicio-contacto { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .inicio-boton { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1rem; border-radius: 0.75rem; border: 1.5px solid #E2E8F0; color: #0F2550; font-weight: 700; font-size: 0.85rem; text-decoration: none; max-width: 100%; overflow-wrap: anywhere; }
  .inicio-pregunta { border-top: 1px solid #F1F5F9; padding: 0.8rem 0; }
  .inicio-pregunta:first-of-type { border-top: none; padding-top: 0; }
  .inicio-pregunta summary { cursor: pointer; font-weight: 800; font-size: 0.95rem; color: #0F172A; min-height: 28px; }
  .inicio-pregunta p { margin: 0.5rem 0 0; }
  .inicio-pie { text-align: center; padding: 1.5rem 1rem calc(1.5rem + var(--sa-bottom)); font-size: 0.8rem; color: #64748B; }
  .inicio-pie p { margin: 0.25rem 0; }
  .inicio-pie a { color: #475569; }
  @media (min-width: 768px) {
    .inicio-hero { padding: 2.75rem 2.25rem; border-radius: 1.75rem; }
    .inicio-hero h1 { font-size: 2.6rem; }
    .inicio-hero-texto { font-size: 1.05rem; }
    .inicio-datos { grid-template-columns: repeat(4, 1fr); }
    .inicio-bloque { padding: 1.75rem; }
  }
`;

export default Inicio;

// Arranque NATIVO (solo app de iPhone/iPad vía Capacitor).
//
// IMPORTANTE: este módulo SOLO se carga cuando Capacitor.isNativePlatform() es
// true (ver src/main.jsx). En la web y en la app Android (TWA, que es Chrome y
// no Capacitor) no se ejecuta nada de aquí: cero impacto en lo que ya funciona.
//
// Avisos de Apple (APNs): aquí solo se escucha el toque en un aviso. El permiso
// y el registro del token los hace la app cuando hay usuario (activarAvisos en
// src/services/pushNotifications.js): no se pregunta nada al arrancar.
// El pago con Redsys se abre en una pantalla de pago propia de la app y vuelve
// solo (ver src/utils/redsysPay.js); no necesita nada aquí.
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { PushNotifications } from '@capacitor/push-notifications';

// Lleva al enrutador de la SPA (React Router) a una ruta interna sin recargar.
function navegarSPA(path) {
  try {
    if (!path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch { /* nada */ }
}

// De una URL de enlace profundo saca la parte interna (ruta + query + hash).
function rutaDeURL(url) {
  try {
    const u = new URL(url);
    return (u.pathname || '/') + (u.search || '') + (u.hash || '');
  } catch {
    return null;
  }
}

async function initStatusBarYSplash() {
  // La pantalla completa la da capacitor.config (ios.contentInset "never") y el
  // CSS con env(safe-area-inset-top). El color de los iconos de la barra de
  // estado lo pone cada pantalla (StatusBarSync en App.jsx).
  try {
    // La web ya está pintada: quitamos el splash nativo.
    await SplashScreen.hide();
  } catch { /* nada */ }
}

function initEnlacesProfundos() {
  // Capacitor entrega aquí las URLs que abren la app (enlaces de avisos, etc.).
  App.addListener('appUrlOpen', ({ url }) => {
    const ruta = rutaDeURL(url);
    if (ruta) navegarSPA(ruta);
  }).catch(() => {});
}

// En iPhone, un enlace con target="_blank" (o window.open) Capacitor lo manda
// FUERA de la app. Para los enlaces a nuestras propias páginas (privacidad, aviso
// legal, el enlace público de un torneo…) eso saca al jugador a Safari — o no
// hace nada, si es una ruta interna. Los abrimos DENTRO de la app. Los enlaces
// a otros sitios (Google Maps, la web de la agencia…) siguen abriéndose fuera.
function initEnlacesInternos() {
  document.addEventListener('click', (ev) => {
    const a = ev.target?.closest?.('a[href]');
    if (!a || (a.getAttribute('target') || '').toLowerCase() !== '_blank') return;
    let u;
    try { u = new URL(a.getAttribute('href'), window.location.href); } catch { return; }
    const propia = (u.protocol === window.location.protocol && u.host === window.location.host)
      || (u.protocol === 'https:' && u.host === 'padelmedina.com');
    if (!propia) return;
    ev.preventDefault();
    navegarSPA((u.pathname || '/') + (u.search || '') + (u.hash || ''));
  }, true);
}

async function initPush() {
  try {
    // Tocar un aviso abre la ruta que venga en los datos (data.url). Si llega
    // una URL completa (p. ej. el enlace de un torneo), nos quedamos con la ruta.
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = notification?.data?.url;
      if (!url) return;
      navegarSPA(url.startsWith('/') ? url : rutaDeURL(url));
    });
  } catch { /* nada */ }
}

// Punto de entrada. Llamado SOLO en plataforma nativa.
export async function initNative() {
  await initStatusBarYSplash();
  initEnlacesProfundos();
  initEnlacesInternos();
  await initPush();
}

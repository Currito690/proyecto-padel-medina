// Arranque NATIVO (solo app de iPhone/iPad vía Capacitor).
//
// IMPORTANTE: este módulo SOLO se carga cuando Capacitor.isNativePlatform() es
// true (ver src/main.jsx). En la web y en la app Android (TWA, que es Chrome y
// no Capacitor) no se ejecuta nada de aquí: cero impacto en lo que ya funciona.
//
// Pendiente (fase de servidor):
//   - Push de Apple (APNs): aquí solo se registra y se obtiene el token; falta
//     enviarlo al backend y mandar los avisos por APNs (hoy la web usa web-push).
// Vuelta del pago: Redsys vuelve a https://padelmedina.com/pv.html, que salta a
// com.padelmedina.app://pago/<ruta> (ver src/utils/redsysPay.js). Necesita el
// esquema com.padelmedina.app registrado en Xcode (Info > URL Types).
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
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
  // Capacitor entrega aquí las URLs que abren la app.
  App.addListener('appUrlOpen', async ({ url }) => {
    let u;
    try { u = new URL(url); } catch { return; }

    // Vuelta del pago: com.padelmedina.app://pago/<ruta interna>
    if (u.protocol === 'com.padelmedina.app:' && u.host === 'pago') {
      const ruta = (u.pathname || '/') + (u.search || '');
      if (!ruta.startsWith('/') || ruta.startsWith('//')) return;
      window.__pmVueltaPago = true; // que cerrar la hoja no se tome como cancelación
      try { await Browser.close(); } catch { /* ya estaba cerrada */ }
      // Recarga completa en capacitor://localhost (mismo localStorage = misma
      // sesión), igual que la vuelta del banco en la web. Hace falta recargar
      // para que pantallas como /torneos/:id relean ?inscripcion en la misma ruta.
      window.location.replace(ruta);
      return;
    }

    const ruta = rutaDeURL(url);
    if (ruta) navegarSPA(ruta);
  }).catch(() => {});
}

async function initPush() {
  try {
    const estado = await PushNotifications.checkPermissions();
    let receive = estado.receive;
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await PushNotifications.requestPermissions()).receive;
    }
    if (receive !== 'granted') return;

    // Token APNs: de momento solo lo registramos/logueamos. Enviarlo al backend
    // y mandar los avisos por APNs queda para la fase de servidor (ver guía iOS).
    PushNotifications.addListener('registration', (token) => {
      try { console.log('[APNs] token de dispositivo:', token.value); } catch { /* nada */ }
      // TODO(servidor APNs): guardar token.value asociado al usuario.
    }).catch(() => {});

    PushNotifications.addListener('registrationError', (err) => {
      try { console.warn('[APNs] error de registro:', err); } catch { /* nada */ }
    }).catch(() => {});

    // Tocar un aviso abre la ruta que venga en los datos (data.url).
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = notification?.data?.url;
      if (url) navegarSPA(url);
    }).catch(() => {});

    await PushNotifications.register();
  } catch { /* nada */ }
}

// Punto de entrada. Llamado SOLO en plataforma nativa.
export async function initNative() {
  await initStatusBarYSplash();
  initEnlacesProfundos();
  await initPush();
}

// Arranque NATIVO (solo app de iPhone/iPad vía Capacitor).
//
// IMPORTANTE: este módulo SOLO se carga cuando Capacitor.isNativePlatform() es
// true (ver src/main.jsx). En la web y en la app Android (TWA, que es Chrome y
// no Capacitor) no se ejecuta nada de aquí: cero impacto en lo que ya funciona.
//
// Pendiente de ajustar/probar EN EL MAC (Xcode + dispositivo real):
//   - Push de Apple (APNs): aquí solo se registra y se obtiene el token; falta
//     enviarlo al backend y mandar los avisos por APNs (hoy la web usa web-push).
//   - Enlaces profundos (vuelta de Redsys y enlaces del correo): el enrutado
//     básico está puesto; hay que verificar el flujo de pago en el dispositivo.
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
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
  try {
    // Texto/íconos oscuros sobre el fondo claro de la app. Ajustable en el Mac.
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch { /* algunos dispositivos no lo soportan */ }
  try {
    // La web ya está pintada: quitamos el splash nativo.
    await SplashScreen.hide();
  } catch { /* nada */ }
}

function initEnlacesProfundos() {
  // Redsys vuelve a https://padelmedina.com/... y los correos abren rutas de la
  // app: Capacitor entrega la URL aquí y la enrutamos dentro de la SPA.
  App.addListener('appUrlOpen', ({ url }) => {
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

import { Capacitor } from '@capacitor/core';
import { supabase as defaultSupabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Token del dispositivo (APNs en el iPhone, FCM en Android), para poder borrar
// su fila al cerrar sesión. La clave conserva el nombre de cuando solo había iPhone.
const CLAVE_TOKEN_APNS = 'pm-apns-token';

// Android: los avisos van por Firebase Cloud Messaging (FCM). Hasta que estén
// android-app/app/google-services.json y el envío por FCM en el servidor, la app
// de Android NO ofrece activarlos (sin Firebase el registro no funciona).
const FCM_LISTO = false;
const esAndroid = () => Capacitor.getPlatform() === 'android';
const avisosNativosDisponibles = () => !esAndroid() || FCM_LISTO;
// Cómo se guarda el dispositivo en push_subscriptions según la plataforma.
const dispositivoNativo = () => (esAndroid()
  ? { prefijo: 'fcm:', plataforma: 'android' }
  : { prefijo: 'apns:', plataforma: 'ios' });
// Último motivo por el que el iPhone NO quedó registrado (lo enseña el perfil:
// con permiso concedido pero sin registro, los avisos no llegan).
const CLAVE_FALLO = 'pm-avisos-fallo';
const guardarFallo = (motivo) => {
  try {
    if (motivo) localStorage.setItem(CLAVE_FALLO, motivo);
    else localStorage.removeItem(CLAVE_FALLO);
  } catch { /* sin almacenamiento */ }
};
export const falloAvisosNativo = () => {
  try { return localStorage.getItem(CLAVE_FALLO); } catch { return null; }
};

// Estados que ve la interfaz:
//   'activos'       → permiso concedido (el dispositivo se registra solo)
//   'pendiente'     → aún no se ha preguntado: se puede pedir con un botón
//   'bloqueados'    → el usuario los denegó: solo se cambian en los ajustes
//   'no-disponible' → este navegador no admite avisos (o falta la clave VAPID)
const ESTADO_WEB = { granted: 'activos', denied: 'bloqueados', default: 'pendiente' };
const estadoNativo = (receive) =>
  receive === 'granted' ? 'activos' : receive === 'denied' ? 'bloqueados' : 'pendiente';

const webPushDisponible = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY;

// El plugin solo existe en la app de iPhone: se carga bajo demanda para no
// meterlo en el bundle de la web.
// OJO: devuelve el MÓDULO, nunca el plugin. El plugin de Capacitor es un Proxy
// que responde a cualquier propiedad, también a `then`: si una función async lo
// devuelve (o se hace `await` sobre él), JavaScript lo toma por una promesa, llama
// a su `then` nativo, que no existe, y se queda esperando para siempre (en el
// iPhone el permiso "no respondía" por esto). Uso: const { PushNotifications } = await moduloPush();
const moduloPush = () => import('@capacitor/push-notifications');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

// Compara la applicationServerKey de una suscripción existente con la VAPID
// actual. Si coinciden, la suscripción sigue siendo válida y se reutiliza;
// si no, hay que recrearla.
function sameApplicationServerKey(existingSub, vapidKey) {
  const existingKey = existingSub?.options?.applicationServerKey;
  if (!existingKey) return false;
  const existingBytes = new Uint8Array(existingKey);
  if (existingBytes.length !== vapidKey.length) return false;
  for (let i = 0; i < vapidKey.length; i += 1) {
    if (existingBytes[i] !== vapidKey[i]) return false;
  }
  return true;
}

// ¿El servidor aún no tiene la función registrar_dispositivo_push? (despliegue a medias)
const faltaRpc = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || /registrar_dispositivo_push/.test(error?.message || '');

// Guarda el dispositivo en la BD. Una fila por endpoint: si el móvil cambia de
// cuenta, la fila pasa a la cuenta nueva (lo hace la RPC en el servidor). NO
// borramos otras filas del mismo usuario: el admin usa varios dispositivos
// (móvil + PC del club) y cada uno tiene su endpoint.
// respaldo: solo para el admin en la web. Si el servidor aún no tiene la RPC,
// tampoco tiene el send-push nuevo (que manda los avisos del club SOLO a los
// admins): un jugador registrado entonces recibiría los avisos internos con
// datos de otros clientes, así que sin la RPC los jugadores no se registran.
// Devuelve null si quedó guardado, o el motivo si no.
async function registrarDispositivo(supabase, userId, endpoint, subscription, plataforma, { respaldo = false } = {}) {
  const { error } = await supabase.rpc('registrar_dispositivo_push', {
    p_endpoint: endpoint,
    p_subscription: subscription,
    p_plataforma: plataforma,
  });
  if (!error) return null;
  if (!faltaRpc(error)) {
    console.warn('Push: no se pudo registrar el dispositivo:', error.message);
    return error.message || 'error del servidor';
  }
  if (!respaldo) {
    console.warn('Push: el servidor aún no admite avisos para jugadores; no se registra este dispositivo.');
    return 'el servidor aún no admite avisos';
  }
  // Sin la RPC (admin en la web): el upsert de siempre.
  const { error: e2 } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, subscription }, { onConflict: 'endpoint' });
  if (e2) console.warn('Push: no se pudo guardar la suscripción:', e2.message);
  return e2 ? (e2.message || 'error del servidor') : null;
}

const registrarSuscripcionWeb = (supabase, userId, subscription, opciones) => {
  const subJSON = subscription.toJSON();
  return registrarDispositivo(supabase, userId, subJSON.endpoint, subJSON, 'web', opciones);
};

// Suscripción web push de este navegador. Si ya hay una y su clave coincide con
// la VAPID actual, se reutiliza (sin unsubscribe+subscribe, que la destruía y
// recreaba en cada carga); si no, se recrea. Devuelve null si no hay permiso.
async function suscripcionWeb() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const vapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub && sameApplicationServerKey(existingSub, vapidKey)) return existingSub;

  // La clave no coincide (o no había suscripción): recreamos desde cero.
  if (existingSub) {
    await existingSub.unsubscribe();
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  });
}

export async function subscribeAdminToPush(supabase, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission === 'denied') return null;
  if (!VAPID_PUBLIC_KEY) return null;

  try {
    const subscription = await suscripcionWeb();
    if (!subscription) return null;
    await registrarSuscripcionWeb(supabase, userId, subscription, { respaldo: true });
    return subscription;
  } catch (err) {
    console.warn('Push subscription error:', err);
    return null;
  }
}

// Pide a iOS el token APNs (register). Devuelve {token} o {error} (motivo, p. ej.
// si no llega en ~10 s). Los listeners se quitan al terminar, para no
// acumularlos en cada llamada.
async function tokenAPNs(PushNotifications, ms = 10000) {
  let terminar;
  const resultado = new Promise((resolve) => { terminar = resolve; });
  const timer = setTimeout(() => terminar({
    error: 'el iPhone no ha dado su token de avisos (falta la configuración de avisos en Xcode)',
  }), ms);
  const handles = [];
  try {
    handles.push(await PushNotifications.addListener('registration', (t) => terminar(
      t?.value ? { token: t.value } : { error: 'token de avisos vacío' })));
    handles.push(await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[APNs] error de registro:', err);
      terminar({ error: `Apple: ${err?.error || err?.message || 'error de registro'}` });
    }));
    PushNotifications.register().catch((err) => {
      console.warn('[APNs] register falló:', err);
      terminar({ error: `register: ${err?.message || err}` });
    });
    return await resultado;
  } finally {
    clearTimeout(timer);
    handles.forEach((h) => { h.remove().catch(() => {}); });
  }
}

// Estado de los avisos en este dispositivo (no pide nada ni registra nada).
export async function estadoAvisos() {
  try {
    if (Capacitor.isNativePlatform()) {
      if (!avisosNativosDisponibles()) return 'no-disponible';
      // Con límite de tiempo: si el plugin no contesta, mejor decirlo que dejar
      // la pantalla esperando para siempre.
      const leer = (async () => {
        const { PushNotifications } = await moduloPush();
        return (await PushNotifications.checkPermissions()).receive;
      })();
      const limite = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('el iPhone no responde')), 3000));
      return estadoNativo(await Promise.race([leer, limite]));
    }
    if (!webPushDisponible()) return 'no-disponible';
    return ESTADO_WEB[Notification.permission] || 'pendiente';
  } catch (err) {
    console.warn('Push: no se pudo leer el permiso:', err);
    if (Capacitor.isNativePlatform()) guardarFallo(`no se puede leer el permiso de avisos (${err?.message || err})`);
    return 'no-disponible';
  }
}

// Activa los avisos de este dispositivo para el usuario y devuelve el estado
// final. Con preguntar=false es un refresco silencioso: solo registra si el
// permiso ya estaba concedido. Con preguntar=true muestra el diálogo del sistema;
// en la web hay que llamarla DENTRO del click (el navegador lo exige), por eso
// el permiso se pide antes de cualquier await. Nunca lanza.
export async function activarAvisos(supabase, userId, { preguntar = false } = {}) {
  if (Capacitor.isNativePlatform()) {
    let estado = 'no-disponible';
    if (!avisosNativosDisponibles()) return estado;
    try {
      const { PushNotifications } = await moduloPush();
      let { receive } = await PushNotifications.checkPermissions();
      if (preguntar && (receive === 'prompt' || receive === 'prompt-with-rationale')) {
        receive = (await PushNotifications.requestPermissions()).receive;
      }
      estado = estadoNativo(receive);
      if (estado !== 'activos') return estado;

      const { token, error } = await tokenAPNs(PushNotifications);
      if (!token) {
        guardarFallo(error);
        return estado;
      }
      const { prefijo, plataforma } = dispositivoNativo();
      const fallo = await registrarDispositivo(supabase, userId, `${prefijo}${token}`, { token }, plataforma);
      guardarFallo(fallo ? `el servidor no ha guardado este dispositivo (${fallo})` : null);
      if (!fallo) {
        try { localStorage.setItem(CLAVE_TOKEN_APNS, token); } catch { /* sin almacenamiento */ }
      }
    } catch (err) {
      console.warn('Push (iPhone): no se pudieron activar los avisos:', err);
      guardarFallo(String(err?.message || err));
    }
    return estado;
  }

  if (!webPushDisponible()) return 'no-disponible';
  let estado = ESTADO_WEB[Notification.permission] || 'pendiente';
  try {
    if (estado === 'pendiente' && preguntar) {
      estado = ESTADO_WEB[await Notification.requestPermission()] || 'pendiente';
    }
    if (estado !== 'activos') return estado;

    const subscription = await suscripcionWeb();
    if (subscription) await registrarSuscripcionWeb(supabase, userId, subscription);
  } catch (err) {
    console.warn('Push: no se pudieron activar los avisos:', err);
  }
  return estado;
}

// Da de baja los avisos de este dispositivo y borra su fila por endpoint.
// La usa AuthContext al cerrar sesión para no dejar suscripciones huérfanas.
// En el iPhone NO se llama a unregister si el borrado va bien: si luego entra
// otra cuenta en el mismo móvil, tiene que poder volver a registrarse con el
// mismo token.
export async function unsubscribeFromPush(client) {
  const supabase = client || defaultSupabase;

  if (Capacitor.isNativePlatform()) {
    let token = null;
    try { token = localStorage.getItem(CLAVE_TOKEN_APNS); } catch { /* sin almacenamiento */ }
    if (!token) return;
    let borrada = false;
    try {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', `${dispositivoNativo().prefijo}${token}`);
      if (error) console.warn('Push unsubscribe error:', error.message);
      else borrada = true;
    } catch (err) {
      console.warn('Push unsubscribe error:', err);
    }
    if (borrada) {
      try { localStorage.removeItem(CLAVE_TOKEN_APNS); } catch { /* sin almacenamiento */ }
      return;
    }
    // No se pudo borrar (sin red, sesión caducada...): la fila sigue a nombre de
    // esta cuenta. Último recurso: dar de baja el iPhone en Apple para que no
    // siga mostrando sus avisos con la sesión cerrada (la fila se limpiará sola
    // cuando Apple conteste que ya no existe). El próximo activarAvisos vuelve a
    // registrarlo.
    try { const { PushNotifications } = await moduloPush(); await PushNotifications.unregister(); } catch (err) {
      console.warn('Push (iPhone): no se pudo dar de baja:', err);
    }
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    if (supabase && endpoint) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } catch (err) {
    console.warn('Push unsubscribe error:', err);
  }
}

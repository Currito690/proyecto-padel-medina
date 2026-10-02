import { supabase as defaultSupabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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

// Guarda la suscripción en la BD. Una fila por endpoint (onConflict): como ahora
// reutilizamos la suscripción en vez de recrearla en cada carga, ya no se
// acumulan filas muertas del mismo navegador. NO borramos otras filas del mismo
// usuario: el admin usa varios dispositivos (móvil + PC del club) y cada uno
// tiene su endpoint; borrarlos dejaría a los demás sin avisos.
async function upsertSubscription(supabase, userId, subscription) {
  const subJSON = subscription.toJSON();
  await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: subJSON.endpoint, subscription: subJSON },
    { onConflict: 'endpoint' }
  );
}

export async function subscribeAdminToPush(supabase, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission === 'denied') return null;
  if (!VAPID_PUBLIC_KEY) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const vapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    // Si ya hay una suscripción y su clave coincide con la VAPID actual, la
    // reutilizamos: solo refrescamos la fila en la BD, sin unsubscribe+subscribe
    // (que era lo que destruía y recreaba la suscripción en cada carga).
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub && sameApplicationServerKey(existingSub, vapidKey)) {
      await upsertSubscription(supabase, userId, existingSub);
      return existingSub;
    }

    // La clave no coincide (o no había suscripción): recreamos desde cero.
    if (existingSub) {
      await existingSub.unsubscribe();
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    await upsertSubscription(supabase, userId, subscription);

    return subscription;
  } catch (err) {
    console.warn('Push subscription error:', err);
    return null;
  }
}

// Cancela la suscripción push de este dispositivo y borra su fila por endpoint.
// La usa AuthContext al cerrar sesión para no dejar suscripciones huérfanas.
export async function unsubscribeFromPush(client) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const supabase = client || defaultSupabase;
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

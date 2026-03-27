const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export async function subscribeAdminToPush(supabase, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission === 'denied') return null;
  if (!VAPID_PUBLIC_KEY) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // Limpiar suscripciones antiguas para evitar errores de key mismatch
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      await existingSub.unsubscribe();
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJSON = subscription.toJSON();
    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: subJSON.endpoint, subscription: subJSON },
      { onConflict: 'endpoint' }
    );

    return subscription;
  } catch (err) {
    console.warn('Push subscription error:', err);
    return null;
  }
}

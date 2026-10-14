// Envío a Redsys y URLs de vuelta, comunes a todos los pagos (reserva, pago
// compartido, parte del amigo, torneos).
//
// Web y app Android (TWA): EXACTAMENTE como antes — form POST en la misma pestaña
// y vuelta por redsys-redirect a la ruta de la web.
//
// App iPhone (Capacitor): su webview no deja hacer el POST a Redsys (Capacitor
// abre los dominios externos en Safari y el POST se pierde). Así que el pago se
// abre en una hoja de Safari DENTRO de la app (public/pago-redsys.html envía el
// form) y, al acabar, Redsys vuelve por redsys-redirect a public/pv.html, que
// salta a com.padelmedina.app://pago/<ruta>; native/capacitorBootstrap.js cierra
// la hoja y recarga esa ruta en la app (misma sesión).
import { ORIGEN_PUBLICO, esAppNativa } from './origen';

// DS_MERCHANT_URLOK / URLKO admiten como máximo 250 caracteres.
const MAX_URL_REDSYS = 250;

// ruta = ruta interna con su query, p. ej. '/mis-reservas?pago=ok'
export function urlVueltaRedsys(ruta) {
  // En iPhone la ruta va en el FRAGMENTO de pv.html (#/ruta): así solo se
  // codifica una vez; en ?r= se codificaría dos veces y la vuelta del torneo
  // pasaría del límite de Redsys.
  const destino = esAppNativa()
    ? `${ORIGEN_PUBLICO}/pv.html#${ruta}`
    : `${window.location.origin}${ruta}`;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-redirect?to=${encodeURIComponent(destino)}`;
  if (esAppNativa() && url.length > MAX_URL_REDSYS) {
    // Mejor fallar aquí (antes de cobrar) que a mitad del pago en Redsys.
    throw new Error('La dirección de vuelta del pago es demasiado larga');
  }
  return url;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// data = respuesta de redsys-create ({ redsysUrl, Ds_MerchantParameters, Ds_Signature }).
// rutaKo = a dónde ir si el pago no se completó.
// En iPhone, si la hoja del pago se cierra con «Listo» sin volver por pv.html
// (p. ej. pagó y pulsó «Listo» en el recibo en vez de «Continuar»), NO se da por
// cancelado a ciegas: se pregunta al servidor con comprobarPagado() durante unos
// segundos (el aviso de Redsys llega en segundos) y se va a rutaOk si entró.
export async function enviarARedsys(data, rutaKo = '/', { rutaOk, comprobarPagado } = {}) {
  if (esAppNativa()) {
    const { Browser } = await import('@capacitor/browser');
    // Los datos van en el fragmento (#): no llegan a los logs del servidor.
    const frag = new URLSearchParams({
      u: data.redsysUrl,
      v: 'HMAC_SHA256_V1',
      p: data.Ds_MerchantParameters,
      s: data.Ds_Signature,
    }).toString();
    window.__pmVueltaPago = false;
    // Solo salta con «Listo»: la vuelta normal cierra la hoja con Browser.close(),
    // que no lo dispara (y además marca __pmVueltaPago).
    const h = await Browser.addListener('browserFinished', async () => {
      h.remove();
      if (window.__pmVueltaPago) return;
      if (rutaOk && comprobarPagado) {
        for (let i = 0; i < 5; i++) {
          try {
            if (await comprobarPagado()) { window.location.replace(rutaOk); return; }
          } catch { /* sin red: se reintenta */ }
          await esperar(2000);
        }
      }
      window.location.replace(rutaKo);
    });
    try {
      await Browser.open({ url: `${ORIGEN_PUBLICO}/pago-redsys.html#${frag}`, presentationStyle: 'fullscreen' });
    } catch (e) {
      h.remove();
      throw e;
    }
    return;
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = data.redsysUrl;
  [
    ['Ds_SignatureVersion', 'HMAC_SHA256_V1'],
    ['Ds_MerchantParameters', data.Ds_MerchantParameters],
    ['Ds_Signature', data.Ds_Signature],
  ].forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

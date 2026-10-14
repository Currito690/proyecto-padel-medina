// Envío a Redsys y vuelta, comunes a todos los pagos (reserva, pago compartido,
// parte del amigo, torneos).
//
// Web y app Android (TWA): EXACTAMENTE como antes — form POST en la misma pestaña
// y vuelta por redsys-redirect a la ruta de la web.
//
// App iPhone (Capacitor): su webview no deja hacer el POST a Redsys (Capacitor
// manda los dominios externos a Safari y el POST se pierde). Así que la pasarela
// se abre en una PANTALLA DE PAGO PROPIA de la app (@capacitor/inappbrowser, sin
// barra de direcciones): public/pago-redsys.html envía el form y, al acabar,
// Redsys vuelve por redsys-redirect a public/pv.html?r=ok|ko. La app detecta esa
// página, cierra la pantalla de pago y abre la ruta OK o KO dentro de la app
// (misma sesión). No hace falta ningún esquema de URL propio.
import { ORIGEN_PUBLICO, esAppNativa } from './origen';

const fnRedirect = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redsys-redirect`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// URLs de vuelta para redsys-create (DS_MERCHANT_URLOK / URLKO).
// rutaOk / rutaKo = rutas internas con su query, p. ej. '/mis-reservas?pago=ok'.
export function urlsVueltaRedsys(rutaOk, rutaKo) {
  if (esAppNativa()) {
    // En iPhone la app ya sabe a qué ruta ir: solo hace falta distinguir OK/KO.
    return {
      successUrl: `${fnRedirect()}?to=${encodeURIComponent(`${ORIGEN_PUBLICO}/pv.html?r=ok`)}`,
      failUrl: `${fnRedirect()}?to=${encodeURIComponent(`${ORIGEN_PUBLICO}/pv.html?r=ko`)}`,
    };
  }
  return {
    successUrl: `${fnRedirect()}?to=${encodeURIComponent(`${window.location.origin}${rutaOk}`)}`,
    failUrl: `${fnRedirect()}?to=${encodeURIComponent(`${window.location.origin}${rutaKo}`)}`,
  };
}

// data = respuesta de redsys-create ({ redsysUrl, Ds_MerchantParameters, Ds_Signature }).
// En iPhone, si se cierra la pantalla de pago sin que Redsys vuelva (p. ej. pagó y
// cerró en el recibo), NO se da por cancelado a ciegas: se pregunta al servidor
// con comprobarPagado() unos segundos (el aviso de Redsys llega en segundos).
export async function enviarARedsys(data, { rutaOk = '/', rutaKo = '/', comprobarPagado } = {}) {
  if (esAppNativa()) {
    const { InAppBrowser, DefaultWebViewOptions, ToolbarPosition, iOSViewStyle } = await import('@capacitor/inappbrowser');
    // Los datos van en el fragmento (#): no llegan a los logs del servidor.
    const frag = new URLSearchParams({
      u: data.redsysUrl,
      v: 'HMAC_SHA256_V1',
      p: data.Ds_MerchantParameters,
      s: data.Ds_Signature,
    }).toString();

    let terminado = false;
    const handles = [];
    const quitarAvisos = () => handles.forEach((h) => { try { h.remove(); } catch { /* nada */ } });
    const ir = (ruta) => { quitarAvisos(); window.location.replace(ruta); };

    // Redsys ha vuelto (pv.html?r=ok|ko): cerramos la pantalla de pago y seguimos en la app.
    handles.push(await InAppBrowser.addListener('browserPageNavigationCompleted', async (e) => {
      if (terminado || !e?.url) return;
      let u;
      try { u = new URL(e.url); } catch { return; }
      if (u.origin !== ORIGEN_PUBLICO || u.pathname !== '/pv.html') return;
      terminado = true;
      try { await InAppBrowser.close(); } catch { /* ya estaba cerrada */ }
      ir(u.searchParams.get('r') === 'ok' ? rutaOk : rutaKo);
    }));

    // Cerró la pantalla de pago («Cerrar») sin que Redsys volviera.
    handles.push(await InAppBrowser.addListener('browserClosed', async () => {
      if (terminado) return;
      terminado = true;
      if (comprobarPagado) {
        for (let i = 0; i < 5; i++) {
          try {
            if (await comprobarPagado()) { ir(rutaOk); return; }
          } catch { /* sin red: se reintenta */ }
          await esperar(2000);
        }
      }
      ir(rutaKo);
    }));

    try {
      await InAppBrowser.openInWebView({
        url: `${ORIGEN_PUBLICO}/pago-redsys.html#${frag}`,
        options: {
          ...DefaultWebViewOptions,
          showURL: false,               // sin barra de direcciones
          showToolbar: true,
          showNavigationButtons: false,
          closeButtonText: 'Cerrar',
          toolbarPosition: ToolbarPosition.TOP,
          clearCache: false,            // no tocar cookies ni sesión de nada
          clearSessionCache: false,
          iOS: {
            ...DefaultWebViewOptions.iOS,
            viewStyle: iOSViewStyle.FULL_SCREEN,
            allowOverScroll: false,
            allowsBackForwardNavigationGestures: false,
          },
        },
      });
    } catch (e) {
      quitarAvisos();
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

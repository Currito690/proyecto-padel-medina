// ¿Hay en el servidor una versión de la web más nueva que la que tiene
// cargada esta pestaña? (14/11/2026)
//
// Una pestaña del panel abierta desde antes de un despliegue sigue con el
// código viejo hasta que se recarga, y el 13/11 una así pisó el torneo. Aquí
// se compara el script principal de esta página (lleva un hash en el nombre:
// /assets/index-XXXX.js) con el del index.html que sirve ahora el servidor.
// Si son distintos hay versión nueva, y la pestaña se recarga sola cuando es
// seguro: al volver a ella, o tras un rato sin tocarla y sin estar
// escribiendo, y siempre después de terminar lo que se esté guardando
// (registrarTrabajoPendiente).
//
// Solo en la web publicada: en local (vite) no hay /assets/index-*.js, y en la
// app de las tiendas el index.html va dentro de la app (no cambia sin
// actualizarla).
//
// Ojo: no se usa un version.json porque el service worker (public/sw.js)
// guarda los .json y los sirve de su copia; el index.html no lo guarda.

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const trabajos = new Set();

// Algo que hay que terminar antes de recargar (p. ej. el guardado del
// torneo). fn devuelve una promesa. Devuelve la función que lo quita.
export const registrarTrabajoPendiente = (fn) => {
  trabajos.add(fn);
  return () => { trabajos.delete(fn); };
};

const RE_SCRIPT = /\/assets\/index-[\w-]+\.js$/;
const rutaDe = (src) => {
  try { return new URL(src, window.location.href).pathname; } catch { return null; }
};

// Ruta del script principal que tiene cargado esta pestaña.
export const scriptCargado = () => {
  const el = [...document.querySelectorAll('script[type="module"][src]')]
    .find((s) => RE_SCRIPT.test(rutaDe(s.getAttribute('src')) || ''));
  return el ? rutaDe(el.getAttribute('src')) : null;
};

// Ruta del script principal del index.html que sirve ahora el servidor, o
// null si no se sabe.
export const scriptDelServidor = async () => {
  const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/<script\b[^>]*\bsrc="([^"]*\/assets\/index-[\w-]+\.js)"/);
  return m ? rutaDe(m[1]) : null;
};

const puedeVigilar = () => import.meta.env.PROD
  && typeof window !== 'undefined'
  && !Capacitor.isNativePlatform();

// Para no recargar en bucle si, tras recargar, esta pestaña siguiera con la
// versión vieja (p. ej. por una caché intermedia): una vez por versión cada
// 10 minutos.
const CLAVE = 'pm_recarga_version';
const yaSeIntento = (objetivo) => {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    return !!v && v.objetivo === objetivo && Date.now() - v.t < 10 * 60 * 1000;
  } catch {
    return false;
  }
};

let recargando = false;
// Termina lo pendiente (como mucho 15 s) y recarga.
export const recargarCuandoSeaSeguro = async (objetivo) => {
  if (recargando) return;
  recargando = true;
  const pendientes = Promise.allSettled([...trabajos].map((fn) => Promise.resolve().then(fn)));
  await Promise.race([pendientes, new Promise((r) => setTimeout(r, 15000))]);
  try { sessionStorage.setItem(CLAVE, JSON.stringify({ objetivo, t: Date.now() })); } catch { /* sin sessionStorage */ }
  window.location.reload();
};

const escribiendo = () => {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

// Vigila si hay versión nueva. Devuelve { nueva, recargar }.
//   cadaMs: cada cuánto se mira (además de al volver a la pestaña).
//   inactivoMs: tiempo sin tocar la pantalla tras el que se recarga sola.
export const useVersionNueva = ({ cadaMs = 5 * 60 * 1000, inactivoMs = 3 * 60 * 1000 } = {}) => {
  const [nueva, setNueva] = useState(null); // ruta del script nuevo, o null
  const objetivoRef = useRef(null);
  useEffect(() => {
    if (!puedeVigilar()) return undefined;
    const actual = scriptCargado();
    if (!actual) return undefined;
    let vivo = true;
    let ultimaComprobacion = 0;
    let ultimaActividad = Date.now();
    const comprobar = async (minimoMs = 30000) => {
      if (objetivoRef.current || Date.now() - ultimaComprobacion < minimoMs) return;
      ultimaComprobacion = Date.now();
      try {
        const delServidor = await scriptDelServidor();
        if (!vivo || !delServidor || delServidor === actual) return;
        objetivoRef.current = delServidor;
        setNueva(delServidor);
      } catch {
        // Sin conexión: ya se mirará.
      }
    };
    const intentarRecarga = () => {
      const objetivo = objetivoRef.current;
      if (objetivo && !yaSeIntento(objetivo)) recargarCuandoSeaSeguro(objetivo);
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState !== 'visible') return;
      if (objetivoRef.current) intentarRecarga();
      else comprobar();
    };
    const alEnfocar = () => { comprobar(); };
    const actividad = () => { ultimaActividad = Date.now(); };
    const reloj = setInterval(() => {
      if (!objetivoRef.current) { comprobar(cadaMs); return; }
      if (document.visibilityState === 'visible' && Date.now() - ultimaActividad > inactivoMs && !escribiendo()) intentarRecarga();
    }, 30000);
    const primera = setTimeout(() => comprobar(0), 20000);
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('focus', alEnfocar);
    eventos.forEach((ev) => window.addEventListener(ev, actividad, { passive: true }));
    return () => {
      vivo = false;
      clearInterval(reloj);
      clearTimeout(primera);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('focus', alEnfocar);
      eventos.forEach((ev) => window.removeEventListener(ev, actividad));
    };
  }, [cadaMs, inactivoMs]);
  return { nueva: !!nueva, recargar: () => recargarCuandoSeaSeguro(nueva) };
};

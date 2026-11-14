// ¿Hay en el servidor una versión de la web más nueva que la que tiene
// cargada esta pestaña? (14/11/2026)
//
// Una pestaña del panel abierta desde antes de un despliegue sigue con el
// código viejo hasta que se recarga, y el 13/11 una así pisó el torneo. Aquí
// se compara el script principal de esta página (lleva un hash en el nombre:
// /assets/index-XXXX.js) con el del index.html que sirve ahora el servidor.
//
// Si hay versión nueva, la pestaña se recarga sola, pero solo cuando es
// seguro: lleva un rato en segundo plano (nadie la está usando), no hay
// ningún campo con el cursor y todo lo registrado con registrarTrabajoPendiente
// (el guardado del torneo) dice que está guardado y que no hay nada a medias.
// Si algo no está guardado, NO se recarga: se vuelve a intentar más tarde.
// Con la pestaña a la vista nunca se recarga sola: sale un aviso con el botón.
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

// Algo que hay que terminar antes de recargar. fn({ manual }) devuelve una
// promesa con true si todo está guardado y se puede recargar, o false si no
// (cambios sin guardar, algo a medias). manual = el admin ha pulsado el botón.
// Devuelve la función que lo quita.
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

const escribiendo = () => {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

let recargando = false;
// Termina lo pendiente y recarga, solo si todo dice que está guardado (como
// mucho espera 60 s; si no, no recarga). Devuelve true si recarga.
export const recargarCuandoSeaSeguro = async (objetivo, { manual = false } = {}) => {
  if (recargando) return false;
  recargando = true;
  try {
    const todos = Promise.all([...trabajos].map((fn) => Promise.resolve()
      .then(() => fn({ manual }))
      .catch(() => false)));
    const plazo = new Promise((r) => { setTimeout(() => r(null), 60000); });
    const res = await Promise.race([todos, plazo]);
    if (!res || res.some((ok) => ok === false)) return false;
    if (!manual && (document.visibilityState !== 'hidden' || escribiendo())) return false;
    try { sessionStorage.setItem(CLAVE, JSON.stringify({ objetivo, t: Date.now() })); } catch { /* sin sessionStorage */ }
    window.location.reload();
    return true;
  } finally {
    recargando = false;
  }
};

// Vigila si hay versión nueva. Devuelve { nueva, recargar, noSePudo }.
//   cadaMs: cada cuánto se mira (además de al volver a la pestaña).
//   ocultaMs: tiempo en segundo plano tras el que se recarga sola.
export const useVersionNueva = ({ cadaMs = 5 * 60 * 1000, ocultaMs = 60 * 1000 } = {}) => {
  const [nueva, setNueva] = useState(null); // ruta del script nuevo, o null
  const [noSePudo, setNoSePudo] = useState(false);
  const objetivoRef = useRef(null);
  useEffect(() => {
    if (!puedeVigilar()) return undefined;
    const actual = scriptCargado();
    if (!actual) return undefined;
    let vivo = true;
    let ultimaComprobacion = 0;
    let ocultaDesde = document.visibilityState === 'hidden' ? Date.now() : null;
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
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        ocultaDesde = Date.now();
        return;
      }
      ocultaDesde = null;
      comprobar();
    };
    const alEnfocar = () => { comprobar(); };
    const reloj = setInterval(() => {
      const objetivo = objetivoRef.current;
      if (!objetivo) { comprobar(cadaMs); return; }
      if (document.visibilityState === 'hidden' && ocultaDesde && Date.now() - ocultaDesde >= ocultaMs && !yaSeIntento(objetivo)) {
        recargarCuandoSeaSeguro(objetivo);
      }
    }, 30000);
    const primera = setTimeout(() => comprobar(0), 20000);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('focus', alEnfocar);
    return () => {
      vivo = false;
      clearInterval(reloj);
      clearTimeout(primera);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('focus', alEnfocar);
    };
  }, [cadaMs, ocultaMs]);
  const recargar = async () => {
    setNoSePudo(false);
    const ok = await recargarCuandoSeaSeguro(nueva, { manual: true });
    if (!ok) setNoSePudo(true);
  };
  return { nueva: !!nueva, recargar, noSePudo };
};

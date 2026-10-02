import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { startServerTimeSync } from './utils/serverTime'
import { registrarDesdeUrl } from './utils/gpsNativo'

// Capturamos el hash de la URL de forma SÍNCRONA al arrancar, ANTES de que
// supabase (detectSessionInUrl) lo borre durante su inicialización asíncrona.
// La página de recuperar contraseña lo necesita para saber que venimos de un
// enlace de recuperación válido (y no de una sesión normal ya abierta).
try {
  const h = window.location.hash || '';
  window.__pmAuthHash = {
    recovery: /type=recovery/.test(h) && /access_token=/.test(h),
    error: /[#&?]error(_code)?=/.test(h),
  };
} catch { /* sin window: nada */ }

// Sincroniza la hora con el servidor (Supabase Date header). Necesario para
// que las comprobaciones de plazo, orden cronológico, etc. no dependan del
// reloj del navegador (que el usuario puede tener mal).
startServerTimeSync();

// La app Android arranca con ?gpsnativo=1: a partir de ahí la ubicación del
// fichaje se pide a la app y no a Chrome. Hay que leerlo antes de que el
// enrutador limpie la URL.
registrarDesdeUrl();

if ('serviceWorker' in navigator) {
  // ¿Había ya un SW controlando la página en este arranque? En la primera
  // visita no lo hay: el primer controllerchange es la activación inicial y NO
  // debe recargar (perdería formularios a medio rellenar). Solo recargamos
  // cuando un deploy nuevo releva a un SW que ya controlaba la página.
  const teniaControlador = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Cuando el usuario vuelve a la pestaña (Ej: tras estar en otra app),
    // pedimos al browser que compruebe si hay un SW nuevo. Si lo hay y
    // cambia el controller, el listener de abajo recarga la página.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(console.warn);

  // Si el SW activo cambia (= deploy nuevo + skipWaiting + clients.claim),
  // recarga la página automáticamente para que el usuario obtenga el JS/CSS
  // actualizado sin tener que hacer Ctrl+Shift+R. Solo recarga una vez para
  // evitar bucles, y solo si ya había un controlador (no en la primera visita).
  let _swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControlador) return;
    if (_swReloaded) return;
    _swReloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Eliminar el loader inicial en el primer frame que React pinta
// (antes se hacía en window.load que espera TODOS los recursos — mucho más tarde)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.style.transition = 'opacity 0.15s';
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 150);
    }
  });
});

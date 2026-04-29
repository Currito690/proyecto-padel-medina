import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'

if ('serviceWorker' in navigator) {
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
  // evitar bucles si algo va mal.
  let _swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swReloaded) return;
    _swReloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
      <AuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>
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

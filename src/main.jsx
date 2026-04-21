import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.warn);
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

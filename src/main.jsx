import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.warn);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  </StrictMode>,
)

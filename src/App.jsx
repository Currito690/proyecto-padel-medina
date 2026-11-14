import { useEffect, Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './context/AuthContext';
import { supabase } from './services/supabase';
import { subscribeAdminToPush, activarAvisos } from './services/pushNotifications';
import { metaDeRuta, aplicarMeta } from './utils/metaRuta';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import TelefonoObligatorio from './components/TelefonoObligatorio';

const BookingDashboard = lazy(() => import('./pages/BookingDashboard'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Login = lazy(() => import('./pages/Login'));
const PaymentGateway = lazy(() => import('./pages/PaymentGateway'));
const TournamentRegistration = lazy(() => import('./pages/TournamentRegistration'));
const TournamentBracket = lazy(() => import('./pages/TournamentBracket'));
const Cart = lazy(() => import('./pages/Cart'));
const SharedPayment = lazy(() => import('./pages/SharedPayment'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const LegalNotice = lazy(() => import('./pages/LegalNotice'));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const MonitorView = lazy(() => import('./pages/MonitorView'));
const Inicio = lazy(() => import('./pages/Inicio'));

// Pantallas sueltas (sin la cabecera de MainLayout): en la app de iPhone la web
// llega hasta el borde de arriba, así que les damos el margen de la zona de la
// hora/batería para que nada quede tapado. En web/Android env() vale 0.
const SafeTop = ({ children }) => (
  <div style={{ paddingTop: 'var(--sa-top)' }}>{children}</div>
);

// Color de los iconos de la barra de estado (hora/batería) en la app nativa:
// blancos sobre la cabecera azul del login; oscuros sobre las cabeceras blancas
// del resto de la app.
const StatusBarSync = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: pathname === '/login' ? Style.Dark : Style.Light }))
      .catch(() => {});
  }, [pathname]);
  return null;
};

// Título, descripción y canónica de cada página (lo que lee Google).
const MetaRuta = () => {
  const { pathname } = useLocation();
  useEffect(() => { aplicarMeta(metaDeRuta(pathname)); }, [pathname]);
  return null;
};

const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-bg-elevated)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  const { user, loading } = useAuth();
  const [maintenancePassword, setMaintenancePassword] = useState('');
  const [maintenanceUnlocked, setMaintenanceUnlocked] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState(false);
  const [maintenanceShake, setMaintenanceShake] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    // Admin en la web: registramos/refrescamos su suscripción push (pide permiso
    // al cargar, como siempre). El aviso "Nueva reserva" lo manda cada ruta de
    // reserva por su cuenta; disparar aquí desde el canal Realtime duplicaba
    // avisos (y avisaba de holds sin pagar y de las propias reservas del admin),
    // así que se ha quitado.
    if (user.role === 'admin' && !Capacitor.isNativePlatform()) {
      subscribeAdminToPush(supabase, user.id);
      return;
    }

    // Admin en el iPhone: igual que en la web, se pide el permiso al entrar (no
    // ve Mis reservas ni el perfil, donde está el botón "Activar avisos").
    // Resto (jugadores en web/Android y en iPhone): refresco silencioso. Solo
    // registra el dispositivo si ya dio permiso; nunca muestra el diálogo (eso
    // lo hace el botón "Activar avisos" de Mis reservas o del perfil).
    activarAvisos(supabase, user.id, { preguntar: user.role === 'admin' });
    // El rol se afina en segundo plano (AuthContext): al cambiar, se repite.
  }, [user?.id, user?.role]);

  // === MODO MANTENIMIENTO ===
  const MAINTENANCE_MODE = false;
  const MAINTENANCE_PASSWORD = 'Ivan2013';

  const handleMaintenanceSubmit = (e) => {
    e.preventDefault();
    if (maintenancePassword === MAINTENANCE_PASSWORD) {
      setMaintenanceUnlocked(true);
      setMaintenanceError(false);
    } else {
      setMaintenanceError(true);
      setMaintenanceShake(true);
      setMaintenancePassword('');
      setTimeout(() => setMaintenanceShake(false), 600);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Cargando...</p>
      </div>
    );
  }

  if (MAINTENANCE_MODE && user?.role !== 'admin' && !maintenanceUnlocked) {
    return (
      <>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-10px); }
            40% { transform: translateX(10px); }
            60% { transform: translateX(-8px); }
            80% { transform: translateX(8px); }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .maintenance-card {
            animation: fadeInUp 0.5s ease forwards;
          }
          .maintenance-input:focus {
            outline: none;
            border-color: #3B82F6 !important;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important;
          }
          .maintenance-btn:hover {
            background: linear-gradient(90deg, #2563EB, #7C3AED) !important;
            transform: translateY(-1px);
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4) !important;
          }
          .maintenance-btn:active {
            transform: translateY(0);
          }
        `}</style>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#fff',
          textAlign: 'center',
          padding: '2rem',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div className="maintenance-card" style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '1.5rem',
            padding: '3rem 2.5rem',
            maxWidth: '420px',
            width: '100%',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4)'
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>🚧</div>
            <h1 style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              marginBottom: '0.5rem',
              background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>Página en desarrollo</h1>
            <p style={{
              fontSize: '0.95rem',
              color: '#94A3B8',
              marginBottom: '2rem',
              lineHeight: 1.6
            }}>
              Estamos trabajando para ofrecerte la mejor experiencia. Vuelve pronto.
            </p>

            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: '1.75rem',
              marginTop: '0.5rem'
            }}>
              <p style={{
                fontSize: '0.85rem',
                color: '#64748B',
                marginBottom: '1rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontWeight: 600
              }}>Acceso privado</p>
              <form
                onSubmit={handleMaintenanceSubmit}
                style={{
                  animation: maintenanceShake ? 'shake 0.6s ease' : 'none'
                }}
              >
                <input
                  id="maintenance-password-input"
                  type="password"
                  className="maintenance-input"
                  placeholder="Introduce la contraseña"
                  value={maintenancePassword}
                  onChange={(e) => {
                    setMaintenancePassword(e.target.value);
                    setMaintenanceError(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.85rem 1rem',
                    borderRadius: '0.75rem',
                    border: maintenanceError ? '1px solid #EF4444' : '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.07)',
                    color: '#fff',
                    fontSize: '1rem',
                    marginBottom: '0.75rem',
                    transition: 'border-color 0.25s, box-shadow 0.25s',
                    boxSizing: 'border-box'
                  }}
                />
                {maintenanceError && (
                  <p style={{
                    color: '#EF4444',
                    fontSize: '0.82rem',
                    marginBottom: '0.75rem',
                    textAlign: 'left'
                  }}>Contraseña incorrecta. Inténtalo de nuevo.</p>
                )}
                <button
                  type="submit"
                  id="maintenance-submit-btn"
                  className="maintenance-btn"
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)'
                  }}
                >
                  Entrar
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="app-container">
      <StatusBarSync />
      <MetaRuta />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
          <Route path="/torneos/:id" element={<SafeTop><TournamentRegistration /></SafeTop>} />
          <Route path="/torneos/:id/cuadro" element={<SafeTop><TournamentBracket /></SafeTop>} />
          <Route path="/pago-compartido" element={<SafeTop><SharedPayment /></SafeTop>} />
          <Route path="/privacidad" element={<SafeTop><PrivacyPolicy /></SafeTop>} />
          <Route path="/aviso-legal" element={<SafeTop><LegalNotice /></SafeTop>} />
          <Route path="/eliminar-cuenta" element={<SafeTop><DeleteAccount /></SafeTop>} />
          <Route path="/reset-password" element={<SafeTop><ResetPassword /></SafeTop>} />

          {/* Admin Routes */}
          {user?.role === 'admin' && (
            <Route path="/*" element={<AdminDashboard />} />
          )}

          {/* Monitor (solo lectura: agenda de pistas ocupadas) */}
          {user?.role === 'monitor' && (
            <Route path="/*" element={<MonitorView />} />
          )}

          {/* Client Routes - No Layout */}
          {user?.role === 'client' && (
            <Route path="/checkout" element={<SafeTop><PaymentGateway /></SafeTop>} />
          )}

          {/* Client Routes - With Layout */}
          {user?.role === 'client' && (
            <Route element={<MainLayout />}>
              <Route path="/" element={<BookingDashboard />} />
              <Route path="/torneos" element={<Tournaments />} />
              <Route path="/carrito" element={<Cart />} />
              <Route path="/mis-reservas" element={<MyBookings />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}

          {/* Portada pública del club (solo en la web: es lo que ve Google). En
              las apps, sin sesión se va directo a /login como siempre. */}
          {!user && !Capacitor.isNativePlatform() && (
            <Route path="/" element={<Inicio />} />
          )}

          {/* Catch-all fallback */}
          {!user && (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </Suspense>
      {/* Jugador sin teléfono válido en su ficha: ventana que tapa toda la app
          hasta que lo guarde (el club lo quiere obligatorio). */}
      {user?.role === 'client' && <TelefonoObligatorio />}
      </ErrorBoundary>
      {/* El banner "Instala Padel Medina" es para la web en el móvil. En la app
          de iPhone/Android ya está instalada: allí el WebView parece Safari y el
          banner pedía "Compartir > Añadir a pantalla de inicio". */}
      {!Capacitor.isNativePlatform() && <InstallPrompt />}
    </div>
  );
}

export default App;

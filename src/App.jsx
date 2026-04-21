import { useEffect, Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { supabase } from './services/supabase';
import { subscribeAdminToPush } from './services/pushNotifications';
import MainLayout from './components/layout/MainLayout';

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
const Tournaments = lazy(() => import('./pages/Tournaments'));

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
    if (user?.role !== 'admin') return;

    subscribeAdminToPush(supabase, user.id);

    const triggerPush = async (title, body) => {
      await supabase.functions.invoke('send-push', {
        body: { title, body, url: '/admin' },
        headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY }
      });
    };

    const channel = supabase.channel('admin-push-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => {
        triggerPush('Nueva reserva', `Se ha realizado una nueva reserva`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
          <Route path="/torneos/:id" element={<TournamentRegistration />} />
          <Route path="/torneos/:id/cuadro" element={<TournamentBracket />} />
          <Route path="/pago-compartido" element={<SharedPayment />} />
          <Route path="/privacidad" element={<PrivacyPolicy />} />

          {/* Admin Routes */}
          {user?.role === 'admin' && (
            <Route path="/*" element={<AdminDashboard />} />
          )}

          {/* Client Routes - No Layout */}
          {user?.role === 'client' && (
            <Route path="/checkout" element={<PaymentGateway />} />
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

          {/* Catch-all fallback */}
          {!user && (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;

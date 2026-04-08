import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { supabase } from './services/supabase';
import { subscribeAdminToPush } from './services/pushNotifications';
import MainLayout from './components/layout/MainLayout';

const BookingDashboard = lazy(() => import('./pages/BookingDashboard'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
import Login from './pages/Login';
import PaymentGateway from './pages/PaymentGateway';
import TournamentRegistration from './pages/TournamentRegistration';

const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-bg-elevated)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  const { user, loading } = useAuth();

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
  const MAINTENANCE_MODE = true;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Cargando...</p>
      </div>
    );
  }

  if (MAINTENANCE_MODE && user?.role !== 'admin') {
    return (
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
        <div style={{
          fontSize: '4rem',
          marginBottom: '1.5rem'
        }}>🚧</div>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 800,
          marginBottom: '1rem',
          background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>Página en desarrollo</h1>
        <p style={{
          fontSize: '1.1rem',
          color: '#94A3B8',
          maxWidth: '400px',
          lineHeight: 1.6
        }}>
          Estamos trabajando para ofrecerte la mejor experiencia. Vuelve pronto.
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Route */}
          <Route
            path="/login"
            element={!user ? <Login /> : <Navigate to="/" replace />}
          />
          <Route path="/torneos/:id" element={<TournamentRegistration />} />

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

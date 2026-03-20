import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import BookingDashboard from './pages/BookingDashboard';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import PaymentGateway from './pages/PaymentGateway';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Routes>
        {/* Public Route */}
        <Route 
          path="/login" 
          element={!user ? <Login /> : <Navigate to="/" replace />} 
        />
        
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
    </div>
  );
}

export default App;

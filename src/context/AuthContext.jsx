import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

const ADMIN_EMAILS = ['admin@padelmedina.com'];

// Construye el objeto user desde los datos de sesión (sin red, instantáneo)
const buildUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.user_metadata?.name || u.email.split('@')[0],
  role: ADMIN_EMAILS.includes(u.email) ? 'admin' : 'client',
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    const finish = (sessionUser) => {
      if (settled) return;
      settled = true;
      setUser(sessionUser ? buildUser(sessionUser) : null);
      setLoading(false);
    };

    // Timeout de seguridad: si nada responde en 5s, desbloquea la app
    const timeout = setTimeout(() => finish(null), 5000);

    // Obtiene sesión de localStorage (rápido, sin red en la mayoría de casos)
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        finish(session?.user ?? null);
      })
      .catch(() => {
        clearTimeout(timeout);
        finish(null);
      });

    // Escucha cambios: login, logout, refresco de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      setUser(session?.user ? buildUser(session.user) : null);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const sendOtpCode = async (email, name) => {
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { 
        data: { name: name || '' },
        shouldCreateUser: true
      } 
    });
    if (error) throw error;
  };

  const verifyOtpCode = async (email, code) => {
    const { error, data } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#94A3B8', fontWeight: 600, margin: 0 }}>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, sendOtpCode, verifyOtpCode, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

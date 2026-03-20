import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

const ADMIN_EMAILS = ['admin@padelmedina.com'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (authUser) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    const role = profile?.role
      || (ADMIN_EMAILS.includes(authUser.email) ? 'admin' : 'client');

    setUser({
      id: authUser.id,
      email: authUser.email,
      name: profile?.name || authUser.user_metadata?.name || authUser.email.split('@')[0],
      role,
    });
  };

  useEffect(() => {
    // Carga inicial: lee la sesión de localStorage, no necesita red
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) await fetchProfile(session.user);
        else setUser(null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    // Escucha cambios posteriores: login, logout, refresco de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return; // ya lo maneja getSession
      try {
        if (session?.user) await fetchProfile(session.user);
        else setUser(null);
      } catch {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const loginWithEmail = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signupWithEmail = async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
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
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithEmail, signupWithEmail, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

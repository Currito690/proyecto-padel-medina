import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

// Fallback: el admin original sigue reconociéndose por email aunque el fetch
// a profiles.role falle (problemas de red, RLS mal aplicado, etc.).
const LEGACY_ADMIN_EMAILS = ['admin@padelmedina.com'];

const buildUser = (u, role) => ({
  id: u.id,
  email: u.email,
  name: u.user_metadata?.name || u.email.split('@')[0],
  role: role || (LEGACY_ADMIN_EMAILS.includes(u.email) ? 'admin' : 'client'),
});

// Consulta profiles.role del usuario logeado. Si falla o no existe devuelve null.
const fetchRole = async (userId) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    return data?.role || null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    let cancelled = false;

    const finish = async (sessionUser) => {
      if (settled) return;
      settled = true;
      if (!sessionUser) {
        setUser(null);
      } else {
        const role = await fetchRole(sessionUser.id);
        if (!cancelled) setUser(buildUser(sessionUser, role));
      }
      if (!cancelled) setLoading(false);
    };

    const timeout = setTimeout(() => finish(null), 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        const supaUser = session?.user;
        // Solo restaurar sesión si el email está verificado
        finish(supaUser?.email_confirmed_at ? supaUser : null);
      })
      .catch(() => {
        clearTimeout(timeout);
        finish(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return;
      const supaUser = session?.user;
      // Solo loguear si el email está verificado
      if (supaUser && !supaUser.email_confirmed_at) {
        setUser(null);
        return;
      }
      if (!supaUser) {
        setUser(null);
        return;
      }
      const role = await fetchRole(supaUser.id);
      if (!cancelled) setUser(buildUser(supaUser, role));
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Login con Google
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  // Login con email + contraseña
  const loginWithPassword = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // Registro: crea el usuario y envía email de verificación con código OTP
  const signupWithEmail = async (email, password, name, phone) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name || '', phone: phone || '' },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;

    // Guardamos el teléfono en profiles si el usuario ya existe (upsert seguro)
    // El trigger de Supabase crea el perfil; actualizamos teléfono aquí tras verificación
  };

  // Verificar código OTP de registro
  const verifySignupOtp = async (email, token) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    if (error) throw error;
  };

  // Logout
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
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithPassword, signupWithEmail, verifySignupOtp, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

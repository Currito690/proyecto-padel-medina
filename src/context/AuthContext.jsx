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

// Consulta profiles.role del usuario logeado. Nunca lanza; si falla/tarda,
// devuelve null y el caller cae al fallback por email. Timeout de 2.5s para
// no bloquear la UI si la red va lenta o RLS no está bien configurada.
const fetchRole = async (userId) => {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 2500);
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .abortSignal(controller.signal)
      .maybeSingle();
    clearTimeout(tid);
    return data?.role || null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Resuelve el rol en segundo plano SIN bloquear el render. El login ya
    // muestra al usuario con el rol del fallback (email) y lo sobrescribe
    // después si profiles devuelve otra cosa.
    const applyUser = (sessionUser) => {
      if (!sessionUser) {
        if (!cancelled) setUser(null);
        return;
      }
      // 1) Pinta el usuario inmediatamente con rol por fallback.
      if (!cancelled) setUser(buildUser(sessionUser, null));
      // 2) Refina el rol con profiles.role en background.
      fetchRole(sessionUser.id).then(role => {
        if (cancelled || !role) return;
        setUser(prev => prev && prev.id === sessionUser.id ? buildUser(sessionUser, role) : prev);
      });
    };

    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        const supaUser = session?.user;
        // Solo restaurar sesión si el email está verificado
        applyUser(supaUser?.email_confirmed_at ? supaUser : null);
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      const supaUser = session?.user;
      if (supaUser && !supaUser.email_confirmed_at) {
        if (!cancelled) setUser(null);
        return;
      }
      applyUser(supaUser || null);
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

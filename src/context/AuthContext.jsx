import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
// Usuarios "monitor" (solo lectura de la agenda) reconocidos por email como
// respaldo, además de profiles.role = 'monitor'.
import { MONITOR_EMAILS } from '../utils/staff';

const AuthContext = createContext();

// Fallback: el admin original sigue reconociéndose por email aunque el fetch
// a profiles.role falle (problemas de red, RLS mal aplicado, etc.).
const LEGACY_ADMIN_EMAILS = ['admin@padelmedina.com'];

const buildUser = (u, role) => ({
  id: u.id,
  email: u.email,
  name: u.user_metadata?.name || u.email.split('@')[0],
  // El email de monitor es AUTORITATIVO (manda sobre profiles.role), porque es
  // una cuenta de staff especial. El resto usa profiles.role con fallback admin.
  role: MONITOR_EMAILS.includes(u.email)
    ? 'monitor'
    : (role || (LEGACY_ADMIN_EMAILS.includes(u.email) ? 'admin' : 'client')),
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
      // 1) Pinta el usuario de inmediato. Si es el MISMO usuario que ya estaba,
      // conservamos el rol ya resuelto: auth-js emite SIGNED_IN/TOKEN_REFRESHED en
      // CADA vuelta a la app, y resetear el rol a "cliente" hacía parpadear y
      // desmontar el panel de un admin/monitor que no sea admin@padelmedina.com.
      if (!cancelled) {
        setUser(prev => {
          if (prev && prev.id === sessionUser.id) {
            const next = buildUser(sessionUser, prev.role);
            return (prev.role === next.role && prev.email === next.email && prev.name === next.name) ? prev : next;
          }
          return buildUser(sessionUser, null);
        });
      }
      // 2) Refina el rol con profiles.role en background.
      fetchRole(sessionUser.id).then(role => {
        if (cancelled || !role) return;
        setUser(prev => prev && prev.id === sessionUser.id && prev.role !== role ? buildUser(sessionUser, role) : prev);
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
  // consentimiento = { aceptadoAt, version }: prueba de que aceptó la Política
  // de Privacidad y el Aviso legal al registrarse (queda en raw_user_meta_data)
  const signupWithEmail = async (email, password, name, phone, consentimiento) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || '',
          phone: phone || '',
          ...(consentimiento?.aceptadoAt ? {
            legal_aceptado_at: consentimiento.aceptadoAt,
            legal_version: consentimiento.version,
          } : {}),
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;

    // Con la confirmación de email activada, GoTrue devuelve un usuario "ofuscado"
    // (identities vacío) cuando el correo YA existe, SIN enviar ningún código. Hay
    // que detectarlo para no dejar al usuario esperando un código que no llega.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      const e = new Error('Este correo ya está registrado. Entra con tu contraseña o recupérala.');
      e.code = 'user_already_exists';
      throw e;
    }
  };

  // Reenviar el código de verificación de registro
  const resendSignupCode = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
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

  // Recuperar contraseña: envía un email con enlace a /reset-password
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  // Cambiar la contraseña del usuario actual (tras abrir el enlace de recuperación)
  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  // Logout. scope:'local' cierra SOLO esta sesión (antes cerraba también el PC del
  // club y los demás dispositivos). Si no hay red, signOut falla: limpiamos el
  // token a mano para no dejar la sesión "pegada". Y damos de baja el push de
  // este dispositivo para que no siga recibiendo avisos con datos de clientes.
  const logout = async () => {
    try {
      const m = await import('../services/pushNotifications');
      if (m.unsubscribeFromPush) await m.unsubscribeFromPush();
    } catch { /* noop */ }
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch { /* sin red: limpiamos igual */ }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
      }
    } catch { /* noop */ }
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
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithPassword, signupWithEmail, verifySignupOtp, resendSignupCode, resetPassword, updatePassword, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

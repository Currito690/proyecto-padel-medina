import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Capacitor } from '@capacitor/core';
import { origenPublico } from '../utils/origen';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../utils/googleNativo';
// Usuarios "monitor" (solo lectura de la agenda) reconocidos por email como
// respaldo, además de profiles.role = 'monitor'.
import { MONITOR_EMAILS } from '../utils/staff';

// Hash SHA-256 en hex (para el nonce de Apple y Google en iPhone: el proveedor recibe
// el hash y Supabase el valor crudo; así no se puede reutilizar el token).
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

  // Login con Google. En la web y la app Android: OAuth de Supabase (redirige a
  // Google y vuelve). En la app de iPhone: ventana nativa de Google (Google no
  // deja iniciar sesión dentro de una pantalla web de la app) y el token se
  // canjea en Supabase con signInWithIdToken, igual que con Apple.
  const loginWithGoogle = async () => {
    if (Capacitor.isNativePlatform()) {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      // iPhone usa su cliente iOS; Android, el cliente WEB (así lo exige Google).
      await SocialLogin.initialize({
        google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' },
      });
      const rawNonce = `${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}.${Date.now().toString(36)}`;
      const hashedNonce = await sha256Hex(rawNonce);
      // forcePrompt: muestra siempre el selector de cuentas (si no, reutiliza en
      // silencio la última cuenta de Google y no se puede entrar con otra).
      const res = await SocialLogin.login({ provider: 'google', options: { nonce: hashedNonce, forcePrompt: true } });
      const idToken = res?.result?.idToken;
      if (!idToken) throw new Error('Google no devolvió el token de identidad');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  // Login con Apple — NATIVO (Face ID, sin navegador). Solo en la app de iPhone.
  // Usa el plugin de Capacitor para pedir el token a Apple y lo canjea en
  // Supabase con signInWithIdToken (provider 'apple'). El plugin se carga de
  // forma diferida para no incluirlo en el bundle web.
  const loginWithApple = async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Iniciar sesión con Apple solo está disponible en la app de iPhone');
    }
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
    const rawNonce = `${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}.${Date.now().toString(36)}`;
    const hashedNonce = await sha256Hex(rawNonce);
    const { response } = await SignInWithApple.authorize({
      clientId: 'com.padelmedina.app',
      redirectURI: 'https://padelmedina.com/supabase/auth/v1/callback',
      scopes: 'email name',
      nonce: hashedNonce,
    });
    if (!response?.identityToken) throw new Error('Apple no devolvió el token de identidad');
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: response.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    // Apple da el nombre solo la PRIMERA vez que el usuario autoriza la app (no va
    // en el token): lo guardamos para que no salga el prefijo del correo, que con
    // "Ocultar mi correo" es un código aleatorio. Nunca pisa un nombre ya puesto.
    const nombre = [response.givenName, response.familyName].filter(Boolean).join(' ').trim();
    if (nombre) {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        const prefijo = (u?.email || '').split('@')[0];
        if (u && (!u.user_metadata?.name || u.user_metadata.name === prefijo)) {
          await supabase.auth.updateUser({ data: { name: nombre } });
          await supabase.from('profiles').update({ name: nombre }).eq('id', u.id).eq('name', prefijo);
        }
      } catch { /* el nombre es opcional: el inicio de sesión ya está hecho */ }
    }
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
        emailRedirectTo: origenPublico(), // en iPhone, el dominio público (no capacitor://)
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
      // En iPhone, el enlace del correo abre la web pública /reset-password.
      redirectTo: `${origenPublico()}/reset-password`,
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
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithApple, loginWithPassword, signupWithEmail, verifySignupOtp, resendSignupCode, resetPassword, updatePassword, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

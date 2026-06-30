import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

// Página de destino del enlace de recuperación de contraseña. Supabase abre la
// app con una sesión temporal de recuperación (evento PASSWORD_RECOVERY); aquí
// el usuario escribe su nueva contraseña.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = 'Restablecer contraseña · Padel Medina';
    // Si ya hay sesión (el enlace de Supabase la crea) habilitamos el formulario.
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña. Pide un enlace nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'white', borderRadius: '1.25rem', border: '1px solid #E2E8F0', padding: '2rem 1.75rem', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/logo.png" alt="Padel Medina" style={{ width: 140, height: 'auto' }} />
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 1rem' }}>✓</div>
            <h2 style={{ margin: '0 0 0.5rem', fontWeight: 800, color: '#0F172A' }}>Contraseña actualizada</h2>
            <p style={{ color: '#64748B', fontSize: '0.9rem' }}>Ya puedes usar tu nueva contraseña. Te llevamos a la app…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 style={{ margin: '0 0 0.5rem', fontWeight: 800, color: '#0F172A', fontSize: '1.25rem' }}>Nueva contraseña</h2>
            <p style={{ margin: '0 0 1.25rem', color: '#64748B', fontSize: '0.85rem' }}>Escribe tu nueva contraseña para tu cuenta.</p>

            {error && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '0.8rem 1rem', borderRadius: '0.625rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 500, border: '1px solid #FECACA' }}>{error}</div>
            )}
            {!ready && (
              <div style={{ background: '#FFF7ED', color: '#9A3412', padding: '0.8rem 1rem', borderRadius: '0.625rem', marginBottom: '1rem', fontSize: '0.82rem', border: '1px solid #FED7AA' }}>
                Abre esta página desde el enlace del email de recuperación. Si llegaste de otra forma, vuelve a pedir el enlace en la pantalla de inicio de sesión.
              </div>
            )}

            <label style={labelStyle}>Nueva contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" style={inputStyle} />
            <label style={{ ...labelStyle, marginTop: '1rem' }}>Repite la contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} placeholder="Repite la contraseña" style={inputStyle} />

            <button type="submit" disabled={loading || !ready} style={{ width: '100%', marginTop: '1.25rem', padding: '0.95rem', background: ready ? 'linear-gradient(135deg,#1B3A6E,#152D57)' : '#CBD5E1', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 700, fontSize: '1rem', cursor: loading || !ready ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputStyle = { width: '100%', padding: '0.875rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #E2E8F0', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none', background: '#F8FAFC' };

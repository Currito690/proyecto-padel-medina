import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { sanitizeInput } from '../utils/sanitize';

const Login = () => {
  const { loginWithGoogle, sendOtpCode, verifyOtpCode } = useAuth();
  const [isLogin, setIsLogin] = useState(true); // true = Entrar, false = Registrarse
  const [step, setStep] = useState(1); // 1 = Petición de email, 2 = Petición de código
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg('');
    try {
      const safeName = sanitizeInput(name);
      await sendOtpCode(email, safeName);
      setSuccessMsg('Te hemos enviado un código de 6 dígitos a tu correo.');
      setStep(2);
    } catch (err) {
      setError(err.message || 'Error al enviar el código');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // sanitizeInput elimina espacios también, útil para el código
      const safeCode = sanitizeInput(otpCode);
      await verifyOtpCode(email, safeCode);
      // Tras el éxito el AuthContext cambiará de estado y redirigirá solo.
    } catch (err) {
      setError('El código es incorrecto o ha expirado. Por favor, revisa bien tu correo.');
    } finally {
      setLoading(false);
    }
  };
  const BrandPanel = () => (
    <div className="login-brand">
      {/* Decorative blobs */}
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />

      <h1 className="login-brand-title">Padel Medina</h1>
      <p className="login-brand-sub">Tu pista te espera</p>

      {/* Features — only visible on desktop */}
      <ul className="login-features">
        {[
          'Reserva en segundos',
          'Pistas de pádel y pickleball',
          'Horarios de 09:00 a 22:00',
        ].map((f) => (
          <li key={f} className="login-feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <style>{`
        /* ── Login layout ── */
        .login-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #F8FAFC;
        }

        /* Brand panel (hero) */
        .login-brand {
          background: linear-gradient(150deg, #1B3A6E 0%, #15326A 55%, #0F2550 100%);
          padding: 2.5rem 1.5rem 3rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .login-blob {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          pointer-events: none;
        }
        .login-blob-1 { width: 200px; height: 200px; top: -60px; right: -60px; }
        .login-blob-2 { width: 160px; height: 160px; bottom: -50px; left: -40px; background: rgba(255,255,255,0.05); }

        .login-logo {
          width: 68px; height: 68px; border-radius: 50%;
          background: rgba(255,255,255,0.18);
          border: 2px solid rgba(255,255,255,0.3);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 1rem;
        }
        .login-brand-title {
          color: white;
          font-size: 1.875rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          margin: 0 0 0.4rem;
        }
        .login-brand-sub {
          color: rgba(255,255,255,0.85);
          font-size: 1rem;
          font-weight: 500;
          margin: 0;
        }
        .login-features {
          display: none; /* hidden on mobile, shown on desktop */
          list-style: none;
          padding: 0; margin: 0;
        }
        .login-feature-item {
          display: flex; align-items: center; gap: 0.625rem;
          color: rgba(255,255,255,0.9);
          font-size: 0.95rem; font-weight: 500;
          margin-bottom: 0.75rem;
        }

        /* Form section */
        .login-form-section {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 0 1rem 2.5rem;
        }
        .login-card {
          width: 100%;
          max-width: 440px;
          background: white;
          border-radius: 1.5rem;
          padding: 1.75rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.09);
          border: 1px solid #E2E8F0;
          margin-top: 1.5rem;
        }

        /* Tab toggle */
        .login-tabs {
          display: flex;
          background: #F1F5F9;
          border-radius: 0.75rem;
          padding: 0.25rem;
          margin-bottom: 1.5rem;
          gap: 0.25rem;
        }
        .login-tab {
          flex: 1; padding: 0.625rem;
          border: none; border-radius: 0.5rem;
          font-family: inherit; font-weight: 700; font-size: 0.875rem;
          cursor: pointer; transition: all 0.2s;
        }
        .login-tab-active {
          background: white; color: #0F172A;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        .login-tab-inactive {
          background: transparent; color: #94A3B8;
        }

        /* Input group */
        .login-input-group { margin-bottom: 1rem; }
        .login-label {
          display: block;
          font-size: 0.75rem; font-weight: 700;
          color: #475569; margin-bottom: 0.4rem;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .login-input {
          width: 100%; padding: 0.875rem 1rem;
          border-radius: 0.625rem; border: 1.5px solid #E2E8F0;
          font-size: 0.95rem; font-family: inherit;
          background: #F8FAFC; color: #0F172A;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .login-input:focus {
          outline: none;
          border-color: #1B3A6E;
          box-shadow: 0 0 0 3px rgba(27,58,110,0.15);
          background: white;
        }

        /* Error */
        .login-error {
          background: #FEF2F2; color: #DC2626;
          padding: 0.875rem 1rem; border-radius: 0.625rem;
          margin-bottom: 1rem; font-size: 0.875rem; font-weight: 500;
          border: 1px solid #FECACA;
          display: flex; align-items: center; gap: 0.5rem;
        }

        /* Submit button */
        .login-submit {
          width: 100%; padding: 1rem; margin-top: 0.25rem;
          background: linear-gradient(135deg, #1B3A6E, #152D57);
          color: white; border: none; border-radius: 0.75rem;
          font-family: inherit; font-size: 1rem; font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(27,58,110,0.35);
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          transition: all 0.2s;
        }
        .login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(27,58,110,0.45);
        }
        .login-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Divider */
        .login-divider {
          display: flex; align-items: center; gap: 1rem;
          margin: 1.25rem 0;
        }
        .login-divider hr {
          flex: 1; border: none; border-top: 1px solid #E2E8F0; margin: 0;
        }
        .login-divider span {
          font-size: 0.8rem; color: #94A3B8; font-weight: 600;
        }

        /* Google */
        .login-google {
          width: 100%; padding: 0.875rem;
          background: white; color: #0F172A;
          border: 1.5px solid #E2E8F0; border-radius: 0.625rem;
          font-family: inherit; font-size: 0.95rem; font-weight: 600;
          display: flex; align-items: center; justify-content: center; gap: 0.75rem;
          cursor: pointer; transition: all 0.2s;
        }
        .login-google:hover { background: #F8FAFC; border-color: #CBD5E1; }

        /* Spin animation */
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        /* ── Tablet (≥ 640px) ── */
        @media (min-width: 640px) {
          .login-brand { padding: 3rem 2rem 3.5rem; }
          .login-brand-title { font-size: 2.25rem; }
          .login-card { padding: 2.25rem; margin-top: 2rem; }
          .login-form-section { padding: 0 2rem 3rem; }
        }

        /* ── Desktop (≥ 1024px) ── */
        @media (min-width: 1024px) {
          .login-page {
            flex-direction: row;
            min-height: 100vh;
          }
          .login-brand {
            flex: 0 0 400px;
            min-height: 100vh;
            padding: 3rem;
            text-align: left;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .login-logo { margin: 0 0 1.5rem; }
          .login-brand-title { font-size: 2.5rem; }
          .login-brand-sub { font-size: 1.1rem; margin-bottom: 2.5rem; }
          .login-features { display: block; }
          .login-form-section {
            flex: 1;
            align-items: center;
            padding: 2rem;
          }
          .login-card { margin-top: 0; }
        }

        @media (min-width: 1280px) {
          .login-brand { flex: 0 0 480px; }
        }
      `}</style>

      <div className="login-page">
        <BrandPanel />

        <div className="login-form-section">
          <div className="login-card">

            {/* Logo sobre fondo blanco — sin rectángulo visible */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <img src="/logo.png" alt="Padel Medina" style={{ width: '160px', height: 'auto', objectFit: 'contain', display: 'inline-block' }} />
            </div>

            {/* Tabs */}
            <div className="login-tabs">
              {['Entrar', 'Registrarse'].map((tab, i) => {
                const active = (i === 0 && isLogin) || (i === 1 && !isLogin);
                return (
                  <button
                    key={tab}
                    onClick={() => { setIsLogin(i === 0); setError(null); }}
                    className={`login-tab ${active ? 'login-tab-active' : 'login-tab-inactive'}`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.25rem', letterSpacing: '-0.02em' }}>
              {isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
            </h2>

            {/* Error */}
            {error && (
              <div className="login-error">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {successMsg && (
              <div style={{ background: '#F0FDF4', color: '#15803D', padding: '0.875rem 1rem', borderRadius: '0.625rem', marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {successMsg}
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleSendOtp}>
                {!isLogin && (
                  <div className="login-input-group">
                    <label className="login-label">Nombre completo</label>
                    <input
                      className="login-input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={!isLogin}
                      placeholder="Juan García"
                    />
                  </div>
                )}

                <div className="login-input-group">
                  <label className="login-label">Email</label>
                  <input
                    className="login-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="tu@email.com"
                  />
                  <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem' }}>
                    Te enviaremos un código seguro a tu correo, sin necesidad de contraseñas.
                  </p>
                </div>

                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? (
                    <>
                      <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      Cargando...
                    </>
                  ) : 'Recibir Código Seguro'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <div className="login-input-group">
                  <label className="login-label">Código de Verificación (OTP)</label>
                  <input
                    className="login-input"
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                    placeholder="Ej. 123456"
                    style={{ textAlign: 'center', letterSpacing: '0.2em', fontSize: '1.2rem' }}
                  />
                </div>
                
                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? 'Verificando...' : 'Verificar y Entrar'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button type="button" onClick={() => { setStep(1); setError(null); }} style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}>
                    Volver o cambiar email
                  </button>
                </div>
              </form>
            )}

            {step === 1 && (
              <>
                <div className="login-divider">
                  <hr /><span>o</span><hr />
                </div>

                <button onClick={loginWithGoogle} disabled={loading} className="login-google">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuar con Google
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default Login;

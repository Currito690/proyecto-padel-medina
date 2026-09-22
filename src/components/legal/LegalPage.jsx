import { Link, useNavigate } from 'react-router-dom';

// Estructura común de las páginas legales (Aviso legal, Política de Privacidad).
// Se abren también en pestaña nueva desde el registro: ahí no hay historial al
// que volver, así que "Volver" lleva al inicio.
export default function LegalPage({ title, updated, children, related }) {
  const navigate = useNavigate();
  const volver = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>

        <button onClick={volver} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748B', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', marginBottom: '2rem', padding: '0.5rem 0', minHeight: '44px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Volver
        </button>

        <div className="legal-card" style={{ backgroundColor: 'white', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
          <style>{`
            .legal-card { padding: 1.5rem 1.25rem; }
            @media (min-width: 640px) { .legal-card { padding: 2rem 2.5rem; } }
            .legal-card a { color: #16A34A; }
          `}</style>

          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          <p style={{ margin: '0 0 2rem', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
            Última actualización: {updated}
          </p>

          {children}

          {related && (
            <p style={{ margin: '2rem 0 0', paddingTop: '1.25rem', borderTop: '1px solid #F1F5F9', fontSize: '0.85rem', color: '#64748B' }}>
              Consulte también nuestro{' '}
              <Link to={related.to} style={{ color: '#16A34A', fontWeight: 700 }}>{related.label}</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', borderBottom: '2px solid #F1F5F9', paddingBottom: '0.5rem' }}>
        {title}
      </h2>
      <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

export function Table({ rows }) {
  return (
    <div style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#475569', backgroundColor: '#F8FAFC', width: '34%', verticalAlign: 'top' }}>{label}</td>
              <td style={{ padding: '0.6rem 0.75rem', color: '#334155', overflowWrap: 'anywhere' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { Component } from 'react';

// Captura errores de render en cualquier descendiente y muestra un fallback
// amigable en vez de dejar la pantalla en blanco. La app sigue corriendo —
// el usuario puede recargar o navegar a otra parte.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // En cliente, log a consola; en producción podemos engancharlo a Sentry
    // u otra herramienta cuando se integre.
    console.error('UI ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    // Recarga forzada (sin caché) tras un crash. Resuelve la mayoría de
    // estados zombies, sobre todo si veníamos de un deploy nuevo.
    window.location.reload();
  };

  handleHome = () => {
    // Vuelve a la home. Útil si el problema está localizado en una ruta.
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: '1.5rem' }}>
        <div style={{ background: 'white', borderRadius: '1.25rem', boxShadow: '0 20px 50px rgba(0,0,0,0.08)', maxWidth: '460px', width: '100%', padding: '2rem', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.8rem', fontWeight: 800 }}>!</div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 900, color: '#0F172A' }}>Algo no fue bien</h1>
          <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Hubo un error al mostrar esta pantalla. Recarga la página y vuelve a intentarlo. Si vuelve a pasar, escríbenos a <a href="mailto:info@padelmedina.com" style={{ color: '#2563EB' }}>info@padelmedina.com</a>.
          </p>
          {this.state.error?.message && (
            <pre style={{ background: '#F1F5F9', color: '#475569', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.75rem', textAlign: 'left', overflowX: 'auto', marginBottom: '1.25rem' }}>
              {String(this.state.error.message).slice(0, 280)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={this.handleReload} style={{ padding: '0.7rem 1.25rem', borderRadius: '0.55rem', border: 'none', background: '#0F172A', color: 'white', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
              Recargar página
            </button>
            <button onClick={this.handleHome} style={{ padding: '0.7rem 1.25rem', borderRadius: '0.55rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}

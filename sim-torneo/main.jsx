// Simulador de torneos: monta el panel de torneos del admin (el mismo código
// que en producción) contra un Supabase de mentira en memoria (fakeSupabase.js)
// y un admin de mentira (fakeAuth.jsx). Ver vite.config.js para los alias.
//
//   npx vite --config sim-torneo/vite.config.js        → http://localhost:4175
//   node sim-torneo/generar-datos.mjs                   → regenera datos.js
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import TournamentManager from '../src/components/admin/TournamentManager';

createRoot(document.getElementById('root')).render(
  <div className="dashboard-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
    <TournamentManager />
  </div>
);

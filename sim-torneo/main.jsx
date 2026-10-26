// Simulador de torneos: monta el panel de torneos del admin (el mismo código
// que en producción) contra un Supabase de mentira en memoria (fakeSupabase.js)
// y un admin de mentira (fakeAuth.jsx). Ver vite.config.js para los alias.
//
//   npx vite --config sim-torneo/vite.config.js        → http://localhost:4175
//   node sim-torneo/generar-datos.mjs                   → regenera datos.js
//   http://localhost:4175/?vista=cuadro                 → página PÚBLICA del cuadro
//     (usa sim-torneo/cuadro.json, una config ya generada, como cuadro publicado)
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '../src/index.css';
import TournamentManager from '../src/components/admin/TournamentManager';
import TournamentBracket from '../src/pages/TournamentBracket';
import { prepararCartel } from '../src/utils/cartel';
import TournamentRegistration from '../src/pages/TournamentRegistration';

const vista = new URLSearchParams(window.location.search).get('vista');
window.__sim.prepararCartel = prepararCartel; // para probar el cartel desde fuera
const raiz = createRoot(document.getElementById('root'));

if (vista === 'cuadro') {
  fetch('/cuadro.json').then((r) => r.json()).then((config) => {
    const t = window.__SIM_DATOS.tournaments[0];
    t.config = { ...config, bracketPublished: true };
    t.status = 'open';
    raiz.render(
      <MemoryRouter initialEntries={[`/torneos/${t.id}/cuadro`]}>
        <Routes>
          <Route path="/torneos/:id/cuadro" element={<TournamentBracket />} />
          <Route path="/torneos/:id" element={<div style={{ padding: 24 }}>(inscripción)</div>} />
          <Route path="/" element={<div style={{ padding: 24 }}>(inicio)</div>} />
        </Routes>
      </MemoryRouter>
    );
  });
} else if (vista === 'inscripcion') {
  // Página PÚBLICA de inscripción con el torneo abierto y un cartel de prueba.
  const t = window.__SIM_DATOS.tournaments[0];
  t.status = 'open';
  t.config = { ...t.config, posterUrl: '/cartel-prueba.jpg' };
  raiz.render(
    <MemoryRouter initialEntries={[`/torneos/${t.id}`]}>
      <Routes>
        <Route path="/torneos/:id" element={<TournamentRegistration />} />
        <Route path="/" element={<div style={{ padding: 24 }}>(inicio)</div>} />
      </Routes>
    </MemoryRouter>
  );
} else {
  raiz.render(
    <div className="dashboard-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
      <TournamentManager />
    </div>
  );
}

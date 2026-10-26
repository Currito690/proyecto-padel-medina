import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Vite del SIMULADOR de torneos (sim-torneo/): el panel real con un Supabase y
// un AuthContext de mentira. No forma parte del build de producción.
const aqui = (f) => fileURLToPath(new URL(f, import.meta.url)).replace(/\\/g, '/');

export default defineConfig({
  root: aqui('.'),
  define: { __APP_VERSION__: JSON.stringify('simulador') },
  plugins: [react()],
  resolve: {
    // La expresión cubre el import ENTERO ("../../services/supabase"): si solo
    // cubriera el final, quedaría "../../C:/…" y no resolvería.
    alias: [
      { find: /^[./]*services\/supabase$/, replacement: aqui('./fakeSupabase.js') },
      { find: /^[./]*context\/AuthContext$/, replacement: aqui('./fakeAuth.jsx') },
    ],
  },
  server: { port: 4175, strictPort: true, open: false },
});

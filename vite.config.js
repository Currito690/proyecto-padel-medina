import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteCompression({ algorithm: 'gzip' }),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' })
  ],
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) return 'react-vendor';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) return 'react-vendor';
            if (id.includes('@supabase')) return 'supabase-vendor';
            if (id.includes('html2canvas') || id.includes('jspdf')) return 'pdf-vendor';
            if (id.includes('date-fns') || id.includes('dompurify') || id.includes('lucide-react')) return 'utils-vendor';
            return 'vendor';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  },
})

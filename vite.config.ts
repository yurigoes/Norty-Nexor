import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * O modo `standalone` produz um único HTML autocontido (ver
 * scripts/build-standalone.mjs). Ele embute a tipografia da marca em vez
 * de buscá-la em um CDN, porque a página final pode rodar sob uma política
 * de segurança que bloqueia requisições externas.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_STANDALONE': JSON.stringify(String(mode === 'standalone')),
  },
  build: {
    outDir: mode === 'standalone' ? 'dist-standalone' : 'dist',
    assetsInlineLimit: mode === 'standalone' ? 100_000_000 : 4096,
    cssCodeSplit: false,
    rollupOptions: {
      input: mode === 'standalone' ? 'index.standalone.html' : 'index.html',
    },
  },
}));

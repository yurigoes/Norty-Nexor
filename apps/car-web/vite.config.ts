import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // O visualizador 3D é pesado e só abre em telas de catálogo: fica em
        // um pedaço próprio, carregado sob demanda.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});

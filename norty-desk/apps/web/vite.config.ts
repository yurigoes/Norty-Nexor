import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Em desenvolvimento o aplicativo fala com a API local; em
      // produção o Caddy faz esse roteamento (docs/11-infra.md).
      '/v1': { target: 'http://localhost:3061', changeOrigin: true },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * O modo `standalone` produz um único HTML autocontido (ver
 * scripts/build-standalone.mjs). Ele desliga a divisão em pedaços e
 * embute os ativos, porque o arquivo final precisa abrir de qualquer
 * lugar — uma página hospedada, um anexo, um arquivo local — sem
 * depender de buscar mais nada.
 */
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';

  return {
    plugins: [react()],
    server: { port: 5273 },
    define: {
      'import.meta.env.VITE_STANDALONE': JSON.stringify(String(standalone)),
    },
    build: {
      outDir: standalone ? 'dist-standalone' : 'dist',
      assetsInlineLimit: standalone ? 100_000_000 : 4096,
      cssCodeSplit: false,
      rollupOptions: {
        input: standalone ? 'index.standalone.html' : 'index.html',
        output: standalone ? { inlineDynamicImports: true } : undefined,
      },
    },
  };
});

/**
 * Registro do service worker (PWA).
 * Ativado apenas em produção para não interferir no ciclo de
 * desenvolvimento. O worker usa estratégia network-first: a
 * instalação no celular é possível sem risco de cache obsoleto.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA é um recurso progressivo: falhar aqui não afeta a aplicação.
    });
  });
}

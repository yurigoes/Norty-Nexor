/*
 * Service worker do Norty Car.
 *
 * Escopo deliberadamente pequeno: guarda só a casca do aplicativo (HTML,
 * JS, CSS e fontes) para abrir rápido e funcionar como app instalado.
 * Dados da API NUNCA são guardados aqui — informação de cliente e de
 * contrato não fica no aparelho. Trabalho offline (vistoria sem sinal)
 * está planejado e documentado, mas não é prometido por este arquivo.
 */
const CACHE = 'nortycar-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/v1/')) return;
  // Navegação: rede primeiro, casca em cache se estiver sem sinal.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  if (/\.(js|css|woff2?|svg|png)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })),
    );
  }
});

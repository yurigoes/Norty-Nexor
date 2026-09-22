/*
 * O service worker do Norty Desk.
 *
 * Existe por um motivo só: receber o aviso quando ninguém está olhando
 * a aba. É o navegador que o mantém vivo — no Windows, o Chrome e o
 * Edge o acordam mesmo com a janela fechada, e é por isso que o aviso
 * de chamado chega na barra do sistema e não só dentro do aplicativo.
 *
 * Não tem cache e não intercepta requisição de propósito. Service
 * worker que serve arquivo do cache é a maneira mais rápida de deixar
 * alguém preso numa versão velha do aplicativo, e o preço disso é alto
 * demais para um ganho que aqui ninguém pediu.
 */

// Assume o controle sem esperar a aba ser fechada e reaberta: quem
// acabou de ligar o aviso quer que ele funcione agora.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let aviso;
  try {
    aviso = evento.data ? evento.data.json() : null;
  } catch {
    aviso = null;
  }

  // Sem corpo legível o navegador mostraria um aviso genérico do
  // sistema ("Este site foi atualizado em segundo plano") — feio e
  // inútil. Melhor dizer o mínimo verdadeiro.
  const titulo = (aviso && aviso.titulo) || 'Norty Desk';
  const corpo = (aviso && aviso.corpo) || 'Há novidade num chamado.';

  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      // Avisos com a mesma etiqueta se substituem: três respostas
      // seguidas no mesmo chamado viram um aviso atualizado, não três
      // empilhados na barra.
      tag: (aviso && aviso.etiqueta) || 'norty-desk',
      renotify: true,
      data: { url: (aviso && aviso.url) || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      // Reaproveita a aba aberta em vez de abrir a décima: quem já tem
      // o Desk aberto não quer uma janela nova a cada aviso.
      for (const aba of abas) {
        if (aba.url.includes(self.location.origin)) {
          return aba.focus().then((focada) => focada.navigate(destino));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});

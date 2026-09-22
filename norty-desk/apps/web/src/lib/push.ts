import type { InscreverPushRequest } from '@norty-desk/shared';

/**
 * O aviso fora da aba, do lado do navegador.
 *
 * Tudo aqui falha de pé: navegador sem suporte, permissão negada,
 * service worker que não registra. Nenhum desses casos é erro do
 * aplicativo — são escolhas de quem usa, ou limites do aparelho — e
 * quem chama recebe `null` para mostrar a tela certa.
 */

/** O navegador sabe fazer isto? Safari no iOS só a partir do 16.4. */
export function pushSuportado(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** A permissão que o navegador guarda para este site. */
export function permissaoAtual(): NotificationPermission | null {
  return pushSuportado() ? Notification.permission : null;
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSuportado()) return null;
  try {
    // `ready` só resolve depois de um registro existir; registrar
    // sempre é idempotente e evita ficar pendurado para sempre na
    // primeira visita.
    await navigator.serviceWorker.register('/sw.js');
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** O endpoint do aparelho, se ele já está inscrito. */
export async function endpointDesteAparelho(): Promise<string | undefined> {
  const reg = await registro();
  const inscricao = await reg?.pushManager.getSubscription();
  return inscricao?.endpoint;
}

/**
 * Pede a permissão e inscreve o aparelho.
 *
 * A permissão só é pedida aqui, dentro do clique — nunca ao carregar a
 * tela. Site que pergunta na chegada é bloqueado para sempre por quem
 * ainda nem sabia o que ele faz, e não há como desfazer isso do lado de
 * cá.
 */
export async function ligarNesteAparelho(
  chavePublica: string,
): Promise<InscreverPushRequest | null> {
  const reg = await registro();
  if (!reg) return null;

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return null;

  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Sem isto o Chrome recusa a inscrição: ele não entrega aviso
      // silencioso, e um aviso que ninguém vê seria rastreamento.
      userVisibleOnly: true,
      applicationServerKey: base64ParaBytes(chavePublica),
    }));

  const json = inscricao.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return null;

  return {
    endpoint: inscricao.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    descricao: descricaoDoAparelho(),
  };
}

/** Desfaz a inscrição no navegador. A linha no banco é outra chamada. */
export async function desligarNesteAparelho(): Promise<void> {
  const reg = await registro();
  const inscricao = await reg?.pushManager.getSubscription();
  await inscricao?.unsubscribe();
}

/**
 * "Chrome no Windows", para a pessoa reconhecer o aparelho na lista.
 *
 * Dedução grosseira de propósito: o objetivo é distinguir o computador
 * do trabalho do celular, não catalogar navegador. Errar o nome do
 * navegador é irrelevante; não saber qual dos três desligar é o
 * problema de verdade.
 */
function descricaoDoAparelho(): string {
  const ua = navigator.userAgent;

  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';

  const sistema = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iPhone'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'este aparelho';

  return `${navegador} no ${sistema}`;
}

/**
 * A chave VAPID chega em base64url e o navegador quer bytes.
 *
 * `atob` não entende base64url: sem trocar `-` e `_` e sem recompor o
 * preenchimento, a inscrição falha com um erro que não diz nada sobre
 * codificação.
 */
function base64ParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const preenchimento = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(base64);

  // Sobre um `ArrayBuffer` explícito: `applicationServerKey` não aceita
  // uma view que possa estar sobre memória compartilhada, e o
  // `Uint8Array` genérico do TypeScript moderno admite as duas.
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

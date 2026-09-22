import type { BaterPontoRequest, EstadoDoChat, EventoDoChat } from '@norty-desk/shared';

import { chamar, tokenAtual } from './cliente';

const BASE = import.meta.env.VITE_API_URL ?? '/v1';

export const baterPonto = (corpo: BaterPontoRequest) =>
  chamar<EstadoDoChat>('/chat/presenca', { metodo: 'POST', corpo });

export const presencaDoChamado = (ticketId: string) =>
  chamar<EstadoDoChat>(`/chat/${ticketId}/presenca`);

/**
 * Sai da conversa — e sobrevive à navegação.
 *
 * `keepalive: true` é o ponto. Um `fetch` comum disparado ao
 * desmontar a tela é **cancelado** pelo navegador quando a navegação
 * acontece, e o outro lado continua vendo "está aqui agora" por até
 * `SEGUNDOS_ONLINE`. Com `keepalive`, o navegador termina o envio
 * mesmo com a página saindo.
 *
 * `sendBeacon` seria o reflexo, e não serve: não carrega cabeçalho
 * `Authorization`, e o token não vai para a URL.
 *
 * A falta da batida continua sendo a rede de segurança — isto aqui só
 * torna a saída imediata em vez de demorada.
 */
export function sairDaConversa(): void {
  void fetch(`${BASE}/chat/presenca`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenAtual() ?? ''}`,
    },
    body: JSON.stringify({ ticketId: null }),
  }).catch(() => undefined);
}

/**
 * Abre o fluxo do chat e chama `aoEvento` a cada novidade.
 *
 * `fetch` com `ReadableStream`, e **não** `EventSource`: aquele não
 * carrega cabeçalho `Authorization`, e a saída seria pôr o token na
 * URL — onde ele cairia no log do proxy e no histórico do navegador.
 * O preço é reimplementar a leitura de SSE aqui embaixo, que são vinte
 * linhas; o preço da outra saída é um token vazado em texto claro.
 *
 * Devolve a função que fecha o fluxo.
 */
export function ouvirChat(
  ticketId: string,
  aoEvento: (evento: EventoDoChat) => void,
  aoFechar?: () => void,
): () => void {
  const controle = new AbortController();

  void (async () => {
    try {
      const resposta = await fetch(`${BASE}/chat/${ticketId}/fluxo`, {
        headers: { Authorization: `Bearer ${tokenAtual() ?? ''}` },
        signal: controle.signal,
      });

      if (!resposta.ok || !resposta.body) {
        aoFechar?.();
        return;
      }

      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let sobra = '';

      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;

        sobra += decodificador.decode(value, { stream: true });

        // Um evento SSE termina em linha em branco. O resto fica para a
        // próxima leitura: um pedaço pode cortar o JSON ao meio.
        const partes = sobra.split('\n\n');
        sobra = partes.pop() ?? '';

        for (const parte of partes) {
          const linha = parte.split('\n').find((l) => l.startsWith('data: '));
          if (!linha) continue;
          try {
            aoEvento(JSON.parse(linha.slice(6)) as EventoDoChat);
          } catch {
            // Pedaço malformado não derruba o fluxo.
          }
        }
      }
    } catch {
      // Abortado pela tela, ou rede caiu: quem chamou reabre.
    } finally {
      aoFechar?.();
    }
  })();

  return () => controle.abort();
}

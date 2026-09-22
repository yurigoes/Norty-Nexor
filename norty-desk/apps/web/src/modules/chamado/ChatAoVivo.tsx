import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INTERVALO_DA_BATIDA,
  type EstadoDoChat,
  type TicketDetail,
  type TicketEventView,
} from '@norty-desk/shared';

import { baterPonto, ouvirChat, sairDaConversa } from '../../api/chat';

/**
 * O chat ao vivo do chamado.
 *
 * Não é uma janela à parte: é a **mesma conversa**, chegando sem
 * recarregar. Cada linha continua sendo um evento do chamado — o que
 * este componente faz é manter a presença viva e empurrar o que chega
 * para quem desenha a conversa.
 *
 * Não desenha nada além do selo: a lista de mensagens é da `Conversa`,
 * e duplicá-la aqui criaria duas telas da mesma coisa, que foi
 * exatamente o que se evitou no servidor ao não criar uma tabela de
 * chat.
 */
export function ChatAoVivo({
  chamado,
  aoChegarMensagem,
}: {
  chamado: TicketDetail;
  /** Uma mensagem nova chegou pelo fluxo. */
  aoChegarMensagem: (evento: TicketEventView) => void;
}) {
  const [estado, setEstado] = useState<EstadoDoChat>({ aberto: false, presentes: [] });
  const [ligado, setLigado] = useState(false);

  // Em `ref` e não em `state`: o fluxo é aberto uma vez, e um `state`
  // aqui o reabriria a cada mensagem — derrubando e refazendo a
  // conexão o tempo todo.
  //
  // A troca acontece num efeito, e não durante o desenho: escrever em
  // `ref` no corpo do componente é leitura de estado mutável no meio da
  // renderização, e o React avisa por bons motivos.
  const aoChegar = useRef(aoChegarMensagem);
  useEffect(() => {
    aoChegar.current = aoChegarMensagem;
  }, [aoChegarMensagem]);

  const digitandoAte = useRef(0);

  // A batida do coração. É ela que mantém a presença viva, e é a falta
  // dela que faz a pessoa sumir quando fecha a aba — o navegador não
  // avisa de forma confiável que fechou.
  useEffect(() => {
    let vivo = true;

    const bater = async (digitando = false) => {
      if (!vivo) return;
      try {
        setEstado(await baterPonto({ ticketId: chamado.id, digitando }));
        setLigado(true);
      } catch {
        setLigado(false);
      }
    };

    void bater();
    const relogio = setInterval(() => {
      void bater(Date.now() < digitandoAte.current);
    }, INTERVALO_DA_BATIDA * 1000);

    // Fechar a aba ou recarregar a página **não** roda a limpeza do
    // efeito — o React desmonta na navegação interna, não na saída do
    // documento. `pagehide` é o evento que cobre os dois casos, e é
    // mais confiável que `beforeunload` no celular.
    const aoSair = () => sairDaConversa();
    window.addEventListener('pagehide', aoSair);

    return () => {
      vivo = false;
      clearInterval(relogio);
      window.removeEventListener('pagehide', aoSair);
      // Sair da conversa ao trocar de tela: sem isto, quem abriu o
      // chamado e foi para a fila continuaria "na conversa" por mais um
      // minuto, e o outro lado escreveria achando que há alguém lendo.
      //
      // `sairDaConversa` e não `baterPonto`: um `fetch` comum disparado
      // aqui é cancelado pela navegação que o causou.
      sairDaConversa();
    };
  }, [chamado.id]);

  // O fluxo.
  useEffect(() => {
    let parar = () => {};
    let vivo = true;
    let religar: ReturnType<typeof setTimeout> | undefined;

    const abrir = () => {
      if (!vivo) return;
      parar = ouvirChat(
        chamado.id,
        (evento) => {
          if (evento.tipo === 'mensagem') aoChegar.current(evento.evento);
          else if (evento.tipo === 'presenca') setEstado(evento.estado);
        },
        () => {
          // O fluxo tem vida curta de propósito (proxy corta conexão
          // parada). Reabrir é o normal, não o erro.
          if (vivo) religar = setTimeout(abrir, 2000);
        },
      );
    };

    abrir();

    return () => {
      vivo = false;
      clearTimeout(religar);
      parar();
    };
  }, [chamado.id]);

  const digitando = estado.presentes.filter((p) => p.digitando);

  return (
    <div className="chat-selo" data-ligado={ligado ? 'sim' : 'nao'}>
      <span className={`chat-ponto ${estado.aberto ? '-aberto' : ''}`} aria-hidden="true" />
      {estado.aberto ? (
        <span>
          <strong>Chat ao vivo aberto</strong> —{' '}
          {digitando.length > 0
            ? `${digitando.map((p) => p.name.split(' ')[0]).join(', ')} está digitando…`
            : `${estado.presentes.map((p) => p.name.split(' ')[0]).join(', ')} está aqui agora`}
        </span>
      ) : (
        <span className="suave">
          Ninguém mais nesta conversa agora. O que você escrever chega pelo canal de sempre.
        </span>
      )}
    </div>
  );
}

/**
 * Avisa o servidor que a pessoa está digitando.
 *
 * Fica fora do componente porque quem sabe que alguém está digitando é
 * a caixa de resposta, que é de outro componente. A batida some sozinha
 * — não há "parou de digitar" a enviar.
 */
export function useAvisarQueDigita(ticketId: string): () => void {
  const ultimo = useRef(0);

  return useCallback(() => {
    // No máximo uma batida a cada três segundos: uma por tecla
    // transformaria "digitando" em cem requisições por parágrafo.
    const agora = Date.now();
    if (agora - ultimo.current < 3000) return;
    ultimo.current = agora;

    void baterPonto({ ticketId, digitando: true }).catch(() => undefined);
  }, [ticketId]);
}

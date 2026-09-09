import type { ApprovalStatus } from './domain';

/**
 * Aprovação em etapas com quórum.
 *
 * O GLPI guarda a decisão de cada validador e deixa o desfecho da
 * validação para a interface montar. Aqui a regra é uma função pura,
 * testada, usada pela API para decidir o status do chamado e pelo
 * aplicativo para desenhar a etapa — as duas leem a mesma coisa.
 */

export type EstadoDaEtapa = 'AGUARDANDO' | 'APROVADA' | 'RECUSADA';

/**
 * O estado de uma etapa a partir das decisões dos seus validadores.
 *
 * Duas condições encerram a etapa, e a segunda é a que o GLPI não tem:
 *
 * 1. **Quórum atingido.** `aprovados >= quorum`.
 * 2. **Quórum tornou-se impossível.** Com 3 de 5 exigidos, a terceira
 *    recusa já garante que os 3 "sim" não virão. Esperar as outras duas
 *    respostas seria pedir a alguém que decida algo já decidido — e
 *    deixaria o chamado parado em aprovação para sempre se essas
 *    pessoas nunca respondessem.
 *
 * Repare que uma recusa isolada **não** derruba a etapa quando o quórum
 * ainda cabe nas respostas que faltam. "Três de cinco precisam
 * aprovar" quer dizer isso mesmo.
 */
export function estadoDaEtapa(
  decisoes: readonly ApprovalStatus[],
  quorum: number,
): EstadoDaEtapa {
  const total = decisoes.length;
  const exigido = Math.min(Math.max(quorum, 1), Math.max(total, 1));

  const aprovados = decisoes.filter((d) => d === 'APROVADO').length;
  if (aprovados >= exigido) return 'APROVADA';

  const recusados = decisoes.filter((d) => d === 'RECUSADO').length;
  if (recusados > total - exigido) return 'RECUSADA';

  return 'AGUARDANDO';
}

/** Quantos "sim" ainda faltam para a etapa passar. Zero quando já passou. */
export function faltamParaOQuorum(
  decisoes: readonly ApprovalStatus[],
  quorum: number,
): number {
  const exigido = Math.min(Math.max(quorum, 1), Math.max(decisoes.length, 1));
  const aprovados = decisoes.filter((d) => d === 'APROVADO').length;
  return Math.max(exigido - aprovados, 0);
}

/**
 * O desfecho do conjunto de etapas.
 *
 * As etapas são sequenciais: a segunda só começa quando a primeira
 * passa. Uma recusa em qualquer etapa encerra a aprovação inteira — não
 * adianta o diretor aprovar o que o gerente já negou.
 */
export function desfechoDaAprovacao(
  etapas: readonly { step: number; decisoes: readonly ApprovalStatus[]; quorum: number }[],
): { estado: EstadoDaEtapa; etapaAtual: number | null } {
  const ordenadas = [...etapas].sort((a, b) => a.step - b.step);

  for (const etapa of ordenadas) {
    const estado = estadoDaEtapa(etapa.decisoes, etapa.quorum);
    if (estado === 'RECUSADA') return { estado: 'RECUSADA', etapaAtual: etapa.step };
    if (estado === 'AGUARDANDO') return { estado: 'AGUARDANDO', etapaAtual: etapa.step };
  }

  // Sem etapas, não há o que aprovar; com todas aprovadas, está aprovada.
  return ordenadas.length === 0
    ? { estado: 'AGUARDANDO', etapaAtual: null }
    : { estado: 'APROVADA', etapaAtual: null };
}

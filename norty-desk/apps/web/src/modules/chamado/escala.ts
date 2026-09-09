/**
 * Reexporta da fonte compartilhada.
 *
 * A prioridade mostrada no formulário tem de sair da **mesma** matriz
 * que a API usa para gravá-la; um cálculo próprio no cliente divergiria
 * na primeira vez que alguém ajustasse a matriz da organização.
 */
export { DEFAULT_PRIORITY_MATRIX, computePriority, type Scale } from '@norty-desk/shared';

export const ROTULO_ESCALA: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Média',
  4: 'Alta',
  5: 'Muito alta',
};

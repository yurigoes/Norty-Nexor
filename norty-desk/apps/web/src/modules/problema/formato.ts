import type { ProblemStatus } from '@norty-desk/shared';

/**
 * O selo de cada situação do problema.
 *
 * `CONTORNO_PUBLICADO` é sucesso mesmo com a causa de pé: para quem
 * atende, ter o que fazer já é o resultado. Só o vermelho fica de fora —
 * `--danger` é alerta real, e um problema em investigação não é um.
 */
export function seloDoProblema(status: ProblemStatus): string {
  switch (status) {
    case 'CONTORNO_PUBLICADO':
    case 'RESOLVIDO':
      return '-sucesso';
    case 'CAUSA_IDENTIFICADA':
      return '-info';
    case 'INVESTIGANDO':
      return '-aviso';
    case 'FECHADO':
      return '-neutro';
    default:
      return '-contorno';
  }
}

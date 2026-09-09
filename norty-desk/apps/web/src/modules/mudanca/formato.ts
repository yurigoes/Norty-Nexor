import type { ChangeRisk, ChangeStatus } from '@norty-desk/shared';

/**
 * O selo de cada situação da mudança.
 *
 * `REVERTIDA` é o único vermelho: `--danger` é alerta real, e recuo em
 * produção é o alerta real desta tela. Recusada e cancelada são
 * neutras — decisão tomada não é acidente.
 */
export function seloDaMudanca(status: ChangeStatus): string {
  switch (status) {
    case 'CONCLUIDA':
    case 'APROVADA':
      return '-sucesso';
    case 'EM_EXECUCAO':
    case 'AGENDADA':
      return '-info';
    case 'EM_APROVACAO':
      return '-aviso';
    case 'REVERTIDA':
      return '-erro';
    case 'RECUSADA':
    case 'CANCELADA':
      return '-neutro';
    default:
      return '-contorno';
  }
}

export function seloDoRisco(risco: ChangeRisk): string {
  return risco === 'ALTO' ? '-erro' : risco === 'MEDIO' ? '-aviso' : '-neutro';
}

/**
 * A janela como quem a lê na escala: "24/03 22:00 → 02:00".
 *
 * Repetir a data no fim só polui quando a janela não vira o dia — e a
 * maioria vira, que é justamente quando repetir importa.
 */
export function janelaCurta(inicio: string | null, fim: string | null): string {
  if (!inicio) return '—';

  const de = new Date(inicio);
  const formatoData = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (!fim) return formatoData.format(de);

  const ate = new Date(fim);
  const mesmoDia = de.toDateString() === ate.toDateString();
  return `${formatoData.format(de)} → ${mesmoDia ? formatoHora.format(ate) : formatoData.format(ate)}`;
}

import type { Channel, Scale, TicketStatus } from '@norty-desk/shared';

/**
 * Os rótulos moram em `packages/shared`: a API também rotula, e duas
 * tabelas divergem na primeira vez que alguém renomeia um status só de
 * um lado. Reexportados daqui para as telas não precisarem saber disso.
 */
export { ROTULO_CANAL, ROTULO_PRIORIDADE, ROTULO_STATUS, ROTULO_TIPO } from '@norty-desk/shared';

/**
 * Modificador do `.prio`. Nomeado, não numerado: `.-1` seria um
 * identificador CSS inválido, e a palavra é o que o usuário lê.
 */
export const MODIFICADOR_PRIORIDADE: Record<Scale, string> = {
  1: '-muito-baixa',
  2: '-baixa',
  3: '-media',
  4: '-alta',
  5: '-muito-alta',
};

/** Modificador do `.selo` para o status. Só o que exige ação é colorido. */
export function seloStatus(status: TicketStatus): string {
  switch (status) {
    case 'NOVO':
      return '-info';
    case 'PENDENTE':
    case 'EM_APROVACAO':
      return '-aviso';
    case 'SOLUCIONADO':
    case 'FECHADO':
      return '-sucesso';
    default:
      return '-neutro';
  }
}

/** Modificador do `.canal`. O CSS usa minúsculo; o domínio, maiúsculo. */
export function modificadorCanal(canal: Channel): string {
  return `-${canal.toLowerCase()}`;
}

/**
 * Três estados de SLA e nada mais: no prazo, apertando, estourado.
 * Uma barra de progresso contínua não ajuda ninguém a decidir o que
 * fazer agora.
 */
export function estadoSla(restanteSegundos: number): '-ok' | '-atencao' | '-estourado' {
  if (restanteSegundos < 0) return '-estourado';
  if (restanteSegundos < 3600) return '-atencao';
  return '-ok';
}

/** `2h 15min`, `-40min` quando já estourou. */
export function duracaoCurta(segundos: number): string {
  const negativo = segundos < 0;
  const total = Math.abs(segundos);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);

  const texto = horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;
  return negativo ? `-${texto}` : texto;
}

export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Iniciais para o `.avatar`. Duas letras bastam. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0] : '';
  return (primeira + ultima).toUpperCase();
}

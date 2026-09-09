import type { Channel, Scale, TicketStatus } from '@norty-desk/shared';

export const ROTULO_STATUS: Record<TicketStatus, string> = {
  NOVO: 'Novo',
  ATRIBUIDO: 'Atribuído',
  PLANEJADO: 'Planejado',
  PENDENTE: 'Pendente',
  EM_APROVACAO: 'Em aprovação',
  SOLUCIONADO: 'Solucionado',
  FECHADO: 'Fechado',
};

export const ROTULO_CANAL: Record<Channel, string> = {
  WEB: 'Portal',
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  API: 'API',
  SISTEMA: 'Sistema',
};

export const ROTULO_PRIORIDADE: Record<Scale, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Média',
  4: 'Alta',
  5: 'Muito alta',
};

/** Classe da etiqueta de status. Só o que exige ação é colorido. */
export function classeStatus(status: TicketStatus): string {
  switch (status) {
    case 'NOVO':
      return 'etiqueta--info';
    case 'PENDENTE':
    case 'EM_APROVACAO':
      return 'etiqueta--aviso';
    case 'SOLUCIONADO':
    case 'FECHADO':
      return 'etiqueta--sucesso';
    default:
      return 'etiqueta--neutro';
  }
}

/**
 * Três estados de SLA e nada mais: no prazo, apertando, estourado.
 * Uma barra de progresso contínua não ajuda ninguém a decidir o que
 * fazer agora.
 */
export function estadoSla(restanteSegundos: number): 'ok' | 'atencao' | 'estourado' {
  if (restanteSegundos < 0) return 'estourado';
  if (restanteSegundos < 3600) return 'atencao';
  return 'ok';
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

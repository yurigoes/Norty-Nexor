import type {
  ConversationChannel,
  ConversationState,
  InsightSeverity,
  LeadSource,
  LeadStatus,
  LeadTemperature,
  PaymentMethod,
  TicketPriority,
} from '@veyra/core';

/**
 * Rótulos de interface
 *
 * O domínio guarda a chave (`debito_automatico`); a interface guarda o
 * texto que a pessoa lê ("Débito automático"). Derivar um do outro com
 * `capitalize` produz "Debito Automatico" — e um produto que erra acento
 * na própria tela não passa a impressão de cuidado que precisa passar.
 *
 * Ficam todos aqui para que um termo tenha a mesma grafia em qualquer
 * módulo: "PIX" no financeiro e no cliente 360°, nunca "Pix" em um e
 * "PIX" no outro.
 */

export const ROTULO_METODO: Record<PaymentMethod, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  cartao: 'Cartão',
  link: 'Link de pagamento',
  transferencia: 'Transferência',
  debito_automatico: 'Débito automático',
};

export const ROTULO_ORIGEM: Record<LeadSource, string> = {
  whatsapp: 'WhatsApp',
  site: 'Site',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  instagram: 'Instagram',
  indicacao: 'Indicação',
  afiliado: 'Afiliado',
  importacao: 'Importação',
  telefone: 'Telefone',
  email: 'E-mail',
  api: 'API',
};

export const ROTULO_STATUS_LEAD: Record<LeadStatus, string> = {
  novo: 'Novo',
  em_qualificacao: 'Em qualificação',
  qualificado: 'Qualificado',
  quente: 'Quente',
  em_negociacao: 'Em negociação',
  cotacao: 'Cotação',
  proposta: 'Proposta',
  venda: 'Venda',
  perdido: 'Perdido',
  sem_resposta: 'Sem resposta',
  desistente: 'Desistente',
  nutricao: 'Nutrição',
  reativado: 'Reativado',
};

export const ROTULO_TEMPERATURA: Record<LeadTemperature, string> = {
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
  fervendo: 'Fervendo',
};

export const ROTULO_CANAL: Record<ConversationChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'e-mail',
  instagram: 'Instagram',
  webchat: 'chat do site',
};

export const ROTULO_ESTADO_CONVERSA: Record<ConversationState, string> = {
  nao_lida: 'Não lida',
  ia_atendendo: 'IA atendendo',
  humano_atendendo: 'Humano atendendo',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_vendedor: 'Aguardando vendedor',
  encerrada: 'Encerrada',
};

export const ROTULO_PRIORIDADE: Record<TicketPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  critica: 'Crítica',
};

export const ROTULO_SEVERIDADE: Record<InsightSeverity, string> = {
  oportunidade: 'Oportunidade',
  atencao: 'Atenção',
  risco: 'Risco',
  conquista: 'Conquista',
};

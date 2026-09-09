/**
 * Domínio do Norty Desk.
 *
 * Fonte única de verdade dos tipos compartilhados entre `apps/web` e
 * `apps/api`. Se um campo muda, ele muda aqui — e o TypeScript aponta os
 * dois lados afetados. Nunca duplique um tipo destes dentro de `apps/`.
 */

// ---------------------------------------------------------------------
// Enumerações — espelham o schema Prisma
// ---------------------------------------------------------------------

/** Incidente é "quebrou"; requisição é "preciso de". Separação do ITIL. */
export const TICKET_TYPES = ['INCIDENTE', 'REQUISICAO'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/**
 * Espelha as constantes de `CommonITILObject` do GLPI, com nome em vez
 * de número. `INCOMING = 1` virou `NOVO`.
 */
export const TICKET_STATUSES = [
  'NOVO',
  'ATRIBUIDO',
  'PLANEJADO',
  'PENDENTE',
  'EM_APROVACAO',
  'SOLUCIONADO',
  'FECHADO',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Status em que o chamado ainda consome SLA. */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  'NOVO',
  'ATRIBUIDO',
  'PLANEJADO',
  'PENDENTE',
  'EM_APROVACAO',
];

export const CHANNELS = ['WEB', 'EMAIL', 'WHATSAPP', 'API', 'SISTEMA'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ACTOR_ROLES = ['REQUERENTE', 'OBSERVADOR', 'ATRIBUIDO'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const EVENT_TYPES = [
  'MENSAGEM',
  'NOTA_INTERNA',
  'TAREFA',
  'SOLUCAO',
  'APROVACAO',
  'ANEXO',
  'MUDANCA_STATUS',
  'MUDANCA_ATRIBUICAO',
  'MUDANCA_CLASSIFICACAO',
  'PAUSA_SLA',
  'RETOMADA_SLA',
  'ENTRADA_CANAL',
  'SAIDA_CANAL',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const VISIBILITIES = ['PUBLICA', 'INTERNA'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const AGREEMENT_KINDS = ['SLA', 'OLA'] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

/** TTO = tempo até o primeiro atendimento. TTR = tempo até resolver. */
export const TARGET_KINDS = ['TTO', 'TTR'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const APPROVAL_STATUSES = ['AGUARDANDO', 'APROVADO', 'RECUSADO'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const LINK_TYPES = ['RELACIONADO', 'DUPLICADO_DE', 'BLOQUEIA'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/** Urgência, impacto e prioridade vão de 1 (muito baixa) a 5 (muito alta). */
export type Scale = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------
// Prioridade derivada
// ---------------------------------------------------------------------

/**
 * Matriz 5x5 urgência x impacto. `matrix[urgencia][impacto]`, ambos
 * indexados de 1 a 5.
 */
export type PriorityMatrix = Record<Scale, Record<Scale, Scale>>;

/**
 * Matriz padrão. Equivale ao `_matrix_{urgencia}_{impacto}` do GLPI:
 * a diagonal principal é a própria escala, e os extremos puxam para o
 * lado mais crítico sem nunca saltar dois níveis.
 */
export const DEFAULT_PRIORITY_MATRIX: PriorityMatrix = {
  1: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 },
  2: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  3: { 1: 2, 2: 2, 3: 3, 4: 4, 5: 4 },
  4: { 1: 2, 2: 3, 3: 4, 4: 4, 5: 5 },
  5: { 1: 3, 2: 3, 3: 4, 4: 5, 5: 5 },
};

/**
 * Prioridade é derivada, nunca digitada (CLAUDE.md, regra 7).
 *
 * Reproduz `CommonITILObject::computePriority()`: consulta a matriz e,
 * se a célula não existir, cai na média arredondada — o mesmo fallback
 * do GLPI.
 */
export function computePriority(
  urgency: Scale,
  impact: Scale,
  matrix: PriorityMatrix = DEFAULT_PRIORITY_MATRIX,
): Scale {
  const fromMatrix = matrix[urgency]?.[impact];
  if (fromMatrix) return fromMatrix;
  return Math.round((urgency + impact) / 2) as Scale;
}

// ---------------------------------------------------------------------
// Payload de evento — a união discriminada guardada em TicketEvent.payload
// ---------------------------------------------------------------------

export type TaskPayload = {
  type: 'TAREFA';
  assigneeId?: string;
  /** Tempo apontado, em segundos. Nunca em horas fracionadas. */
  spentSeconds: number;
  plannedStart?: string;
  plannedEnd?: string;
  done: boolean;
};

export type SolutionPayload = {
  type: 'SOLUCAO';
  solutionTypeId?: string;
  accepted: boolean;
};

export type StatusChangePayload = {
  type: 'MUDANCA_STATUS';
  from: TicketStatus;
  to: TicketStatus;
};

export type AssignmentChangePayload = {
  type: 'MUDANCA_ATRIBUICAO';
  fromTeamId?: string;
  toTeamId?: string;
  fromUserId?: string;
  toUserId?: string;
};

export type ClassificationChangePayload = {
  type: 'MUDANCA_CLASSIFICACAO';
  fromCategoryId?: string;
  toCategoryId?: string;
  fromUrgency?: Scale;
  toUrgency?: Scale;
  fromImpact?: Scale;
  toImpact?: Scale;
};

export type ApprovalPayload = {
  type: 'APROVACAO';
  approvalId: string;
  decision: ApprovalStatus;
};

export type SlaPausePayload = {
  type: 'PAUSA_SLA';
  pendingReasonId: string;
};

export type SlaResumePayload = {
  type: 'RETOMADA_SLA';
  /** Segundos de expediente descontados dos compromissos. */
  pausedSeconds: number;
};

export type ChannelIoPayload = {
  type: 'ENTRADA_CANAL' | 'SAIDA_CANAL';
  channel: Channel;
  externalId?: string;
  /** Endereço de e-mail ou telefone em E.164. */
  address?: string;
};

export type EventPayload =
  | TaskPayload
  | SolutionPayload
  | StatusChangePayload
  | AssignmentChangePayload
  | ClassificationChangePayload
  | ApprovalPayload
  | SlaPausePayload
  | SlaResumePayload
  | ChannelIoPayload;

// ---------------------------------------------------------------------
// Formulário dinâmico — substitui as 12 tabelas de tickettemplate*
// ---------------------------------------------------------------------

export type FormFieldType =
  | 'TEXTO'
  | 'TEXTO_LONGO'
  | 'NUMERO'
  | 'DATA'
  | 'SELECAO'
  | 'MULTISELECAO'
  | 'BOOLEANO'
  | 'ARQUIVO';

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  /** Só para SELECAO e MULTISELECAO. */
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  help?: string;
  /** Campo visível só para agentes, nunca no portal. */
  internal?: boolean;
};

export type FormSchema = {
  fields: FormField[];
};

// ---------------------------------------------------------------------
// Regras de entrada — substitui RuleTicket / RuleMailCollector
// ---------------------------------------------------------------------

export type IntakeCriterion =
  | { campo: 'assunto' | 'corpo' | 'remetente'; operador: 'contem' | 'igual' | 'regex'; valor: string }
  | { campo: 'canal'; operador: 'igual'; valor: Channel }
  | { campo: 'categoria'; operador: 'igual'; valor: string };

export type IntakeAction =
  | { tipo: 'DEFINIR_CATEGORIA'; categoryId: string }
  | { tipo: 'ATRIBUIR_TIME'; teamId: string }
  | { tipo: 'DEFINIR_URGENCIA'; urgency: Scale }
  | { tipo: 'DEFINIR_TIPO'; ticketType: TicketType }
  | { tipo: 'APLICAR_ACORDO'; agreementIds: string[] }
  | { tipo: 'DESCARTAR'; motivo: string };

export type IntakeRuleDefinition = {
  criteria: IntakeCriterion[];
  /** `E` exige todos os critérios; `OU`, ao menos um. */
  match: 'E' | 'OU';
  actions: IntakeAction[];
};

// ---------------------------------------------------------------------
// Escalonamento
// ---------------------------------------------------------------------

export type EscalationAction =
  | { tipo: 'NOTIFICAR'; alvo: 'ATRIBUIDO' | 'TIME' | 'SUPERVISOR' | 'REQUERENTE' }
  | { tipo: 'AUMENTAR_URGENCIA'; para: Scale }
  | { tipo: 'ATRIBUIR_TIME'; teamId: string }
  | { tipo: 'MARCAR'; etiqueta: string }
  | { tipo: 'WEBHOOK'; webhookId: string };

// ---------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------

export type CalendarSegmentInput = {
  /** 0 = domingo .. 6 = sábado */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Minutos desde a meia-noite, no fuso do calendário. */
  startMinute: number;
  endMinute: number;
};

/** Segunda a sexta, 9h às 18h. Padrão de implantação. */
export const DEFAULT_BUSINESS_HOURS: CalendarSegmentInput[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({ weekday: weekday as 1 | 2 | 3 | 4 | 5, startMinute: 9 * 60, endMinute: 18 * 60 }),
);

// ---------------------------------------------------------------------
// Transições de status
// ---------------------------------------------------------------------

/**
 * Para onde um chamado pode ir a partir de cada status.
 *
 * O GLPI permite quase tudo e deixa a coerência para o operador. Aqui a
 * transição inválida é 409, não um chamado em estado impossível.
 */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NOVO: ['ATRIBUIDO', 'PLANEJADO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO'],
  ATRIBUIDO: ['PLANEJADO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO'],
  PLANEJADO: ['ATRIBUIDO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO'],
  PENDENTE: ['ATRIBUIDO', 'PLANEJADO', 'SOLUCIONADO', 'FECHADO'],
  EM_APROVACAO: ['ATRIBUIDO', 'PLANEJADO', 'PENDENTE', 'SOLUCIONADO', 'FECHADO'],
  SOLUCIONADO: ['FECHADO', 'ATRIBUIDO'],
  /** Chamado fechado não recebe evento: reabrir primeiro. */
  FECHADO: ['ATRIBUIDO'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------

/** O `[#1042]` que sustenta o threading de e-mail e as mensagens de WhatsApp. */
export function ticketTag(number: number): string {
  return `[#${number}]`;
}

export function emailSubject(number: number, subject: string): string {
  return `[Norty Desk #${number}] ${subject}`;
}

/** Extrai o número do chamado do assunto. Mesmo regex do GLPI. */
export function parseTicketNumberFromSubject(subject: string): number | null {
  const match = /\[.*#(\d+)\]/.exec(subject);
  return match ? Number(match[1]) : null;
}

/** `5511999999999@s.whatsapp.net` → `+5511999999999` */
export function normalizePhone(raw: string): string {
  const digits = raw.split('@')[0].replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

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
  /**
   * Mudança de status do **problema**.
   *
   * Tipo próprio porque o payload carrega `ProblemStatus`, e não
   * `TicketStatus`. Alargar `MUDANCA_STATUS` para aceitar os dois faria
   * toda leitura de status de chamado passar a conviver com valores que
   * um chamado nunca tem.
   */
  'MUDANCA_STATUS_PROBLEMA',
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

/**
 * Ciclo do problema.
 *
 * O GLPI reaproveita os status do chamado no problema, e o resultado é
 * um problema "atribuído" que ninguém sabe se já tem causa. Aqui o
 * status conta a investigação: onde ela está, e o que já dá para
 * entregar a quem atende.
 *
 * `CONTORNO_PUBLICADO` é o estado que o GLPI não tem e que mais vale no
 * dia a dia: a causa pode continuar de pé por semanas, mas o
 * atendimento já sabe o que fazer no décimo chamado igual.
 */
export const PROBLEM_STATUSES = [
  'NOVO',
  'INVESTIGANDO',
  'CAUSA_IDENTIFICADA',
  'CONTORNO_PUBLICADO',
  'RESOLVIDO',
  'FECHADO',
] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** Status em que o problema ainda está de pé. */
export const OPEN_PROBLEM_STATUSES: readonly ProblemStatus[] = [
  'NOVO',
  'INVESTIGANDO',
  'CAUSA_IDENTIFICADA',
  'CONTORNO_PUBLICADO',
];

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

export type ProblemStatusChangePayload = {
  type: 'MUDANCA_STATUS_PROBLEMA';
  from: ProblemStatus;
  to: ProblemStatus;
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
  | ProblemStatusChangePayload
  | AssignmentChangePayload
  | ClassificationChangePayload
  | ApprovalPayload
  | SlaPausePayload
  | SlaResumePayload
  | ChannelIoPayload;

/** Anexo já gravado no armazenamento, aguardando virar `Attachment`. */
export type AnexoRecebido = {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
};

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
// Rótulos em português
// ---------------------------------------------------------------------

/**
 * O nome que a pessoa lê para cada valor do domínio.
 *
 * Mora aqui, e não no aplicativo, porque a API também rotula: o painel
 * devolve `rotulo` junto do número, e o CSV do relatório sai com o nome
 * da coluna. Duas tabelas de rótulos divergem na primeira vez que
 * alguém renomeia um status só de um lado (CLAUDE.md, regra 1).
 */
export const ROTULO_STATUS: Record<TicketStatus, string> = {
  NOVO: 'Novo',
  ATRIBUIDO: 'Atribuído',
  PLANEJADO: 'Planejado',
  PENDENTE: 'Pendente',
  EM_APROVACAO: 'Em aprovação',
  SOLUCIONADO: 'Solucionado',
  FECHADO: 'Fechado',
};

export const ROTULO_PROBLEMA_STATUS: Record<ProblemStatus, string> = {
  NOVO: 'Novo',
  INVESTIGANDO: 'Investigando',
  CAUSA_IDENTIFICADA: 'Causa identificada',
  CONTORNO_PUBLICADO: 'Contorno publicado',
  RESOLVIDO: 'Resolvido',
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

export const ROTULO_TIPO: Record<TicketType, string> = {
  INCIDENTE: 'Incidente',
  REQUISICAO: 'Requisição',
};

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

/**
 * Para onde um problema pode ir.
 *
 * Investigar volta a ser possível de qualquer estado, inclusive depois
 * de fechado: a causa que se julgava removida reaparece, e refazer o
 * registro perderia o histórico dos chamados já vinculados a ele.
 */
export const ALLOWED_PROBLEM_TRANSITIONS: Record<ProblemStatus, readonly ProblemStatus[]> = {
  NOVO: ['INVESTIGANDO', 'CAUSA_IDENTIFICADA', 'RESOLVIDO', 'FECHADO'],
  INVESTIGANDO: ['CAUSA_IDENTIFICADA', 'CONTORNO_PUBLICADO', 'RESOLVIDO', 'FECHADO'],
  CAUSA_IDENTIFICADA: ['INVESTIGANDO', 'CONTORNO_PUBLICADO', 'RESOLVIDO', 'FECHADO'],
  CONTORNO_PUBLICADO: ['INVESTIGANDO', 'CAUSA_IDENTIFICADA', 'RESOLVIDO', 'FECHADO'],
  RESOLVIDO: ['INVESTIGANDO', 'FECHADO'],
  FECHADO: ['INVESTIGANDO'],
};

export function canTransitionProblem(from: ProblemStatus, to: ProblemStatus): boolean {
  return ALLOWED_PROBLEM_TRANSITIONS[from].includes(to);
}

/**
 * Erro conhecido é causa **e** contorno documentados.
 *
 * A regra é a mesma no CHECK `problems_erro_conhecido`, no service e no
 * botão da tela. Ela mora aqui porque o aplicativo precisa dizer *por
 * que* o botão está desabilitado antes de a API recusar — e porque duas
 * cópias da mesma regra divergem na primeira vez que alguém muda uma.
 */
export function podeSerErroConhecido(problema: {
  rootCause?: string | null;
  workaround?: string | null;
}): boolean {
  return Boolean(problema.rootCause?.trim()) && Boolean(problema.workaround?.trim());
}

/** O `[P#7]` do problema, irmão do `[#1042]` do chamado. */
export function problemTag(number: number): string {
  return `[P#${number}]`;
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

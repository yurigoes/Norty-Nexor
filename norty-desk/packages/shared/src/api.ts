/**
 * Contratos de API do Norty Desk.
 *
 * O mesmo tipo descreve o que a API devolve e o que o aplicativo espera.
 * A especificação em prosa está em `docs/07-api.md`.
 */

import type {
  ActorRole,
  AgreementKind,
  ApprovalStatus,
  ChangeKind,
  ChangeRisk,
  ChangeStatus,
  Channel,
  FormSchema,
  Recorrencia,
  EventPayload,
  EventType,
  LinkType,
  ProblemStatus,
  Scale,
  TargetKind,
  TicketStatus,
  TicketType,
  Visibility,
} from './domain';
import type { Permission, Role } from './permissions';

// ---------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------

export type Paginated<T> = {
  data: T[];
  /** Opaco. Devolva como veio em `?cursor=`. */
  nextCursor: string | null;
};

/** RFC 7807. Em produção, erro inesperado vira mensagem genérica. */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Erros por campo, quando a validação do corpo falha. */
  errors?: Record<string, string[]>;
};

// ---------------------------------------------------------------------
// Referências enxutas — o que aparece embutido numa listagem
// ---------------------------------------------------------------------

export type PartyKind = 'USER' | 'TEAM' | 'SUPPLIER' | 'CONTACT';

export type PartyRef = {
  kind: PartyKind;
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

export type CategoryRef = {
  id: string;
  /** Caminho completo: `Hardware > Impressora`. */
  name: string;
};

// ---------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------

export type LoginRequest = { email: string; password: string };

export type OrganizationRef = { id: string; slug: string; name: string; role: Role };

export type LoginResponse = {
  /** JWT de 15 minutos, guardado em memória. O refresh vai no cookie. */
  accessToken: string;
  user: { id: string; name: string; email: string; mustChangePassword: boolean };
  organizations: OrganizationRef[];
};

export type MeResponse = {
  user: { id: string; name: string; email: string; avatarUrl?: string };
  organization: OrganizationRef;
  role: Role;
  /** Já resolvidas pela matriz — o aplicativo não recalcula. */
  permissions: Permission[];
  teamIds: string[];
};

// ---------------------------------------------------------------------
// Chamado
// ---------------------------------------------------------------------

export type CommitmentView = {
  kind: AgreementKind;
  target: TargetKind;
  dueAt: string;
  achievedAt: string | null;
  breachedAt: string | null;
  /** Negativo quando o prazo já passou. */
  remainingSeconds: number;
};

export type TicketListItem = {
  id: string;
  number: number;
  subject: string;
  type: TicketType;
  status: TicketStatus;
  urgency: Scale;
  impact: Scale;
  priority: Scale;
  originChannel: Channel;
  category: CategoryRef | null;
  requester: PartyRef | null;
  assignedTeam: PartyRef | null;
  assignedUser: PartyRef | null;
  commitments: CommitmentView[];
  createdAt: string;
  updatedAt: string;
};

export type TicketActorView = {
  id: string;
  role: ActorRole;
  party: PartyRef;
};

export type TicketDetail = TicketListItem & {
  description: string;
  actors: TicketActorView[];
  pendingReason: { id: string; name: string } | null;
  pendingSince: string | null;
  firstResponseAt: string | null;
  solvedAt: string | null;
  closedAt: string | null;
  spentSeconds: number;
  customFields: Record<string, unknown> | null;
  links: { id: string; type: LinkType; ticket: { id: string; number: number; subject: string } }[];
  attachmentCount: number;
  /**
   * O problema por trás deste chamado, quando há um.
   *
   * Vem no detalhe e não só na tela do problema porque é o chamado que
   * se abre: quem atende precisa ver "isto já tem causa conhecida" sem
   * sair da tela — e é daqui que a sugestão sabe qual já foi vinculado.
   */
  problem: TicketProblemRef | null;
  /** A mudança que vai resolver este chamado, quando há uma. */
  change: TicketChangeRef | null;
  /**
   * O formulário que o chamado respondeu.
   *
   * Vem junto porque `customFields` são chaves: sem o schema, a tela
   * mostraria `patrimonio: PAT-4721` em vez de "Patrimônio".
   */
  form: { id: string; name: string; schema: FormSchema } | null;
};

export type TicketProblemRef = {
  id: string;
  number: number;
  title: string;
  isKnownError: boolean;
  workaround: string | null;
};

export type TicketChangeRef = {
  id: string;
  number: number;
  title: string;
  status: ChangeStatus;
  windowStart: string | null;
};

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  eventId: string | null;
  createdAt: string;
};

export type TicketEventView = {
  id: string;
  type: EventType;
  visibility: Visibility;
  channel: Channel;
  author: PartyRef | null;
  body: string | null;
  payload: EventPayload | null;
  attachments: AttachmentView[];
  createdAt: string;
  editedAt: string | null;
};

// ---------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------

export type PartyInput = { kind: PartyKind; id: string } | { kind: 'CONTACT'; email?: string; phone?: string; name?: string };

/** `priority` não entra: é derivada (CLAUDE.md, regra 7). */
export type CreateTicketRequest = {
  subject: string;
  description: string;
  type?: TicketType;
  urgency?: Scale;
  impact?: Scale;
  categoryId?: string;
  /*
   * Não há `formId`: o formulário vem da categoria, resolvido pela API.
   * Aceitá-lo do cliente seria deixar alguém responder ao schema de um
   * formulário e gravar no chamado de outro.
   */
  requester?: PartyInput;
  observers?: PartyInput[];
  customFields?: Record<string, unknown>;
};

export type ReplyRequest = {
  body: string;
  visibility?: Visibility;
  /** Omitido, responde pelo canal de origem do chamado. */
  channel?: Channel;
};

export type AssignRequest = { teamId?: string; userId?: string };

export type ClassifyRequest = {
  categoryId?: string;
  urgency?: Scale;
  impact?: Scale;
  type?: TicketType;
};

export type PauseRequest = { pendingReasonId: string; body?: string };
export type ResolveRequest = { body: string; solutionTypeId?: string };
export type ReopenRequest = { body: string };
export type LinkRequest = { targetTicketId: string; type: LinkType };

export type TicketQuery = {
  status?: TicketStatus[];
  assignedTeamId?: string;
  /** `me` resolve para o usuário do token. */
  assignedUserId?: string | 'me';
  requesterId?: string;
  categoryId?: string;
  priority?: Scale[];
  channel?: Channel[];
  slaBreached?: boolean;
  slaDueBefore?: string;
  q?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
};

// ---------------------------------------------------------------------
// Aprovação
// ---------------------------------------------------------------------

/**
 * O que espera aprovação.
 *
 * Desde a Fase 4 são dois: chamado e mudança. A união discriminada
 * substituiu um campo `ticket` obrigatório — que obrigaria a tela de
 * "minhas aprovações" a mentir sobre metade das linhas, ou a existir
 * duas vezes.
 */
export type ApprovalTarget =
  | { kind: 'CHAMADO'; id: string; number: number; title: string }
  | { kind: 'MUDANCA'; id: string; number: number; title: string };

export type ApprovalView = {
  id: string;
  alvo: ApprovalTarget;
  step: number;
  quorum: number;
  approver: PartyRef;
  status: ApprovalStatus;
  comment: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

export type DecideApprovalRequest = {
  decision: Extract<ApprovalStatus, 'APROVADO' | 'RECUSADO'>;
  comment?: string;
};

// ---------------------------------------------------------------------
// Ação em lote
// ---------------------------------------------------------------------

export type BulkAction =
  | { tipo: 'ATRIBUIR'; teamId?: string; userId?: string }
  | { tipo: 'CLASSIFICAR'; categoryId?: string; urgency?: Scale; impact?: Scale }
  | { tipo: 'MUDAR_STATUS'; status: TicketStatus; body?: string };

export type BulkRequest = {
  ticketIds: string[];
  acao: BulkAction;
};

/**
 * O resultado **por item**.
 *
 * Uma ação em lote que devolve "23 de 40 concluídos" e não diz quais 17
 * falharam obriga o agente a conferir os quarenta à mão — e ele não vai
 * conferir.
 */
export type BulkResultItem = {
  ticketId: string;
  number?: number;
  ok: boolean;
  motivo?: string;
};

export type BulkResult = {
  total: number;
  concluidos: number;
  falhas: number;
  itens: BulkResultItem[];
};

// ---------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  diff: Record<string, { de: unknown; para: unknown }> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

// ---------------------------------------------------------------------
// Ativos
// ---------------------------------------------------------------------

export const ASSET_KINDS = [
  'COMPUTADOR',
  'MONITOR',
  'IMPRESSORA',
  'TELEFONE',
  'REDE',
  'LICENCA',
  'OUTRO',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ['EM_USO', 'EM_ESTOQUE', 'EM_MANUTENCAO', 'BAIXADO'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ROTULO_ATIVO: Record<AssetKind, string> = {
  COMPUTADOR: 'Computador',
  MONITOR: 'Monitor',
  IMPRESSORA: 'Impressora',
  TELEFONE: 'Telefone',
  REDE: 'Rede',
  LICENCA: 'Licença',
  OUTRO: 'Outro',
};

export const ROTULO_ATIVO_STATUS: Record<AssetStatus, string> = {
  EM_USO: 'Em uso',
  EM_ESTOQUE: 'Em estoque',
  EM_MANUTENCAO: 'Em manutenção',
  BAIXADO: 'Baixado',
};

export type AssetView = {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  name: string;
  tag: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
  user: PartyRef | null;
  purchasedAt: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  /** Quantos chamados já envolveram este equipamento. */
  ticketCount?: number;
};

export type WriteAssetRequest = {
  kind?: AssetKind;
  status?: AssetStatus;
  name: string;
  tag?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
  userId?: string | null;
  purchasedAt?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------
// Satisfação
// ---------------------------------------------------------------------

export type SurveyView = {
  id: string;
  ticket: { id: string; number: number; subject: string };
  sentAt: string | null;
  score: number | null;
  comment: string | null;
  answeredAt: string | null;
  expiresAt: string;
};

/** O que a página pública da pesquisa mostra — sem nada de interno. */
export type SurveyPublicView = {
  ticketNumber: number;
  subject: string;
  organizationName: string;
  answered: boolean;
  score: number | null;
  comment: string | null;
};

export type AnswerSurveyRequest = {
  score: number;
  comment?: string;
};

export type SatisfacaoResumo = {
  periodo: { de: string; ate: string };
  enviadas: number;
  respondidas: number;
  /** Respondidas ÷ enviadas. */
  taxaDeResposta: number;
  /** Média das notas respondidas, 1 a 5. */
  media: number;
  /** Percentual de notas 4 e 5 menos percentual de 1 e 2. */
  csat: number;
  porNota: { nota: number; total: number }[];
};

// ---------------------------------------------------------------------
// Painéis e relatórios
// ---------------------------------------------------------------------

/** Um número do painel, com o dado que o gerou — nunca só o número. */
export type Indicador = {
  rotulo: string;
  valor: number;
  /** Sufixo de exibição: `%`, `h`, `min`. Ausente quando é contagem. */
  unidade?: string;
  /** Comparação com o período anterior, em pontos percentuais ou absoluto. */
  variacao?: number;
  /** Filtro da fila que mostra exatamente estes chamados. */
  filtro?: string;
};

export type FatiaDeContagem = {
  chave: string;
  rotulo: string;
  total: number;
};

export type PainelView = {
  escopo: 'AGENTE' | 'TIME' | 'ORGANIZACAO';
  periodo: { de: string; ate: string };
  indicadores: Indicador[];
  porStatus: FatiaDeContagem[];
  porPrioridade: FatiaDeContagem[];
  porCanal: FatiaDeContagem[];
  /** Volume diário no período, para o gráfico de linha. */
  porDia: { dia: string; abertos: number; resolvidos: number }[];
};

export type LinhaDeSla = {
  chave: string;
  rotulo: string;
  total: number;
  cumpridos: number;
  violados: number;
  emAberto: number;
  /** Cumpridos ÷ (cumpridos + violados). Não conta o que ainda corre. */
  percentual: number;
};

export type RelatorioSlaView = {
  periodo: { de: string; ate: string };
  agrupamento: 'categoria' | 'time' | 'prioridade' | 'acordo';
  geral: LinhaDeSla;
  linhas: LinhaDeSla[];
};

// ---------------------------------------------------------------------
// Problema
// ---------------------------------------------------------------------

/*
 * Os nomes vão em português porque `ProblemDetails` acima já é o
 * envelope de erro RFC 7807 desta API. Duas coisas chamadas "problem"
 * no mesmo arquivo é confusão garantida no `import`.
 */

export type ProblemaResumo = {
  id: string;
  number: number;
  title: string;
  status: ProblemStatus;
  urgency: Scale;
  impact: Scale;
  priority: Scale;
  category: CategoryRef | null;
  assignedTeam: PartyRef | null;
  assignedUser: PartyRef | null;
  isKnownError: boolean;
  /** Quantos chamados já apontam para este problema. */
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProblemaDetalhe = ProblemaResumo & {
  description: string;
  rootCause: string | null;
  workaround: string | null;
  knownErrorAt: string | null;
  /** Artigo da base que documenta o erro conhecido. */
  article: { id: string; title: string } | null;
  resolvedAt: string | null;
  closedAt: string | null;
  tickets: ProblemaChamadoRef[];
};

export type ProblemaChamadoRef = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  createdAt: string;
};

export type EscreverProblemaRequest = {
  title: string;
  description: string;
  status?: ProblemStatus;
  urgency?: Scale;
  impact?: Scale;
  categoryId?: string | null;
  assignedTeamId?: string | null;
  assignedUserId?: string | null;
  rootCause?: string | null;
  workaround?: string | null;
  /** Só aceita `true` com causa e contorno preenchidos. */
  isKnownError?: boolean;
  articleId?: string | null;
};

export type ProblemaQuery = {
  q?: string;
  status?: ProblemStatus;
  isKnownError?: boolean;
  assignedTeamId?: string;
  assignedUserId?: string;
  limit?: number;
};

/** O que a tela do chamado mostra: "isso já é um problema conhecido". */
export type ErroConhecidoSugerido = {
  id: string;
  number: number;
  title: string;
  workaround: string | null;
  status: ProblemStatus;
  /** Aderência da busca de texto, de 0 a 1. */
  score: number;
};

// ---------------------------------------------------------------------
// Formulário dinâmico
// ---------------------------------------------------------------------

export type FormularioView = {
  id: string;
  name: string;
  /** O formulário da organização, usado quando a categoria não tem um. */
  isDefault: boolean;
  category: CategoryRef | null;
  schema: FormSchema;
  /** Quantos chamados já responderam a este formulário. */
  ticketCount: number;
};

export type EscreverFormularioRequest = {
  name: string;
  schema: FormSchema;
  categoryId?: string | null;
  isDefault?: boolean;
};

/** O formulário que vale para uma categoria, já resolvido pela API. */
export type FormularioResolvido = {
  form: FormularioView | null;
  /**
   * De onde ele veio: a própria categoria, uma categoria acima, ou o
   * padrão da organização. A tela de configuração mostra isso — sem a
   * origem, "por que aparece este formulário aqui?" não tem resposta.
   */
  origem: 'CATEGORIA' | 'CATEGORIA_ACIMA' | 'PADRAO' | 'NENHUM';
};

// ---------------------------------------------------------------------
// Chamado recorrente
// ---------------------------------------------------------------------

export type RecorrenciaView = {
  id: string;
  name: string;
  isActive: boolean;
  /** O molde do chamado que vai nascer. */
  subject: string;
  description: string;
  ticketType: TicketType;
  urgency: Scale;
  impact: Scale;
  category: CategoryRef | null;
  assignedTeam: PartyRef | null;
  requester: PartyRef;
  schedule: Recorrencia;
  timezone: string;
  /** Quantos segundos antes da ocorrência o chamado é aberto. */
  createBeforeSeconds: number;
  startsAt: string | null;
  endsAt: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  /** A recorrência em português, como a tela e a linha do tempo dizem. */
  descricao: string;
};

export type EscreverRecorrenciaRequest = {
  name: string;
  subject: string;
  description: string;
  schedule: Recorrencia;
  ticketType?: TicketType;
  urgency?: Scale;
  impact?: Scale;
  categoryId?: string | null;
  assignedTeamId?: string | null;
  requesterId?: string | null;
  timezone?: string;
  createBeforeSeconds?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
};

// ---------------------------------------------------------------------
// Mudança
// ---------------------------------------------------------------------

export type MudancaResumo = {
  id: string;
  number: number;
  title: string;
  status: ChangeStatus;
  kind: ChangeKind;
  risk: ChangeRisk;
  category: CategoryRef | null;
  assignedTeam: PartyRef | null;
  assignedUser: PartyRef | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** Quantos chamados esta mudança carrega. */
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MudancaDetalhe = MudancaResumo & {
  description: string;
  implementationPlan: string | null;
  testPlan: string | null;
  rollbackPlan: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** O que de fato aconteceu, escrito depois da execução. */
  outcome: string | null;
  problem: { id: string; number: number; title: string } | null;
  tickets: ProblemaChamadoRef[];
  approvals: ApprovalView[];
};

export type EscreverMudancaRequest = {
  title: string;
  description: string;
  status?: ChangeStatus;
  kind?: ChangeKind;
  risk?: ChangeRisk;
  categoryId?: string | null;
  assignedTeamId?: string | null;
  assignedUserId?: string | null;
  implementationPlan?: string | null;
  testPlan?: string | null;
  rollbackPlan?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  outcome?: string | null;
  problemId?: string | null;
};

export type MudancaQuery = {
  q?: string;
  status?: ChangeStatus;
  kind?: ChangeKind;
  risk?: ChangeRisk;
  abertas?: boolean;
  /** Só as com janela dentro do intervalo — é o que a agenda pede. */
  de?: string;
  ate?: string;
  limit?: number;
};

// ---------------------------------------------------------------------
// Base de conhecimento
// ---------------------------------------------------------------------

export type ArticleListItem = {
  id: string;
  title: string;
  isPublic: boolean;
  isArchived: boolean;
  category: CategoryRef | null;
  keywords: string[];
  author: PartyRef;
  views: number;
  updatedAt: string;
  /** Trecho com os termos da busca em destaque. Só vem na busca. */
  excerpt?: string;
};

export type ArticleDetail = ArticleListItem & {
  body: string;
  version: number;
  createdAt: string;
};

export type ArticleRevisionView = {
  version: number;
  title: string;
  body: string;
  note: string | null;
  editor: PartyRef;
  createdAt: string;
};

export type WriteArticleRequest = {
  title: string;
  body: string;
  categoryId?: string | null;
  keywords?: string[];
  isPublic?: boolean;
  isArchived?: boolean;
  /** Por que mudou. Vai para a revisão. */
  note?: string;
};

// ---------------------------------------------------------------------
// Canais
// ---------------------------------------------------------------------

/** Corpo normalizado do webhook de e-mail. Ver `docs/06-canais.md`. */
export type InboundEmailRequest = {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  from: { email: string; name?: string };
  to: { email: string; name?: string }[];
  cc?: { email: string; name?: string }[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: {
    filename: string;
    contentType: string;
    /** Base64. */
    content: string;
  }[];
  receivedAt?: string;
};

/** Corpo da Evolution, repassado sem transformação. */
export type EvolutionWebhookRequest = {
  event: 'messages.upsert' | 'messages.update' | string;
  instance: string;
  data: {
    key: { remoteJid: string; fromMe: boolean; id: string };
    pushName?: string;
    message?: Record<string, unknown>;
    messageType?: string;
    messageTimestamp?: number;
  };
};

export type InboundAcceptedResponse = {
  /** `ACEITO` enfileirou; `DUPLICADO` já tinha sido visto; `DESCARTADO` casou com regra. */
  resultado: 'ACEITO' | 'DUPLICADO' | 'DESCARTADO';
  inboundMessageId?: string;
  motivo?: string;
};

export type InboundMessageView = {
  id: string;
  channel: Channel;
  externalId: string;
  fromAddress: string;
  subject: string | null;
  receivedAt: string;
  processedAt: string | null;
  discardedReason: string | null;
  ticket: { id: string; number: number } | null;
};

// ---------------------------------------------------------------------
// Intake público
// ---------------------------------------------------------------------

export type IntakeTicketRequest = {
  subject: string;
  description: string;
  type?: TicketType;
  urgency?: Scale;
  impact?: Scale;
  /** Caminho da categoria: `Sistemas > Integração`. Criada se não existir. */
  categoryPath?: string;
  requester?: { email?: string; phone?: string; name?: string };
  /** Junto com `Idempotency-Key`, impede chamado repetido de monitoramento. */
  externalRef?: string;
};

// ---------------------------------------------------------------------
// Painéis
// ---------------------------------------------------------------------

export type DashboardCard = {
  chave: string;
  rotulo: string;
  valor: number;
  /** Variação percentual sobre o período anterior. */
  variacao?: number;
};

export type SeriePonto = { rotulo: string; valor: number };

export type DashboardResponse = {
  cartoes: DashboardCard[];
  series: Record<string, SeriePonto[]>;
};

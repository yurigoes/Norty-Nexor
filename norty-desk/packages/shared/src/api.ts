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
  Channel,
  EventPayload,
  EventType,
  LinkType,
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
  formId?: string;
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

export type ApprovalView = {
  id: string;
  ticket: { id: string; number: number; subject: string };
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

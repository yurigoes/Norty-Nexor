/**
 * Contratos de API do Norty Desk.
 *
 * O mesmo tipo descreve o que a API devolve e o que o aplicativo espera.
 * A especificação em prosa está em `docs/07-api.md`.
 */

import type {
  ActorRole,
  AgreementKind,
  AppointmentStatus,
  RemoteAccessKind,
  ServiceOrderStatus,
  ApprovalStatus,
  ChangeKind,
  ChangeRisk,
  ChangeStatus,
  Channel,
  BillingPeriod,
  ComponentKind,
  ContractKind,
  CostKind,
  FormSchema,
  Recorrencia,
  TemplateKind,
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
  email?: string | null;
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

/** `login` aceita e-mail ou nome de usuário; `email` é o nome antigo do campo. */
export type LoginRequest = {
  login: string;
  password: string;
  /** Slug da organização. Obrigatório quando `login` é nome de usuário. */
  organization?: string;
};

export type OrganizationRef = { id: string; slug: string; name: string; role: Role };

export type LoginResponse = {
  /** JWT de 15 minutos, guardado em memória. O refresh vai no cookie. */
  accessToken: string;
  user: { id: string; name: string; email: string | null; username?: string | null; mustChangePassword: boolean };
  organizations: OrganizationRef[];
};

export type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    username?: string | null;
    /** Nome do diretório (AD) que autentica a pessoa; nulo = conta local. */
    authSourceName?: string | null;
    phone?: string | null;
    /** Senha provisória: o aplicativo não abre antes da troca. */
    mustChangePassword: boolean;
    avatarUrl?: string;
  };
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
  /**
   * O código que o solicitante cita, e o único que serve fora daqui.
   *
   * `number` é o handle de quem atende: curto, sequencial, bom para
   * falar em reunião — e por isso mesmo adivinhável. O protocolo é o
   * que vai no e-mail, no WhatsApp e na consulta pública, porque quem
   * tivesse um `number` teria todos os outros.
   *
   * Os dois convivem: a fila mostra o número, a tela do chamado mostra
   * os dois, e quem liga perguntando "meu chamado" tem o que ditar.
   */
  protocol: string;
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

// ---------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------

/**
 * Um time e quem está nele.
 *
 * Os membros vêm junto, e não numa segunda chamada: a tela de times
 * existe justamente para responder "quem está no time?", e uma lista
 * de nomes sem pessoas dentro não responde nada.
 *
 * `isManager` é o gestor **do time** — quem aprova e para quem o
 * escalonamento sobe. Não é o papel GESTOR da matriz RBAC: aquele diz
 * o que a pessoa pode fazer no sistema, este diz de quem ela responde.
 */
export type TimeView = {
  id: string;
  name: string;
  description: string | null;
  /** E-mail da fila do time, usado como remetente das respostas. */
  email: string | null;
  isActive: boolean;
  members: TimeMembroView[];
};

export type TimeMembroView = {
  id: string;
  name: string;
  email: string | null;
  isManager: boolean;
};

export type EscreverTimeRequest = {
  name: string;
  description?: string | null;
  email?: string | null;
  isActive?: boolean;
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
  /** Nulo quando o anexo entrou por canal sem autor identificado. */
  uploadedById: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------
// Consulta pública por protocolo
// ---------------------------------------------------------------------

/**
 * O que um estranho com o protocolo enxerga.
 *
 * Deliberadamente menos que `TicketDetail`. Quem abre esta tela provou
 * apenas que tem o código — não que é a pessoa do chamado. Então: nada
 * de e-mail, telefone, nota interna, anexo para baixar, id de ninguém.
 * Só o andamento, que é o que o código promete mostrar.
 */
export type ConsultaPublica = {
  protocol: string;
  subject: string;
  status: TicketStatus;
  /** Nome da organização que atende. */
  organization: string;
  openedAt: string;
  solvedAt: string | null;
  closedAt: string | null;
  /** Data e hora do atendimento marcado, quando há um. */
  scheduledFor: string | null;
  timeline: EventoPublico[];
  /**
   * As ordens de serviço já concluídas.
   *
   * Aparecem aqui porque é isto que dá sentido ao código de verificação
   * impresso no carimbo: quem tem o papel na mão digita o protocolo e
   * confere que o documento existe e bate.
   */
  serviceOrders: OrdemPublica[];
};

/**
 * A empresa, como a tela sem login a enxerga.
 *
 * Só id e nome. Nem documento, nem contato, nem quantos chamados tem:
 * quem abre esta tela não provou ser ninguém, e o que sai daqui sai
 * para qualquer um que digite três letras.
 */
export type EmpresaPublica = {
  id: string;
  name: string;
};

export type AbrirPublicoRequest = {
  clientId: string;
  /** Quem está abrindo. Nome e ao menos uma forma de retorno. */
  requesterName: string;
  requesterEmail?: string;
  requesterPhone?: string;
  subject: string;
  description: string;
  /** O tipo de chamado, que também decide para quem ele vai. */
  categoryId?: string;
  /** O modelo escolhido, e as respostas dos campos dele. */
  formId?: string;
  customFields?: Record<string, unknown>;
  /**
   * Quem acompanha junto, por e-mail.
   *
   * E-mail e não id: quem abre sem login não conhece id de ninguém, e
   * dar-lhe uma lista de pessoas seria entregar o catálogo da empresa
   * a quem só digitou um nome.
   */
  observerEmails?: string[];
};

/** Um tipo de chamado, como a tela sem login o enxerga. */
export type CategoriaPublica = {
  id: string;
  name: string;
};

/** O que a pessoa leva da tela: o protocolo para acompanhar. */
export type AberturaPublicaResposta = {
  protocol: string;
  number: number;
};

export type OrdemPublica = {
  number: number;
  concludedAt: string;
  signedByName: string | null;
  itemsDone: number;
  itemsTotal: number;
};

export type EventoPublico = {
  at: string;
  /** Frase pronta. A regra de o que dizer é do servidor, não da tela. */
  text: string;
  /** Primeiro nome de quem escreveu, ou `null` para evento do sistema. */
  by: string | null;
};

// ---------------------------------------------------------------------
// Atendimento agendado
// ---------------------------------------------------------------------

export type AppointmentView = {
  id: string;
  ticketId: string;
  /** ISO 8601 com fuso. A tela formata; o contrato não presume o fuso. */
  scheduledFor: string;
  durationMinutes: number;
  technician: PartyRef | null;
  note: string | null;
  status: AppointmentStatus;
  /** Quanto este agendamento empurrou o prazo do chamado, em segundos. */
  postponedSeconds: number;
  createdAt: string;
};

// ---------------------------------------------------------------------
// Ordem de serviço
// ---------------------------------------------------------------------

export type ServiceOrderItemView = {
  id: string;
  position: number;
  description: string;
  done: boolean;
  notes: string | null;
  doneAt: string | null;
};

export type ServiceOrderView = {
  id: string;
  ticketId: string;
  number: number;
  status: ServiceOrderStatus;
  technician: PartyRef | null;
  appointmentId: string | null;
  report: string | null;
  items: ServiceOrderItemView[];
  /** Quem assinou, e como. Nulo enquanto não assinada. */
  signedByName: string | null;
  signedByRole: string | null;
  signedAt: string | null;
  /** Há assinatura desenhada guardada? O traço em si não vem na lista. */
  hasSignature: boolean;
  createdAt: string;
};

export type EscreverOrdemRequest = {
  appointmentId?: string;
  technicianId?: string;
  report?: string;
};

export type EscreverItemRequest = {
  description: string;
  notes?: string;
  done?: boolean;
};

export type ConcluirOrdemRequest = {
  /** PNG em `data:`, vindo do `<canvas>` onde o técnico desenhou. */
  signature: string;
  signedByName: string;
  signedByRole?: string;
  report?: string;
};

export type AgendarRequest = {
  scheduledFor: string;
  durationMinutes?: number;
  technicianId?: string;
  note?: string;
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
  /**
   * O texto foi redigido pelo Norty Copilot.
   *
   * Campo próprio, e não uma chave no `payload`, porque o selo de IA
   * não pode depender de alguém lembrar de ler um JSON. Ver
   * `MARCA_DE_IA` em `domain.ts`: a mesma verdade sai na tela, no
   * e-mail e no WhatsApp.
   */
  aiGenerated: boolean;
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
  /**
   * O modelo escolhido, quando houve escolha.
   *
   * Omitido, o formulário continua vindo da categoria — a herança não
   * mudou. Isto existe para o painel rápido: clicar em "Impressora"
   * abre com aquele modelo, e não com o que a categoria calhar de ter.
   *
   * Aqui havia a decisão contrária, pelo receio de alguém responder ao
   * schema de um formulário e gravar o resultado no chamado de outro.
   * O receio é legítimo e a resposta não é recusar o campo: é validar
   * contra o **mesmo** formulário que vai ser gravado, que é o que a
   * abertura sem login já faz. A API ainda exige que o modelo seja da
   * organização e esteja marcado como modelo — ficha que existe só
   * para herdar não é item de menu.
   */
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
  /**
   * O texto veio do Norty Copilot?
   *
   * Quem envia é sempre a pessoa, mas quem **lê** tem direito de saber
   * que o texto foi escrito por máquina. A marca acompanha o evento e
   * vale na tela, no e-mail e no WhatsApp.
   *
   * A tela marca sozinha quando o rascunho veio do Copilot, e a pessoa
   * pode desmarcar se reescreveu por conta — a marca diz quem escreveu,
   * e mentir nela nos dois sentidos é pior que não tê-la.
   */
  aiGenerated?: boolean;
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
  actor: { id: string; name: string; email: string | null } | null;
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

/**
 * Localização com o caminho inteiro.
 *
 * "Sala 201" sozinho não localiza ninguém; "Prédio A > 2º andar > Sala
 * 201" localiza. O caminho é montado na leitura, não gravado — um
 * caminho gravado é mais uma coisa a atualizar quando alguém renomeia o
 * prédio.
 */
export type LocalizacaoRef = {
  id: string;
  name: string;
  path: string;
};

export type CatalogoRef = { id: string; name: string };

export type AssetView = {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  name: string;
  tag: string | null;
  serialNumber: string | null;
  manufacturer: CatalogoRef | null;
  assetModel: CatalogoRef | null;
  location: LocalizacaoRef | null;
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
  manufacturerId?: string | null;
  assetModelId?: string | null;
  locationId?: string | null;
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
// Catálogo do ativo — localização, fabricante e modelo
// ---------------------------------------------------------------------

export type LocalizacaoView = {
  id: string;
  name: string;
  /** Caminho inteiro, montado na leitura. */
  path: string;
  parentId: string | null;
  notes: string | null;
  isActive: boolean;
  /** Quantos ativos estão aqui — sem contar as sublocalizações. */
  assetCount: number;
};

export type EscreverLocalizacaoRequest = {
  name: string;
  parentId?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type FabricanteView = {
  id: string;
  name: string;
  modelCount: number;
  assetCount: number;
};

export type ModeloDeAtivoView = {
  id: string;
  name: string;
  kind: AssetKind;
  manufacturer: CatalogoRef | null;
  assetCount: number;
};

export type EscreverModeloDeAtivoRequest = {
  name: string;
  kind?: AssetKind;
  manufacturerId?: string | null;
};

// ---------------------------------------------------------------------
// Componentes do ativo
// ---------------------------------------------------------------------

export type ComponenteView = {
  id: string;
  kind: ComponentKind;
  /** Modelo do componente: "Kingston KVR26N19S8", "Samsung 980". */
  name: string;
  manufacturer: CatalogoRef | null;
  serialNumber: string | null;
  /** A ficha do tipo, validada por `validarAtributos`. */
  attributes: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
};

export type EscreverComponenteRequest = {
  kind: ComponentKind;
  name: string;
  manufacturerId?: string | null;
  serialNumber?: string | null;
  attributes?: Record<string, unknown>;
  notes?: string | null;
};

/**
 * O ativo com o que está pendurado dentro dele.
 *
 * Só acrescenta os componentes ao `AssetView`. O dado financeiro do
 * ativo (valor de compra, nota, fornecedor) fica de fora de propósito:
 * ler o ativo é `ativo:ler`, que o agente tem, e quanto a empresa pagou
 * pela máquina não é informação de quem vai consertá-la.
 */
export type AssetDetail = AssetView & {
  components: ComponenteView[];
};

/**
 * Como se chega na máquina.
 *
 * Só chega a quem tem `ativo:acesso-remoto`. A **senha não está aqui**
 * e não está em nenhuma outra carga: ela sai por uma rota própria, uma
 * vez, e a saída fica na auditoria. Pôr a senha neste tipo faria dela
 * um campo que vaza junto com qualquer tela que mostre o equipamento.
 */
export type AcessoRemotoView = {
  tailscaleIp: string | null;
  vpnNotes: string | null;
  remoteAccessKind: RemoteAccessKind | null;
  remoteAccessId: string | null;
  /** Há senha guardada? O valor dela, não. */
  temSenha: boolean;
};

export type EscreverAcessoRemotoRequest = {
  tailscaleIp?: string | null;
  vpnNotes?: string | null;
  remoteAccessKind?: RemoteAccessKind | null;
  remoteAccessId?: string | null;
  /**
   * A senha nova. Omitir mantém a que está lá; `null` apaga.
   *
   * A diferença importa: uma tela que não mostra a senha também não
   * pode reenviá-la, e sem o "omitir mantém" toda edição de outro
   * campo apagaria a senha sem ninguém pedir.
   */
  remoteAccessSecret?: string | null;
};

/** O que a rota de revelar devolve. Uma vez, e auditada. */
export type SenhaRevelada = {
  secret: string;
};

// ---------------------------------------------------------------------
// Fornecedor, contrato, orçamento e custo
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Carteira de clientes
// ---------------------------------------------------------------------

export type ClienteView = {
  id: string;
  name: string;
  document: string | null;
  /** Domínio do e-mail: é dele que sai o login das pessoas. */
  emailDomain: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  /** Quantas pessoas desta empresa têm acesso ao portal. */
  peopleCount: number;
  /** Chamados abertos agora. É a coluna que diz onde olhar primeiro. */
  openTickets: number;
};

export type PessoaDoClienteView = {
  id: string;
  name: string;
  /** O login gerado, que a pessoa usa para entrar. */
  login: string;
  contactEmail: string | null;
  phone: string | null;
  isActive: boolean;
  /** Ainda não definiu o PIN: o primeiro acesso está pendente. */
  pinPendente: boolean;
};

export type ClienteDetail = ClienteView & {
  people: PessoaDoClienteView[];
};

export type EscreverClienteRequest = {
  name: string;
  emailDomain: string;
  document?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type EscreverPessoaDoClienteRequest = {
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
  isActive?: boolean;
};

export type FornecedorView = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contractCount: number;
};

export type EscreverFornecedorRequest = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type ContratoView = {
  id: string;
  number: string;
  name: string;
  kind: ContractKind;
  supplier: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string | null;
  noticeDays: number;
  autoRenew: boolean;
  billingPeriod: BillingPeriod;
  /** Decimal vira `number` uma vez só, no serializador (CLAUDE.md, regra 5). */
  value: number;
  notes: string | null;
  isActive: boolean;
  /** Quantos ativos o contrato cobre. */
  assetCount: number;
};

export type EscreverContratoRequest = {
  number: string;
  name: string;
  kind?: ContractKind;
  supplierId?: string | null;
  startsAt: string;
  endsAt?: string | null;
  noticeDays?: number;
  autoRenew?: boolean;
  billingPeriod?: BillingPeriod;
  value?: number;
  notes?: string | null;
  isActive?: boolean;
};

export type OrcamentoView = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  value: number;
  notes: string | null;
  /** Quanto já foi lançado contra ele. */
  spent: number;
};

export type EscreverOrcamentoRequest = {
  name: string;
  startsAt: string;
  endsAt: string;
  value?: number;
  notes?: string | null;
};

export type CustoView = {
  id: string;
  kind: CostKind;
  label: string;
  hours: number | null;
  hourlyRate: number | null;
  amount: number;
  budget: { id: string; name: string } | null;
  author: PartyRef | null;
  createdAt: string;
};

export type LancarCustoRequest = {
  kind: CostKind;
  label: string;
  /** Só para TEMPO. O valor da linha sai de `hours * hourlyRate`. */
  hours?: number;
  hourlyRate?: number;
  /** Para MATERIAL e FIXO. */
  amount?: number;
  budgetId?: string | null;
};

/** O que a tela do chamado mostra sobre dinheiro. */
export type CustoDoChamado = {
  linhas: CustoView[];
  total: number;
};

/** Uma linha do relatório de custo. */
export type LinhaDeCusto = {
  chave: string;
  rotulo: string;
  chamados: number;
  total: number;
};

export type RelatorioDeCusto = {
  de: string;
  ate: string;
  total: number;
  porCategoria: LinhaDeCusto[];
  porTipo: LinhaDeCusto[];
};

// ---------------------------------------------------------------------
// Tarefa do chamado
// ---------------------------------------------------------------------

/**
 * Uma tarefa é um `TicketEvent` do tipo `TAREFA`.
 *
 * Não é tabela própria: a linha do tempo é a fonte, e a tarefa aparece
 * nela junto do resto (CLAUDE.md, regra 8). Esta view é a mesma coisa
 * lida pelo lado do painel de tarefas.
 */
export type TicketTaskView = {
  id: string;
  body: string;
  done: boolean;
  /** Tempo apontado, em segundos. Nunca em horas fracionadas. */
  spentSeconds: number;
  assignee: PartyRef | null;
  author: PartyRef | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  createdAt: string;
};

export type CriarTarefaRequest = {
  body: string;
  assigneeId?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  spentSeconds?: number;
};

export type EditarTarefaRequest = {
  body?: string;
  done?: boolean;
  assigneeId?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  /** Somado ao que já estava apontado — apontar tempo é acrescentar. */
  addSpentSeconds?: number;
};

// ---------------------------------------------------------------------
// Modelos de texto
// ---------------------------------------------------------------------

export type ModeloView = {
  id: string;
  kind: TemplateKind;
  name: string;
  body: string;
  category: CategoryRef | null;
  /** Só para RESPOSTA: se o texto entra como nota interna. */
  isInternal: boolean;
  isActive: boolean;
  /** Quantas vezes já foi usado. Ordena a lista pelo que serve. */
  usageCount: number;
};

export type EscreverModeloRequest = {
  kind: TemplateKind;
  name: string;
  body: string;
  categoryId?: string | null;
  isInternal?: boolean;
  isActive?: boolean;
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
  /** Aparece na lista de modelos que a pessoa escolhe ao abrir. */
  isModel: boolean;
  /** Vale também na abertura sem login. */
  isPublic: boolean;
  description: string | null;
  position: number;
  /**
   * Para onde vai o chamado aberto com este modelo.
   *
   * Vence o destino da categoria quando o modelo é escolhido a dedo —
   * ver `destinoDoChamado` em domain.ts. Os dois nulos significam
   * "não opino": o chamado segue o que a categoria disser.
   */
  defaultTeam: { id: string; name: string } | null;
  defaultAssignee: { id: string; name: string } | null;
  /** O que o sistema faz sozinho ao abrir por este modelo. */
  acaoAutomatica: AcaoAutomatica | null;
};

/**
 * A pessoa reconhecida na abertura sem login.
 *
 * Devolve **uma** ou nenhuma, e só com casamento exato — o e-mail
 * inteiro, ou o nome completo. Nunca uma lista, nunca um id.
 *
 * A diferença importa: busca por prefixo aqui entregaria o catálogo de
 * funcionários da empresa a quem só escolheu o nome dela e digitou uma
 * letra. É a mesma razão pela qual observador se informa digitando o
 * e-mail, e não escolhendo de uma lista.
 *
 * O que sobra: quem já sabe o e-mail exato de alguém descobre o
 * telefone dele. É o preço de preencher sozinho, e é o dado de contato
 * da própria empresa — mas está escrito aqui para ninguém descobrir
 * depois.
 */
export type PessoaReconhecida = {
  name: string;
  email: string | null;
  phone: string | null;
};

/**
 * Um modelo de chamado, como a tela de abertura o enxerga.
 *
 * É o mesmo `TicketForm` visto do outro lado: lá é "o formulário que a
 * categoria traz", aqui é "o botão que a pessoa clica". Vem com o
 * schema junto porque escolher o modelo e carregar os campos é um
 * gesto só — buscar os campos numa segunda chamada faria a tela piscar
 * vazia entre o clique e a resposta.
 */
export type ModeloDeChamado = {
  id: string;
  name: string;
  description: string | null;
  schema: FormSchema;
  /** A categoria que o modelo já traz, quando ele tem uma. */
  category: CategoryRef | null;
};

export type EscreverFormularioRequest = {
  defaultTeamId?: string | null;
  defaultAssigneeId?: string | null;
  name: string;
  schema: FormSchema;
  categoryId?: string | null;
  isDefault?: boolean;
  /** Aparece na lista de quem vai abrir chamado. */
  isModel?: boolean;
  /** Vale também na abertura sem login. Só faz sentido com `isModel`. */
  isPublic?: boolean;
  description?: string | null;
  position?: number;
  /** Nulo desliga. Ver `ACOES_AUTOMATICAS`. */
  acaoAutomatica?: AcaoAutomatica | null;
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
  /**
   * Quantos chamados esta resolução já resolveu, confirmado por quem
   * atendeu.
   *
   * É o que separa "artigo com texto parecido" de "isto costuma ser a
   * resposta" — e é por ele que a sugestão ordena. Texto parecido não é
   * a mesma coisa que solução que funcionou.
   */
  resolvedCount: number;
  /** Saiu de um chamado? É o que deixa dizer "já houve isto antes". */
  fromTicket: { id: string; number: number } | null;
};

/**
 * A verificação que o sistema propõe num chamado novo.
 *
 * Diferente da sugestão antiga, que listava artigos parecidos: aqui há
 * uma afirmação — isto já aconteceu, e isto resolveu — e um gesto para
 * confirmar ou descartar. É a confirmação que alimenta o índice.
 */
export type VerificacaoSugerida = ArticleListItem & {
  /** Já foi confirmada como a resolução **deste** chamado? */
  confirmada: boolean;
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

/** O que a tela manda ao registrar a resolução de um chamado no índice. */
export type RegistrarResolucaoRequest = {
  title: string;
  body: string;
  /** Publicar no portal do solicitante, além do atendimento. */
  isPublic?: boolean;
  keywords?: string[];
};

// ---------------------------------------------------------------------
// Norty Copilot
// ---------------------------------------------------------------------

export const COPILOT_INTENCOES = ['REDIGIR', 'SUGERIR'] as const;
export type CopilotIntencao = (typeof COPILOT_INTENCOES)[number];

/**
 * Quanto texto o técnico pode mandar para o Copilot reescrever.
 *
 * Generoso o bastante para uma resposta longa e curto o bastante para
 * que ninguém cole o manual inteiro e mande para fora sem perceber.
 */
export const LIMITE_DO_RASCUNHO = 4000;

/**
 * O pedido ao Copilot.
 *
 * `rascunho` é o que **muda o trabalho** do REDIGIR: com ele, o Copilot
 * não escreve uma resposta a partir do chamado — ele reescreve o que a
 * pessoa já disse, em português técnico e formal. Quem sabe o que
 * responder é o técnico; o que falta, às vezes, é a forma.
 *
 * Sem `rascunho`, o REDIGIR continua o de antes: parte do chamado.
 */
export type PedirAoCopilotoRequest = {
  intencao: CopilotIntencao;
  rascunho?: string;
};

export const AI_PROVIDERS = ['GEMINI', 'GROQ'] as const;
export type AiProviderNome = (typeof AI_PROVIDERS)[number];

/**
 * O que o Copilot devolve.
 *
 * Texto, e nada além: **o Copilot nunca responde sozinho**. Quem envia
 * é a pessoa, e é ao enviar que a resposta ganha a marca de IA.
 *
 * O provedor e o modelo voltam junto porque a tela os mostra: quem lê
 * um rascunho de máquina tem direito de saber qual máquina o escreveu.
 */
export type CopilotResposta = {
  texto: string;
  provider: AiProviderNome;
  model: string;
};

/**
 * A configuração do Copilot, como a tela a vê.
 *
 * `temChave` e nunca a chave: ela é cifrada no banco e não sai da API,
 * pela mesma razão que a senha de canal não sai.
 */
export type AiConfigView = {
  provider: AiProviderNome;
  model: string;
  isActive: boolean;
  temChave: boolean;
};

export type EscreverAiConfigRequest = {
  provider: AiProviderNome;
  model: string;
  isActive?: boolean;
  /** Omitido, mantém a que está lá. String vazia apaga. */
  apiKey?: string;
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

// ---------------------------------------------------------------------
// Software e licenças (Fase 6)
// ---------------------------------------------------------------------

export const LICENSE_KINDS = ['PERPETUA', 'ASSINATURA', 'OEM', 'VOLUME', 'GRATUITA'] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number];

export const ROTULO_LICENCA: Record<LicenseKind, string> = {
  PERPETUA: 'Perpétua',
  ASSINATURA: 'Assinatura',
  OEM: 'OEM (veio com o equipamento)',
  VOLUME: 'Volume',
  GRATUITA: 'Gratuita',
};

/**
 * Situação de uma licença, calculada na API:
 * - `excedida`: mais assentos ocupados do que comprados;
 * - `vencida`: passou do `expiresAt`;
 * - `vencendo`: vence nos próximos 30 dias;
 * - `ok`: nada disso.
 * Excedida ganha de vencida: é a que dá multa em auditoria.
 */
export type SituacaoDaLicenca = 'ok' | 'vencendo' | 'vencida' | 'excedida';

export type SoftwareView = {
  id: string;
  name: string;
  category: string | null;
  manufacturer: CatalogoRef | null;
  isActive: boolean;
  notes: string | null;
  versionCount: number;
  installCount: number;
  /** Assentos comprados, somando as licenças. Nulo quando alguma é ilimitada. */
  seats: number | null;
  seatsUsed: number;
  /** Equipamentos com o software instalado e sem assento de licença dele. */
  unlicensedInstalls: number;
  /** A validade mais próxima entre as licenças que vencem. */
  nextExpiry: string | null;
};

export type VersaoDeSoftwareView = {
  id: string;
  name: string;
  installCount: number;
};

export type InstalacaoView = {
  id: string;
  installedAt: string | null;
  software: CatalogoRef;
  version: CatalogoRef;
  asset: { id: string; name: string; tag: string | null };
  /** Se o equipamento ocupa um assento de alguma licença deste software. */
  licensed: boolean;
};

export type AtribuicaoView = {
  id: string;
  assignedAt: string;
  asset: { id: string; name: string; tag: string | null } | null;
  user: { id: string; name: string; email: string | null } | null;
};

export type LicencaView = {
  id: string;
  software: CatalogoRef;
  name: string;
  kind: LicenseKind;
  version: CatalogoRef | null;
  seats: number | null;
  seatsUsed: number;
  purchasedAt: string | null;
  expiresAt: string | null;
  /** Decimal como texto, como nos outros valores em dinheiro. */
  purchaseValue: string | null;
  supplier: CatalogoRef | null;
  contract: { id: string; number: string; name: string } | null;
  notes: string | null;
  situacao: SituacaoDaLicenca;
  /** Existe chave guardada? A chave em si só vai para quem gerencia ativos. */
  hasKey: boolean;
  licenseKey?: string | null;
  assignments: AtribuicaoView[];
};

export type SoftwareDetail = SoftwareView & {
  versions: VersaoDeSoftwareView[];
  installations: InstalacaoView[];
  licenses: LicencaView[];
};

/** O que a tela do equipamento mostra de software. */
export type SoftwareDoAtivo = {
  installations: InstalacaoView[];
  licenses: {
    assignmentId: string;
    license: { id: string; name: string; kind: LicenseKind; expiresAt: string | null };
    software: CatalogoRef;
  }[];
};

export type WriteSoftwareRequest = {
  name: string;
  manufacturerId?: string | null;
  category?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type WriteLicenseRequest = {
  name: string;
  kind?: LicenseKind;
  versionId?: string | null;
  /** Ausente mantém a chave guardada; `null` apaga. */
  licenseKey?: string | null;
  seats?: number | null;
  purchasedAt?: string | null;
  expiresAt?: string | null;
  purchaseValue?: number | null;
  supplierId?: string | null;
  contractId?: string | null;
  notes?: string | null;
};

/** Instalar pelo nome da versão: a versão é criada se ainda não existir. */
export type InstalarSoftwareRequest = {
  softwareId: string;
  version: string;
  installedAt?: string | null;
};

export type AtribuirLicencaRequest = { assetId: string } | { userId: string };

// ---------------------------------------------------------------------
// Consumíveis e cartuchos (Fase 6)
// ---------------------------------------------------------------------

export const CONSUMABLE_KINDS = ['CONSUMIVEL', 'TONER'] as const;
export type ConsumableKind = (typeof CONSUMABLE_KINDS)[number];
export const ROTULO_CONSUMIVEL: Record<ConsumableKind, string> = {
  CONSUMIVEL: 'Consumível',
  TONER: 'Toner / cartucho',
};

export const MOVEMENT_KINDS = ['ENTRADA', 'SAIDA', 'AJUSTE'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
export const ROTULO_MOVIMENTO: Record<MovementKind, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
};

export type ConsumivelView = {
  id: string;
  kind: ConsumableKind;
  name: string;
  /** Código do fabricante (ex.: CF258A). É por ele que se compra. */
  reference: string | null;
  manufacturer: CatalogoRef | null;
  location: CatalogoRef | null;
  minStock: number;
  unit: string;
  notes: string | null;
  isActive: boolean;
  /** Saldo: entradas − saídas ± ajustes. */
  stock: number;
  /** Saldo no mínimo ou abaixo — hora de comprar. */
  belowMin: boolean;
  compatibleModels: CatalogoRef[];
  lastMovementAt: string | null;
};

export type MovimentoView = {
  id: string;
  kind: MovementKind;
  /** Positivo em entrada e saída; com sinal no ajuste. */
  quantity: number;
  /** Saldo logo depois deste movimento. */
  stockAfter: number;
  asset: { id: string; name: string; tag: string | null } | null;
  user: { id: string; name: string } | null;
  author: { id: string; name: string } | null;
  note: string | null;
  createdAt: string;
};

export type ConsumivelDetail = ConsumivelView & { movements: MovimentoView[] };

/** O que a tela do equipamento mostra de suprimentos. */
export type SuprimentosDoAtivo = {
  /** Consumíveis compatíveis com o modelo do equipamento (ou todos os toners, sem modelo). */
  compatible: ConsumivelView[];
  /** O que já foi entregue para este equipamento, mais recente primeiro. */
  recent: (MovimentoView & { item: CatalogoRef })[];
};

export type WriteConsumivelRequest = {
  name: string;
  kind?: ConsumableKind;
  reference?: string | null;
  manufacturerId?: string | null;
  locationId?: string | null;
  minStock?: number;
  unit?: string;
  notes?: string | null;
  isActive?: boolean;
  compatibleModelIds?: string[];
};

export type MovimentarRequest = {
  kind: MovementKind;
  quantity: number;
  assetId?: string;
  userId?: string;
  note?: string | null;
};

// ---------------------------------------------------------------------
// Projetos (Fase 8)
// ---------------------------------------------------------------------

export const PROJECT_STATUSES = ['PLANEJADO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const ROTULO_PROJETO_STATUS: Record<ProjectStatus, string> = {
  PLANEJADO: 'Planejado',
  EM_ANDAMENTO: 'Em andamento',
  PAUSADO: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

export const PROJECT_TASK_STATUSES = ['A_FAZER', 'EM_ANDAMENTO', 'BLOQUEADA', 'CONCLUIDA'] as const;
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];
export const ROTULO_TAREFA_PROJETO: Record<ProjectTaskStatus, string> = {
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  BLOQUEADA: 'Bloqueada',
  CONCLUIDA: 'Concluída',
};

export type PessoaRef = { id: string; name: string };

export type ProjetoView = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  /** 1 (mais baixa) a 5 (mais alta). */
  priority: number;
  manager: PessoaRef | null;
  team: CatalogoRef | null;
  parent: { id: string; name: string; code: string | null } | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  realStart: string | null;
  realEnd: string | null;
  /** Das tarefas, ponderado pelas horas previstas (sem horas, cada tarefa pesa 1). */
  percentDone: number;
  taskCount: number;
  openTaskCount: number;
  ticketCount: number;
  /** Passou do fim previsto sem concluir. */
  late: boolean;
};

export type TarefaDeProjetoView = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  status: ProjectTaskStatus;
  assignee: PessoaRef | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedMinutes: number | null;
  spentMinutes: number;
  percentDone: number;
  /** Ordem dentro da coluna do quadro. */
  position: number;
  dependsOn: { id: string; name: string; status: ProjectTaskStatus } | null;
  /** A predecessora ainda não foi concluída. */
  blockedByDependency: boolean;
  late: boolean;
  completedAt: string | null;
};

export type ChamadoDoProjeto = { id: string; number: number; subject: string; status: string };

export type ProjetoDetail = ProjetoView & {
  tasks: TarefaDeProjetoView[];
  /** Só os chamados que quem pede pode ler. */
  tickets: ChamadoDoProjeto[];
  children: ProjetoView[];
  /** Soma dos custos dos chamados vinculados. Nulo para quem não lê custo. */
  totalCost: string | null;
};

export type WriteProjetoRequest = {
  name: string;
  code?: string | null;
  description?: string | null;
  status?: ProjectStatus;
  priority?: number;
  managerId?: string | null;
  teamId?: string | null;
  parentId?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
};

export type WriteTarefaDeProjetoRequest = {
  name: string;
  description?: string | null;
  status?: ProjectTaskStatus;
  assigneeId?: string | null;
  parentId?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  percentDone?: number;
  /** Somado ao já apontado, como no chamado. */
  addSpentMinutes?: number;
  position?: number;
  dependsOnId?: string | null;
};

// ---------------------------------------------------------------------
// Agenda (Fase 8)
// ---------------------------------------------------------------------

export const AGENDA_ITEM_KINDS = ['EVENTO', 'TAREFA_CHAMADO', 'TAREFA_PROJETO'] as const;
export type AgendaItemKind = (typeof AGENDA_ITEM_KINDS)[number];

/** Um item da agenda, venha de onde vier. */
export type AgendaItem = {
  kind: AgendaItemKind;
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  user: PessoaRef | null;
  /** Caminho no aplicativo (chamado, projeto) ou nulo. */
  link: string | null;
  done: boolean;
  /** Compromisso privado de outra pessoa: aparece como "Ocupado". */
  private: boolean;
  /** Quem pede pode editar (dono ou quem marcou). */
  editable: boolean;
  location: string | null;
  description: string | null;
};

export type EventoRequest = {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  isPrivate?: boolean;
  location?: string | null;
  /** De quem é o compromisso. Ausente = de quem marca. */
  ownerId?: string;
};

// ---------------------------------------------------------------------
// Rede: VLAN, sub-rede, IP e porta (Fase 6)
// ---------------------------------------------------------------------

export const PORT_KINDS = ['ETHERNET', 'WIFI', 'FIBRA', 'OUTRA'] as const;
export type PortKind = (typeof PORT_KINDS)[number];
export const ROTULO_PORTA: Record<PortKind, string> = {
  ETHERNET: 'Ethernet',
  WIFI: 'Wi-Fi',
  FIBRA: 'Fibra',
  OUTRA: 'Outra',
};

export type VlanRef = { id: string; tag: number; name: string };
export type AtivoRef = { id: string; name: string; tag: string | null };

export type VlanView = VlanRef & { notes: string | null; networkCount: number; portCount: number };

export type SubRedeView = {
  id: string;
  name: string;
  /** Endereço de rede com máscara, como o Postgres normaliza ("192.168.15.0/24"). */
  cidr: string;
  gateway: string | null;
  vlan: VlanRef | null;
  notes: string | null;
  /** Hosts utilizáveis (sem rede e broadcast). Nulo em IPv6 — grande demais para contar. */
  total: number | null;
  used: number;
  percent: number | null;
};

export type IpView = {
  id: string;
  address: string;
  fqdn: string | null;
  notes: string | null;
  asset: AtivoRef | null;
  port: { id: string; name: string } | null;
  network: { id: string; name: string; cidr: string } | null;
};

export type SubRedeDetail = SubRedeView & {
  addresses: IpView[];
  /** Primeiro IPv4 livre (fora rede, broadcast e gateway). */
  nextFree: string | null;
};

export type PortaView = {
  id: string;
  name: string;
  kind: PortKind;
  mac: string | null;
  speedMbps: number | null;
  vlan: VlanRef | null;
  notes: string | null;
  /** A porta do outro lado do cabo, e o equipamento dela. */
  connectedTo: { id: string; name: string; asset: AtivoRef } | null;
  ips: IpView[];
};

export type RedeDoAtivo = {
  ports: PortaView[];
  /** IPs do equipamento que não estão presos a uma porta. */
  ips: IpView[];
};

export type WriteVlanRequest = { tag: number; name: string; notes?: string | null };
export type WriteSubRedeRequest = {
  name: string;
  cidr: string;
  gateway?: string | null;
  vlanId?: string | null;
  notes?: string | null;
};
export type WritePortaRequest = {
  name: string;
  kind?: PortKind;
  mac?: string | null;
  speedMbps?: number | null;
  vlanId?: string | null;
  notes?: string | null;
};
export type WriteIpRequest = {
  address: string;
  assetId?: string | null;
  portId?: string | null;
  fqdn?: string | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------
// Datacenter: sala, rack e posição no rack (Fase 7)
// ---------------------------------------------------------------------

export const RACK_FACES = ['FRENTE', 'TRAS', 'AMBAS'] as const;
export type RackFace = (typeof RACK_FACES)[number];
export const ROTULO_FACE: Record<RackFace, string> = {
  FRENTE: 'Frente',
  TRAS: 'Trás',
  AMBAS: 'Profundidade inteira',
};

export type SalaView = {
  id: string;
  name: string;
  location: CatalogoRef | null;
  notes: string | null;
  rackCount: number;
};

export type RackView = {
  id: string;
  name: string;
  room: CatalogoRef | null;
  /** Altura útil em U (padrão 42). */
  units: number;
  /** Us ocupados em qualquer face. */
  usedUnits: number;
  /** Onde o rack fica na sala ("fila B, posição 3"). */
  position: string | null;
  notes: string | null;
};

export type ItemDeRackView = {
  id: string;
  asset: AtivoRef & { kind: string };
  /** U de baixo (1 = o mais baixo). */
  positionU: number;
  heightU: number;
  face: RackFace;
};

export type RackDetail = RackView & {
  items: ItemDeRackView[];
  /** Faixas livres na frente, de baixo para cima. */
  freeRanges: { from: number; to: number }[];
};

export type OndeEstaNoRack = {
  itemId: string;
  rack: { id: string; name: string; room: CatalogoRef | null };
  positionU: number;
  heightU: number;
  face: RackFace;
} | null;

export type WriteSalaRequest = { name: string; locationId?: string | null; notes?: string | null };
export type WriteRackRequest = {
  name: string;
  roomId?: string | null;
  units?: number;
  position?: string | null;
  notes?: string | null;
};
export type ColocarNoRackRequest = { assetId: string; positionU: number; heightU?: number; face?: RackFace };


// ---------------------------------------------------------------------
// Notificações fora da aba
// ---------------------------------------------------------------------

export const NOTIFICACOES = [
  'ATRIBUICAO',
  'RESPOSTA_DO_CLIENTE',
  'RESPOSTA_NO_MEU_CHAMADO',
  'NOTA_INTERNA',
  'APROVACAO',
  'SLA',
] as const;

export type TipoDeNotificacao = (typeof NOTIFICACOES)[number];

/**
 * O rótulo de cada motivo, como a pessoa o lê na tela de preferências.
 *
 * Mora em shared porque o mesmo texto aparece no aplicativo e no corpo
 * do aviso: o título que chega no Windows precisa dizer a mesma coisa
 * que a linha que a pessoa marcou.
 */
export const ROTULO_DA_NOTIFICACAO: Record<TipoDeNotificacao, string> = {
  ATRIBUICAO: 'Um chamado passou a ser meu',
  RESPOSTA_DO_CLIENTE: 'O cliente respondeu num chamado que eu atendo',
  RESPOSTA_NO_MEU_CHAMADO: 'O atendimento respondeu num chamado meu',
  NOTA_INTERNA: 'Nota interna num chamado que eu atendo',
  APROVACAO: 'Há um aval esperando por mim',
  SLA: 'Prazo estourando ou estourado',
};

/** Um aparelho inscrito, como a tela o vê. A chave do aparelho não volta. */
export type AparelhoInscritoView = {
  id: string;
  descricao: string | null;
  /** É o aparelho que está olhando esta tela agora. */
  esteAparelho: boolean;
  createdAt: string;
  lastSentAt: string | null;
};

export type InscreverPushRequest = {
  endpoint: string;
  /** Chave pública do aparelho (P-256), base64url. */
  p256dh: string;
  /** Segredo de autenticação do aparelho, base64url. */
  auth: string;
  descricao?: string;
};

/**
 * O que a tela precisa saber antes de oferecer o botão.
 *
 * `chavePublica` nula significa que a instalação não tem par VAPID: o
 * aviso está desligado, e a tela não deve oferecer o que não funciona.
 */
export type EstadoDasNotificacoes = {
  chavePublica: string | null;
  aparelhos: AparelhoInscritoView[];
  silenciados: TipoDeNotificacao[];
};

export type SilenciarRequest = { silenciados: TipoDeNotificacao[] };

/** O que viaja dentro do aviso, e o que o service worker desenha. */
export type AvisoPush = {
  tipo: TipoDeNotificacao;
  titulo: string;
  corpo: string;
  /** Para onde o clique leva, relativo à raiz do aplicativo. */
  url: string;
  /**
   * Avisos com a mesma etiqueta se substituem no sistema.
   *
   * É o número do chamado: três respostas seguidas no mesmo chamado
   * viram um aviso atualizado, não três empilhados na barra.
   */
  etiqueta: string;
};


// ---------------------------------------------------------------------
// Ações automáticas
// ---------------------------------------------------------------------

export const ACOES_AUTOMATICAS = ['RESET_DE_SENHA'] as const;
export type AcaoAutomatica = (typeof ACOES_AUTOMATICAS)[number];

/**
 * O nome e o aviso de cada ação, como a tela de configuração os mostra.
 *
 * O aviso não é enfeite: quem liga a ação precisa saber, antes de
 * salvar, que o chamado vai se resolver sem passar por ninguém. Deixar
 * isso só na documentação é como não dizer.
 */
export const ACAO_AUTOMATICA: Record<
  AcaoAutomatica,
  { rotulo: string; descricao: string }
> = {
  RESET_DE_SENHA: {
    rotulo: 'Trocar a própria senha',
    descricao:
      'O sistema envia à pessoa um link de troca de senha por e-mail e WhatsApp, e resolve o ' +
      'chamado. Só vale para quem abriu logado ou pelo integrador, e só para a senha de quem ' +
      'pediu — nunca a de outro. Conta de diretório (AD) não entra: a senha é de lá.',
  },
};

/**
 * O que a tela de troca de senha sabe antes de pedir a senha nova.
 *
 * `valido: false` cobre expirado, já usado e inexistente — sem dizer
 * qual dos três. Distinguir "não existe" de "já foi usado" conta a
 * quem tem o link o que aconteceu com ele, e quem tem o link pode não
 * ser o dono.
 */
export type ConviteDeSenha = { valido: boolean; nome: string | null };

export type DefinirSenhaRequest = { token: string; nova: string };

// ---------------------------------------------------------------------
// Cofre de senhas
// ---------------------------------------------------------------------

export const TIPOS_DE_SEGREDO = ['SITE', 'COMPUTADOR', 'SISTEMA'] as const;
export type TipoDeSegredo = (typeof TIPOS_DE_SEGREDO)[number];

export const ROTULO_DO_SEGREDO: Record<TipoDeSegredo, string> = {
  SITE: 'Site',
  COMPUTADOR: 'Computador',
  SISTEMA: 'Sistema',
};

/**
 * Um segredo, como a lista o vê. **Sem a senha**, sempre.
 *
 * A senha sai por uma rota só, que existe para isso e registra cada
 * chamada. Se ela viesse aqui, bastaria abrir a lista para copiar o
 * cofre inteiro — e ninguém saberia que foi copiado.
 */
export type SegredoView = {
  id: string;
  kind: TipoDeSegredo;
  name: string;
  login: string;
  url: string | null;
  sistema: string | null;
  asset: { id: string; name: string } | null;
  notas: string | null;
  owner: { id: string; name: string };
  /** Quem está olhando é o dono? Só ele compartilha, edita e revoga. */
  souDono: boolean;
  /**
   * Por que esta linha está à vista desta pessoa.
   *
   * `DONO` e `COMPARTILHADO` dizem que ela **abre** o segredo.
   * `ADMINISTRACAO` diz o contrário: ela só sabe que ele existe, porque
   * administra o cofre. Sem o terceiro valor, a lista da organização
   * inteira chamaria de "compartilhada" toda senha que o administrador
   * nunca recebeu — e dizer isso seria mentir na tela.
   */
  via: 'DONO' | 'COMPARTILHADO' | 'ADMINISTRACAO';
  /** Quando o meu acesso acaba. Nulo é sem prazo. */
  meuAcessoAte: string | null;
  /** Com quantas pessoas está compartilhado agora. Só o dono vê. */
  compartilhadoCom: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Uma concessão, na tela do dono. */
export type ConcessaoView = {
  id: string;
  user: { id: string; name: string; email: string | null };
  /** Nulo = sem prazo. */
  expiresAt: string | null;
  /** Já passou do prazo, mas a linha ainda está lá. */
  vencida: boolean;
  createdAt: string;
};

/** Quem abriu a senha, e quando. O dono vê; os demais, não. */
export type LeituraDoSegredoView = {
  id: string;
  user: { id: string; name: string };
  readAt: string;
};

export type EscreverSegredoRequest = {
  kind: TipoDeSegredo;
  name: string;
  login: string;
  /** Omitida na edição, mantém a guardada. Nunca volta em leitura. */
  senha?: string;
  url?: string | null;
  assetId?: string | null;
  sistema?: string | null;
  notas?: string | null;
};

export type CompartilharSegredoRequest = {
  userId: string;
  /**
   * Até quando. Omitido ou nulo é "para sempre" — que na prática é
   * "até alguém revogar", e a tela diz isso com todas as letras.
   */
  expiresAt?: string | null;
};

/** A senha, uma vez. Cada chamada que a devolve fica registrada. */
export type SegredoRevelado = { senha: string };

/**
 * O cofre está ligado nesta instalação?
 *
 * Sem `VAULT_SECRET_KEY` não há como cifrar, e a tela não deve oferecer
 * um cofre que não guarda — mesma regra do Copilot e do aviso push.
 */
export type EstadoDoCofre = { disponivel: boolean };

// ---------------------------------------------------------------------
// Chat ao vivo
// ---------------------------------------------------------------------

/**
 * Quantos segundos sem batida antes de a pessoa sumir da presença.
 *
 * Mora em shared porque os dois lados dependem dele: o aplicativo bate
 * o coração a cada `INTERVALO_DA_BATIDA`, e a API considera online quem
 * bateu dentro de `SEGUNDOS_ONLINE`. Se os dois números viessem de
 * lugares diferentes, um ajuste num deles deixaria todo mundo offline.
 */
export const SEGUNDOS_ONLINE = 45;

/** De quanto em quanto tempo o aplicativo diz "ainda estou aqui". */
export const INTERVALO_DA_BATIDA = 15;

/** Depois disto, "digitando" some mesmo que a pessoa não tenha parado. */
export const SEGUNDOS_DIGITANDO = 6;

/** Alguém com o Desk aberto. */
export type PresencaView = {
  userId: string;
  name: string;
  /** Está com o chat **deste** chamado aberto agora. */
  naConversa: boolean;
  /** Está digitando agora, neste chamado. */
  digitando: boolean;
};

/**
 * O estado do chat de um chamado.
 *
 * `aberto` é a resposta à pergunta do pedido — "mostra que o chat ao
 * vivo está aberto": há **outra pessoa** com esta conversa na tela
 * agora, então vale escrever e esperar resposta na hora.
 */
export type EstadoDoChat = {
  aberto: boolean;
  /** Quem está nesta conversa, sem contar você. */
  presentes: PresencaView[];
};

export type BaterPontoRequest = {
  /** O chamado com o chat aberto. Nulo = online, sem conversa. */
  ticketId?: string | null;
  /** Está digitando agora. */
  digitando?: boolean;
};

/**
 * O que chega pelo fluxo do chat.
 *
 * `mensagem` traz o evento inteiro, que é o mesmo `TicketEventView` da
 * linha do tempo — o chat **é** a conversa do chamado, não um histórico
 * paralelo (CLAUDE.md, regra 8).
 */
export type EventoDoChat =
  | { tipo: 'mensagem'; evento: TicketEventView }
  | { tipo: 'presenca'; estado: EstadoDoChat }
  | { tipo: 'batida' };

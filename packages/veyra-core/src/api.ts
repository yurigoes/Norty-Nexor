/**
 * VEYRA — Contratos da API
 *
 * O VEYRA é API-first: a interface é o primeiro consumidor da API, não um
 * caso especial dela. Estes contratos valem para o aplicativo, para o
 * portal de afiliados, para integrações e para o cliente que quiser
 * plugar o próprio sistema.
 */

import type { Id, IsoDate, LeadStatus, LeadTemperature, LeadSource, BusinessSegment, TicketPriority, PhaseKey } from './domain.js';
import type { PermissionKey } from './permissions.js';

export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

/** Envelope de coleção. Toda listagem devolve este formato — sem exceção. */
export interface Page<T> {
  dados: T[];
  paginacao: {
    pagina: number;
    porPagina: number;
    total: number;
    totalPaginas: number;
  };
}

/**
 * Erro. Em produção `detalhe` é genérico para falha inesperada: stack
 * trace e texto do Postgres não saem para o cliente.
 */
export interface ApiError {
  status: number;
  codigo: string;
  mensagem: string;
  detalhe?: string;
  camposInvalidos?: { campo: string; motivo: string }[];
  /** Correlaciona o erro do cliente com a linha do log. */
  rastreio: string;
}

export interface ListQuery {
  pagina?: number;
  porPagina?: number;
  busca?: string;
  ordenarPor?: string;
  ordem?: 'asc' | 'desc';
}

/* ---------- Autenticação ---------- */

export interface LoginRequest {
  email: string;
  senha: string;
  /** Código TOTP, quando o usuário tem 2FA ativo. */
  codigo2fa?: string;
}

export interface LoginResponse {
  /** 15 minutos, guardado em memória no cliente — nunca em localStorage. */
  accessToken: string;
  expiraEm: number;
  usuario: AuthenticatedUser;
  /** O refresh token vai em cookie httpOnly, com rotação a cada uso. */
  trocaSenhaObrigatoria: boolean;
}

/**
 * O usuário como a API o devolve. Não existe campo de hash aqui — é por
 * isso que este tipo existe separado de `User`.
 */
export interface AuthenticatedUser {
  id: Id;
  nome: string;
  email: string;
  papel: string;
  organizationId: Id;
  organizationNome: string;
  permissoes: PermissionKey[];
  modulosLiberados: string[];
  equipeId?: Id;
  avatarCor?: string;
}

/* ---------- Leads ---------- */

export interface LeadFilter extends ListQuery {
  status?: LeadStatus[];
  temperatura?: LeadTemperature[];
  origem?: LeadSource[];
  segmento?: BusinessSegment[];
  responsavelId?: Id;
  equipeId?: Id;
  pipelineId?: Id;
  scoreMinimo?: number;
  criadoDe?: IsoDate;
  criadoAte?: IsoDate;
  semInteracaoHa?: number;
}

export interface CreateLeadRequest {
  nome: string;
  telefone: string;
  email?: string;
  origem: LeadSource;
  segmento: BusinessSegment;
  produtoId?: Id;
  valorEstimado?: number;
  utm?: Record<string, string>;
  observacoes?: string;
}

/* ---------- IA ---------- */

export interface AiTriageRequest {
  conversationId?: Id;
  mensagem: string;
  contato: { nome?: string; telefone: string };
  canal: string;
}

/**
 * Resposta da triagem. `fonte` diz de onde veio o conteúdo — é o que
 * permite medir quanto da operação já roda sem provedor externo.
 */
export interface AiTriageResponse {
  intencao: string;
  segmento?: BusinessSegment;
  produtoSugerido?: string;
  valorIdentificado?: number;
  score: number;
  temperatura: LeadTemperature;
  resposta: string;
  fonte: 'base_interna' | 'conhecimento_empresa' | 'historico' | 'produto' | 'provedor_externo';
  confianca: number;
  proximasPerguntas: string[];
  transferirParaHumano: boolean;
  motivoTransferencia?: string;
}

export interface AiAssistRequest {
  conversationId: Id;
  acao: 'sugerir_resposta' | 'resumir' | 'corrigir' | 'analisar_sentimento' | 'proximo_passo';
  texto?: string;
}

/* ---------- Suporte ---------- */

export interface CreateTicketRequest {
  clienteId: Id;
  assunto: string;
  categoria: string;
  prioridade: TicketPriority;
  descricao: string;
}

export interface CsatRequest {
  protocolo: string;
  nota: 1 | 2 | 3 | 4 | 5;
  comentario?: string;
}

/* ---------- Webhooks ---------- */

export type WebhookEvent =
  | 'lead.criado'
  | 'lead.atualizado'
  | 'lead.status_alterado'
  | 'cotacao.enviada'
  | 'proposta.aprovada'
  | 'contrato.assinado'
  | 'pagamento.confirmado'
  | 'pagamento.vencido'
  | 'comissao.aprovada'
  | 'chamado.criado'
  | 'chamado.encerrado'
  | 'csat.respondido'
  | 'mensagem.recebida';

/**
 * Entrega de webhook. A assinatura é HMAC-SHA256 do corpo cru com o
 * segredo do endpoint — o receptor valida antes de confiar no conteúdo.
 */
export interface WebhookDelivery<T = unknown> {
  id: Id;
  evento: WebhookEvent;
  organizationId: Id;
  em: IsoDate;
  dados: T;
  assinatura: string;
}

/* ---------- Mapa de rotas ---------- */

export interface EndpointDefinition {
  metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  caminho: string;
  resumo: string;
  permissao?: PermissionKey;
  fase: PhaseKey;
}

/**
 * O mapa serve a três coisas: gerar a documentação OpenAPI, alimentar a
 * página pública de API e conferir que toda rota nasce com permissão
 * declarada. Rota sem `permissao` é rota pública — e isso precisa ser
 * uma decisão visível, não um esquecimento.
 */
export const ENDPOINTS: EndpointDefinition[] = [
  { metodo: 'POST', caminho: `${API_PREFIX}/auth/login`, resumo: 'Autentica e devolve access token', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/auth/refresh`, resumo: 'Rotaciona o refresh token', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/auth/logout`, resumo: 'Revoga a sessão corrente', fase: 'core' },

  { metodo: 'GET', caminho: `${API_PREFIX}/leads`, resumo: 'Lista leads com filtro e paginação', permissao: 'leads.visualizar', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/leads`, resumo: 'Cria lead', permissao: 'leads.criar', fase: 'core' },
  { metodo: 'GET', caminho: `${API_PREFIX}/leads/:id`, resumo: 'Detalha lead com linha do tempo', permissao: 'leads.visualizar', fase: 'core' },
  { metodo: 'PATCH', caminho: `${API_PREFIX}/leads/:id`, resumo: 'Atualiza lead', permissao: 'leads.editar', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/leads/:id/transferir`, resumo: 'Transfere responsável', permissao: 'leads.transferir', fase: 'core' },

  { metodo: 'GET', caminho: `${API_PREFIX}/customers`, resumo: 'Lista clientes', permissao: 'clientes.visualizar', fase: 'core' },
  { metodo: 'GET', caminho: `${API_PREFIX}/customers/:id/360`, resumo: 'Visão 360° do cliente', permissao: 'clientes.visualizar', fase: 'core' },

  { metodo: 'GET', caminho: `${API_PREFIX}/products`, resumo: 'Catálogo por segmento', permissao: 'produtos.visualizar', fase: 'comercial' },
  { metodo: 'GET', caminho: `${API_PREFIX}/quotes`, resumo: 'Lista cotações', permissao: 'cotacoes.visualizar', fase: 'comercial' },
  { metodo: 'POST', caminho: `${API_PREFIX}/quotes`, resumo: 'Cria cotação com opções comparáveis', permissao: 'cotacoes.criar', fase: 'comercial' },
  { metodo: 'POST', caminho: `${API_PREFIX}/quotes/:id/enviar`, resumo: 'Gera link público e envia', permissao: 'cotacoes.editar', fase: 'comercial' },
  { metodo: 'GET', caminho: `${API_PREFIX}/proposals`, resumo: 'Lista propostas', permissao: 'propostas.visualizar', fase: 'comercial' },
  { metodo: 'POST', caminho: `${API_PREFIX}/proposals/:id/aprovar`, resumo: 'Aprova e gera contrato', permissao: 'propostas.aprovar', fase: 'comercial' },
  { metodo: 'GET', caminho: `${API_PREFIX}/contracts`, resumo: 'Lista contratos e vigências', permissao: 'contratos.visualizar', fase: 'operacao' },

  { metodo: 'GET', caminho: `${API_PREFIX}/payments`, resumo: 'Lista cobranças', permissao: 'financeiro.visualizar', fase: 'financeiro' },
  { metodo: 'POST', caminho: `${API_PREFIX}/payments`, resumo: 'Emite cobrança (PIX, boleto ou link)', permissao: 'financeiro.criar', fase: 'financeiro' },
  { metodo: 'POST', caminho: `${API_PREFIX}/payments/webhook/:provedor`, resumo: 'Recebe confirmação do provedor', fase: 'financeiro' },
  { metodo: 'GET', caminho: `${API_PREFIX}/commissions`, resumo: 'Lista comissões por competência', permissao: 'comissoes.visualizar', fase: 'comercial' },
  { metodo: 'POST', caminho: `${API_PREFIX}/commissions/:id/aprovar`, resumo: 'Aprova comissão para pagamento', permissao: 'comissoes.aprovar', fase: 'comercial' },

  { metodo: 'GET', caminho: `${API_PREFIX}/conversations`, resumo: 'Lista conversas da caixa', permissao: 'conversas.visualizar', fase: 'core' },
  { metodo: 'GET', caminho: `${API_PREFIX}/conversations/:id/messages`, resumo: 'Mensagens da conversa', permissao: 'conversas.visualizar', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/messages`, resumo: 'Envia mensagem pelo canal do contato', permissao: 'conversas.criar', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/ai/triagem`, resumo: 'Classifica intenção e responde', permissao: 'conversas.criar', fase: 'core' },
  { metodo: 'POST', caminho: `${API_PREFIX}/ai/assistir`, resumo: 'Sugere, resume ou corrige para o vendedor', permissao: 'conversas.criar', fase: 'intelligence' },

  { metodo: 'GET', caminho: `${API_PREFIX}/campaigns`, resumo: 'Lista campanhas e métricas', permissao: 'campanhas.visualizar', fase: 'comercial' },
  { metodo: 'POST', caminho: `${API_PREFIX}/campaigns/:id/disparar`, resumo: 'Dispara respeitando blacklist e consentimento', permissao: 'campanhas.aprovar', fase: 'comercial' },
  { metodo: 'GET', caminho: `${API_PREFIX}/automations`, resumo: 'Lista automações', permissao: 'automacoes.visualizar', fase: 'intelligence' },

  { metodo: 'GET', caminho: `${API_PREFIX}/tickets`, resumo: 'Lista chamados e SLA', permissao: 'suporte.visualizar', fase: 'operacao' },
  { metodo: 'POST', caminho: `${API_PREFIX}/tickets`, resumo: 'Abre chamado e gera protocolo', permissao: 'suporte.criar', fase: 'operacao' },
  { metodo: 'POST', caminho: `${API_PREFIX}/csat`, resumo: 'Registra avaliação do atendimento', fase: 'operacao' },

  { metodo: 'GET', caminho: `${API_PREFIX}/reports/:tipo`, resumo: 'Relatório parametrizado', permissao: 'relatorios.visualizar', fase: 'intelligence' },
  { metodo: 'GET', caminho: `${API_PREFIX}/audit-logs`, resumo: 'Trilha de auditoria', permissao: 'auditoria.visualizar', fase: 'ecossistema' },
  { metodo: 'GET', caminho: `${API_PREFIX}/integrations`, resumo: 'Estado das integrações', permissao: 'integracoes.visualizar', fase: 'ecossistema' },
  { metodo: 'POST', caminho: `${API_PREFIX}/webhooks`, resumo: 'Registra endpoint assinado', permissao: 'integracoes.criar', fase: 'ecossistema' },
];

/** Limites por minuto, por chave de API. O plano ajusta o teto. */
export const RATE_LIMITS = {
  padrao: 120,
  autenticacao: 10,
  disparoCampanha: 30,
  webhookEntrada: 600,
} as const;

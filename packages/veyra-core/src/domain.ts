/**
 * VEYRA — Domínio
 *
 * Fonte única de verdade dos tipos de negócio. O aplicativo, a API e a
 * camada de IA importam daqui. Se um campo muda, muda em um lugar só e o
 * TypeScript aponta os dois lados afetados.
 *
 * Convenções:
 *  - Todo registro operacional carrega `organizationId`. O isolamento
 *    multi-tenant não é opcional nem inferido: é um campo do tipo.
 *  - Dinheiro é `number` na fronteira (serializado de Decimal(12,2) no
 *    banco). Nunca use ponto flutuante para acumular no servidor.
 *  - Datas trafegam em ISO 8601 (string), não em `Date`, para sobreviver
 *    ao JSON sem ambiguidade de fuso.
 */

import type { PermissionKey } from './permissions.js';

export type Id = string;
export type IsoDate = string;
/** Valor monetário já serializado. Decimal(12,2) no banco. */
export type Money = number;

/** Campos que todo registro escopado por organização carrega. */
export interface TenantScoped {
  id: Id;
  organizationId: Id;
  createdAt: IsoDate;
  updatedAt?: IsoDate;
}

/* =========================================================
   Plataforma — organizações, planos, assinatura
   ========================================================= */

export type OrganizationStatus =
  | 'ativa'
  | 'em_teste'
  | 'suspensa'
  | 'bloqueada'
  | 'inadimplente'
  | 'cancelada';

export type PlanTier = 'starter' | 'growth' | 'scale' | 'enterprise';

/** Limites do plano. `null` significa ilimitado — não zero. */
export interface PlanLimits {
  usuarios: number | null;
  leadsPorMes: number | null;
  mensagensPorMes: number | null;
  interacoesIaPorMes: number | null;
  armazenamentoGb: number | null;
  numerosWhatsapp: number | null;
  automacoesAtivas: number | null;
  chamadasApiPorMinuto: number | null;
}

export interface Plan {
  id: Id;
  nome: string;
  tier: PlanTier;
  precoMensal: Money;
  precoAnual: Money;
  limites: PlanLimits;
  /** Módulos liberados por padrão neste plano. */
  modulos: ModuleKey[];
  addOns: ModuleKey[];
  destaque?: boolean;
}

export interface Organization {
  id: Id;
  nome: string;
  documento: string;
  slug: string;
  status: OrganizationStatus;
  planoId: Id;
  segmento: BusinessSegment[];
  criadaEm: IsoDate;
  trialTerminaEm?: IsoDate;
  /** Módulos efetivamente liberados — plano + add-ons - bloqueios. */
  modulosLiberados: ModuleKey[];
  responsavel: { nome: string; email: string; telefone: string };
  mrr: Money;
}

export type BusinessSegment = 'consorcio' | 'seguro' | 'saude' | 'financeiro' | 'servicos';

/** Consumo medido do ciclo corrente — alimenta cobrança e limites. */
export interface UsageSnapshot {
  organizationId: Id;
  periodo: string;
  usuarios: number;
  leads: number;
  mensagens: number;
  emails: number;
  interacoesIa: number;
  armazenamentoGb: number;
  chamadasApi: number;
  automacoesExecutadas: number;
}

/* =========================================================
   Identidade e acesso
   ========================================================= */

export type RoleKey =
  | 'administrador'
  | 'gestor'
  | 'supervisor'
  | 'vendedor'
  | 'financeiro'
  | 'suporte'
  | 'marketing'
  | 'afiliado'
  | 'auditor';

/** Papel exclusivo do proprietário da plataforma. Vive fora do tenant. */
export type PlatformRoleKey = 'veyra_admin' | 'veyra_suporte';

export interface Team {
  id: Id;
  organizationId: Id;
  nome: string;
  supervisorId?: Id;
  membros: Id[];
}

export interface User extends TenantScoped {
  nome: string;
  email: string;
  telefone?: string;
  papel: RoleKey;
  /** Permissões extras concedidas fora do papel — sempre aditivas. */
  permissoesExtras?: PermissionKey[];
  /** Permissões revogadas individualmente. Vencem o papel. */
  permissoesRevogadas?: PermissionKey[];
  equipeId?: Id;
  ativo: boolean;
  ultimoAcesso?: IsoDate;
  doisFatoresAtivo: boolean;
  trocaSenhaObrigatoria: boolean;
  avatarCor?: string;
}

/* =========================================================
   CRM — leads e funil
   ========================================================= */

export type LeadStatus =
  | 'novo'
  | 'em_qualificacao'
  | 'qualificado'
  | 'quente'
  | 'em_negociacao'
  | 'cotacao'
  | 'proposta'
  | 'venda'
  | 'perdido'
  | 'sem_resposta'
  | 'desistente'
  | 'nutricao'
  | 'reativado';

export type LeadTemperature = 'frio' | 'morno' | 'quente' | 'fervendo';

export type LeadSource =
  | 'whatsapp'
  | 'site'
  | 'meta_ads'
  | 'google_ads'
  | 'instagram'
  | 'indicacao'
  | 'afiliado'
  | 'importacao'
  | 'telefone'
  | 'email'
  | 'api';

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export interface Lead extends TenantScoped {
  nome: string;
  telefone: string;
  whatsapp?: string;
  email?: string;
  documento?: string;
  cidade?: string;
  uf?: string;
  origem: LeadSource;
  campanhaId?: Id;
  utm?: Utm;
  produtoId?: Id;
  segmento: BusinessSegment;
  interesse?: string;
  valorEstimado?: Money;
  /** 0–100. Calculado pelo motor de score, nunca digitado. */
  score: number;
  temperatura: LeadTemperature;
  responsavelId?: Id;
  equipeId?: Id;
  status: LeadStatus;
  pipelineId: Id;
  etapaId: Id;
  ultimaInteracaoEm?: IsoDate;
  proximaAtividadeEm?: IsoDate;
  motivoPerda?: string;
  observacoes?: string;
  clienteId?: Id;
}

export interface PipelineStage {
  id: Id;
  nome: string;
  ordem: number;
  cor: string;
  /** Probabilidade média de fechamento nesta etapa (0–1). */
  probabilidade: number;
}

export interface Pipeline extends TenantScoped {
  nome: string;
  segmento: BusinessSegment;
  etapas: PipelineStage[];
  padrao: boolean;
}

/** Evento imutável na linha do tempo do lead ou do cliente. */
export type TimelineChannel =
  | 'whatsapp'
  | 'email'
  | 'ligacao'
  | 'nota'
  | 'sistema'
  | 'cotacao'
  | 'proposta'
  | 'pagamento'
  | 'chamado'
  | 'ia';

export interface TimelineEvent {
  id: Id;
  organizationId: Id;
  leadId?: Id;
  clienteId?: Id;
  canal: TimelineChannel;
  titulo: string;
  descricao?: string;
  autor?: string;
  em: IsoDate;
}

/* =========================================================
   Clientes
   ========================================================= */

export interface Customer extends TenantScoped {
  nome: string;
  documento: string;
  tipo: 'pf' | 'pj';
  email?: string;
  telefone: string;
  whatsapp?: string;
  cidade?: string;
  uf?: string;
  nascimento?: IsoDate;
  responsavelId?: Id;
  desde: IsoDate;
  /** Receita reconhecida no histórico. Somatório das faturas pagas. */
  valorVitalicio: Money;
  csatMedio?: number;
  tags: string[];
}

/* =========================================================
   Catálogo — produtos por segmento
   ========================================================= */

export interface Product extends TenantScoped {
  nome: string;
  segmento: BusinessSegment;
  categoria: string;
  fornecedor: string;
  ativo: boolean;
  /** Base da comissão quando a regra não especifica outra. */
  comissaoPadraoPercentual: number;
  descricao?: string;
}

/** Consórcio — campos que só existem neste segmento. */
export interface ConsortiumContract {
  administradora: string;
  grupo: string;
  cota: string;
  cartaCredito: Money;
  prazoMeses: number;
  parcela: Money;
  taxaAdministracao: number;
  fundoReserva: number;
  lanceOfertado?: Money;
  lanceEmbutido?: Money;
  contemplado: boolean;
  contempladoEm?: IsoDate;
}

/** Seguro — apólice. */
export interface InsurancePolicy {
  seguradora: string;
  apolice: string;
  ramo: string;
  coberturas: { nome: string; capital: Money }[];
  franquia: Money;
  premio: Money;
  parcelas: number;
  vigenciaInicio: IsoDate;
  vigenciaFim: IsoDate;
  renovacaoAutomatica: boolean;
}

/** Plano de saúde. */
export interface HealthPlan {
  operadora: string;
  plano: string;
  categoria: 'individual' | 'familiar' | 'empresarial' | 'adesao';
  acomodacao: 'enfermaria' | 'apartamento';
  titular: string;
  dependentes: { nome: string; nascimento: IsoDate; parentesco: string }[];
  mensalidade: Money;
  carenciaDias: number;
  vigenciaInicio: IsoDate;
  reajusteAniversario: IsoDate;
}

/* =========================================================
   Ciclo comercial — cotação, proposta, contrato
   ========================================================= */

export type QuoteStatus = 'rascunho' | 'enviada' | 'visualizada' | 'aprovada' | 'recusada' | 'expirada';

export interface QuoteOption {
  id: Id;
  rotulo: string;
  fornecedor: string;
  valor: Money;
  parcelas: number;
  valorParcela: Money;
  destaques: string[];
  recomendada?: boolean;
}

export interface Quote extends TenantScoped {
  numero: string;
  leadId?: Id;
  clienteId?: Id;
  segmento: BusinessSegment;
  responsavelId: Id;
  status: QuoteStatus;
  versao: number;
  opcoes: QuoteOption[];
  validaAte: IsoDate;
  enviadaEm?: IsoDate;
  visualizadaEm?: IsoDate;
  linkPublico?: string;
}

export type ProposalStatus =
  | 'rascunho'
  | 'enviada'
  | 'em_analise'
  | 'documentacao'
  | 'aprovada'
  | 'recusada'
  | 'cancelada';

export interface ChecklistItem {
  id: Id;
  descricao: string;
  obrigatorio: boolean;
  concluido: boolean;
  concluidoEm?: IsoDate;
}

export interface Proposal extends TenantScoped {
  numero: string;
  cotacaoId?: Id;
  clienteId: Id;
  produtoId: Id;
  segmento: BusinessSegment;
  responsavelId: Id;
  status: ProposalStatus;
  valor: Money;
  checklist: ChecklistItem[];
  enviadaEm?: IsoDate;
  decididaEm?: IsoDate;
  motivoRecusa?: string;
}

export type ContractStatus = 'vigente' | 'pendente' | 'suspenso' | 'cancelado' | 'encerrado' | 'renovacao';

export interface Contract extends TenantScoped {
  numero: string;
  propostaId?: Id;
  clienteId: Id;
  produtoId: Id;
  segmento: BusinessSegment;
  status: ContractStatus;
  valor: Money;
  vigenciaInicio: IsoDate;
  vigenciaFim?: IsoDate;
  renovaEm?: IsoDate;
  assinadoEm?: IsoDate;
  responsavelId: Id;
  consorcio?: ConsortiumContract;
  apolice?: InsurancePolicy;
  saude?: HealthPlan;
}

/* =========================================================
   Financeiro
   ========================================================= */

export type ReceivableStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado' | 'estornado';
export type PaymentMethod = 'pix' | 'boleto' | 'cartao' | 'link' | 'transferencia' | 'debito_automatico';

export interface Installment {
  numero: number;
  vencimento: IsoDate;
  valor: Money;
  status: ReceivableStatus;
  pagoEm?: IsoDate;
}

export interface Invoice extends TenantScoped {
  numero: string;
  clienteId: Id;
  contratoId?: Id;
  descricao: string;
  valor: Money;
  vencimento: IsoDate;
  status: ReceivableStatus;
  metodo?: PaymentMethod;
  pagoEm?: IsoDate;
  /** Identificador no provedor de pagamento. Nunca a chave do provedor. */
  referenciaExterna?: string;
  linkPagamento?: string;
}

/**
 * Recebimento registrado contra uma fatura.
 *
 * A fatura pode ser quitada de uma vez ou em vários registros — parte em
 * PIX hoje, parte em boleto na semana que vem. Guardar cada recebimento
 * em vez de só marcar a fatura como paga é o que permite conciliar
 * depois: sem isso, "quanto entrou por PIX em agosto" não tem resposta.
 */
export interface PaymentRecord extends TenantScoped {
  invoiceId: Id;
  metodo: PaymentMethod;
  valor: Money;
  recebidoEm: IsoDate;
  observacao?: string;
  /** Identificador no provedor. Nunca a chave do provedor. */
  referenciaExterna?: string;
  registradoPor: string;
}

export interface Payable extends TenantScoped {
  fornecedor: string;
  categoria: string;
  descricao: string;
  valor: Money;
  vencimento: IsoDate;
  status: ReceivableStatus;
  pagoEm?: IsoDate;
}

export interface CashFlowPoint {
  mes: string;
  entradas: Money;
  saidas: Money;
  saldo: Money;
  previsto: boolean;
}

/* =========================================================
   Comissões e parceiros
   ========================================================= */

export type CommissionStatus = 'pendente' | 'aprovada' | 'paga' | 'estornada';
export type CommissionBase = 'percentual' | 'fixo' | 'recorrente';

export interface CommissionRule extends TenantScoped {
  nome: string;
  base: CommissionBase;
  valor: number;
  produtoId?: Id;
  segmento?: BusinessSegment;
  papel?: RoleKey;
  /** Parcelas de recorrência; 1 significa pagamento único. */
  recorrenciaMeses: number;
  ativa: boolean;
}

export interface Commission extends TenantScoped {
  contratoId: Id;
  beneficiarioId: Id;
  beneficiarioNome: string;
  beneficiarioTipo: 'vendedor' | 'afiliado' | 'supervisor';
  regraId: Id;
  baseCalculo: Money;
  percentual?: number;
  valor: Money;
  competencia: string;
  /**
   * Parcela da recorrência. Comissão de pagamento único é sempre 1; a
   * recorrente gera uma linha por competência enquanto o contrato durar.
   * É este campo que compõe a chave única no banco e impede que
   * reprocessar o fechamento pague duas vezes a mesma parcela.
   */
  parcela?: number;
  status: CommissionStatus;
  pagaEm?: IsoDate;
}

export interface Affiliate extends TenantScoped {
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  codigo: string;
  linkExclusivo: string;
  status: 'ativo' | 'pendente' | 'suspenso';
  leadsGerados: number;
  vendas: number;
  comissaoAcumulada: Money;
  saldoDisponivel: Money;
}

/* =========================================================
   Conversas — WhatsApp, e-mail, omnichannel
   ========================================================= */

export type ConversationChannel = 'whatsapp' | 'email' | 'instagram' | 'webchat';
export type ConversationState =
  | 'nao_lida'
  | 'ia_atendendo'
  | 'humano_atendendo'
  | 'aguardando_cliente'
  | 'aguardando_vendedor'
  | 'encerrada';

export type MessageKind = 'texto' | 'audio' | 'imagem' | 'documento' | 'video' | 'localizacao' | 'contato' | 'sistema';

export interface Message {
  id: Id;
  conversationId: Id;
  autor: 'cliente' | 'ia' | 'usuario' | 'sistema';
  autorNome?: string;
  tipo: MessageKind;
  conteudo: string;
  anexo?: { nome: string; tamanho: string; url?: string };
  em: IsoDate;
  lida: boolean;
}

export interface Conversation extends TenantScoped {
  canal: ConversationChannel;
  contatoNome: string;
  contatoIdentificador: string;
  leadId?: Id;
  clienteId?: Id;
  estado: ConversationState;
  responsavelId?: Id;
  naoLidas: number;
  ultimaMensagem: string;
  ultimaMensagemEm: IsoDate;
  /** Assunto — só faz sentido em e-mail. */
  assunto?: string;
}

/* =========================================================
   Campanhas, consentimento e blacklist
   ========================================================= */

export type CampaignChannel = 'whatsapp' | 'email' | 'sms';
export type CampaignStatus = 'rascunho' | 'agendada' | 'enviando' | 'concluida' | 'pausada' | 'cancelada';

export interface CampaignMetrics {
  publico: number;
  enviadas: number;
  entregues: number;
  abertas: number;
  respondidas: number;
  leadsGerados: number;
  vendas: number;
  receita: Money;
  investimento: Money;
}

export interface Campaign extends TenantScoped {
  nome: string;
  canal: CampaignChannel;
  status: CampaignStatus;
  segmento?: BusinessSegment;
  agendadaPara?: IsoDate;
  templateId?: Id;
  metricas: CampaignMetrics;
}

export type OptOutChannel = 'whatsapp' | 'email' | 'sms' | 'telefone' | 'todos';

/**
 * Pedido de não contato. É o registro que a LGPD exige: quem pediu,
 * quando, por qual canal e por quê. A reativação depende de nova
 * manifestação do titular — nunca de decisão interna.
 */
export interface BlacklistEntry extends TenantScoped {
  contato: string;
  nome?: string;
  canal: OptOutChannel;
  motivo: string;
  solicitadoEm: IsoDate;
  registradoPor: string;
  origem: 'cliente' | 'ia' | 'operador' | 'importacao';
  reativadoEm?: IsoDate;
}

export interface Consent extends TenantScoped {
  titular: string;
  documento?: string;
  finalidade: string;
  canais: OptOutChannel[];
  concedido: boolean;
  em: IsoDate;
  base: 'consentimento' | 'contrato' | 'legitimo_interesse' | 'obrigacao_legal';
  evidencia?: string;
}

/* =========================================================
   Suporte
   ========================================================= */

export type TicketStatus =
  | 'novo'
  | 'em_atendimento'
  | 'aguardando_cliente'
  | 'aguardando_equipe'
  | 'resolvido'
  | 'encerrado';

export type TicketPriority = 'baixa' | 'normal' | 'alta' | 'critica';

/** Minutos de SLA por prioridade. Regra de negócio, não configuração de UI. */
export const SLA_MINUTOS: Record<TicketPriority, number> = {
  critica: 15,
  alta: 60,
  normal: 240,
  baixa: 1440,
};

export interface Ticket extends TenantScoped {
  protocolo: string;
  clienteId: Id;
  assunto: string;
  categoria: string;
  prioridade: TicketPriority;
  status: TicketStatus;
  responsavelId?: Id;
  equipeId?: Id;
  abertoEm: IsoDate;
  primeiraRespostaEm?: IsoDate;
  fechadoEm?: IsoDate;
  slaVenceEm: IsoDate;
  slaViolado: boolean;
  solucao?: string;
}

export interface CsatResponse extends TenantScoped {
  protocolo: string;
  clienteId: Id;
  nota: 1 | 2 | 3 | 4 | 5;
  comentario?: string;
  atendenteId?: Id;
  equipeId?: Id;
  canal: ConversationChannel;
  respondidoEm: IsoDate;
}

/* =========================================================
   Tarefas e agenda
   ========================================================= */

export interface Task extends TenantScoped {
  titulo: string;
  descricao?: string;
  responsavelId: Id;
  leadId?: Id;
  clienteId?: Id;
  vence: IsoDate;
  concluida: boolean;
  concluidaEm?: IsoDate;
  prioridade: TicketPriority;
  tipo: 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'documento' | 'outro';
}

export type AppointmentKind = 'reuniao' | 'ligacao' | 'visita' | 'assembleia' | 'interno';

export interface Appointment extends TenantScoped {
  titulo: string;
  descricao?: string;
  tipo: AppointmentKind;
  responsavelId: Id;
  clienteId?: Id;
  leadId?: Id;
  inicia: IsoDate;
  termina: IsoDate;
  local?: string;
  /** Compromisso criado por automação, não por pessoa. */
  automatico?: boolean;
  cancelado?: boolean;
}

/* =========================================================
   Automações
   ========================================================= */

export type AutomationTrigger =
  | 'lead_criado'
  | 'lead_atualizado'
  | 'status_alterado'
  | 'mensagem_recebida'
  | 'proposta_criada'
  | 'venda_realizada'
  | 'pagamento_confirmado'
  | 'vencimento_proximo'
  | 'chamado_criado'
  | 'chamado_encerrado'
  | 'csat_baixo'
  | 'renovacao_proxima'
  | 'sem_resposta';

export type AutomationActionKind =
  | 'enviar_whatsapp'
  | 'enviar_email'
  | 'acionar_ia'
  | 'distribuir_vendedor'
  | 'criar_tarefa'
  | 'mudar_status'
  | 'notificar'
  | 'chamar_webhook'
  | 'aguardar'
  | 'adicionar_blacklist';

export interface AutomationNode {
  id: Id;
  tipo: 'gatilho' | 'condicao' | 'acao' | 'espera';
  rotulo: string;
  detalhe?: string;
  acao?: AutomationActionKind;
}

export interface Automation extends TenantScoped {
  nome: string;
  gatilho: AutomationTrigger;
  ativa: boolean;
  nos: AutomationNode[];
  execucoes30d: number;
  sucesso30d: number;
}

/* =========================================================
   Inteligência
   ========================================================= */

export type InsightSeverity = 'oportunidade' | 'atencao' | 'risco' | 'conquista';

export interface Insight {
  id: Id;
  organizationId: Id;
  severidade: InsightSeverity;
  titulo: string;
  detalhe: string;
  metrica?: string;
  acao?: { rotulo: string; rota: string };
  geradoEm: IsoDate;
}

export interface ScoreFactor {
  fator: string;
  peso: number;
  contribuicao: number;
}

export interface LeadPrediction {
  leadId: Id;
  probabilidadeFechamento: number;
  receitaEsperada: Money;
  melhorHorarioContato: string;
  fatores: ScoreFactor[];
  recomendacao: string;
}

/** Registro do que a IA fez — insumo de auditoria, custo e aprendizado. */
export interface AiInteraction extends TenantScoped {
  conversationId?: Id;
  leadId?: Id;
  intencao: string;
  produtoIdentificado?: string;
  confianca: number;
  fonte: 'base_interna' | 'conhecimento_empresa' | 'historico' | 'produto' | 'provedor_externo';
  provedor?: string;
  tokensEntrada: number;
  tokensSaida: number;
  custo: Money;
  latenciaMs: number;
  transferiuParaHumano: boolean;
}

export interface KnowledgeArticle extends TenantScoped {
  titulo: string;
  categoria: string;
  segmento?: BusinessSegment;
  conteudo: string;
  aprovado: boolean;
  usosPelaIa: number;
  atualizadoEm: IsoDate;
  autor: string;
}

/* =========================================================
   Plataforma — auditoria, integrações, API
   ========================================================= */

export interface AuditLog {
  id: Id;
  organizationId?: Id;
  usuario: string;
  papel: RoleKey | PlatformRoleKey;
  acao: string;
  entidade: string;
  entidadeId?: Id;
  antes?: Record<string, unknown>;
  depois?: Record<string, unknown>;
  ip: string;
  userAgent?: string;
  em: IsoDate;
}

export type IntegrationStatus = 'conectado' | 'desconectado' | 'erro' | 'configurando';

export type IntegrationKey =
  | 'whatsapp_oficial'
  | 'evolution_api'
  | 'chatwoot'
  | 'meta_ads'
  | 'instagram'
  | 'google_ads'
  | 'smtp'
  | 'imap'
  | 'gateway_pagamento'
  | 'pix'
  | 'seguradora_api'
  | 'administradora_api'
  | 'operadora_api'
  | 'n8n'
  | 'webhook'
  | 'erp';

export interface Integration extends TenantScoped {
  chave: IntegrationKey;
  nome: string;
  categoria: 'mensageria' | 'midia' | 'pagamento' | 'produto' | 'automacao' | 'sistema';
  status: IntegrationStatus;
  ultimaSincronizacao?: IsoDate;
  mensagemErro?: string;
}

export interface ApiKey extends TenantScoped {
  nome: string;
  /** Só o prefixo é exibível. O segredo aparece uma vez, na criação. */
  prefixo: string;
  escopos: PermissionKey[];
  ultimoUso?: IsoDate;
  expiraEm?: IsoDate;
  revogada: boolean;
}

export interface WebhookEndpoint extends TenantScoped {
  url: string;
  eventos: string[];
  ativo: boolean;
  /** Assinatura HMAC. O segredo nunca sai da API. */
  assinaturaAtiva: boolean;
  ultimaEntrega?: IsoDate;
  falhasConsecutivas: number;
}

export interface Notification {
  id: Id;
  organizationId: Id;
  usuarioId?: Id;
  categoria: 'sistema' | 'leads' | 'vendas' | 'financeiro' | 'suporte' | 'sla' | 'comissao' | 'renovacao' | 'ia';
  titulo: string;
  detalhe: string;
  em: IsoDate;
  lida: boolean;
  rota?: string;
}

/* =========================================================
   Módulos e fases
   ========================================================= */

export type ModuleKey =
  | 'dashboard'
  | 'intelligence'
  | 'leads'
  | 'funil'
  | 'clientes'
  | 'conversas'
  | 'email'
  | 'cotacoes'
  | 'propostas'
  | 'contratos'
  | 'produtos'
  | 'campanhas'
  | 'automacoes'
  | 'tarefas'
  | 'agenda'
  | 'financeiro'
  | 'comissoes'
  | 'partners'
  | 'suporte'
  | 'conhecimento'
  | 'relatorios'
  | 'integracoes'
  | 'configuracoes'
  | 'auditoria';

export type PhaseKey = 'core' | 'comercial' | 'operacao' | 'financeiro' | 'intelligence' | 'ecossistema';

export interface PhaseDefinition {
  chave: PhaseKey;
  numero: number;
  nome: string;
  proposito: string;
  modulos: ModuleKey[];
}

export const FASES: PhaseDefinition[] = [
  {
    chave: 'core',
    numero: 1,
    nome: 'Core',
    proposito: 'A operação para de viver no WhatsApp pessoal. Lead entra, é qualificado e tem dono.',
    modulos: ['dashboard', 'leads', 'funil', 'clientes', 'conversas', 'tarefas', 'configuracoes'],
  },
  {
    chave: 'comercial',
    numero: 2,
    nome: 'Comercial',
    proposito: 'Do interesse ao contrato assinado, com o cálculo da comissão saindo junto.',
    modulos: ['cotacoes', 'propostas', 'produtos', 'comissoes', 'partners', 'campanhas'],
  },
  {
    chave: 'operacao',
    numero: 3,
    nome: 'Operação',
    proposito: 'O que foi vendido passa a ser acompanhado: vigência, renovação e pós-venda.',
    modulos: ['contratos', 'suporte', 'agenda', 'conhecimento'],
  },
  {
    chave: 'financeiro',
    numero: 4,
    nome: 'Financeiro',
    proposito: 'A receita deixa de ser estimativa. Cobrança, baixa e fluxo de caixa fecham.',
    modulos: ['financeiro'],
  },
  {
    chave: 'intelligence',
    numero: 5,
    nome: 'Intelligence',
    proposito: 'A base acumulada vira previsão, score e recomendação de próxima ação.',
    modulos: ['intelligence', 'automacoes', 'relatorios'],
  },
  {
    chave: 'ecossistema',
    numero: 6,
    nome: 'Ecossistema',
    proposito: 'A plataforma deixa de ser destino e vira infraestrutura para outros sistemas.',
    modulos: ['integracoes', 'auditoria', 'email'],
  },
];

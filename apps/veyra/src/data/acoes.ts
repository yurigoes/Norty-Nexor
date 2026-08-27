import type {
  Appointment,
  BusinessSegment,
  Id,
  Lead,
  LeadSource,
  PaymentMethod,
  PaymentRecord,
  Task,
  TicketPriority,
} from '@veyra/core';
import {
  COMPROMISSOS,
  FATURAS,
  LEADS,
  PAGAMENTOS,
  PIPELINES,
  TAREFAS,
  AGORA,
} from './base';

/**
 * Escrita na base de demonstração
 *
 * Enquanto a API não entra, a demonstração precisa de um lugar único
 * onde o dado é alterado. Espalhar `array.push` pelos componentes faria
 * cada tela inventar a própria regra — e é justamente a regra que
 * interessa mostrar: uma fatura vira "paga" quando a soma dos
 * recebimentos alcança o valor, não quando alguém marca uma caixa.
 *
 * Toda função aqui muda o array em memória e devolve o registro criado.
 * Quem chama é responsável por pedir `invalidar()` da sessão em seguida:
 * é o mesmo contrato que os services terão quando falarem com a API.
 */

/** Identificador sequencial e legível, para o dado da tela fazer sentido. */
function proximoId(prefixo: string, existentes: { id: string }[]): string {
  const numeros = existentes
    .map((r) => Number(r.id.replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n));
  const proximo = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return `${prefixo}-${String(proximo).padStart(3, '0')}`;
}

/* =========================================================
   Leads
   ========================================================= */

export interface NovoLead {
  nome: string;
  telefone: string;
  email?: string;
  cidade?: string;
  uf?: string;
  origem: LeadSource;
  segmento: BusinessSegment;
  produtoId?: string;
  valorEstimado?: number;
  responsavelId?: string;
  observacoes?: string;
}

/**
 * O score de um lead recém-criado não é zero nem um chute: ele começa
 * pelos sinais que já existem no cadastro. Origem de indicação converte
 * muito mais que mídia paga, e ticket acima da média puxa a prioridade.
 * É uma versão simplificada do que o motor faz — mas a leitura da tela
 * fica honesta: o número tem de onde vir.
 */
function scoreInicial(dados: NovoLead): number {
  let score = 20;
  if (dados.origem === 'indicacao') score += 22;
  if (dados.origem === 'afiliado') score += 14;
  if (dados.origem === 'whatsapp') score += 10;
  if (dados.email) score += 6;
  if (dados.valorEstimado && dados.valorEstimado >= 150_000) score += 14;
  else if (dados.valorEstimado && dados.valorEstimado >= 50_000) score += 8;
  if (dados.cidade) score += 4;
  return Math.min(score, 99);
}

function temperaturaDoScore(score: number): Lead['temperatura'] {
  if (score >= 85) return 'fervendo';
  if (score >= 65) return 'quente';
  if (score >= 40) return 'morno';
  return 'frio';
}

export function criarLead(dados: NovoLead): Lead {
  const pipeline =
    PIPELINES.find((p) => p.segmento === dados.segmento) ?? PIPELINES[0];
  const score = scoreInicial(dados);

  const lead: Lead = {
    id: proximoId('lead', LEADS),
    organizationId: LEADS[0].organizationId,
    createdAt: AGORA,
    nome: dados.nome.trim(),
    telefone: dados.telefone.trim(),
    whatsapp: dados.telefone.replace(/\D/g, ''),
    email: dados.email?.trim() || undefined,
    cidade: dados.cidade?.trim() || undefined,
    uf: dados.uf?.trim().toUpperCase() || undefined,
    origem: dados.origem,
    produtoId: dados.produtoId,
    segmento: dados.segmento,
    valorEstimado: dados.valorEstimado,
    score,
    temperatura: temperaturaDoScore(score),
    responsavelId: dados.responsavelId,
    equipeId:
      dados.segmento === 'seguro'
        ? 'eq-seguros'
        : dados.segmento === 'saude'
          ? 'eq-saude'
          : 'eq-consorcio',
    status: 'novo',
    pipelineId: pipeline.id,
    etapaId: pipeline.etapas[0].id,
    ultimaInteracaoEm: AGORA,
    observacoes: dados.observacoes?.trim() || undefined,
  };

  LEADS.unshift(lead);
  return lead;
}

/** Move o lead de etapa e mantém o status coerente com onde ele parou. */
export function moverLead(leadId: Id, etapaId: Id): Lead | undefined {
  const lead = LEADS.find((l) => l.id === leadId);
  if (!lead) return undefined;
  const pipeline = PIPELINES.find((p) => p.id === lead.pipelineId);
  const etapa = pipeline?.etapas.find((e) => e.id === etapaId);
  if (!etapa) return lead;

  lead.etapaId = etapaId;
  lead.updatedAt = AGORA;

  /* A etapa é o fato; o status é a leitura dela. Deixá-los divergir faria
     o funil e a lista de leads contarem histórias diferentes. */
  const porEtapa: Record<string, Lead['status']> = {
    'et-novo': 'novo',
    'et-qualificacao': 'em_qualificacao',
    'et-interesse': 'qualificado',
    'et-cotacao': 'cotacao',
    'et-proposta': 'proposta',
    'et-negociacao': 'em_negociacao',
    'et-documentacao': 'em_negociacao',
    'et-vistoria': 'em_negociacao',
    'et-venda': 'venda',
  };
  const novoStatus = porEtapa[etapaId];
  if (novoStatus) lead.status = novoStatus;

  return lead;
}

/* =========================================================
   Tarefas
   ========================================================= */

export interface NovaTarefa {
  titulo: string;
  descricao?: string;
  responsavelId: string;
  vence: string;
  prioridade: TicketPriority;
  tipo: Task['tipo'];
  clienteId?: string;
  leadId?: string;
}

export function criarTarefa(dados: NovaTarefa): Task {
  const tarefa: Task = {
    id: proximoId('tar', TAREFAS),
    organizationId: TAREFAS[0].organizationId,
    createdAt: AGORA,
    titulo: dados.titulo.trim(),
    descricao: dados.descricao?.trim() || undefined,
    responsavelId: dados.responsavelId,
    clienteId: dados.clienteId,
    leadId: dados.leadId,
    vence: dados.vence,
    concluida: false,
    prioridade: dados.prioridade,
    tipo: dados.tipo,
  };
  TAREFAS.unshift(tarefa);
  return tarefa;
}

export function atualizarTarefa(id: Id, mudancas: Partial<Task>): Task | undefined {
  const tarefa = TAREFAS.find((t) => t.id === id);
  if (!tarefa) return undefined;
  Object.assign(tarefa, mudancas);
  return tarefa;
}

/** Alterna a conclusão. Concluir carimba a data; reabrir a apaga. */
export function alternarTarefa(id: Id): Task | undefined {
  const tarefa = TAREFAS.find((t) => t.id === id);
  if (!tarefa) return undefined;
  tarefa.concluida = !tarefa.concluida;
  tarefa.concluidaEm = tarefa.concluida ? AGORA : undefined;
  return tarefa;
}

export function excluirTarefa(id: Id): boolean {
  const i = TAREFAS.findIndex((t) => t.id === id);
  if (i < 0) return false;
  TAREFAS.splice(i, 1);
  return true;
}

/* =========================================================
   Agenda
   ========================================================= */

export interface NovoCompromisso {
  titulo: string;
  descricao?: string;
  tipo: Appointment['tipo'];
  responsavelId: string;
  clienteId?: string;
  inicia: string;
  termina: string;
  local?: string;
}

export function criarCompromisso(dados: NovoCompromisso): Appointment {
  const compromisso: Appointment = {
    id: proximoId('ag', COMPROMISSOS),
    organizationId: COMPROMISSOS[0].organizationId,
    createdAt: AGORA,
    titulo: dados.titulo.trim(),
    descricao: dados.descricao?.trim() || undefined,
    tipo: dados.tipo,
    responsavelId: dados.responsavelId,
    clienteId: dados.clienteId,
    inicia: dados.inicia,
    termina: dados.termina,
    local: dados.local?.trim() || undefined,
  };
  COMPROMISSOS.push(compromisso);
  return compromisso;
}

export function atualizarCompromisso(
  id: Id,
  mudancas: Partial<Appointment>,
): Appointment | undefined {
  const compromisso = COMPROMISSOS.find((c) => c.id === id);
  if (!compromisso) return undefined;
  Object.assign(compromisso, mudancas, { updatedAt: AGORA });
  return compromisso;
}

/**
 * Cancelar não apaga.
 *
 * Um compromisso que some do calendário leva junto a evidência de que
 * ele existiu — e quem foi cobrado por não ter comparecido perde a
 * defesa. Ele fica marcado como cancelado e sai da visão do dia.
 */
export function cancelarCompromisso(id: Id): Appointment | undefined {
  return atualizarCompromisso(id, { cancelado: true });
}

/* =========================================================
   Financeiro
   ========================================================= */

export function pagamentosDaFatura(invoiceId: Id): PaymentRecord[] {
  return PAGAMENTOS.filter((p) => p.invoiceId === invoiceId).sort((a, b) =>
    a.recebidoEm < b.recebidoEm ? -1 : 1,
  );
}

export function totalRecebido(invoiceId: Id): number {
  return pagamentosDaFatura(invoiceId).reduce((s, p) => s + p.valor, 0);
}

export function saldoDaFatura(invoiceId: Id): number {
  const fatura = FATURAS.find((f) => f.id === invoiceId);
  if (!fatura) return 0;
  /* Arredonda no centavo: somar decimais em ponto flutuante deixa
     resíduos como 0.000000001 que impediriam a fatura de fechar. */
  return Math.round((fatura.valor - totalRecebido(invoiceId)) * 100) / 100;
}

export interface NovoPagamento {
  invoiceId: Id;
  metodo: PaymentMethod;
  valor: number;
  observacao?: string;
  referenciaExterna?: string;
  registradoPor: string;
}

/**
 * Registra um recebimento e reavalia a fatura.
 *
 * A fatura fecha sozinha quando a soma dos recebimentos alcança o valor.
 * Isso é o oposto de deixar alguém marcar "pago" à mão: com o registro,
 * um pagamento parcial mantém a fatura em aberto pelo saldo, e a régua
 * de cobrança continua trabalhando pelo que falta.
 */
export function registrarPagamento(dados: NovoPagamento): PaymentRecord | undefined {
  const fatura = FATURAS.find((f) => f.id === dados.invoiceId);
  if (!fatura) return undefined;

  const valor = Math.round(dados.valor * 100) / 100;
  if (valor <= 0) return undefined;

  const pagamento: PaymentRecord = {
    id: proximoId('pg', PAGAMENTOS),
    organizationId: fatura.organizationId,
    createdAt: AGORA,
    invoiceId: fatura.id,
    metodo: dados.metodo,
    valor,
    recebidoEm: AGORA,
    observacao: dados.observacao?.trim() || undefined,
    referenciaExterna: dados.referenciaExterna?.trim() || undefined,
    registradoPor: dados.registradoPor,
  };
  PAGAMENTOS.push(pagamento);

  const saldo = saldoDaFatura(fatura.id);
  if (saldo <= 0) {
    fatura.status = 'pago';
    fatura.pagoEm = AGORA;
    fatura.metodo = dados.metodo;
  } else {
    /* Ainda falta dinheiro: a fatura volta a "vencido" se o prazo já
       passou, e a "pendente" se não. O parcial não perdoa o atraso. */
    fatura.status = new Date(fatura.vencimento) < new Date(AGORA) ? 'vencido' : 'pendente';
    fatura.pagoEm = undefined;
  }

  return pagamento;
}

/** Desfaz um recebimento lançado por engano e recalcula a fatura. */
export function estornarPagamento(pagamentoId: Id): boolean {
  const i = PAGAMENTOS.findIndex((p) => p.id === pagamentoId);
  if (i < 0) return false;
  const { invoiceId } = PAGAMENTOS[i];
  PAGAMENTOS.splice(i, 1);

  const fatura = FATURAS.find((f) => f.id === invoiceId);
  if (fatura) {
    const saldo = saldoDaFatura(invoiceId);
    if (saldo <= 0) {
      fatura.status = 'pago';
    } else {
      fatura.status = new Date(fatura.vencimento) < new Date(AGORA) ? 'vencido' : 'pendente';
      fatura.pagoEm = undefined;
    }
  }
  return true;
}

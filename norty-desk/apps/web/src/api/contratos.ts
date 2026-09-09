import type {
  ContratoView,
  CustoDoChamado,
  EscreverContratoRequest,
  EscreverFornecedorRequest,
  EscreverOrcamentoRequest,
  FornecedorView,
  LancarCustoRequest,
  OrcamentoView,
  RelatorioDeCusto,
} from '@norty-desk/shared';

import { chamar } from './cliente';

function query(filtro: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtro)) {
    if (valor === undefined || valor === null || valor === '') continue;
    p.set(chave, String(valor));
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

// --- Fornecedores -------------------------------------------------------

export const listarFornecedores = () => chamar<FornecedorView[]>('/suppliers');

export const criarFornecedor = (dados: EscreverFornecedorRequest) =>
  chamar<FornecedorView>('/suppliers', { metodo: 'POST', corpo: dados });

// --- Contratos ----------------------------------------------------------

export const listarContratos = (
  filtro: { q?: string; kind?: string; incluirInativos?: boolean; vencendoEm?: number } = {},
) => chamar<ContratoView[]>(`/contracts${query(filtro)}`);

export const criarContrato = (dados: EscreverContratoRequest) =>
  chamar<ContratoView>('/contracts', { metodo: 'POST', corpo: dados });

export const editarContrato = (id: string, dados: Partial<EscreverContratoRequest>) =>
  chamar<ContratoView>(`/contracts/${id}`, { metodo: 'PATCH', corpo: dados });

export type AtivoDoContrato = { id: string; name: string; tag: string | null; status: string };

export const ativosDoContrato = (id: string) =>
  chamar<AtivoDoContrato[]>(`/contracts/${id}/ativos`);

// --- Orçamento ----------------------------------------------------------

export const listarOrcamentos = () => chamar<OrcamentoView[]>('/budgets');

export const criarOrcamento = (dados: EscreverOrcamentoRequest) =>
  chamar<OrcamentoView>('/budgets', { metodo: 'POST', corpo: dados });

// --- Custo do chamado ---------------------------------------------------

export const custosDoChamado = (ticketId: string) =>
  chamar<CustoDoChamado>(`/tickets/${ticketId}/custos`);

export const lancarCusto = (ticketId: string, dados: LancarCustoRequest) =>
  chamar<CustoDoChamado>(`/tickets/${ticketId}/custos`, { metodo: 'POST', corpo: dados });

export const removerCusto = (ticketId: string, custoId: string) =>
  chamar<CustoDoChamado>(`/tickets/${ticketId}/custos/${custoId}`, { metodo: 'DELETE' });

export const relatorioDeCusto = (filtro: { de?: string; ate?: string } = {}) =>
  chamar<RelatorioDeCusto>(`/reports/custo${query(filtro)}`);

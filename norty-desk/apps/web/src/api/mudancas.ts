import type {
  ApprovalView,
  EscreverMudancaRequest,
  MudancaDetalhe,
  MudancaQuery,
  MudancaResumo,
  TicketEventView,
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

export const buscarMudancas = (filtro: MudancaQuery = {}) =>
  chamar<MudancaResumo[]>(`/changes${query(filtro)}`);

export const obterMudanca = (id: string) => chamar<MudancaDetalhe>(`/changes/${id}`);

export const eventosDaMudanca = (id: string) =>
  chamar<TicketEventView[]>(`/changes/${id}/eventos`);

export const criarMudanca = (dados: EscreverMudancaRequest & { ticketIds?: string[] }) =>
  chamar<MudancaDetalhe>('/changes', { metodo: 'POST', corpo: dados });

export const editarMudanca = (id: string, dados: Partial<EscreverMudancaRequest>) =>
  chamar<MudancaDetalhe>(`/changes/${id}`, { metodo: 'PATCH', corpo: dados });

export const anotarMudanca = (id: string, body: string) =>
  chamar<TicketEventView[]>(`/changes/${id}/notas`, { metodo: 'POST', corpo: { body } });

export const solicitarAprovacaoDaMudanca = (
  id: string,
  dados: { approverIds: string[]; quorum?: number; comment?: string },
) => chamar<ApprovalView[]>(`/changes/${id}/aprovacoes`, { metodo: 'POST', corpo: dados });

export const executarMudanca = (
  id: string,
  dados: { acao: 'INICIAR' | 'CONCLUIR' | 'REVERTER'; outcome?: string },
) => chamar<MudancaDetalhe>(`/changes/${id}/executar`, { metodo: 'POST', corpo: dados });

export const vincularChamadoAMudanca = (id: string, ticketId: string) =>
  chamar<MudancaDetalhe>(`/changes/${id}/tickets`, { metodo: 'POST', corpo: { ticketId } });

export const desvincularChamadoDaMudanca = (id: string, ticketId: string) =>
  chamar<MudancaDetalhe>(`/changes/${id}/tickets/${ticketId}`, { metodo: 'DELETE' });

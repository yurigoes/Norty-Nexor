import type {
  ErroConhecidoSugerido,
  EscreverProblemaRequest,
  ProblemaDetalhe,
  ProblemaQuery,
  ProblemaResumo,
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

export const buscarProblemas = (filtro: ProblemaQuery & { abertos?: boolean } = {}) =>
  chamar<ProblemaResumo[]>(`/problems${query(filtro)}`);

export const obterProblema = (id: string) => chamar<ProblemaDetalhe>(`/problems/${id}`);

export const eventosDoProblema = (id: string) =>
  chamar<TicketEventView[]>(`/problems/${id}/eventos`);

export const criarProblema = (dados: EscreverProblemaRequest & { ticketIds?: string[] }) =>
  chamar<ProblemaDetalhe>('/problems', { metodo: 'POST', corpo: dados });

export const editarProblema = (id: string, dados: Partial<EscreverProblemaRequest>) =>
  chamar<ProblemaDetalhe>(`/problems/${id}`, { metodo: 'PATCH', corpo: dados });

export const anotarProblema = (id: string, body: string) =>
  chamar<TicketEventView[]>(`/problems/${id}/notas`, { metodo: 'POST', corpo: { body } });

// --- Vínculo com o chamado --------------------------------------------

export const vincularChamadoAoProblema = (id: string, ticketId: string) =>
  chamar<ProblemaDetalhe>(`/problems/${id}/tickets`, { metodo: 'POST', corpo: { ticketId } });

export const desvincularChamadoDoProblema = (id: string, ticketId: string) =>
  chamar<ProblemaDetalhe>(`/problems/${id}/tickets/${ticketId}`, { metodo: 'DELETE' });

// --- Erros conhecidos --------------------------------------------------

export const errosConhecidos = (filtro: { q?: string; limit?: number } = {}) =>
  chamar<ErroConhecidoSugerido[]>(`/problems/erros-conhecidos${query(filtro)}`);

export const errosConhecidosDoChamado = (ticketId: string) =>
  chamar<ErroConhecidoSugerido[]>(`/tickets/${ticketId}/erros-conhecidos`);

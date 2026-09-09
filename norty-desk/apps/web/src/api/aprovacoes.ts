import type { ApprovalView, DecideApprovalRequest } from '@norty-desk/shared';

import { chamar } from './cliente';

export const aprovacoesDoChamado = (ticketId: string) =>
  chamar<ApprovalView[]>(`/tickets/${ticketId}/aprovacoes`);

export const minhasAprovacoes = () => chamar<ApprovalView[]>('/aprovacoes/minhas');

export const solicitarAprovacao = (
  ticketId: string,
  dados: { approverIds: string[]; quorum?: number; step?: number; comment?: string },
) =>
  chamar<ApprovalView[]>(`/tickets/${ticketId}/aprovacoes`, { metodo: 'POST', corpo: dados });

export const decidirAprovacao = (id: string, dados: DecideApprovalRequest) =>
  chamar<ApprovalView[]>(`/aprovacoes/${id}/decidir`, { metodo: 'POST', corpo: dados });

export type PessoaView = { id: string; name: string; email: string; role: string };

export const listarPessoas = () => chamar<PessoaView[]>('/users');

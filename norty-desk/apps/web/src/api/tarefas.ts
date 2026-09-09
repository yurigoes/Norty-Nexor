import type { CriarTarefaRequest, EditarTarefaRequest, TicketTaskView } from '@norty-desk/shared';

import { chamar } from './cliente';

export const tarefasDoChamado = (ticketId: string) =>
  chamar<TicketTaskView[]>(`/tickets/${ticketId}/tarefas`);

export const criarTarefa = (ticketId: string, dados: CriarTarefaRequest) =>
  chamar<TicketTaskView[]>(`/tickets/${ticketId}/tarefas`, { metodo: 'POST', corpo: dados });

export const editarTarefa = (ticketId: string, tarefaId: string, dados: EditarTarefaRequest) =>
  chamar<TicketTaskView[]>(`/tickets/${ticketId}/tarefas/${tarefaId}`, {
    metodo: 'PATCH',
    corpo: dados,
  });

export const removerTarefa = (ticketId: string, tarefaId: string) =>
  chamar<TicketTaskView[]>(`/tickets/${ticketId}/tarefas/${tarefaId}`, { metodo: 'DELETE' });

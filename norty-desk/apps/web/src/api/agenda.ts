import type { AgendaItem, EventoRequest } from '@norty-desk/shared';

import { chamar } from './cliente';

/** Agenda: compromissos, tarefas de chamado e de projeto com data, de uma pessoa, várias ou um time. */

export const listarAgenda = (filtro: { from: string; to: string; userIds?: string[]; teamId?: string }) => {
  const p = new URLSearchParams({ from: filtro.from, to: filtro.to });
  if (filtro.userIds?.length) p.set('userIds', filtro.userIds.join(','));
  if (filtro.teamId) p.set('teamId', filtro.teamId);
  return chamar<AgendaItem[]>(`/agenda?${p.toString()}`);
};

export const criarEvento = (dados: EventoRequest) =>
  chamar<AgendaItem>('/agenda/events', { metodo: 'POST', corpo: dados });

export const editarEvento = (id: string, dados: Partial<Omit<EventoRequest, 'ownerId'>>) =>
  chamar<AgendaItem>(`/agenda/events/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerEvento = (id: string) => chamar<void>(`/agenda/events/${id}`, { metodo: 'DELETE' });

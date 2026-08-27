/* Chamados de manutenção e serviços. */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type { ID, Ticket, TicketPriority, TicketStatus } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';
import { unitLabel } from './directory';

export function tickets(condominiumId: ID): Ticket[] {
  return where('tickets', (t) => t.condominiumId === condominiumId);
}

export function ticketsOfUnit(unitId: ID): Ticket[] {
  return where('tickets', (t) => t.unitId === unitId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function openTickets(condominiumId: ID): Ticket[] {
  return tickets(condominiumId).filter((t) => t.status === 'aberto' || t.status === 'em_andamento');
}

export interface CreateTicketInput {
  condominiumId: ID;
  unitId?: ID;
  category: string;
  location: string;
  title: string;
  description: string;
  priority: TicketPriority;
  openedBy: string;
  openedById?: ID;
  hasAttachment: boolean;
}

export function createTicket(input: CreateTicketInput): Ticket {
  const now = new Date().toISOString();
  const sequence = tickets(input.condominiumId).length + 2401;
  const ticket: Ticket = {
    id: nextId('tkt'),
    code: `CH-${String(sequence).padStart(5, '0')}`,
    status: 'aberto',
    createdAt: now,
    updatedAt: now,
    updates: [{ id: nextId('tu'), at: now, author: input.openedBy, message: 'Chamado aberto.' }],
    ...input,
  };
  insert('tickets', ticket);

  pushNotification({
    condominiumId: input.condominiumId,
    role: 'sindico',
    kind: 'chamado',
    title: 'Novo chamado aberto',
    body: `${ticket.code} · ${ticket.title} — ${input.unitId ? unitLabel(input.unitId) : input.location}`,
    link: '/gestao/chamados',
    refId: ticket.id,
  });

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.openedBy,
    actorRole: 'morador',
    action: 'Abriu chamado',
    target: `${ticket.code} · ${ticket.title}`,
    detail: input.location,
    module: 'Chamados',
  });

  return ticket;
}

export function addTicketUpdate(id: ID, author: string, message: string, status?: TicketStatus): Ticket | undefined {
  const ticket = byId('tickets', id);
  if (!ticket) return undefined;
  const at = new Date().toISOString();
  const updates = [...ticket.updates, { id: nextId('tu'), at, author, message, status }];
  const next = update('tickets', id, {
    updates,
    updatedAt: at,
    status: status ?? ticket.status,
    closedAt: status === 'resolvido' ? at : ticket.closedAt,
  });

  if (status && ticket.unitId) {
    pushNotification({
      condominiumId: ticket.condominiumId,
      unitId: ticket.unitId,
      kind: 'chamado',
      title: `Chamado ${ticket.code} atualizado`,
      body: `${ticket.title} — ${TICKET_STATUS_LABEL[status]}.`,
      link: '/app/chamados',
      refId: ticket.id,
    });
  }

  recordAudit({
    condominiumId: ticket.condominiumId,
    actorName: author,
    actorRole: 'sindico',
    action: status === 'resolvido' ? 'Encerrou chamado' : 'Atualizou chamado',
    target: ticket.code,
    detail: message,
    module: 'Chamados',
  });

  return next;
}

export function assignTicket(id: ID, assignee: string, author: string): Ticket | undefined {
  const ticket = byId('tickets', id);
  if (!ticket) return undefined;
  update('tickets', id, { assignedTo: assignee });
  return addTicketUpdate(id, author, `Chamado atribuído a ${assignee}.`, 'em_andamento');
}

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export function ticketTone(status: TicketStatus) {
  switch (status) {
    case 'aberto': return 'warning' as const;
    case 'em_andamento': return 'info' as const;
    case 'resolvido': return 'success' as const;
    default: return 'danger' as const;
  }
}

export function priorityTone(priority: TicketPriority) {
  switch (priority) {
    case 'urgente': return 'danger' as const;
    case 'alta': return 'warning' as const;
    case 'normal': return 'info' as const;
    default: return 'neutral' as const;
  }
}

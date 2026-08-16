/* Autorizações de visitantes, prestadores e convidados de eventos. */

import { all, byId, insert, nextId, update, where } from '../data/repositories';
import type { AuthorizationKind, CondoEvent, ID, Visitor, VisitorStatus } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';
import { registerAccess } from './access';
import { unitLabel } from './directory';

export function visitorsOfCondominium(condominiumId: ID): Visitor[] {
  return where('visitors', (v) => v.condominiumId === condominiumId);
}

export function visitorsOfUnit(unitId: ID): Visitor[] {
  return where('visitors', (v) => v.unitId === unitId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function expectedToday(condominiumId: ID, isoDate: string): Visitor[] {
  return where('visitors', (v) =>
    v.condominiumId === condominiumId
    && v.expectedDate === isoDate
    && (v.status === 'aguardando' || v.status === 'liberado'))
    .sort((a, b) => a.expectedTime.localeCompare(b.expectedTime));
}

export function onSite(condominiumId: ID): Visitor[] {
  return where('visitors', (v) => v.condominiumId === condominiumId && v.status === 'no_local');
}

export function activeAuthorizations(unitId: ID): Visitor[] {
  return visitorsOfUnit(unitId).filter((v) => v.status === 'aguardando' || v.status === 'no_local' || v.status === 'liberado');
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `NX-${out}`;
}

export interface CreateVisitorInput {
  condominiumId: ID;
  unitId: ID;
  residentId: ID;
  name: string;
  document: string;
  phone?: string;
  kind: AuthorizationKind;
  expectedDate: string;
  expectedTime: string;
  validUntil?: string;
  recurrenceDays?: number[];
  notes?: string;
  vehiclePlate?: string;
  companyName?: string;
  category: Visitor['category'];
  eventId?: ID;
  createdBy: string;
}

export function createVisitor(input: CreateVisitorInput): Visitor {
  const visitor: Visitor = {
    id: nextId('vis'),
    status: 'aguardando',
    code: generateCode(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  insert('visitors', visitor);

  pushNotification({
    condominiumId: input.condominiumId,
    role: 'portaria',
    kind: 'autorizacao',
    title: 'Nova autorização de visitante',
    body: `${visitor.name} foi autorizado para ${unitLabel(visitor.unitId)} em ${visitor.expectedDate.split('-').reverse().join('/')} às ${visitor.expectedTime}.`,
    link: '/portaria/visitantes',
    refId: visitor.id,
  });

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.createdBy,
    actorRole: 'morador',
    action: 'Autorizou visitante',
    target: visitor.name,
    detail: `${unitLabel(visitor.unitId)} · Autorização ${visitor.kind}`,
    module: 'Visitantes',
  });

  return visitor;
}

export function revokeVisitor(id: ID, actorName: string): Visitor | undefined {
  const visitor = byId('visitors', id);
  if (!visitor) return undefined;
  const next = update('visitors', id, { status: 'revogado' as VisitorStatus });
  recordAudit({
    condominiumId: visitor.condominiumId,
    actorName,
    actorRole: 'morador',
    action: 'Revogou autorização',
    target: visitor.name,
    detail: unitLabel(visitor.unitId),
    module: 'Visitantes',
  });
  return next;
}

/** Portaria libera a entrada: registra acesso e avisa o morador. */
export function checkIn(id: ID, gateId: ID, registeredBy: string, method: 'manual' | 'qrcode' = 'manual'): Visitor | undefined {
  const visitor = byId('visitors', id);
  if (!visitor) return undefined;
  const at = new Date().toISOString();
  const next = update('visitors', id, { status: 'no_local' as VisitorStatus, checkInAt: at });

  registerAccess({
    condominiumId: visitor.condominiumId,
    unitId: visitor.unitId,
    subjectType: visitor.category === 'prestador' ? 'prestador' : 'visitante',
    subjectId: visitor.id,
    subjectName: visitor.name,
    direction: 'entrada',
    gateId,
    plate: visitor.vehiclePlate,
    registeredBy,
    method,
    authorized: true,
  });

  pushNotification({
    condominiumId: visitor.condominiumId,
    unitId: visitor.unitId,
    kind: 'visitante_chegou',
    title: 'Visitante liberado na portaria',
    body: `${visitor.name} teve a entrada registrada e está a caminho da sua unidade.`,
    link: '/app/acessos',
    refId: visitor.id,
  });

  return next;
}

export function checkOut(id: ID, gateId: ID, registeredBy: string): Visitor | undefined {
  const visitor = byId('visitors', id);
  if (!visitor) return undefined;
  const at = new Date().toISOString();
  const next = update('visitors', id, { status: 'finalizado' as VisitorStatus, checkOutAt: at });

  registerAccess({
    condominiumId: visitor.condominiumId,
    unitId: visitor.unitId,
    subjectType: visitor.category === 'prestador' ? 'prestador' : 'visitante',
    subjectId: visitor.id,
    subjectName: visitor.name,
    direction: 'saida',
    gateId,
    plate: visitor.vehiclePlate,
    registeredBy,
    method: 'manual',
    authorized: true,
  });

  return next;
}

export function denyVisitor(id: ID, registeredBy: string): Visitor | undefined {
  const visitor = byId('visitors', id);
  if (!visitor) return undefined;
  recordAudit({
    condominiumId: visitor.condominiumId,
    actorName: registeredBy,
    actorRole: 'portaria',
    action: 'Recusou entrada de visitante',
    target: visitor.name,
    detail: unitLabel(visitor.unitId),
    module: 'Visitantes',
  });
  return update('visitors', id, { status: 'recusado' as VisitorStatus });
}

/** Busca por código de convite/QR na portaria. */
export function findByCode(condominiumId: ID, code: string): Visitor | undefined {
  const normalized = code.trim().toUpperCase();
  return where('visitors', (v) => v.condominiumId === condominiumId && v.code.toUpperCase() === normalized)[0];
}

/* ---------------- Eventos ---------------- */

export function eventsOfUnit(unitId: ID): CondoEvent[] {
  return where('events', (e) => e.unitId === unitId);
}

export function eventsOfCondominium(condominiumId: ID): CondoEvent[] {
  return where('events', (e) => e.condominiumId === condominiumId);
}

export function guestsOfEvent(eventId: ID): Visitor[] {
  return where('visitors', (v) => v.eventId === eventId);
}

export interface CreateEventInput {
  condominiumId: ID;
  unitId: ID;
  residentId: ID;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  expectedGuests: number;
  areaId?: ID;
  createdBy: string;
}

export function createEvent(input: CreateEventInput): CondoEvent {
  const event: CondoEvent = {
    id: nextId('event'),
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    residentId: input.residentId,
    title: input.title,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    expectedGuests: input.expectedGuests,
    areaId: input.areaId,
    status: 'planejado',
    createdAt: new Date().toISOString(),
    inviteCode: `NX-EVT-${Math.floor(1000 + Math.random() * 8999)}`,
  };
  insert('events', event);

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.createdBy,
    actorRole: 'morador',
    action: 'Criou evento',
    target: event.title,
    detail: `${unitLabel(event.unitId)} · ${event.expectedGuests} convidados`,
    module: 'Eventos',
  });

  return event;
}

export function addGuest(event: CondoEvent, name: string, document: string, createdBy: string): Visitor {
  return createVisitor({
    condominiumId: event.condominiumId,
    unitId: event.unitId,
    residentId: event.residentId,
    name,
    document,
    kind: 'unica',
    expectedDate: event.date,
    expectedTime: event.startTime,
    category: 'convidado_evento',
    eventId: event.id,
    createdBy,
  });
}

export const AUTHORIZATION_LABEL: Record<AuthorizationKind, string> = {
  unica: 'Única',
  temporaria: 'Temporária',
  recorrente: 'Recorrente',
  permanente: 'Permanente',
};

export const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  aguardando: 'Aguardando',
  liberado: 'Liberado',
  no_local: 'No local',
  finalizado: 'Finalizado',
  revogado: 'Revogado',
  expirado: 'Expirado',
  recusado: 'Recusado',
};

export function statusTone(status: VisitorStatus) {
  switch (status) {
    case 'aguardando': return 'warning' as const;
    case 'liberado': return 'info' as const;
    case 'no_local': return 'success' as const;
    case 'finalizado': return 'neutral' as const;
    case 'revogado':
    case 'recusado': return 'danger' as const;
    default: return 'neutral' as const;
  }
}

export function totalVisitors(): number {
  return all('visitors').length;
}

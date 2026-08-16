/* Reservas de áreas comuns: disponibilidade, criação e aprovação. */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type { CommonArea, ID, Reservation } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';
import { unitLabel } from './directory';

export function commonAreas(condominiumId: ID): CommonArea[] {
  return where('commonAreas', (a) => a.condominiumId === condominiumId && a.active);
}

export function area(id: ID | undefined): CommonArea | undefined {
  return id ? byId('commonAreas', id) : undefined;
}

export function areaName(id: ID | undefined): string {
  return area(id)?.name ?? '—';
}

export function reservations(condominiumId: ID): Reservation[] {
  return where('reservations', (r) => r.condominiumId === condominiumId);
}

export function reservationsOfUnit(unitId: ID): Reservation[] {
  return where('reservations', (r) => r.unitId === unitId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function reservationsOn(condominiumId: ID, date: string): Reservation[] {
  return reservations(condominiumId).filter((r) => r.date === date && r.status !== 'cancelada' && r.status !== 'recusada');
}

/** Slots já ocupados de uma área numa data. */
export function takenSlots(areaId: ID, date: string): string[] {
  return where('reservations', (r) =>
    r.areaId === areaId && r.date === date && (r.status === 'confirmada' || r.status === 'pendente'))
    .map((r) => r.slot);
}

export function availability(areaId: ID, date: string): { slot: string; available: boolean }[] {
  const target = area(areaId);
  if (!target) return [];
  const taken = new Set(takenSlots(areaId, date));
  return target.slots.map((slot) => ({ slot, available: !taken.has(slot) }));
}

/** Mapa de ocupação do mês, usado para colorir o calendário. */
export function monthAvailability(areaId: ID, monthIso: string): Record<string, { status: 'free' | 'partial' | 'full'; count: number }> {
  const target = area(areaId);
  if (!target) return {};
  const prefix = monthIso.slice(0, 7);
  const map: Record<string, { status: 'free' | 'partial' | 'full'; count: number }> = {};
  where('reservations', (r) => r.areaId === areaId && r.date.startsWith(prefix) && (r.status === 'confirmada' || r.status === 'pendente'))
    .forEach((r) => {
      const current = map[r.date] ?? { status: 'free' as const, count: 0 };
      current.count += 1;
      map[r.date] = current;
    });
  Object.keys(map).forEach((date) => {
    map[date].status = map[date].count >= target.slots.length ? 'full' : 'partial';
  });
  return map;
}

export interface CreateReservationInput {
  condominiumId: ID;
  areaId: ID;
  unitId: ID;
  residentId: ID;
  residentName: string;
  date: string;
  slot: string;
  guests: number;
  notes?: string;
  eventId?: ID;
}

export class ReservationError extends Error {}

export function createReservation(input: CreateReservationInput): Reservation {
  const target = area(input.areaId);
  if (!target) throw new ReservationError('Área comum não encontrada.');
  if (takenSlots(input.areaId, input.date).includes(input.slot)) {
    throw new ReservationError('Este horário já está reservado. Escolha outro horário.');
  }
  if (input.guests > target.capacity) {
    throw new ReservationError(`Capacidade máxima da área é de ${target.capacity} pessoas.`);
  }

  const reservation: Reservation = {
    id: nextId('resv'),
    status: target.autoApprove ? 'confirmada' : 'pendente',
    fee: target.fee,
    createdAt: new Date().toISOString(),
    ...input,
  };
  insert('reservations', reservation);

  pushNotification({
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    kind: 'reserva',
    title: target.autoApprove ? 'Reserva confirmada' : 'Reserva enviada para aprovação',
    body: `${target.name} · ${input.date.split('-').reverse().join('/')} · ${input.slot}`,
    link: '/app/reservas',
    refId: reservation.id,
  });

  if (!target.autoApprove) {
    pushNotification({
      condominiumId: input.condominiumId,
      role: 'sindico',
      kind: 'reserva',
      title: 'Nova reserva aguardando aprovação',
      body: `${input.residentName} (${unitLabel(input.unitId)}) solicitou ${target.name} em ${input.date.split('-').reverse().join('/')}.`,
      link: '/gestao/reservas',
      refId: reservation.id,
    });
  }

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.residentName,
    actorRole: 'morador',
    action: 'Criou reserva',
    target: `${target.name} · ${input.slot}`,
    detail: unitLabel(input.unitId),
    module: 'Reservas',
  });

  return reservation;
}

export function decideReservation(id: ID, approve: boolean, actorName: string): Reservation | undefined {
  const reservation = byId('reservations', id);
  if (!reservation) return undefined;
  const next = update('reservations', id, { status: approve ? 'confirmada' : 'recusada' });

  pushNotification({
    condominiumId: reservation.condominiumId,
    unitId: reservation.unitId,
    kind: 'reserva',
    title: approve ? 'Reserva confirmada' : 'Reserva recusada',
    body: `${areaName(reservation.areaId)} · ${reservation.date.split('-').reverse().join('/')} · ${reservation.slot}`,
    link: '/app/reservas',
    refId: reservation.id,
  });

  recordAudit({
    condominiumId: reservation.condominiumId,
    actorName,
    actorRole: 'sindico',
    action: approve ? 'Aprovou reserva' : 'Recusou reserva',
    target: `${areaName(reservation.areaId)} · ${reservation.slot}`,
    detail: unitLabel(reservation.unitId),
    module: 'Reservas',
  });

  return next;
}

export function cancelReservation(id: ID, actorName: string): Reservation | undefined {
  const reservation = byId('reservations', id);
  if (!reservation) return undefined;
  recordAudit({
    condominiumId: reservation.condominiumId,
    actorName,
    actorRole: 'morador',
    action: 'Cancelou reserva',
    target: `${areaName(reservation.areaId)} · ${reservation.slot}`,
    detail: unitLabel(reservation.unitId),
    module: 'Reservas',
  });
  return update('reservations', id, { status: 'cancelada' });
}

export const RESERVATION_STATUS_LABEL: Record<Reservation['status'], string> = {
  pendente: 'Aguardando aprovação',
  confirmada: 'Confirmada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
};

export function reservationTone(status: Reservation['status']) {
  switch (status) {
    case 'confirmada': return 'success' as const;
    case 'pendente': return 'warning' as const;
    case 'recusada':
    case 'cancelada': return 'danger' as const;
    default: return 'neutral' as const;
  }
}

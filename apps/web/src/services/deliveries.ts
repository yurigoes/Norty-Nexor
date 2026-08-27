/* Encomendas: recebimento na portaria, notificação e retirada. */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type { Delivery, ID } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';
import { unitLabel } from './directory';

export function deliveries(condominiumId: ID): Delivery[] {
  return where('deliveries', (d) => d.condominiumId === condominiumId);
}

export function deliveriesOfUnit(unitId: ID): Delivery[] {
  return where('deliveries', (d) => d.unitId === unitId);
}

export function pendingDeliveries(condominiumId: ID): Delivery[] {
  return deliveries(condominiumId).filter((d) => d.status === 'recebida' || d.status === 'notificada');
}

export interface ReceiveDeliveryInput {
  condominiumId: ID;
  unitId: ID;
  carrier: string;
  trackingCode: string;
  size: Delivery['size'];
  shelf: string;
  requiresSignature: boolean;
  notes?: string;
  receivedBy: string;
}

export function receiveDelivery(input: ReceiveDeliveryInput): Delivery {
  const delivery: Delivery = {
    id: nextId('del'),
    status: 'notificada',
    receivedAt: new Date().toISOString(),
    ...input,
  };
  insert('deliveries', delivery);

  pushNotification({
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    kind: 'encomenda',
    title: 'Encomenda recebida',
    body: `Uma encomenda da ${input.carrier} está disponível na portaria (prateleira ${input.shelf}).`,
    link: '/app/encomendas',
    refId: delivery.id,
  });

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.receivedBy,
    actorRole: 'portaria',
    action: 'Registrou encomenda',
    target: `${input.carrier} · ${input.trackingCode}`,
    detail: unitLabel(input.unitId),
    module: 'Encomendas',
  });

  return delivery;
}

export function pickUpDelivery(id: ID, pickedUpBy: string, registeredBy: string): Delivery | undefined {
  const delivery = byId('deliveries', id);
  if (!delivery) return undefined;
  const next = update('deliveries', id, {
    status: 'retirada',
    pickedUpAt: new Date().toISOString(),
    pickedUpBy,
  });

  recordAudit({
    condominiumId: delivery.condominiumId,
    actorName: registeredBy,
    actorRole: 'portaria',
    action: 'Confirmou retirada de encomenda',
    target: `${delivery.carrier} · ${delivery.trackingCode}`,
    detail: `${unitLabel(delivery.unitId)} · Retirada por ${pickedUpBy}`,
    module: 'Encomendas',
  });

  return next;
}

export const DELIVERY_STATUS_LABEL: Record<Delivery['status'], string> = {
  recebida: 'Recebida',
  notificada: 'Aguardando retirada',
  retirada: 'Retirada',
  devolvida: 'Devolvida',
};

export function deliveryTone(status: Delivery['status']) {
  switch (status) {
    case 'recebida': return 'info' as const;
    case 'notificada': return 'warning' as const;
    case 'retirada': return 'success' as const;
    default: return 'neutral' as const;
  }
}

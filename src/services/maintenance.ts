/* Plano de manutenção preventiva e corretiva. */

import { byId, update, where } from '../data/repositories';
import type { ID, MaintenanceOrder } from '../data/types';
import { recordAudit } from './audit';

export function maintenanceOrders(condominiumId: ID): MaintenanceOrder[] {
  return where('maintenance', (m) => m.condominiumId === condominiumId)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export function advanceMaintenance(id: ID, status: MaintenanceOrder['status'], actorName: string): MaintenanceOrder | undefined {
  const order = byId('maintenance', id);
  if (!order) return undefined;
  const next = update('maintenance', id, {
    status,
    lastExecutedAt: status === 'concluida' ? new Date().toISOString().slice(0, 10) : order.lastExecutedAt,
  });
  recordAudit({
    condominiumId: order.condominiumId,
    actorName,
    actorRole: 'sindico',
    action: 'Atualizou ordem de manutenção',
    target: order.asset,
    detail: MAINTENANCE_STATUS_LABEL[status],
    module: 'Manutenção',
  });
  return next;
}

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceOrder['status'], string> = {
  agendada: 'Agendada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
};

export const RECURRENCE_LABEL: Record<MaintenanceOrder['recurrence'], string> = {
  unica: 'Única',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export function maintenanceTone(status: MaintenanceOrder['status']) {
  switch (status) {
    case 'concluida': return 'success' as const;
    case 'em_execucao': return 'info' as const;
    case 'atrasada': return 'danger' as const;
    default: return 'neutral' as const;
  }
}

/**
 * Rotinas de manutenção para a rotina agendada. Recebem a transação já
 * escopada pela empresa e não dependem de injeção: os serviços usados
 * aqui são classes sem estado.
 */
import { maintenanceDue } from '@nortycar/shared';
import type { Tx } from '../../common/prisma.service';
import { NotifyService } from '../../common/notify.service';
import { TimelineService } from '../../common/timeline.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';

export interface MaintenanceAlert {
  planId: string;
  vehicleUnitId: string;
  plate: string;
  plan: string;
  state: 'DUE_SOON' | 'OVERDUE';
  kmRemaining: number | null;
  daysRemaining: number | null;
  blocked: boolean;
}

/**
 * Planos vencendo ou vencidos. Gera um alerta por plano e marco (a chave
 * inclui o próximo km/data, então o alerta renasce no ciclo seguinte) e,
 * quando o plano manda, bloqueia o veículo vencido para novas locações.
 */
export async function maintenanceAlerts(tx: Tx, organizationId: string): Promise<MaintenanceAlert[]> {
  const notify = new NotifyService();
  const status = new VehicleStatusService(new TimelineService());
  const plans = await tx.maintenancePlan.findMany({
    where: { organizationId, active: true, vehicle: { deletedAt: null, commercialStatus: { not: 'SOLD' } } },
    include: { vehicle: true },
  });
  const alerts: MaintenanceAlert[] = [];
  for (const p of plans) {
    const due = maintenanceDue({
      intervalKm: p.intervalKm, intervalDays: p.intervalDays, lastDoneKm: p.lastDoneKm, lastDoneAt: p.lastDoneAt,
      currentKm: p.vehicle.odometerKm, alertKmBefore: p.alertKmBefore, alertDaysBefore: p.alertDaysBefore,
    });
    if (due.state !== 'DUE_SOON' && due.state !== 'OVERDUE') continue;
    const marker = `${due.nextKm ?? ''}:${due.nextDate?.toISOString().slice(0, 10) ?? ''}`;
    const parts = [
      due.kmRemaining !== null ? (due.kmRemaining <= 0 ? `${-due.kmRemaining} km além do previsto` : `faltam ${due.kmRemaining} km`) : null,
      due.daysRemaining !== null ? (due.daysRemaining <= 0 ? `${-due.daysRemaining} dia(s) de atraso` : `faltam ${due.daysRemaining} dia(s)`) : null,
    ].filter(Boolean).join(' · ');
    await notify.notify(tx, organizationId, {
      type: 'maintenance.due', severity: due.state === 'OVERDUE' ? 'CRITICAL' : 'WARNING', audiencePermission: 'maintenance.view',
      branchId: p.vehicle.branchId,
      title: `${due.state === 'OVERDUE' ? 'Manutenção vencida' : 'Manutenção próxima'}: ${p.vehicle.plate} — ${p.name}`,
      body: parts, link: `/operacao/manutencao?veiculo=${p.vehicleUnitId}`, dedupeKey: `plan:${p.id}:${due.state}:${marker}`,
    });
    let blocked = false;
    if (due.state === 'OVERDUE' && p.blockWhenOverdue && p.vehicle.operationalStatus === 'RELEASED') {
      // Bloqueio por sistema: a liberação depois exige a permissão de quem libera.
      await status.setOperational(tx, null, organizationId, p.vehicleUnitId, 'BLOCKED', `Manutenção preventiva vencida: ${p.name}`);
      blocked = true;
    }
    alerts.push({
      planId: p.id, vehicleUnitId: p.vehicleUnitId, plate: p.vehicle.plate, plan: p.name, state: due.state,
      kmRemaining: due.kmRemaining, daysRemaining: due.daysRemaining, blocked,
    });
  }
  return alerts;
}

/** Ordens de serviço abertas com prazo vencido. Um alerta por OS por dia. */
export async function overdueWorkOrders(tx: Tx, organizationId: string) {
  const notify = new NotifyService();
  const late = await tx.workOrder.findMany({
    where: { organizationId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueAt: { lt: new Date() } },
    include: { vehicle: { select: { plate: true } } },
  });
  const day = new Date().toISOString().slice(0, 10);
  for (const w of late) {
    await notify.notify(tx, organizationId, {
      type: 'maintenance.work_order_late', severity: 'WARNING', audiencePermission: 'maintenance.view', branchId: w.branchId,
      title: `OS ${w.number} atrasada (${w.vehicle.plate})`, body: `Prazo era ${w.dueAt!.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
      link: `/operacao/ordens-servico/${w.id}`, dedupeKey: `wo_late:${w.id}:${day}`,
    });
  }
  return late.map((w) => ({ id: w.id, number: w.number, plate: w.vehicle.plate, dueAt: w.dueAt, status: w.status }));
}

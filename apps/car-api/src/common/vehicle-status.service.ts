import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  COMMERCIAL_STATUS_LABEL, OPERATIONAL_STATUS_LABEL, type CommercialStatus, type OperationalStatus,
} from '@nortycar/shared';
import type { Tx } from './prisma.service';
import { TimelineService } from './timeline.service';
import type { RequestContext } from './context';

/**
 * Situação do veículo. Comercial e operacional são separadas: um carro
 * pode estar "Alugado" e "Em manutenção" (sinistro no meio do contrato).
 *
 * Toda mudança grava histórico e entra na linha do tempo da placa.
 */
@Injectable()
export class VehicleStatusService {
  constructor(private readonly timeline: TimelineService) {}

  async setOperational(tx: Tx, ctx: RequestContext | null, organizationId: string, vehicleUnitId: string, to: OperationalStatus, reason?: string | null): Promise<void> {
    const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: vehicleUnitId } });
    if (vehicle.operationalStatus === to) return;
    // Sair de "Bloqueado" exige a permissão específica — bloqueio não se
    // desfaz por um efeito colateral de outra tela.
    if (vehicle.operationalStatus === 'BLOCKED' && ctx && !ctx.permissions.has('fleet.unblock')) {
      throw new ForbiddenException('Somente quem tem a permissão de liberar veículo bloqueado pode alterar esta situação.');
    }
    await tx.vehicleUnit.update({
      where: { id: vehicleUnitId },
      data: { operationalStatus: to, blockReason: to === 'BLOCKED' ? (reason ?? 'Bloqueado') : null },
    });
    await tx.vehicleStatusChange.create({
      data: { organizationId, vehicleUnitId, field: 'OPERATIONAL', fromStatus: vehicle.operationalStatus, toStatus: to, reason: reason ?? null, userId: ctx?.userId ?? null },
    });
    await this.timeline.record(tx, ctx, organizationId, {
      vehicleUnitId, type: 'STATUS_CHANGED',
      title: `Situação operacional: ${OPERATIONAL_STATUS_LABEL[vehicle.operationalStatus]} → ${OPERATIONAL_STATUS_LABEL[to]}`,
      description: reason ?? null,
    });
  }

  async setCommercial(tx: Tx, ctx: RequestContext | null, organizationId: string, vehicleUnitId: string, to: CommercialStatus, reason?: string | null): Promise<void> {
    const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: vehicleUnitId } });
    if (vehicle.commercialStatus === to) return;
    await tx.vehicleUnit.update({ where: { id: vehicleUnitId }, data: { commercialStatus: to, ...(to === 'SOLD' ? { soldAt: new Date() } : {}) } });
    await tx.vehicleStatusChange.create({
      data: { organizationId, vehicleUnitId, field: 'COMMERCIAL', fromStatus: vehicle.commercialStatus, toStatus: to, reason: reason ?? null, userId: ctx?.userId ?? null },
    });
    await this.timeline.record(tx, ctx, organizationId, {
      vehicleUnitId, type: 'STATUS_CHANGED',
      title: `Situação comercial: ${COMMERCIAL_STATUS_LABEL[vehicle.commercialStatus]} → ${COMMERCIAL_STATUS_LABEL[to]}`,
      description: reason ?? null,
    });
  }

  /**
   * Recalcula a situação comercial a partir da agenda: contrato aberto →
   * Alugado; reserva ativa futura → Reservado; senão Disponível. À venda
   * e Vendido são decisões explícitas e não são sobrescritas.
   */
  async recomputeCommercial(tx: Tx, ctx: RequestContext | null, organizationId: string, vehicleUnitId: string): Promise<CommercialStatus> {
    const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: vehicleUnitId } });
    if (vehicle.commercialStatus === 'SOLD' || vehicle.commercialStatus === 'FOR_SALE') return vehicle.commercialStatus;
    const openContract = await tx.contractVehicle.findFirst({ where: { vehicleUnitId, endAt: null, contract: { status: 'ACTIVE' } } });
    let next: CommercialStatus = 'AVAILABLE';
    if (openContract) next = 'RENTED';
    else {
      const reservation = await tx.vehicleAllocation.findFirst({ where: { vehicleUnitId, kind: 'RESERVATION', active: true, endsAt: { gt: new Date() } } });
      if (reservation) next = 'RESERVED';
    }
    await this.setCommercial(tx, ctx, organizationId, vehicleUnitId, next, 'Atualização automática pela agenda');
    return next;
  }
}

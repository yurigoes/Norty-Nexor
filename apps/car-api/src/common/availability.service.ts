import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { addHours, type AllocationKind } from '@nortycar/shared';
import type { Tx } from './prisma.service';
import { orgSettings } from './org-settings';
import { mapDatabaseError } from './http-exception.filter';

export interface AllocateInput {
  vehicleUnitId: string;
  kind: AllocationKind;
  startsAt: Date;
  endsAt: Date;
  /** Sobrepõe o tempo de preparo da filial/empresa. */
  bufferHours?: number;
  reservationId?: string;
  contractVehicleId?: string;
  workOrderId?: string;
  reason?: string;
  createdById?: string;
}

export interface AvailabilityQuery {
  startAt: Date;
  endAt: Date;
  branchId?: string;
  branchIds?: string[];
  categoryId?: string;
  modelId?: string;
  /** Inclui os campos internos (placa) — falso para o site público. */
  internal?: boolean;
}

/** Situações em que o carro não entra em nenhuma locação nova. */
const NOT_RENTABLE_COMMERCIAL = ['SOLD', 'FOR_SALE'] as const;

/**
 * Motor de disponibilidade.
 *
 * Disponibilidade não é um campo de status: é a ausência de bloco ativo
 * na agenda do carro durante o período pedido, mais o tempo de preparo,
 * respeitando as situações que impedem locação (vendido, à venda,
 * bloqueado, excluído).
 *
 * Consultar não reserva. Reservar é inserir um bloco — e quem garante
 * que dois blocos não se sobrepõem é a restrição de exclusão do banco,
 * não esta classe. Duas confirmações simultâneas do mesmo carro: uma
 * passa, a outra recebe 409.
 */
@Injectable()
export class AvailabilityService {
  async turnaroundHours(tx: Tx, organizationId: string, branchId?: string | null): Promise<number> {
    if (branchId) {
      const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { turnaroundHours: true } });
      if (branch?.turnaroundHours !== null && branch?.turnaroundHours !== undefined) return branch.turnaroundHours;
    }
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    return orgSettings(org?.settings).turnaroundHours;
  }

  /** Verifica se o carro pode receber uma locação nova (independe do período). */
  async assertRentable(tx: Tx, vehicleUnitId: string): Promise<void> {
    const vehicle = await tx.vehicleUnit.findUnique({ where: { id: vehicleUnitId } });
    if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
    if ((NOT_RENTABLE_COMMERCIAL as readonly string[]).includes(vehicle.commercialStatus)) {
      throw new ConflictException(vehicle.commercialStatus === 'SOLD' ? 'Veículo vendido não pode ser locado.' : 'Veículo à venda não está disponível para novas locações.');
    }
    if (vehicle.operationalStatus === 'BLOCKED') {
      throw new ConflictException(`Veículo bloqueado${vehicle.blockReason ? `: ${vehicle.blockReason}` : ''}. Libere-o com a autorização necessária antes de locar.`);
    }
  }

  async allocate(tx: Tx, organizationId: string, input: AllocateInput) {
    if (input.endsAt <= input.startsAt) throw new BadRequestException('O fim do período precisa ser posterior ao início.');
    if (input.kind === 'RESERVATION' || input.kind === 'CONTRACT') await this.assertRentable(tx, input.vehicleUnitId);
    const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: input.vehicleUnitId }, select: { branchId: true } });
    const buffer = input.bufferHours ?? (input.kind === 'BLOCK' ? 0 : await this.turnaroundHours(tx, organizationId, vehicle.branchId));
    try {
      // SAVEPOINT: a violação da exclusão vira 409 sem abortar a transação inteira.
      await tx.$executeRaw`SAVEPOINT allocate_vehicle`;
      const allocation = await tx.vehicleAllocation.create({
        data: {
          organizationId,
          vehicleUnitId: input.vehicleUnitId,
          kind: input.kind,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          blockedUntil: addHours(input.endsAt, buffer),
          reservationId: input.reservationId ?? null,
          contractVehicleId: input.contractVehicleId ?? null,
          workOrderId: input.workOrderId ?? null,
          reason: input.reason ?? null,
          createdById: input.createdById ?? null,
        },
      });
      await tx.$executeRaw`RELEASE SAVEPOINT allocate_vehicle`;
      return allocation;
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT allocate_vehicle`;
      const mapped = mapDatabaseError(error);
      if (mapped?.status === 409) {
        const conflict = await this.conflicts(tx, input.vehicleUnitId, input.startsAt, addHours(input.endsAt, buffer));
        const first = conflict[0];
        throw new ConflictException(
          first
            ? `O veículo já está ocupado neste período (${KIND_LABEL[first.kind]} de ${fmt(first.startsAt)} a ${fmt(first.endsAt)}, mais preparo).`
            : 'O veículo já está ocupado neste período.',
        );
      }
      throw error;
    }
  }

  /** Libera um bloco inteiro (cancelamento) — o registro fica, inativo. */
  async release(tx: Tx, allocationId: string): Promise<void> {
    await tx.vehicleAllocation.update({ where: { id: allocationId }, data: { active: false, releasedAt: new Date() } });
  }

  /**
   * Encerra um bloco antes do previsto (devolução antecipada, troca de
   * veículo, OS concluída). O preparo passa a contar do novo fim.
   */
  async truncate(tx: Tx, organizationId: string, allocationId: string, newEnd: Date): Promise<void> {
    const current = await tx.vehicleAllocation.findUniqueOrThrow({ where: { id: allocationId }, include: { vehicle: true } });
    const end = newEnd <= current.startsAt ? new Date(current.startsAt.getTime() + 60_000) : newEnd;
    const buffer = current.kind === 'BLOCK' ? 0 : await this.turnaroundHours(tx, organizationId, current.vehicle.branchId);
    await tx.vehicleAllocation.update({ where: { id: allocationId }, data: { endsAt: end, blockedUntil: addHours(end, buffer) } });
  }

  /**
   * Estende um bloco (prorrogação). Falha com 409 se colidir com o bloco
   * seguinte — a prorrogação não atropela a próxima reserva.
   */
  async extend(tx: Tx, organizationId: string, allocationId: string, newEnd: Date): Promise<void> {
    const current = await tx.vehicleAllocation.findUniqueOrThrow({ where: { id: allocationId }, include: { vehicle: true } });
    const buffer = await this.turnaroundHours(tx, organizationId, current.vehicle.branchId);
    try {
      await tx.$executeRaw`SAVEPOINT extend_vehicle`;
      await tx.vehicleAllocation.update({ where: { id: allocationId }, data: { endsAt: newEnd, blockedUntil: addHours(newEnd, buffer) } });
      await tx.$executeRaw`RELEASE SAVEPOINT extend_vehicle`;
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT extend_vehicle`;
      if (mapDatabaseError(error)?.status === 409) {
        throw new ConflictException('Não é possível prorrogar: o veículo tem outro compromisso logo depois. Considere trocar o veículo.');
      }
      throw error;
    }
  }

  async conflicts(tx: Tx, vehicleUnitId: string, from: Date, to: Date) {
    return tx.vehicleAllocation.findMany({
      where: { vehicleUnitId, active: true, startsAt: { lt: to }, blockedUntil: { gt: from } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async isFree(tx: Tx, organizationId: string, vehicleUnitId: string, startAt: Date, endAt: Date): Promise<boolean> {
    const vehicle = await tx.vehicleUnit.findUnique({ where: { id: vehicleUnitId }, select: { branchId: true } });
    if (!vehicle) return false;
    const buffer = await this.turnaroundHours(tx, organizationId, vehicle.branchId);
    const list = await this.conflicts(tx, vehicleUnitId, startAt, addHours(endAt, buffer));
    return list.length === 0;
  }

  /**
   * Unidades livres no período. A conta considera o preparo do bloco
   * novo (fim + preparo não pode invadir o próximo) e o dos existentes
   * (gravado em blockedUntil).
   */
  async findAvailable(tx: Tx, organizationId: string, query: AvailabilityQuery) {
    if (query.endAt <= query.startAt) throw new BadRequestException('A devolução precisa ser posterior à retirada.');
    const buffer = await this.turnaroundHours(tx, organizationId, query.branchId);
    const until = addHours(query.endAt, buffer);
    const units = await tx.vehicleUnit.findMany({
      where: {
        organizationId,
        deletedAt: null,
        commercialStatus: { notIn: [...NOT_RENTABLE_COMMERCIAL] },
        operationalStatus: { not: 'BLOCKED' },
        ...(query.branchId ? { branchId: query.branchId } : query.branchIds ? { branchId: { in: query.branchIds } } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.modelId ? { modelId: query.modelId } : {}),
        allocations: { none: { active: true, startsAt: { lt: until }, blockedUntil: { gt: query.startAt } } },
      },
      include: { model: { include: { make: true } }, version: true, category: true, branch: true },
      orderBy: [{ odometerKm: 'asc' }],
    });
    return units;
  }

  async agenda(tx: Tx, vehicleUnitId: string, from: Date, to: Date) {
    return tx.vehicleAllocation.findMany({
      where: { vehicleUnitId, active: true, startsAt: { lt: to }, blockedUntil: { gt: from } },
      orderBy: { startsAt: 'asc' },
    });
  }
}

const KIND_LABEL: Record<AllocationKind, string> = {
  RESERVATION: 'reserva', CONTRACT: 'contrato', MAINTENANCE: 'manutenção', BLOCK: 'bloqueio', INSPECTION: 'vistoria',
};

function fmt(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

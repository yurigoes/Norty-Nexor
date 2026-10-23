import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { computeProfitability, fromCents, toCents, type ProfitabilityResult } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { num, numOrNull } from '../../common/serialize.interceptor';
import { orgSettings } from '../../common/org-settings';
import type { OrgContext } from '../../common/context';

const DAY = 86_400_000;
const REVENUE_KINDS = ['RENTAL', 'MONTHLY', 'EXTRA'] as const;

export interface PeriodQuery {
  from: Date;
  to: Date;
  branchIds?: string[] | null;
  vehicleId?: string;
}

export interface VehicleProfitability extends ProfitabilityResult {
  vehicleUnitId: string;
  plate: string;
  model: string;
  branchId: string;
  commercialStatus: string;
  daysInFleet: number;
  daysRented: number;
  daysUnavailable: number;
  kmDriven: number | null;
  breakdown: {
    maintenance: number; parts: number; tires: number; insurance: number; taxes: number; documentation: number; fuel: number; other: number;
  };
}

/** Dias de sobreposição entre dois intervalos (frações contam). */
function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? (end - start) / DAY : 0;
}

/** Janela de uma competência AAAA-MM. */
function competenceWindow(competence: string): [Date, Date] {
  const [y, m] = competence.split('-').map(Number);
  return [new Date(Date.UTC(y!, m! - 1, 1)), new Date(Date.UTC(y!, m!, 1))];
}

/**
 * Rentabilidade por veículo no período.
 *
 * Receita: pagamentos confirmados (não estornados) de títulos de locação,
 * mensalidade e extras, no período. Quando o título é de um contrato,
 * o valor é rateado entre os carros pelos dias em que cada um esteve no
 * contrato (dentro da competência, se houver) — assim a troca de veículo
 * não joga a receita toda num carro só.
 *
 * Custos: contas a pagar ligadas ao veículo (competência pelo vencimento),
 * peças baixadas do estoque para a placa, eventos de pneu com custo e
 * abastecimentos pagos pela empresa. Contas a pagar do tipo combustível
 * ficam de fora para não contar o mesmo abastecimento duas vezes; a
 * aquisição do veículo é capital, não custo do período.
 *
 * Dado ausente nunca vira zero: o indicador volta nulo e `missing` diz o
 * que falta.
 */
@Injectable()
export class ProfitabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Período e filiais validados contra o contexto. */
  resolve(ctx: OrgContext, query: { from?: string; to?: string; branchId?: string }): PeriodQuery {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 365 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new BadRequestException('Período inválido.');
    if (to.getTime() - from.getTime() > 5 * 366 * DAY) throw new BadRequestException('Período máximo de 5 anos.');
    if (query.branchId && !ctx.allBranches && !ctx.branchIds.includes(query.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
    const branchIds = query.branchId ? [query.branchId] : ctx.allBranches ? null : ctx.branchIds;
    return { from, to, branchIds };
  }

  async compute(tx: Tx, organizationId: string, period: PeriodQuery): Promise<VehicleProfitability[]> {
    const { from, to } = period;
    const vehicleWhere: Prisma.VehicleUnitWhereInput = {
      deletedAt: null,
      ...(period.branchIds ? { branchId: { in: period.branchIds } } : {}),
      ...(period.vehicleId ? { id: period.vehicleId } : {}),
      OR: [{ soldAt: null }, { soldAt: { gte: from } }],
    };
    const vehicles = await tx.vehicleUnit.findMany({ where: vehicleWhere, include: { model: { select: { name: true, make: { select: { name: true } } } } } });
    if (!vehicles.length) return [];
    const ids = vehicles.map((v) => v.id);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
    const depreciation = orgSettings(org.settings).annualDepreciationPercent;

    const [intervals, payments, payables, movements, tireEvents, refuels, allocations, readings, sales] = await Promise.all([
      tx.contractVehicle.findMany({ where: { vehicleUnitId: { in: ids } }, include: { contract: { select: { startAt: true, endAt: true, actualEndAt: true } } } }),
      tx.payment.findMany({
        where: {
          direction: 'IN', status: 'CONFIRMED', paidAt: { gte: from, lt: to },
          receivable: { kind: { in: [...REVENUE_KINDS] }, OR: [{ vehicleUnitId: { in: ids } }, { contract: { vehicles: { some: { vehicleUnitId: { in: ids } } } } }] },
        },
        include: { receivable: { select: { contractId: true, vehicleUnitId: true, competence: true } } },
      }),
      tx.payable.findMany({ where: { vehicleUnitId: { in: ids }, status: { not: 'CANCELLED' }, dueDate: { gte: from, lt: to }, kind: { notIn: ['VEHICLE_ACQUISITION', 'FUEL'] } } }),
      tx.inventoryMovement.findMany({ where: { vehicleUnitId: { in: ids }, at: { gte: from, lt: to } } }),
      tx.tireEvent.findMany({ where: { vehicleUnitId: { in: ids }, at: { gte: from, lt: to }, cost: { not: null } } }),
      tx.refuelRecord.findMany({ where: { vehicleUnitId: { in: ids }, at: { gte: from, lt: to }, paidByCompany: true } }),
      tx.vehicleAllocation.findMany({ where: { vehicleUnitId: { in: ids }, kind: { in: ['MAINTENANCE', 'BLOCK'] }, startsAt: { lt: to }, endsAt: { gt: from } } }),
      tx.odometerReading.findMany({ where: { vehicleUnitId: { in: ids }, at: { gte: from, lt: to } }, orderBy: { at: 'asc' } }),
      tx.vehicleSale.findMany({ where: { vehicleUnitId: { in: ids }, status: 'SOLD' } }),
    ]);

    // Receita rateada por veículo, em centavos.
    const revenue = new Map<string, number>();
    const add = (map: Map<string, number>, key: string, cents: number) => map.set(key, (map.get(key) ?? 0) + cents);
    const byContract = new Map<string, typeof intervals>();
    for (const i of intervals) {
      const list = byContract.get(i.contractId) ?? [];
      list.push(i);
      byContract.set(i.contractId, list);
    }
    for (const p of payments) {
      const cents = toCents(num(p.amount));
      const r = p.receivable!;
      if (r.vehicleUnitId && !r.contractId) {
        add(revenue, r.vehicleUnitId, cents);
        continue;
      }
      const links = r.contractId ? byContract.get(r.contractId) ?? [] : [];
      if (!links.length) {
        if (r.vehicleUnitId) add(revenue, r.vehicleUnitId, cents);
        continue;
      }
      const c = links[0]!.contract;
      const [wStart, wEnd] = r.competence ? competenceWindow(r.competence) : [c.startAt, c.actualEndAt ?? c.endAt];
      const shares = links.map((l) => ({ id: l.vehicleUnitId, days: overlapDays(l.startAt, l.endAt ?? new Date(8.64e15), wStart, wEnd) }));
      const total = shares.reduce((a, s) => a + s.days, 0);
      if (total <= 0) {
        add(revenue, links[links.length - 1]!.vehicleUnitId, cents);
        continue;
      }
      let assigned = 0;
      shares.forEach((s, idx) => {
        const part = idx === shares.length - 1 ? cents - assigned : Math.round((cents * s.days) / total);
        assigned += part;
        add(revenue, s.id, part);
      });
    }

    const result: VehicleProfitability[] = [];
    for (const v of vehicles) {
      const start = new Date(Math.max(from.getTime(), (v.acquiredAt ?? v.createdAt).getTime()));
      const end = new Date(Math.min(to.getTime(), (v.soldAt ?? to).getTime(), Date.now()));
      const daysInFleet = Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY));
      const daysRented = Math.round(intervals.filter((i) => i.vehicleUnitId === v.id)
        .reduce((a, i) => a + overlapDays(i.startAt, i.endAt ?? new Date(), start, end), 0));
      const daysUnavailable = Math.round(allocations.filter((a) => a.vehicleUnitId === v.id)
        .reduce((a, x) => a + overlapDays(x.startsAt, x.endsAt, start, end), 0));

      const breakdown = { maintenance: 0, parts: 0, tires: 0, insurance: 0, taxes: 0, documentation: 0, fuel: 0, other: 0 };
      for (const p of payables.filter((x) => x.vehicleUnitId === v.id)) {
        const cents = toCents(num(p.amount));
        if (p.kind === 'MAINTENANCE') breakdown.maintenance += cents;
        else if (p.kind === 'PARTS') breakdown.parts += cents;
        else if (p.kind === 'INSURANCE') breakdown.insurance += cents;
        else if (p.kind === 'TAX') breakdown.taxes += cents;
        else if (p.kind === 'DOCUMENTATION') breakdown.documentation += cents;
        else breakdown.other += cents;
      }
      for (const m of movements.filter((x) => x.vehicleUnitId === v.id)) {
        // Saída para a placa soma; devolução de material à prateleira abate.
        const cents = Math.abs(toCents(num(m.totalCost)));
        if (num(m.quantity) < 0) breakdown.parts += cents;
        else if (m.type === 'RETURN_IN') breakdown.parts -= cents;
      }
      breakdown.tires += tireEvents.filter((t) => t.vehicleUnitId === v.id).reduce((a, t) => a + toCents(num(t.cost)), 0);
      breakdown.fuel += refuels.filter((r) => r.vehicleUnitId === v.id).reduce((a, r) => a + toCents(num(r.total)), 0);

      const vReadings = readings.filter((r) => r.vehicleUnitId === v.id).map((r) => r.km);
      let kmDriven: number | null = null;
      if (vReadings.length >= 2) kmDriven = Math.max(...vReadings) - Math.min(...vReadings);
      else if (v.initialOdometerKm !== null && v.acquiredAt && v.acquiredAt >= from) kmDriven = v.odometerKm - v.initialOdometerKm;

      const sale = sales.find((s) => s.vehicleUnitId === v.id && s.soldAt && s.soldAt >= from && s.soldAt < to);
      const computed = computeProfitability({
        revenue: fromCents(revenue.get(v.id) ?? 0),
        discounts: 0,
        maintenanceCost: fromCents(breakdown.maintenance),
        partsCost: fromCents(breakdown.parts),
        tireCost: fromCents(breakdown.tires),
        insuranceCost: fromCents(breakdown.insurance),
        taxCost: fromCents(breakdown.taxes),
        documentationCost: fromCents(breakdown.documentation),
        otherDirectCosts: fromCents(breakdown.other),
        fuelCost: fromCents(breakdown.fuel),
        acquisitionValue: numOrNull(v.acquisitionValue),
        saleValue: sale ? numOrNull(sale.salePrice) : null,
        annualDepreciationPercent: depreciation,
        daysInFleet,
        daysRented,
        daysUnavailable,
        kmDriven,
      });
      const missing = [...computed.missing];
      if (!v.acquiredAt) missing.push('Data de aquisição');
      result.push({
        ...computed,
        missing: [...new Set(missing)],
        vehicleUnitId: v.id,
        plate: v.plate,
        model: `${v.model.make.name} ${v.model.name}`,
        branchId: v.branchId,
        commercialStatus: v.commercialStatus,
        daysInFleet,
        daysRented,
        daysUnavailable,
        kmDriven,
        breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, c]) => [k, fromCents(c)])) as VehicleProfitability['breakdown'],
      });
    }
    return result;
  }

  async list(ctx: OrgContext, query: { from?: string; to?: string; branchId?: string }) {
    const period = this.resolve(ctx, query);
    const rows = await this.prisma.tenant(ctx, (tx) => this.compute(tx, ctx.organizationId, period));
    rows.sort((a, b) => b.operatingResult - a.operatingResult);
    const totals = rows.reduce((acc, r) => ({ revenue: acc.revenue + toCents(r.revenue), costs: acc.costs + toCents(r.costs) }), { revenue: 0, costs: 0 });
    return {
      from: period.from.toISOString(), to: period.to.toISOString(),
      totals: { revenue: fromCents(totals.revenue), costs: fromCents(totals.costs), operatingResult: fromCents(totals.revenue - totals.costs) },
      vehicles: rows,
      incomplete: rows.filter((r) => r.missing.length).length,
    };
  }

  async vehicle(ctx: OrgContext, vehicleId: string, query: { from?: string; to?: string }) {
    const period = this.resolve(ctx, query);
    const rows = await this.prisma.tenant(ctx, (tx) => this.compute(tx, ctx.organizationId, { ...period, vehicleId }));
    const row = rows[0];
    if (!row) throw new NotFoundException('Veículo não encontrado.');
    return { from: period.from.toISOString(), to: period.to.toISOString(), ...row };
  }
}

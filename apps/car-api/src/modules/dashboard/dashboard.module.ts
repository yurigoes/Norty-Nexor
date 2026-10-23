import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { depositBalance, fromCents, maintenanceDue, toCents, type CommercialStatus, type OperationalStatus } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { num } from '../../common/serialize.interceptor';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { ProfitabilityService } from '../profitability/profitability.service';
import { todayStart } from '../notifications/alert-jobs';

const DAY = 86_400_000;

class DashboardQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

/**
 * Painel com números reais. Cada bloco só é calculado (e devolvido) se o
 * usuário tiver a permissão correspondente — o painel do mecânico não
 * carrega o financeiro, nem por baixo dos panos.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly profitability: ProfitabilityService) {}

  async build(ctx: OrgContext, query: DashboardQueryDto) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (to <= from) throw new BadRequestException('Período inválido.');
    if (query.branchId && !ctx.allBranches && !ctx.branchIds.includes(query.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
    const branchIds = query.branchId ? [query.branchId] : ctx.allBranches ? null : ctx.branchIds;
    const branch = branchIds ? { branchId: { in: branchIds } } : {};
    const can = (p: string) => ctx.permissions.has(p);

    return this.prisma.tenant(ctx, async (tx) => {
      const out: Record<string, unknown> = { period: { from: from.toISOString(), to: to.toISOString() }, branchId: query.branchId ?? null };
      if (can('fleet.view')) out.fleet = await this.fleet(tx, branch, from, to);
      if (can('contracts.view') || can('reservations.view')) out.rentals = await this.rentals(tx, branch, now, can);
      if (can('finance.view')) out.finance = await this.finance(tx, branch, from, to, now);
      if (can('deposits.view')) out.deposits = await this.deposits(tx, branchIds);
      if (can('infractions.view')) out.infractions = await this.infractions(tx, branchIds, now);
      if (can('maintenance.view')) out.maintenance = await this.maintenance(tx, branch, now);
      if (can('inventory.view')) out.inventory = await this.inventory(tx);
      if (can('reports.financial') && can('fleet.view')) {
        const rows = await this.profitability.compute(tx, ctx.organizationId, { from, to, branchIds });
        const brief = (r: (typeof rows)[number]) => ({ vehicleUnitId: r.vehicleUnitId, plate: r.plate, model: r.model, revenue: r.revenue, costs: r.costs, operatingResult: r.operatingResult, margin: r.margin });
        out.vehicles = {
          mostProfitable: [...rows].filter((r) => r.revenue > 0).sort((a, b) => b.operatingResult - a.operatingResult).slice(0, 5).map(brief),
          highestCost: [...rows].filter((r) => r.costs > 0).sort((a, b) => b.costs - a.costs).slice(0, 5).map(brief),
        };
      }
      return out;
    });
  }

  private async fleet(tx: Tx, branch: Record<string, unknown>, from: Date, to: Date) {
    const units = await tx.vehicleUnit.findMany({ where: { ...branch, deletedAt: null }, select: { id: true, commercialStatus: true, operationalStatus: true, acquiredAt: true, createdAt: true, soldAt: true } });
    const active = units.filter((u) => u.commercialStatus !== 'SOLD');
    const byCommercial = Object.fromEntries((['AVAILABLE', 'RESERVED', 'RENTED', 'FOR_SALE', 'SOLD'] as CommercialStatus[]).map((s) => [s, units.filter((u) => u.commercialStatus === s).length]));
    const byOperational = Object.fromEntries((['RELEASED', 'IN_INSPECTION', 'IN_MAINTENANCE', 'BLOCKED', 'AWAITING_RELEASE'] as OperationalStatus[]).map((s) => [s, active.filter((u) => u.operationalStatus === s).length]));
    // Ocupação: dias em contrato ÷ dias em que cada carro esteve na frota no período.
    const end = new Date(Math.min(to.getTime(), Date.now()));
    let available = 0;
    for (const u of units) {
      const s = Math.max(from.getTime(), (u.acquiredAt ?? u.createdAt).getTime());
      const e = Math.min(end.getTime(), (u.soldAt ?? end).getTime());
      if (e > s) available += (e - s) / DAY;
    }
    const intervals = await tx.contractVehicle.findMany({
      where: { vehicleUnitId: { in: units.map((u) => u.id) }, startAt: { lt: end }, OR: [{ endAt: null }, { endAt: { gt: from } }] },
      select: { startAt: true, endAt: true },
    });
    const rented = intervals.reduce((a, i) => {
      const s = Math.max(from.getTime(), i.startAt.getTime());
      const e = Math.min(end.getTime(), (i.endAt ?? end).getTime());
      return a + (e > s ? (e - s) / DAY : 0);
    }, 0);
    return {
      total: active.length, byCommercial, byOperational,
      occupancyRate: available > 0 ? Math.round((rented / available) * 10_000) / 100 : null,
    };
  }

  private async rentals(tx: Tx, branch: Record<string, unknown>, now: Date, can: (p: string) => boolean) {
    const start = todayStart(now);
    const end = new Date(start.getTime() + DAY);
    const in30 = new Date(now.getTime() + 30 * DAY);
    const out: Record<string, unknown> = {};
    if (can('contracts.view')) {
      const [active, expiring, deliveries, returns, overdueReturns] = await Promise.all([
        tx.rentalContract.count({ where: { ...branch, status: 'ACTIVE' } }),
        tx.rentalContract.findMany({ where: { ...branch, status: 'ACTIVE', endAt: { gte: now, lte: in30 } }, include: { customer: { select: { name: true } } }, orderBy: { endAt: 'asc' }, take: 8 }),
        tx.rentalContract.findMany({ where: { ...branch, status: 'APPROVED', startAt: { lt: end } }, include: { customer: { select: { name: true } } }, orderBy: { startAt: 'asc' }, take: 10 }),
        tx.rentalContract.findMany({ where: { ...branch, status: 'ACTIVE', endAt: { gte: start, lt: end } }, include: { customer: { select: { name: true } } }, orderBy: { endAt: 'asc' }, take: 10 }),
        tx.rentalContract.count({ where: { ...branch, status: 'ACTIVE', endAt: { lt: start } } }),
      ]);
      const expiringCount = await tx.rentalContract.count({ where: { ...branch, status: 'ACTIVE', endAt: { gte: now, lte: in30 } } });
      const brief = (c: { id: string; number: string; startAt: Date; endAt: Date; customer: { name: string } }) => ({ id: c.id, number: c.number, customer: c.customer.name, startAt: c.startAt, endAt: c.endAt });
      Object.assign(out, {
        activeContracts: active, expiringContracts: expiringCount, overdueReturns,
        expiring: expiring.map(brief), deliveriesToday: deliveries.map(brief), returnsToday: returns.map(brief),
      });
    }
    if (can('reservations.view')) {
      const [future, pickups] = await Promise.all([
        tx.reservation.count({ where: { ...branch, status: { in: ['REQUESTED', 'CONFIRMED'] }, startAt: { gte: now } } }),
        tx.reservation.findMany({ where: { ...branch, status: 'CONFIRMED', startAt: { lt: end } }, include: { customer: { select: { name: true } } }, orderBy: { startAt: 'asc' }, take: 10 }),
      ]);
      Object.assign(out, {
        futureReservations: future,
        pickupsToday: pickups.map((r) => ({ id: r.id, code: r.code, customer: r.customer.name, startAt: r.startAt })),
      });
    }
    return out;
  }

  private async finance(tx: Tx, branch: Record<string, unknown>, from: Date, to: Date, now: Date) {
    const revenueKinds = { kind: { in: ['RENTAL', 'MONTHLY', 'EXTRA'] as ('RENTAL' | 'MONTHLY' | 'EXTRA')[] } };
    const today = todayStart(now);
    const [periodTitles, payments, overdue, dueUntilToday, payablesOpen] = await Promise.all([
      tx.receivable.findMany({ where: { ...branch, ...revenueKinds, status: { not: 'CANCELLED' }, dueDate: { gte: from, lt: to } }, select: { amount: true, paidAmount: true } }),
      tx.payment.findMany({ where: { direction: 'IN', status: 'CONFIRMED', paidAt: { gte: from, lt: to }, receivable: { ...branch } }, select: { amount: true } }),
      tx.receivable.findMany({ where: { ...branch, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: today } }, select: { amount: true, paidAmount: true } }),
      tx.receivable.findMany({ where: { ...branch, status: { not: 'CANCELLED' }, dueDate: { lt: today } }, select: { amount: true } }),
      tx.payable.findMany({ where: { ...branch, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { gte: from, lt: to } }, select: { amount: true, paidAmount: true } }),
    ]);
    const sum = (list: { amount: Prisma.Decimal }[]) => list.reduce((a, r) => a + toCents(num(r.amount)), 0);
    const balance = (list: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal }[]) => list.reduce((a, r) => a + toCents(num(r.amount)) - toCents(num(r.paidAmount)), 0);
    const overdueCents = balance(overdue);
    const dueCents = sum(dueUntilToday);

    // Série dos últimos 6 meses: previsto (vencimentos) × recebido (pagamentos).
    const months: { month: string; forecast: number; received: number }[] = [];
    const base = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    const seriesStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 5, 1));
    const seriesEnd = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
    const [titles6, payments6] = await Promise.all([
      tx.receivable.findMany({ where: { ...branch, ...revenueKinds, status: { not: 'CANCELLED' }, dueDate: { gte: seriesStart, lt: seriesEnd } }, select: { amount: true, dueDate: true } }),
      tx.payment.findMany({ where: { direction: 'IN', status: 'CONFIRMED', paidAt: { gte: seriesStart, lt: seriesEnd }, receivable: { ...branch } }, select: { amount: true, paidAt: true } }),
    ]);
    for (let i = 0; i < 6; i += 1) {
      const m = new Date(Date.UTC(seriesStart.getUTCFullYear(), seriesStart.getUTCMonth() + i, 1));
      const key = m.toISOString().slice(0, 7);
      months.push({
        month: key,
        forecast: fromCents(titles6.filter((t) => t.dueDate.toISOString().startsWith(key)).reduce((a, t) => a + toCents(num(t.amount)), 0)),
        received: fromCents(payments6.filter((p) => p.paidAt.toISOString().startsWith(key)).reduce((a, p) => a + toCents(num(p.amount)), 0)),
      });
    }
    const revenue = sum(periodTitles);
    const received = sum(payments);
    const pending = balance(periodTitles);
    return {
      revenue: fromCents(revenue),
      received: fromCents(received),
      pending: fromCents(pending),
      overdue: fromCents(overdueCents),
      delinquencyRate: dueCents > 0 ? Math.round((overdueCents / dueCents) * 10_000) / 100 : null,
      // Taxa de recebimento: parcela já quitada dos títulos que vencem no período.
      collectionRate: revenue > 0 ? Math.round(((revenue - pending) / revenue) * 10_000) / 100 : null,
      payablesOpen: fromCents(balance(payablesOpen)),
      series: months,
    };
  }

  private async deposits(tx: Tx, branchIds: string[] | null) {
    const list = await tx.securityDeposit.findMany({
      where: { status: { notIn: ['REFUNDED', 'CLOSED'] }, ...(branchIds ? { contract: { branchId: { in: branchIds } } } : {}) },
      include: { entries: true, contract: { select: { status: true } } },
    });
    let held = 0;
    let pendingRefund = 0;
    let pendingRefundCount = 0;
    for (const d of list) {
      const b = depositBalance(d.entries.map((e) => ({ type: e.type, amount: num(e.amount), status: e.status })));
      held += toCents(b.available);
      if (['CLOSED', 'TERMINATED'].includes(d.contract.status) && b.available > 0) {
        pendingRefund += toCents(b.available);
        pendingRefundCount += 1;
      }
    }
    return { held: fromCents(held), pendingRefund: fromCents(pendingRefund), pendingRefundCount };
  }

  private async infractions(tx: Tx, branchIds: string[] | null, now: Date) {
    const in30 = new Date(now.getTime() + 30 * DAY);
    const where: Prisma.TrafficInfractionWhereInput = {
      financialStatus: { in: ['PENDING', 'BILLING'] }, adminStatus: { notIn: ['CANCELLED', 'FINISHED', 'GRANTED'] },
      dueDate: { lte: in30 }, ...(branchIds ? { vehicle: { branchId: { in: branchIds } } } : {}),
    };
    const list = await tx.trafficInfraction.findMany({ where, select: { finalAmount: true } });
    const awaitingDriver = await tx.trafficInfraction.count({
      where: { adminStatus: { in: ['RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID'] }, driverIndicationDeadline: { lte: in30 }, ...(branchIds ? { vehicle: { branchId: { in: branchIds } } } : {}) },
    });
    return { dueSoon: list.length, dueSoonAmount: fromCents(list.reduce((a, i) => a + toCents(num(i.finalAmount)), 0)), awaitingDriver };
  }

  private async maintenance(tx: Tx, branch: Record<string, unknown>, now: Date) {
    const [openOrders, lateOrders, plans] = await Promise.all([
      tx.workOrder.count({ where: { ...branch, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      tx.workOrder.count({ where: { ...branch, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueAt: { lt: now } } }),
      tx.maintenancePlan.findMany({
        where: { active: true, vehicle: { ...branch, deletedAt: null, commercialStatus: { not: 'SOLD' } } },
        include: { vehicle: { select: { id: true, plate: true, odometerKm: true } } },
      }),
    ]);
    const due = plans.map((p) => ({
      p, d: maintenanceDue({ intervalKm: p.intervalKm, intervalDays: p.intervalDays, lastDoneKm: p.lastDoneKm, lastDoneAt: p.lastDoneAt, currentKm: p.vehicle.odometerKm, alertKmBefore: p.alertKmBefore, alertDaysBefore: p.alertDaysBefore, now }),
    })).filter((x) => x.d.state === 'DUE_SOON' || x.d.state === 'OVERDUE');
    return {
      openOrders, lateOrders, dueSoon: due.filter((x) => x.d.state === 'DUE_SOON').length, overdue: due.filter((x) => x.d.state === 'OVERDUE').length,
      upcoming: due.slice(0, 8).map((x) => ({ planId: x.p.id, name: x.p.name, vehicleUnitId: x.p.vehicle.id, plate: x.p.vehicle.plate, state: x.d.state, kmRemaining: x.d.kmRemaining, daysRemaining: x.d.daysRemaining })),
    };
  }

  private async inventory(tx: Tx) {
    const products = await tx.inventoryProduct.findMany({ where: { active: true, minStock: { gt: 0 } }, include: { balances: true } });
    const critical = products
      .map((p) => ({ id: p.id, sku: p.sku, description: p.description, unit: p.unit, minStock: num(p.minStock), balance: p.balances.reduce((a, b) => a + num(b.quantity), 0) }))
      .filter((p) => p.balance < p.minStock);
    return { critical: critical.length, items: critical.slice(0, 8) };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('dashboard.view')
  @Get()
  get(@OrgCtx() ctx: OrgContext, @Query() query: DashboardQueryDto) {
    return this.dashboard.build(ctx, query);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService], exports: [DashboardService] })
export class DashboardModule {}

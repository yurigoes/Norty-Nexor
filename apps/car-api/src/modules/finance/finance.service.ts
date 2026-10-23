import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  centsToDecimalString, depositBalance, fromCents, isoDateInZone, lateCharges, toCents, type DepositEntryType, type ApprovalStatus,
} from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { assertApprovalLimit, assertBranch, branchWhere, type OrgContext } from '../../common/context';
import { num } from '../../common/serialize.interceptor';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import { orgSettings } from '../../common/org-settings';
import { LedgerService } from './ledger.service';
import type {
  CostCenterDto, CreatePayableDto, CreateReceivableDto, PaymentDto, PaymentQueryDto, PeriodQueryDto, TitleQueryDto, UpdateCostCenterDto,
} from './dto';

const TZ = 'America/Sao_Paulo';
const today = () => new Date(`${isoDateInZone(new Date(), TZ)}T00:00:00.000Z`);

/** Período padrão: mês corrente. Datas de vencimento são `date` (meia-noite UTC). */
function period(q: { from?: string; to?: string }): { from: Date; to: Date } {
  const now = isoDateInZone(new Date(), TZ);
  const from = q.from ? new Date(`${q.from.slice(0, 10)}T00:00:00.000Z`) : new Date(`${now.slice(0, 7)}-01T00:00:00.000Z`);
  const to = q.to ? new Date(`${q.to.slice(0, 10)}T00:00:00.000Z`) : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  if (to < from) throw new BadRequestException('O fim do período precisa ser posterior ao início.');
  if (to.getTime() - from.getTime() > 3 * 366 * 86_400_000) throw new BadRequestException('Período máximo: 3 anos.');
  return { from, to };
}
const endOfDay = (d: Date) => new Date(d.getTime() + 86_400_000 - 1);

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  /* ================= Contas a receber ================= */

  async receivables(ctx: OrgContext, q: TitleQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = this.titleWhere(ctx, q) as Prisma.ReceivableWhereInput;
    if (q.customerId) where.customerId = q.customerId;
    if (q.contractId) where.contractId = q.contractId;
    if (q.kind) where.kind = q.kind as never;
    if (q.q) {
      where.OR = [
        { description: { contains: q.q, mode: 'insensitive' } },
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
        { contract: { number: { contains: q.q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.tenant(ctx, async (tx) => {
      const settings = orgSettings((await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }))?.settings);
      const [rows, total, sums] = await Promise.all([
        tx.receivable.findMany({
          where, skip, take,
          orderBy: orderBy(q, ['dueDate', 'amount', 'createdAt', 'status'], { dueDate: 'asc' }),
          include: {
            customer: { select: { id: true, name: true } },
            contract: { select: { id: true, number: true, lateFeePercent: true, monthlyInterestPercent: true } },
            costCenter: { select: { id: true, name: true } },
          },
        }),
        tx.receivable.count({ where }),
        tx.receivable.aggregate({ where, _sum: { amount: true, paidAmount: true } }),
      ]);
      const items = rows.map((r) => this.withCharges(r, settings.lateFeePercent, settings.monthlyInterestPercent));
      return { ...paginated(items, total, page, pageSize), totals: { amount: num(sums._sum.amount), paid: num(sums._sum.paidAmount) } };
    });
  }

  async receivable(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await tx.receivable.findFirst({
        where: { id, ...branchWhere(ctx) },
        include: {
          customer: { select: { id: true, name: true } },
          contract: { select: { id: true, number: true, lateFeePercent: true, monthlyInterestPercent: true } },
          costCenter: { select: { id: true, name: true } },
          payments: { orderBy: { paidAt: 'desc' } },
        },
      });
      if (!r) throw new NotFoundException('Título não encontrado.');
      const settings = orgSettings((await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }))?.settings);
      return this.withCharges(r, settings.lateFeePercent, settings.monthlyInterestPercent);
    });
  }

  async createReceivable(ctx: OrgContext, dto: CreateReceivableDto) {
    assertBranch(ctx, dto.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertRefs(tx, { customerId: dto.customerId, contractId: dto.contractId, vehicleUnitId: dto.vehicleUnitId, costCenterId: dto.costCenterId, branchId: dto.branchId });
      const r = await tx.receivable.create({
        data: {
          organizationId: ctx.organizationId, branchId: dto.branchId, customerId: dto.customerId ?? null, contractId: dto.contractId ?? null,
          vehicleUnitId: dto.vehicleUnitId ?? null, kind: dto.kind, description: dto.description,
          amount: centsToDecimalString(toCents(dto.amount)), dueDate: new Date(`${dto.dueDate.slice(0, 10)}T00:00:00.000Z`),
          costCenterId: dto.costCenterId ?? null, createdById: ctx.userId,
        },
      });
      await this.audit.record(tx, ctx, { action: 'finance.receivable_created', entityType: 'Receivable', entityId: r.id, branchId: r.branchId, after: dto });
      return r;
    });
  }

  /** Título só é cancelado sem pagamento confirmado: com pagamento, estorne antes. */
  async cancelReceivable(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await tx.receivable.findFirst({ where: { id, ...branchWhere(ctx) } });
      if (!r) throw new NotFoundException('Título não encontrado.');
      if (r.status === 'CANCELLED') throw new ConflictException('Título já cancelado.');
      if (num(r.paidAmount) > 0) throw new ConflictException('Há pagamento registrado. Estorne o pagamento antes de cancelar.');
      await tx.receivable.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await this.audit.record(tx, ctx, { action: 'finance.receivable_cancelled', entityType: 'Receivable', entityId: id, branchId: r.branchId, reason, before: { status: r.status, amount: r.amount } });
      return { id };
    });
  }

  /* ================= Contas a pagar ================= */

  async payables(ctx: OrgContext, q: TitleQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = this.titleWhere(ctx, q) as Prisma.PayableWhereInput;
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.vehicleUnitId) where.vehicleUnitId = q.vehicleUnitId;
    if (q.kind) where.kind = q.kind as never;
    if (q.approval) where.approval = q.approval as never;
    if (q.q) {
      where.OR = [
        { description: { contains: q.q, mode: 'insensitive' } },
        { supplier: { name: { contains: q.q, mode: 'insensitive' } } },
        { documentNumber: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.tenant(ctx, async (tx) => {
      const [items, total, sums] = await Promise.all([
        tx.payable.findMany({
          where, skip, take,
          orderBy: orderBy(q, ['dueDate', 'amount', 'createdAt', 'status'], { dueDate: 'asc' }),
          include: { supplier: { select: { id: true, name: true } }, vehicle: { select: { id: true, plate: true } }, costCenter: { select: { id: true, name: true } } },
        }),
        tx.payable.count({ where }),
        tx.payable.aggregate({ where, _sum: { amount: true, paidAmount: true } }),
      ]);
      return { ...paginated(items.map((p) => ({ ...p, balance: fromCents(toCents(num(p.amount)) - toCents(num(p.paidAmount))) })), total, page, pageSize), totals: { amount: num(sums._sum.amount), paid: num(sums._sum.paidAmount) } };
    });
  }

  async payable(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const p = await tx.payable.findFirst({
        where: { id, ...branchWhere(ctx) },
        include: { supplier: { select: { id: true, name: true } }, vehicle: { select: { id: true, plate: true } }, payments: { orderBy: { paidAt: 'desc' } } },
      });
      if (!p) throw new NotFoundException('Conta a pagar não encontrada.');
      return { ...p, balance: fromCents(toCents(num(p.amount)) - toCents(num(p.paidAmount))) };
    });
  }

  async createPayable(ctx: OrgContext, dto: CreatePayableDto) {
    assertBranch(ctx, dto.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertRefs(tx, { supplierId: dto.supplierId, vehicleUnitId: dto.vehicleUnitId, costCenterId: dto.costCenterId, branchId: dto.branchId });
      const p = await tx.payable.create({
        data: {
          organizationId: ctx.organizationId, branchId: dto.branchId, supplierId: dto.supplierId ?? null, kind: dto.kind,
          description: dto.description, amount: centsToDecimalString(toCents(dto.amount)),
          dueDate: new Date(`${dto.dueDate.slice(0, 10)}T00:00:00.000Z`), vehicleUnitId: dto.vehicleUnitId ?? null,
          costCenterId: dto.costCenterId ?? null, documentNumber: dto.documentNumber ?? null, createdById: ctx.userId,
        },
      });
      await this.audit.record(tx, ctx, { action: 'finance.payable_created', entityType: 'Payable', entityId: p.id, branchId: p.branchId, after: dto });
      return p;
    });
  }

  /** Aprovação de despesa: permissão + alçada do usuário. Quem lança não precisa ser quem aprova. */
  async decidePayable(ctx: OrgContext, id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const p = await tx.payable.findFirst({ where: { id, ...branchWhere(ctx) } });
      if (!p) throw new NotFoundException('Conta a pagar não encontrada.');
      if (p.approval !== 'PENDING_APPROVAL') throw new ConflictException('Esta despesa já foi decidida.');
      if (p.status === 'CANCELLED') throw new ConflictException('Despesa cancelada.');
      if (decision === 'APPROVED') assertApprovalLimit(ctx, num(p.amount), 'esta despesa');
      await tx.payable.update({ where: { id }, data: { approval: decision, approvedById: ctx.userId, approvedAt: new Date() } });
      await this.audit.record(tx, ctx, {
        action: decision === 'APPROVED' ? 'finance.payable_approved' : 'finance.payable_rejected', entityType: 'Payable', entityId: id,
        branchId: p.branchId, reason: reason ?? null, before: { approval: p.approval }, after: { approval: decision, amount: p.amount },
      });
      return { id, approval: decision };
    });
  }

  async cancelPayable(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const p = await tx.payable.findFirst({ where: { id, ...branchWhere(ctx) } });
      if (!p) throw new NotFoundException('Conta a pagar não encontrada.');
      if (p.status === 'CANCELLED') throw new ConflictException('Despesa já cancelada.');
      if (num(p.paidAmount) > 0) throw new ConflictException('Há pagamento registrado. Estorne antes de cancelar.');
      await tx.payable.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await this.audit.record(tx, ctx, { action: 'finance.payable_cancelled', entityType: 'Payable', entityId: id, branchId: p.branchId, reason, before: { status: p.status } });
      return { id };
    });
  }

  /* ================= Pagamentos ================= */

  async settle(ctx: OrgContext, target: 'receivable' | 'payable', titleId: string, dto: PaymentDto) {
    await this.prisma.tenant(ctx, async (tx) => {
      // Escopo de filial antes da baixa: o RLS garante a empresa; a filial é conferida aqui.
      const title = target === 'receivable'
        ? await tx.receivable.findFirst({ where: { id: titleId, ...branchWhere(ctx) }, select: { id: true } })
        : await tx.payable.findFirst({ where: { id: titleId, ...branchWhere(ctx) }, select: { id: true } });
      if (!title) throw new NotFoundException('Título não encontrado.');
    });
    const result = await this.prisma.tenant(ctx, (tx) => this.ledger.applyPayment(tx, ctx, ctx.organizationId, {
      target, titleId, amount: dto.amount, method: dto.method, paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      idempotencyKey: dto.idempotencyKey, bankReference: dto.bankReference, notes: dto.notes,
    }));
    return { ...result.payment, duplicate: result.duplicate };
  }

  async payments(ctx: OrgContext, q: PaymentQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const scope = branchWhere(ctx);
    const where: Prisma.PaymentWhereInput = {
      ...(q.direction ? { direction: q.direction } : {}),
      ...(q.reconciled !== undefined ? { reconciled: q.reconciled } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.method ? { method: q.method as never } : {}),
      ...(q.from || q.to ? { paidAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: endOfDay(new Date(q.to)) } : {}) } } : {}),
      ...(Object.keys(scope).length ? { OR: [{ receivable: scope }, { payable: scope }] } : {}),
    };
    if (q.q) {
      where.AND = [{ OR: [
        { bankReference: { contains: q.q, mode: 'insensitive' } },
        { receivable: { description: { contains: q.q, mode: 'insensitive' } } },
        { payable: { description: { contains: q.q, mode: 'insensitive' } } },
      ] }];
    }
    return this.prisma.tenant(ctx, async (tx) => {
      const [items, total] = await Promise.all([
        tx.payment.findMany({
          where, skip, take, orderBy: orderBy(q, ['paidAt', 'amount'], { paidAt: 'desc' }),
          include: {
            receivable: { select: { id: true, description: true, kind: true, customer: { select: { name: true } } } },
            payable: { select: { id: true, description: true, kind: true, supplier: { select: { name: true } } } },
          },
        }),
        tx.payment.count({ where }),
      ]);
      return paginated(items, total, page, pageSize);
    });
  }

  async reversePayment(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id }, include: { receivable: true, payable: true } });
      if (!payment) throw new NotFoundException('Pagamento não encontrado.');
      if (payment.method === 'DEPOSIT_OFFSET') throw new ConflictException('Compensação de caução se desfaz pelo módulo de cauções.');
      const branchId = payment.receivable?.branchId ?? payment.payable?.branchId;
      if (!ctx.allBranches && branchId && !ctx.branchIds.includes(branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
      await this.ledger.reverse(tx, ctx, id, reason);
      return { id, status: 'REVERSED' };
    });
  }

  async reconcile(ctx: OrgContext, id: string, reconciled: boolean, bankReference?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException('Pagamento não encontrado.');
      if (payment.status !== 'CONFIRMED' && reconciled) throw new ConflictException('Só pagamento confirmado pode ser conciliado.');
      const updated = await tx.payment.update({
        where: { id },
        data: reconciled
          ? { reconciled: true, reconciledAt: new Date(), reconciledById: ctx.userId, bankReference: bankReference ?? payment.bankReference }
          : { reconciled: false, reconciledAt: null, reconciledById: null },
      });
      await this.audit.record(tx, ctx, {
        action: reconciled ? 'finance.payment_reconciled' : 'finance.payment_unreconciled', entityType: 'Payment', entityId: id,
        before: { reconciled: payment.reconciled, bankReference: payment.bankReference }, after: { reconciled, bankReference: updated.bankReference },
      });
      return updated;
    });
  }

  /* ================= Centros de custo ================= */

  costCenters(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.costCenter.findMany({ orderBy: { code: 'asc' } }));
  }

  createCostCenter(ctx: OrgContext, dto: CostCenterDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await tx.costCenter.create({ data: { ...dto, organizationId: ctx.organizationId } });
      await this.audit.record(tx, ctx, { action: 'finance.cost_center_created', entityType: 'CostCenter', entityId: c.id, after: dto });
      return c;
    });
  }

  updateCostCenter(ctx: OrgContext, id: string, dto: UpdateCostCenterDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.costCenter.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Centro de custo não encontrado.');
      const c = await tx.costCenter.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'finance.cost_center_updated', entityType: 'CostCenter', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return c;
    });
  }

  /* ================= Indicadores ================= */

  /**
   * Resumo do período. Os números são separados de propósito:
   * previsto (vencimentos), recebido (pagamentos confirmados), conciliado
   * (conferido com o extrato), pendente (a vencer) e vencido. Caução tem
   * bloco próprio e nunca entra em receita.
   */
  async summary(ctx: OrgContext, q: PeriodQueryDto) {
    const { from, to } = period(q);
    const scope = this.scope(ctx, q.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      const now = today();
      const dueInPeriod = { ...scope, dueDate: { gte: from, lte: to }, status: { not: 'CANCELLED' as const } };
      const [expected, overdueRows, upcoming, receivedIn, receivedRec, paidOut, payablesOpen, dueUntilToday] = await Promise.all([
        tx.receivable.aggregate({ where: dueInPeriod, _sum: { amount: true, paidAmount: true } }),
        tx.receivable.aggregate({ where: { ...scope, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: now } }, _sum: { amount: true, paidAmount: true }, _count: true }),
        tx.receivable.aggregate({ where: { ...scope, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { gte: now, lte: to } }, _sum: { amount: true, paidAmount: true } }),
        tx.payment.aggregate({ where: { direction: 'IN', status: 'CONFIRMED', paidAt: { gte: from, lte: endOfDay(to) }, receivable: scope }, _sum: { amount: true } }),
        tx.payment.aggregate({ where: { direction: 'IN', status: 'CONFIRMED', reconciled: true, paidAt: { gte: from, lte: endOfDay(to) }, receivable: scope }, _sum: { amount: true } }),
        tx.payment.aggregate({ where: { direction: 'OUT', status: 'CONFIRMED', paidAt: { gte: from, lte: endOfDay(to) }, payable: scope }, _sum: { amount: true } }),
        tx.payable.aggregate({ where: { ...scope, status: { in: ['OPEN', 'PARTIAL'] } }, _sum: { amount: true, paidAmount: true }, _count: true }),
        tx.receivable.aggregate({ where: { ...scope, status: { not: 'CANCELLED' }, dueDate: { lt: now } }, _sum: { amount: true } }),
      ]);
      const overdue = num(overdueRows._sum.amount) - num(overdueRows._sum.paidAmount);
      const expectedAmount = num(expected._sum.amount);
      const deposits = await this.depositTotals(tx, ctx, q.branchId);
      const overdueCustomers = await tx.receivable.groupBy({
        by: ['customerId'], where: { ...scope, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: now }, customerId: { not: null } },
      });
      return {
        period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
        revenue: {
          expected: expectedAmount,
          paidOfExpected: num(expected._sum.paidAmount),
          received: num(receivedIn._sum.amount),
          reconciled: num(receivedRec._sum.amount),
          pending: num(upcoming._sum.amount) - num(upcoming._sum.paidAmount),
          overdue: fromCents(toCents(overdue)),
          overdueCount: overdueRows._count,
          overdueCustomers: overdueCustomers.length,
          collectionRate: expectedAmount > 0 ? Math.round((num(expected._sum.paidAmount) / expectedAmount) * 10_000) / 100 : null,
          delinquencyRate: num(dueUntilToday._sum.amount) > 0 ? Math.round((overdue / num(dueUntilToday._sum.amount)) * 10_000) / 100 : null,
        },
        expenses: {
          paid: num(paidOut._sum.amount),
          open: num(payablesOpen._sum.amount) - num(payablesOpen._sum.paidAmount),
          openCount: payablesOpen._count,
        },
        deposits,
      };
    });
  }

  /** Fluxo de caixa: previsto × realizado, por dia ou por mês. */
  async cashflow(ctx: OrgContext, q: PeriodQueryDto) {
    const { from, to } = period(q);
    const groupBy = q.groupBy ?? ((to.getTime() - from.getTime()) / 86_400_000 > 62 ? 'month' : 'day');
    const scope = this.scope(ctx, q.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      const [recs, pays, ins, outs] = await Promise.all([
        tx.receivable.findMany({ where: { ...scope, status: { not: 'CANCELLED' }, dueDate: { gte: from, lte: to } }, select: { dueDate: true, amount: true } }),
        tx.payable.findMany({ where: { ...scope, status: { not: 'CANCELLED' }, approval: { not: 'REJECTED' }, dueDate: { gte: from, lte: to } }, select: { dueDate: true, amount: true } }),
        tx.payment.findMany({ where: { direction: 'IN', status: 'CONFIRMED', paidAt: { gte: from, lte: endOfDay(to) }, receivable: scope }, select: { paidAt: true, amount: true } }),
        tx.payment.findMany({ where: { direction: 'OUT', status: 'CONFIRMED', paidAt: { gte: from, lte: endOfDay(to) }, payable: scope }, select: { paidAt: true, amount: true } }),
      ]);
      const buckets = new Map<string, { key: string; expectedIn: number; expectedOut: number; realizedIn: number; realizedOut: number }>();
      const keyOf = (iso: string) => (groupBy === 'month' ? iso.slice(0, 7) : iso.slice(0, 10));
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
        const k = keyOf(d.toISOString());
        if (!buckets.has(k)) buckets.set(k, { key: k, expectedIn: 0, expectedOut: 0, realizedIn: 0, realizedOut: 0 });
      }
      const add = (k: string, field: 'expectedIn' | 'expectedOut' | 'realizedIn' | 'realizedOut', v: unknown) => {
        const b = buckets.get(k);
        if (b) b[field] = fromCents(toCents(b[field]) + toCents(num(v as never)));
      };
      for (const r of recs) add(keyOf(r.dueDate.toISOString()), 'expectedIn', r.amount);
      for (const p of pays) add(keyOf(p.dueDate.toISOString()), 'expectedOut', p.amount);
      for (const p of ins) add(keyOf(isoDateInZone(p.paidAt, TZ)), 'realizedIn', p.amount);
      for (const p of outs) add(keyOf(isoDateInZone(p.paidAt, TZ)), 'realizedOut', p.amount);
      let balance = 0;
      const series = [...buckets.values()].map((b) => {
        balance = fromCents(toCents(balance) + toCents(b.realizedIn) - toCents(b.realizedOut));
        return { ...b, netRealized: fromCents(toCents(b.realizedIn) - toCents(b.realizedOut)), cumulativeRealized: balance };
      });
      return { groupBy, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), series };
    });
  }

  /* ================= Auxiliares ================= */

  private async depositTotals(tx: Tx, ctx: OrgContext, branchId?: string) {
    const deposits = await tx.securityDeposit.findMany({
      where: { contract: this.scope(ctx, branchId) },
      include: { entries: { select: { type: true, amount: true, status: true } } },
    });
    let held = 0;
    let pendingRefund = 0;
    let pendingReceipt = 0;
    for (const d of deposits) {
      const b = depositBalance(d.entries.map((e) => ({ type: e.type as DepositEntryType, amount: num(e.amount), status: e.status as ApprovalStatus })));
      held += toCents(b.available);
      if (d.status === 'REFUND_PENDING') pendingRefund += toCents(b.available);
      if (d.status === 'PENDING') pendingReceipt += toCents(num(d.expectedAmount)) - toCents(b.received);
    }
    return { held: fromCents(held), pendingRefund: fromCents(pendingRefund), pendingReceipt: fromCents(Math.max(0, pendingReceipt)), count: deposits.length };
  }

  private scope(ctx: OrgContext, branchId?: string): { branchId?: string | { in: string[] } } {
    if (branchId) {
      assertBranch(ctx, branchId);
      return { branchId };
    }
    return branchWhere(ctx) as { branchId?: { in: string[] } };
  }

  private titleWhere(ctx: OrgContext, q: TitleQueryDto): Record<string, unknown> {
    const now = today();
    const where: Record<string, unknown> = { ...this.scope(ctx, q.branchId) };
    if (q.status) where.status = q.status;
    if (q.open) where.status = { in: ['OPEN', 'PARTIAL'] };
    if (q.overdue) {
      where.status = { in: ['OPEN', 'PARTIAL'] };
      where.dueDate = { lt: now };
    }
    if (q.from || q.to) {
      where.dueDate = {
        ...((where.dueDate as object) ?? {}),
        ...(q.from ? { gte: new Date(`${q.from.slice(0, 10)}T00:00:00.000Z`) } : {}),
        ...(q.to ? { lte: new Date(`${q.to.slice(0, 10)}T00:00:00.000Z`) } : {}),
      };
    }
    return where;
  }

  private withCharges<T extends { amount: unknown; paidAmount: unknown; dueDate: Date; status: string; contract?: { lateFeePercent: unknown; monthlyInterestPercent: unknown } | null }>(r: T, defaultFee: number, defaultInterest: number) {
    const balance = fromCents(toCents(num(r.amount as never)) - toCents(num(r.paidAmount as never)));
    const open = r.status === 'OPEN' || r.status === 'PARTIAL';
    const fee = r.contract ? num(r.contract.lateFeePercent as never) : defaultFee;
    const interest = r.contract ? num(r.contract.monthlyInterestPercent as never) : defaultInterest;
    const charges = open ? lateCharges(balance, r.dueDate.toISOString().slice(0, 10), new Date(), fee, interest) : { fine: 0, interest: 0, days: 0 };
    return {
      ...r,
      balance,
      overdue: open && charges.days > 0,
      daysOverdue: charges.days,
      lateFine: charges.fine,
      lateInterest: charges.interest,
      updatedBalance: fromCents(toCents(balance) + toCents(charges.fine) + toCents(charges.interest)),
    };
  }

  private async assertRefs(tx: Tx, refs: { customerId?: string; contractId?: string; vehicleUnitId?: string; costCenterId?: string; supplierId?: string; branchId: string }) {
    if (!(await tx.branch.findUnique({ where: { id: refs.branchId } }))) throw new BadRequestException('Filial inválida.');
    if (refs.customerId && !(await tx.customer.findUnique({ where: { id: refs.customerId } }))) throw new BadRequestException('Cliente inválido.');
    if (refs.contractId && !(await tx.rentalContract.findUnique({ where: { id: refs.contractId } }))) throw new BadRequestException('Contrato inválido.');
    if (refs.vehicleUnitId && !(await tx.vehicleUnit.findUnique({ where: { id: refs.vehicleUnitId } }))) throw new BadRequestException('Veículo inválido.');
    if (refs.costCenterId && !(await tx.costCenter.findUnique({ where: { id: refs.costCenterId } }))) throw new BadRequestException('Centro de custo inválido.');
    if (refs.supplierId && !(await tx.supplier.findUnique({ where: { id: refs.supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
  }
}

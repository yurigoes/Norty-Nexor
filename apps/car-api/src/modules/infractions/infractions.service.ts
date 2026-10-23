import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  INFRACTION_ADMIN_STATUS_LABEL, INFRACTION_FINANCIAL_STATUS_LABEL, centsToDecimalString, fromCents, toCents,
  type InfractionAdminStatus, type InfractionFinancialStatus,
} from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { num } from '../../common/serialize.interceptor';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import type { OrgContext } from '../../common/context';
import type {
  AppealDto, AppealResultDto, ChargeInfractionDto, CreateInfractionDto, IndicateDriverDto, InfractionQueryDto,
  InfractionStatusDto, PayInfractionDto, UpdateInfractionDto,
} from './dto';

/**
 * Transições do status administrativo. "Condutor indicado" só nasce pela
 * indicação explícita (com permissão própria) — nunca por troca de status.
 */
export const ADMIN_TRANSITIONS: Record<InfractionAdminStatus, InfractionAdminStatus[]> = {
  RECEIVED: ['UNDER_REVIEW', 'AWAITING_DRIVER_ID', 'APPEALING', 'CANCELLED', 'FINISHED'],
  UNDER_REVIEW: ['AWAITING_DRIVER_ID', 'APPEALING', 'CANCELLED', 'FINISHED'],
  AWAITING_DRIVER_ID: ['UNDER_REVIEW', 'CANCELLED', 'FINISHED'],
  DRIVER_INDICATED: ['APPEALING', 'FINISHED', 'CANCELLED'],
  APPEALING: ['GRANTED', 'DENIED'],
  GRANTED: ['FINISHED', 'CANCELLED'],
  DENIED: ['APPEALING', 'FINISHED'],
  CANCELLED: [],
  FINISHED: [],
};

/**
 * Transições do status financeiro por troca manual. "Paga pela locadora",
 * "Em cobrança" e "Aguardando reembolso" nascem das ações que geram os
 * títulos — assim nenhum status financeiro existe sem o lançamento.
 */
export const FINANCIAL_TRANSITIONS: Record<InfractionFinancialStatus, InfractionFinancialStatus[]> = {
  PENDING: ['CANCELLED'],
  BILLING: ['REIMBURSED', 'CANCELLED'],
  PAID_BY_COMPANY: ['CANCELLED'],
  AWAITING_REIMBURSEMENT: ['REIMBURSED', 'CANCELLED'],
  REIMBURSED: [],
  CANCELLED: [],
};

const TRACKED: (keyof UpdateInfractionDto)[] = [
  'autoNumber', 'authority', 'infractionCode', 'description', 'occurredAt', 'location', 'notifiedAt',
  'driverIndicationDeadline', 'defenseDeadline', 'originalAmount', 'discountAmount', 'interestAmount', 'dueDate', 'points', 'notes',
];

const DATE_ONLY = new Set(['notifiedAt', 'driverIndicationDeadline', 'defenseDeadline', 'dueDate']);

@Injectable()
export class InfractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
  ) {}

  /** Escopo de filial pela filial do veículo autuado. */
  private scope(ctx: OrgContext): Prisma.TrafficInfractionWhereInput {
    if (ctx.allBranches) return {};
    return { vehicle: { branchId: { in: ctx.branchIds } } };
  }

  async list(ctx: OrgContext, query: InfractionQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const deadline = query.deadlineDays !== undefined ? new Date(Date.now() + query.deadlineDays * 86_400_000) : null;
    const where: Prisma.TrafficInfractionWhereInput = {
      AND: [
        this.scope(ctx),
        query.branchId ? { vehicle: { branchId: query.branchId } } : {},
        query.adminStatus ? { adminStatus: query.adminStatus as InfractionAdminStatus } : {},
        query.financialStatus ? { financialStatus: query.financialStatus as InfractionFinancialStatus } : {},
        query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {},
        query.driverId ? { driverId: query.driverId } : {},
        deadline
          ? {
              adminStatus: { notIn: ['CANCELLED', 'FINISHED'] },
              OR: [
                { driverIndicationDeadline: { lte: deadline } },
                { defenseDeadline: { lte: deadline } },
                { dueDate: { lte: deadline }, financialStatus: { in: ['PENDING', 'BILLING'] } },
              ],
            }
          : {},
        query.q
          ? {
              OR: [
                { autoNumber: { contains: query.q, mode: 'insensitive' } },
                { authority: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { vehicle: { plate: { contains: query.q.toUpperCase().replace(/[^A-Z0-9]/g, '') || query.q } } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.trafficInfraction.findMany({
        where, skip, take,
        orderBy: orderBy(query, ['occurredAt', 'dueDate', 'finalAmount', 'createdAt'], { occurredAt: 'desc' }),
        include: {
          vehicle: { select: { id: true, plate: true, branchId: true } },
          driver: { select: { id: true, name: true } },
          contract: { select: { id: true, number: true } },
        },
      }),
      tx.trafficInfraction.count({ where }),
    ]));
    return paginated(items, total, page, pageSize);
  }

  private async load(tx: Tx, ctx: OrgContext, id: string) {
    const item = await tx.trafficInfraction.findFirst({
      where: { id, ...this.scope(ctx) },
      include: {
        vehicle: { select: { id: true, plate: true, branchId: true, internalCode: true, model: { select: { name: true, make: { select: { name: true } } } } } },
        driver: { select: { id: true, name: true, cnhNumber: true } },
        contract: { select: { id: true, number: true, customerId: true } },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('Infração não encontrada.');
    return item;
  }

  async detail(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      const events = await tx.infractionEvent.findMany({ where: { infractionId: id }, orderBy: { at: 'desc' } });
      return { ...item, events };
    });
  }

  async create(ctx: OrgContext, dto: CreateInfractionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
      if (!ctx.allBranches && !ctx.branchIds.includes(vehicle.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
      const finalCents = finalAmount(dto.originalAmount, dto.discountAmount ?? 0, dto.interestAmount ?? 0);
      const created = await tx.trafficInfraction.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: vehicle.branchId,
          autoNumber: dto.autoNumber.trim().toUpperCase(),
          authority: dto.authority.trim(),
          infractionCode: dto.infractionCode ?? null,
          description: dto.description,
          occurredAt: new Date(dto.occurredAt),
          location: dto.location ?? null,
          vehicleUnitId: vehicle.id,
          notifiedAt: day(dto.notifiedAt),
          driverIndicationDeadline: day(dto.driverIndicationDeadline),
          defenseDeadline: day(dto.defenseDeadline),
          originalAmount: centsToDecimalString(toCents(dto.originalAmount)),
          discountAmount: centsToDecimalString(toCents(dto.discountAmount ?? 0)),
          interestAmount: centsToDecimalString(toCents(dto.interestAmount ?? 0)),
          finalAmount: centsToDecimalString(finalCents),
          dueDate: day(dto.dueDate),
          points: dto.points ?? null,
          notes: dto.notes ?? null,
          createdById: ctx.userId,
        },
      });
      await tx.infractionEvent.create({
        data: { organizationId: ctx.organizationId, infractionId: created.id, field: 'created', toValue: 'RECEIVED', note: 'Infração cadastrada', userId: ctx.userId },
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'INFRACTION', title: `Infração ${created.autoNumber} — ${created.authority}`,
        description: dto.description, refType: 'TrafficInfraction', refId: created.id, at: created.occurredAt,
        data: { amount: fromCents(finalCents) },
      });
      await this.audit.record(tx, ctx, { action: 'infraction.created', entityType: 'TrafficInfraction', entityId: created.id, branchId: vehicle.branchId, after: dto });
      return created;
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateInfractionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await this.load(tx, ctx, id);
      if (['CANCELLED', 'FINISHED'].includes(before.adminStatus)) throw new ConflictException('Infração encerrada não pode ser alterada.');
      const original = dto.originalAmount ?? num(before.originalAmount);
      const discount = dto.discountAmount ?? num(before.discountAmount);
      const interest = dto.interestAmount ?? num(before.interestAmount);
      const finalCents = finalAmount(original, discount, interest);
      const data: Record<string, unknown> = {};
      for (const field of TRACKED) {
        const value = dto[field];
        if (value === undefined) continue;
        data[field] = field === 'occurredAt' ? new Date(value as string)
          : DATE_ONLY.has(field) ? day(value as string)
          : field === 'autoNumber' ? String(value).trim().toUpperCase()
          : value;
      }
      data.finalAmount = centsToDecimalString(finalCents);
      await tx.trafficInfraction.update({ where: { id }, data: data as Prisma.TrafficInfractionUpdateInput });
      // Cada campo que mudou vira uma linha do histórico: quem, quando, de, para.
      for (const field of [...TRACKED, 'finalAmount'] as string[]) {
        if (data[field] === undefined) continue;
        const from = stringify((before as Record<string, unknown>)[field]);
        const to = stringify(data[field]);
        if (normalize(from) !== normalize(to)) {
          await tx.infractionEvent.create({
            data: { organizationId: ctx.organizationId, infractionId: id, field, fromValue: from, toValue: to, note: dto.note ?? null, userId: ctx.userId },
          });
        }
      }
      await this.audit.record(tx, ctx, {
        action: 'infraction.updated', entityType: 'TrafficInfraction', entityId: id, branchId: before.branchId,
        ...AuditService.diff(before as unknown as Record<string, unknown>, data), reason: dto.note,
      });
      return this.load(tx, ctx, id);
    });
  }

  async changeStatus(ctx: OrgContext, id: string, dto: InfractionStatusDto) {
    if (!dto.adminStatus && !dto.financialStatus) throw new BadRequestException('Informe o novo status administrativo ou financeiro.');
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      const data: Prisma.TrafficInfractionUpdateInput = {};
      if (dto.adminStatus && dto.adminStatus !== item.adminStatus) {
        const to = dto.adminStatus as InfractionAdminStatus;
        if (to === 'DRIVER_INDICATED') throw new BadRequestException('Use a ação "Indicar condutor", que exige permissão própria.');
        if (!ADMIN_TRANSITIONS[item.adminStatus].includes(to)) {
          throw new ConflictException(`Não é possível passar de "${INFRACTION_ADMIN_STATUS_LABEL[item.adminStatus]}" para "${INFRACTION_ADMIN_STATUS_LABEL[to]}".`);
        }
        data.adminStatus = to;
        await this.event(tx, ctx, id, 'adminStatus', item.adminStatus, to, dto.note);
      }
      if (dto.financialStatus && dto.financialStatus !== item.financialStatus) {
        const to = dto.financialStatus as InfractionFinancialStatus;
        if (!FINANCIAL_TRANSITIONS[item.financialStatus].includes(to)) {
          throw new ConflictException(`Não é possível passar de "${INFRACTION_FINANCIAL_STATUS_LABEL[item.financialStatus]}" para "${INFRACTION_FINANCIAL_STATUS_LABEL[to]}".`);
        }
        data.financialStatus = to;
        await this.event(tx, ctx, id, 'financialStatus', item.financialStatus, to, dto.note);
      }
      if (!Object.keys(data).length) throw new BadRequestException('Nenhuma mudança de status.');
      await tx.trafficInfraction.update({ where: { id }, data });
      await this.audit.record(tx, ctx, {
        action: 'infraction.status_changed', entityType: 'TrafficInfraction', entityId: id, branchId: item.branchId,
        before: { adminStatus: item.adminStatus, financialStatus: item.financialStatus }, after: data, reason: dto.note,
      });
      return this.load(tx, ctx, id);
    });
  }

  /**
   * Quem dirigia o carro no instante da infração, pelo histórico do
   * contrato. É só uma sugestão: a indicação ao órgão é um ato explícito.
   */
  async driverSuggestion(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      return suggestDriver(tx, item.vehicleUnitId, item.occurredAt);
    });
  }

  async indicateDriver(ctx: OrgContext, id: string, dto: IndicateDriverDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      if (!['RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID'].includes(item.adminStatus)) {
        throw new ConflictException('A indicação de condutor só é possível antes da defesa e do encerramento.');
      }
      const driver = await tx.driver.findUnique({ where: { id: dto.driverId } });
      if (!driver) throw new NotFoundException('Motorista não encontrado.');
      let contractId: string | null = null;
      let customerId: string | null = driver.customerId;
      if (dto.contractId) {
        const contract = await tx.rentalContract.findUnique({ where: { id: dto.contractId } });
        if (!contract) throw new NotFoundException('Contrato não encontrado.');
        contractId = contract.id;
        customerId = contract.customerId;
      }
      await tx.trafficInfraction.update({
        where: { id },
        data: {
          driverId: driver.id, contractId, customerId, adminStatus: 'DRIVER_INDICATED',
          driverIndicatedAt: new Date(), driverIndicatedById: ctx.userId,
        },
      });
      await this.event(tx, ctx, id, 'adminStatus', item.adminStatus, 'DRIVER_INDICATED', dto.note ?? `Condutor indicado: ${driver.name}`);
      await this.event(tx, ctx, id, 'driverId', item.driverId, driver.id, `Condutor: ${driver.name}`);
      await this.audit.record(tx, ctx, {
        action: 'infraction.driver_indicated', entityType: 'TrafficInfraction', entityId: id, branchId: item.branchId,
        before: { driverId: item.driverId }, after: { driverId: driver.id, contractId }, reason: dto.note,
      });
      return this.load(tx, ctx, id);
    });
  }

  /** A locadora assume o pagamento: nasce uma conta a pagar, sujeita a aprovação. */
  async payByCompany(ctx: OrgContext, id: string, dto: PayInfractionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      if (item.payableId) throw new ConflictException('Esta infração já tem conta a pagar.');
      if (item.financialStatus !== 'PENDING' && item.financialStatus !== 'BILLING') {
        throw new ConflictException('A situação financeira não permite registrar o pagamento pela locadora.');
      }
      const payable = await tx.payable.create({
        data: {
          organizationId: ctx.organizationId, branchId: item.vehicle.branchId, kind: 'FINE',
          description: `Multa ${item.autoNumber} — ${item.authority}`, amount: item.finalAmount, dueDate: day(dto.dueDate)!,
          vehicleUnitId: item.vehicleUnitId, infractionId: id, approval: 'PENDING_APPROVAL', createdById: ctx.userId,
        },
      });
      const to: InfractionFinancialStatus = item.financialStatus === 'BILLING' ? 'AWAITING_REIMBURSEMENT' : 'PAID_BY_COMPANY';
      await tx.trafficInfraction.update({ where: { id }, data: { payableId: payable.id, financialStatus: to } });
      await this.event(tx, ctx, id, 'financialStatus', item.financialStatus, to, dto.note ?? 'Conta a pagar gerada');
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: item.vehicleUnitId, type: 'EXPENSE', title: `Multa ${item.autoNumber} assumida pela locadora`,
        refType: 'Payable', refId: payable.id, data: { amount: num(item.finalAmount) },
      });
      await this.audit.record(tx, ctx, {
        action: 'infraction.paid_by_company', entityType: 'TrafficInfraction', entityId: id, branchId: item.branchId,
        after: { payableId: payable.id, amount: item.finalAmount },
      });
      return this.load(tx, ctx, id);
    });
  }

  /** Cobra do cliente (repasse ou reembolso): nasce uma conta a receber. */
  async chargeCustomer(ctx: OrgContext, id: string, dto: ChargeInfractionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      if (item.receivableId) throw new ConflictException('Esta infração já tem cobrança.');
      if (!['PENDING', 'PAID_BY_COMPANY'].includes(item.financialStatus)) throw new ConflictException('A situação financeira não permite gerar cobrança.');
      const customerId = dto.customerId ?? item.customerId ?? item.contract?.customerId ?? null;
      if (!customerId) throw new BadRequestException('Indique o condutor/contrato ou informe o cliente a ser cobrado.');
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundException('Cliente não encontrado.');
      const amount = dto.amount ?? num(item.finalAmount);
      const receivable = await tx.receivable.create({
        data: {
          organizationId: ctx.organizationId, branchId: item.vehicle.branchId, customerId, contractId: item.contractId,
          vehicleUnitId: item.vehicleUnitId, kind: 'INFRACTION_REIMBURSEMENT',
          description: `Reembolso de multa ${item.autoNumber} — ${item.authority}`,
          amount: centsToDecimalString(toCents(amount)), dueDate: day(dto.dueDate)!, createdById: ctx.userId,
        },
      });
      const to: InfractionFinancialStatus = item.financialStatus === 'PAID_BY_COMPANY' ? 'AWAITING_REIMBURSEMENT' : 'BILLING';
      await tx.trafficInfraction.update({ where: { id }, data: { receivableId: receivable.id, customerId, financialStatus: to } });
      await this.event(tx, ctx, id, 'financialStatus', item.financialStatus, to, dto.note ?? `Cobrança gerada para ${customer.name}`);
      await this.audit.record(tx, ctx, {
        action: 'infraction.charged', entityType: 'TrafficInfraction', entityId: id, branchId: item.branchId,
        after: { receivableId: receivable.id, amount },
      });
      return this.load(tx, ctx, id);
    });
  }

  async appeal(ctx: OrgContext, id: string, dto: AppealDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      if (!ADMIN_TRANSITIONS[item.adminStatus].includes('APPEALING')) throw new ConflictException('A situação atual não permite registrar defesa ou recurso.');
      await tx.trafficInfraction.update({ where: { id }, data: { adminStatus: 'APPEALING', appealProtocol: dto.protocol } });
      await this.event(tx, ctx, id, 'adminStatus', item.adminStatus, 'APPEALING', dto.note ?? `Protocolo ${dto.protocol}`);
      await this.event(tx, ctx, id, 'appealProtocol', item.appealProtocol, dto.protocol, null);
      await this.audit.record(tx, ctx, { action: 'infraction.appealed', entityType: 'TrafficInfraction', entityId: id, branchId: item.branchId, after: dto });
      return this.load(tx, ctx, id);
    });
  }

  async appealResult(ctx: OrgContext, id: string, dto: AppealResultDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const item = await this.load(tx, ctx, id);
      if (item.adminStatus !== 'APPEALING') throw new ConflictException('Não há recurso em andamento.');
      await tx.trafficInfraction.update({ where: { id }, data: { adminStatus: dto.result, result: dto.note } });
      await this.event(tx, ctx, id, 'adminStatus', item.adminStatus, dto.result, dto.note);
      await this.audit.record(tx, ctx, { action: 'infraction.appeal_result', entityType: 'TrafficInfraction', entityId: id, branchId: item.branchId, after: dto });
      return this.load(tx, ctx, id);
    });
  }

  private event(tx: Tx, ctx: OrgContext, infractionId: string, field: string, from: unknown, to: unknown, note?: string | null) {
    return tx.infractionEvent.create({
      data: { organizationId: ctx.organizationId, infractionId, field, fromValue: stringify(from), toValue: stringify(to), note: note ?? null, userId: ctx.userId },
    });
  }
}

/** Motorista e contrato que cobriam o veículo no instante informado. */
export async function suggestDriver(tx: Tx, vehicleUnitId: string, at: Date) {
  const link = await tx.contractVehicle.findFirst({
    where: { vehicleUnitId, startAt: { lte: at }, OR: [{ endAt: null }, { endAt: { gt: at } }] },
    include: { contract: { select: { id: true, number: true, customerId: true, customer: { select: { id: true, name: true } } } } },
    orderBy: { startAt: 'desc' },
  });
  if (!link) return { found: false, contract: null, driver: null, reason: 'Nenhum contrato cobria o veículo na data e hora da infração.' };
  const driver = await tx.contractDriver.findFirst({
    where: { contractId: link.contractId, startAt: { lte: at }, OR: [{ endAt: null }, { endAt: { gt: at } }] },
    include: { driver: { select: { id: true, name: true, cnhNumber: true, cnhExpiresAt: true } } },
    orderBy: [{ primary: 'desc' }, { startAt: 'desc' }],
  });
  return {
    found: Boolean(driver),
    contract: link.contract,
    driver: driver?.driver ?? null,
    reason: driver
      ? 'Motorista vinculado ao contrato no instante da infração. Confirme antes de indicar ao órgão.'
      : 'O contrato não tinha motorista vinculado naquele instante.',
  };
}

function finalAmount(original: number, discount: number, interest: number): number {
  const cents = toCents(original) - toCents(discount) + toCents(interest);
  if (cents <= 0) throw new BadRequestException('O valor final precisa ser maior que zero.');
  return cents;
}

export function day(value?: string | null): Date | null {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** "150" e "150.00" são o mesmo valor para o histórico. */
function normalize(value: string | null): string | null {
  if (value !== null && /^-?\d+(\.\d+)?$/.test(value)) return String(Number(value));
  return value;
}

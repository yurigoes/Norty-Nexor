import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Injectable, Module,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { DAY_MS, isoDateInZone, toCents, type ReservationStatus } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { CounterService } from '../../common/counter.service';
import { AvailabilityService } from '../../common/availability.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { assertBranch, assertCan, branchWhere, OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { num } from '../../common/serialize.interceptor';
import { orderBy, PageQueryDto, pageArgs, paginated } from '../../common/pagination';
import { orgSettings } from '../../common/org-settings';
import { PricingService } from '../pricing/pricing.service';
import { QuoteExtraDto } from '../pricing/dto';
import { ContractsModule } from '../contracts/contracts.controller';
import { ContractsService, quoteJson } from '../contracts/contracts.service';
import { expireRequested } from '../contracts/rentals.jobs';

/* ---------------- DTOs ---------------- */

class CreateReservationDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsUUID() categoryId!: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() returnBranchId?: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => QuoteExtraDto) extras?: QuoteExtraDto[];
  @IsOptional() @IsInt() @Min(0) @Max(5) additionalDrivers?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  /** Pedido do site que originou a reserva. */
  @IsOptional() @IsUUID() leadId?: string;
  /** Confirma já na criação (exige veículo e reservations.confirm). */
  @IsOptional() @IsBoolean() confirm?: boolean;
}

class UpdateReservationDto {
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => QuoteExtraDto) extras?: QuoteExtraDto[];
  @IsOptional() @IsInt() @Min(0) @Max(5) additionalDrivers?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsString() @Length(3, 500) reason!: string;
}

class ConfirmDto {
  @IsOptional() @IsUUID() vehicleUnitId?: string;
}

class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

class CheckoutDto {
  @IsOptional() @IsUUID() driverId?: string;
  /** Valor diferente do cotado: exige contracts.price_override e fica na auditoria. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) totalAmount?: number;
  @IsOptional() @IsString() @MaxLength(500) priceReason?: string;
}

class ReservationQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['REQUESTED', 'CONFIRMED', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED']) status?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class AgendaQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) @Max(365) renewalDays?: number;
}

/* ---------------- Serviço ---------------- */

/**
 * Reservas por período.
 *
 * Pedido (REQUESTED) não ocupa a agenda: é intenção. Reserva confirmada
 * (CONFIRMED) é um bloco na agenda do carro, e é o banco — pela restrição
 * de exclusão — quem decide entre duas confirmações simultâneas.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly counter: CounterService,
    private readonly availability: AvailabilityService,
    private readonly vehicleStatus: VehicleStatusService,
    private readonly pricing: PricingService,
    private readonly contracts: ContractsService,
  ) {}

  async list(ctx: OrgContext, q: ReservationQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.ReservationWhereInput = {
      ...(q.branchId ? (assertBranch(ctx, q.branchId), { branchId: q.branchId }) : branchWhere(ctx)),
      ...(q.status ? { status: q.status as ReservationStatus } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.vehicleUnitId ? { vehicleUnitId: q.vehicleUnitId } : {}),
      ...(q.from || q.to ? { startAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.q ? { OR: [
        { code: { contains: q.q, mode: 'insensitive' } },
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
        { vehicle: { plate: { contains: q.q.toUpperCase().replace(/[^A-Z0-9]/g, '') || q.q } } },
      ] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [items, total] = await Promise.all([
        tx.reservation.findMany({
          where, skip, take, orderBy: orderBy(q, ['startAt', 'endAt', 'createdAt', 'code'], { startAt: 'asc' }),
          include: {
            customer: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
            vehicle: { select: { id: true, plate: true, model: { select: { name: true, make: { select: { name: true } } } } } },
            contract: { select: { id: true, number: true } },
          },
        }),
        tx.reservation.count({ where }),
      ]);
      return paginated(items, total, page, pageSize);
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await tx.reservation.findFirst({
        where: { id, ...branchWhere(ctx) },
        include: {
          customer: { select: { id: true, name: true, status: true, email: true, phone: true } },
          category: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, color: true, model: { select: { name: true, make: { select: { name: true } } } } } },
          contract: { select: { id: true, number: true, status: true } },
        },
      });
      if (!r) throw new NotFoundException('Reserva não encontrada.');
      const driver = r.driverId ? await tx.driver.findUnique({ where: { id: r.driverId }, select: { id: true, name: true, cnhExpiresAt: true } }) : null;
      return { ...r, driver };
    });
  }

  async create(ctx: OrgContext, dto: CreateReservationDto) {
    assertBranch(ctx, dto.branchId);
    if ((dto.discountPercent ?? 0) > 0) assertCan(ctx, 'contracts.price_override');
    if (dto.confirm) {
      assertCan(ctx, 'reservations.confirm');
      if (!dto.vehicleUnitId) throw new BadRequestException('Escolha o veículo para confirmar a reserva.');
    }
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('A devolução precisa ser posterior à retirada.');
    return this.prisma.tenant(ctx, async (tx) => {
      const customer = await this.assertCustomer(tx, dto.customerId);
      if (dto.driverId) await this.assertDriver(tx, ctx.organizationId, dto.driverId, endAt);
      if (dto.returnBranchId && !(await tx.branch.findUnique({ where: { id: dto.returnBranchId } }))) throw new BadRequestException('Filial de devolução inválida.');
      if (!(await tx.vehicleCategory.findUnique({ where: { id: dto.categoryId } }))) throw new BadRequestException('Categoria inválida.');
      const quote = await this.pricing.quote(tx, ctx.organizationId, {
        categoryId: dto.categoryId, branchId: dto.branchId, startAt, endAt, extras: dto.extras,
        additionalDrivers: dto.additionalDrivers, discountPercent: dto.discountPercent,
      });
      const code = await this.counter.next(tx, ctx.organizationId, 'reservation', 'RES-');
      const reservation = await tx.reservation.create({
        data: {
          organizationId: ctx.organizationId, branchId: dto.branchId, returnBranchId: dto.returnBranchId ?? null, code,
          customerId: customer.id, driverId: dto.driverId ?? null, categoryId: dto.categoryId, startAt, endAt,
          status: 'REQUESTED', source: 'INTERNAL', quote: quoteJson(quote, dto) as Prisma.InputJsonValue,
          total: quote.total, depositAmount: quote.depositAmount, extras: (dto.extras ?? []) as unknown as Prisma.InputJsonValue,
          additionalDrivers: dto.additionalDrivers ?? 0, discountPercent: dto.discountPercent ?? 0, notes: dto.notes ?? null, createdById: ctx.userId,
        },
      });
      if (dto.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: dto.leadId } });
        if (!lead) throw new BadRequestException('Pedido do site não encontrado.');
        if (lead.status === 'CONVERTED') throw new ConflictException('Este pedido do site já foi convertido.');
        await tx.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED', reservationId: reservation.id, handledById: ctx.userId } });
      }
      await this.audit.record(tx, ctx, {
        action: 'reservation.created', entityType: 'Reservation', entityId: reservation.id, branchId: dto.branchId,
        after: { code, startAt, endAt, total: quote.total, categoryId: dto.categoryId, leadId: dto.leadId ?? null },
      });
      if (dto.confirm) await this.doConfirm(tx, ctx, reservation.id, dto.vehicleUnitId);
      return tx.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    });
  }

  async confirm(ctx: OrgContext, id: string, dto: ConfirmDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.doConfirm(tx, ctx, id, dto.vehicleUnitId);
      return tx.reservation.findUniqueOrThrow({ where: { id } });
    });
  }

  private async doConfirm(tx: Tx, ctx: OrgContext, id: string, vehicleUnitId?: string) {
    const r = await this.load(tx, ctx, id);
    if (r.status !== 'REQUESTED') throw new ConflictException('Só uma reserva solicitada pode ser confirmada.');
    if (r.startAt < new Date(Date.now() - 6 * 3_600_000)) throw new ConflictException('A data de retirada já passou. Altere o período antes de confirmar.');
    const vehicleId = vehicleUnitId ?? r.vehicleUnitId;
    if (!vehicleId) throw new BadRequestException('Escolha o veículo para confirmar.');
    await this.assertCustomer(tx, r.customerId);
    if (r.driverId) await this.assertDriver(tx, ctx.organizationId, r.driverId, r.endAt);
    const vehicle = await this.assertVehicle(tx, ctx, vehicleId, r.categoryId, r.branchId);
    await this.availability.allocate(tx, ctx.organizationId, {
      vehicleUnitId: vehicle.id, kind: 'RESERVATION', startsAt: r.startAt, endsAt: r.endAt, reservationId: r.id,
      reason: `Reserva ${r.code}`, createdById: ctx.userId,
    });
    await tx.reservation.update({ where: { id }, data: { status: 'CONFIRMED', vehicleUnitId: vehicle.id, confirmedAt: new Date(), confirmedById: ctx.userId } });
    await this.timeline.record(tx, ctx, ctx.organizationId, {
      vehicleUnitId: vehicle.id, type: 'RESERVATION', title: `Reserva ${r.code} confirmada`,
      description: `${fmt(r.startAt)} a ${fmt(r.endAt)}`, refType: 'Reservation', refId: r.id,
    });
    await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, vehicle.id);
    await this.audit.record(tx, ctx, { action: 'reservation.confirmed', entityType: 'Reservation', entityId: id, branchId: r.branchId, after: { vehicleUnitId: vehicle.id } });
  }

  /**
   * Alteração de período, veículo ou extras. Numa reserva confirmada, o
   * bloco antigo é liberado e o novo é alocado na mesma transação: se o
   * novo colidir, nada muda.
   */
  async update(ctx: OrgContext, id: string, dto: UpdateReservationDto) {
    if (dto.discountPercent !== undefined && dto.discountPercent > 0) assertCan(ctx, 'contracts.price_override');
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await this.load(tx, ctx, id);
      if (!['REQUESTED', 'CONFIRMED'].includes(r.status)) throw new ConflictException('Reserva não pode mais ser alterada.');
      const startAt = dto.startAt ? new Date(dto.startAt) : r.startAt;
      const endAt = dto.endAt ? new Date(dto.endAt) : r.endAt;
      if (endAt <= startAt) throw new BadRequestException('A devolução precisa ser posterior à retirada.');
      const driverId = dto.driverId ?? r.driverId;
      if (driverId) await this.assertDriver(tx, ctx.organizationId, driverId, endAt);
      const previous = (r.quote as { input?: { extras?: { extraServiceId: string; quantity: number }[]; additionalDrivers?: number; discountPercent?: number } } | null)?.input ?? {};
      const input = {
        categoryId: r.categoryId, extras: dto.extras ?? previous.extras, additionalDrivers: dto.additionalDrivers ?? previous.additionalDrivers,
        discountPercent: dto.discountPercent ?? previous.discountPercent,
      };
      const quote = await this.pricing.quote(tx, ctx.organizationId, { ...input, branchId: r.branchId, startAt, endAt });
      let vehicleUnitId = dto.vehicleUnitId ?? r.vehicleUnitId;
      if (r.status === 'CONFIRMED') {
        const current = await tx.vehicleAllocation.findFirst({ where: { reservationId: r.id, active: true } });
        if (current) await this.availability.release(tx, current.id);
        const vehicle = await this.assertVehicle(tx, ctx, vehicleUnitId!, r.categoryId, r.branchId);
        vehicleUnitId = vehicle.id;
        await this.availability.allocate(tx, ctx.organizationId, {
          vehicleUnitId: vehicle.id, kind: 'RESERVATION', startsAt: startAt, endsAt: endAt, reservationId: r.id, reason: `Reserva ${r.code}`, createdById: ctx.userId,
        });
      }
      await tx.reservation.update({
        where: { id },
        data: {
          startAt, endAt, vehicleUnitId, driverId, quote: quoteJson(quote, input) as Prisma.InputJsonValue, total: quote.total,
          depositAmount: quote.depositAmount, extras: (input.extras ?? []) as unknown as Prisma.InputJsonValue,
          additionalDrivers: input.additionalDrivers ?? 0, discountPercent: input.discountPercent ?? 0, notes: dto.notes ?? r.notes,
        },
      });
      for (const v of new Set([r.vehicleUnitId, vehicleUnitId].filter(Boolean) as string[])) await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, v);
      await this.audit.record(tx, ctx, {
        action: 'reservation.updated', entityType: 'Reservation', entityId: id, branchId: r.branchId, reason: dto.reason,
        before: { startAt: r.startAt, endAt: r.endAt, vehicleUnitId: r.vehicleUnitId, total: r.total },
        after: { startAt, endAt, vehicleUnitId, total: quote.total },
      });
      return tx.reservation.findUniqueOrThrow({ where: { id } });
    });
  }

  async cancel(ctx: OrgContext, id: string, reason: string, status: 'CANCELLED' | 'NO_SHOW' = 'CANCELLED') {
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await this.load(tx, ctx, id);
      if (status === 'NO_SHOW') {
        if (r.status !== 'CONFIRMED') throw new ConflictException('Só reserva confirmada pode ser marcada como não comparecimento.');
        if (r.startAt > new Date()) throw new ConflictException('A retirada ainda não aconteceu.');
      } else if (!['REQUESTED', 'CONFIRMED'].includes(r.status)) {
        throw new ConflictException('Esta reserva não pode mais ser cancelada.');
      }
      const alloc = await tx.vehicleAllocation.findFirst({ where: { reservationId: r.id, active: true } });
      if (alloc) await this.availability.release(tx, alloc.id);
      await tx.reservation.update({ where: { id }, data: { status, cancelReason: reason, cancelledAt: new Date() } });
      if (r.vehicleUnitId) {
        await this.timeline.record(tx, ctx, ctx.organizationId, {
          vehicleUnitId: r.vehicleUnitId, type: 'RESERVATION',
          title: `Reserva ${r.code} ${status === 'NO_SHOW' ? 'sem comparecimento' : 'cancelada'}`, description: reason, refType: 'Reservation', refId: r.id,
        });
        await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, r.vehicleUnitId);
      }
      await this.audit.record(tx, ctx, { action: status === 'NO_SHOW' ? 'reservation.no_show' : 'reservation.cancelled', entityType: 'Reservation', entityId: id, branchId: r.branchId, reason, before: { status: r.status }, after: { status } });
      return { id, status };
    });
  }

  /**
   * Retirada: a reserva vira contrato por período, aprovado, e o bloco da
   * agenda passa de RESERVATION a CONTRACT na mesma transação. A entrega do
   * carro (com vistoria) acontece no contrato.
   */
  async checkout(ctx: OrgContext, id: string, dto: CheckoutDto) {
    assertCan(ctx, 'contracts.create');
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await this.load(tx, ctx, id);
      if (r.status !== 'CONFIRMED') throw new ConflictException('Só reserva confirmada pode ser retirada.');
      const driverId = dto.driverId ?? r.driverId;
      if (!driverId) throw new BadRequestException('Informe o motorista principal para a retirada.');
      const allocation = await tx.vehicleAllocation.findFirst({ where: { reservationId: r.id, active: true } });
      if (!allocation || !r.vehicleUnitId) throw new ConflictException('A reserva não tem veículo alocado.');
      const quote = (r.quote ?? {}) as { total?: number; includedKm?: number | null; extraKmRate?: number | null; extras?: { name: string; pricing: 'PER_DAY' | 'FIXED'; price: number; quantity: number }[] };
      if (dto.totalAmount !== undefined && toCents(dto.totalAmount) !== toCents(num(r.total))) {
        assertCan(ctx, 'contracts.price_override');
        if (!dto.priceReason) throw new BadRequestException('Informe o motivo da alteração de valor.');
      }
      const settings = orgSettings((await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }))?.settings);
      const contract = await this.contracts.insert(tx, ctx, {
        kind: 'PERIOD', status: 'APPROVED', branchId: r.branchId, customerId: r.customerId, driverId, vehicleUnitId: r.vehicleUnitId,
        startAt: r.startAt, endAt: r.endAt, reservationId: r.id, reservationAllocationId: allocation.id,
        quote: r.quote as Record<string, unknown>, totalAmount: dto.totalAmount ?? num(r.total),
        kmAllowance: quote.includedKm ?? null, kmAllowancePeriod: 'TOTAL', extraKmRate: quote.extraKmRate ?? null,
        depositRequired: num(r.depositAmount), lateFeePercent: settings.lateFeePercent, monthlyInterestPercent: settings.monthlyInterestPercent,
        extras: (quote.extras ?? []).map((e) => ({ name: e.name, pricing: e.pricing, price: e.price, quantity: e.quantity })),
        versionReason: `Retirada da reserva ${r.code}`,
      });
      await tx.reservation.update({ where: { id }, data: { status: 'CHECKED_OUT', driverId } });
      if (dto.totalAmount !== undefined && toCents(dto.totalAmount) !== toCents(num(r.total))) {
        await this.audit.record(tx, ctx, { action: 'contract.price_overridden', entityType: 'RentalContract', entityId: contract.id, branchId: r.branchId, reason: dto.priceReason, before: { total: r.total }, after: { total: dto.totalAmount } });
      }
      await this.audit.record(tx, ctx, { action: 'reservation.checked_out', entityType: 'Reservation', entityId: id, branchId: r.branchId, after: { contractId: contract.id, number: contract.number } });
      return contract;
    });
  }

  async expire(ctx: OrgContext) {
    return this.prisma.tenant(ctx, async (tx) => {
      const expired = await expireRequested(tx, ctx.organizationId);
      if (expired) await this.audit.record(tx, ctx, { action: 'reservation.expired_batch', entityType: 'Reservation', after: { expired } });
      return { expired };
    });
  }

  /**
   * Agenda do balcão: retiradas (reservas confirmadas e contratos
   * aprovados), devoluções (contratos em vigor) e renovações próximas,
   * com o que falta para cada entrega.
   */
  async agenda(ctx: OrgContext, q: AgendaQueryDto) {
    const today = new Date(`${isoDateInZone(new Date())}T03:00:00.000Z`);
    const from = q.from ? new Date(q.from) : new Date(today.getTime() - 30 * DAY_MS);
    const to = q.to ? new Date(q.to) : new Date(today.getTime() + 7 * DAY_MS);
    const scope = q.branchId ? (assertBranch(ctx, q.branchId), { branchId: q.branchId }) : branchWhere(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const [reservations, approved, active, renewals] = await Promise.all([
        tx.reservation.findMany({
          where: { ...scope, status: 'CONFIRMED', startAt: { gte: from, lte: to } }, orderBy: { startAt: 'asc' },
          include: { customer: { select: { id: true, name: true } }, vehicle: { select: { id: true, plate: true } }, category: { select: { name: true } } },
        }),
        tx.rentalContract.findMany({
          where: { ...scope, status: 'APPROVED', startAt: { lte: to } }, orderBy: { startAt: 'asc' },
          include: { customer: { select: { id: true, name: true } }, vehicles: { where: { endAt: null }, include: { vehicle: { select: { id: true, plate: true } } } } },
        }),
        tx.rentalContract.findMany({
          where: { ...scope, status: 'ACTIVE', endAt: { lte: to } }, orderBy: { endAt: 'asc' },
          include: { customer: { select: { id: true, name: true } }, vehicles: { where: { endAt: null }, include: { vehicle: { select: { id: true, plate: true } } } } },
        }),
        tx.rentalContract.findMany({
          where: { ...scope, status: 'ACTIVE', kind: 'LONG_TERM', endAt: { lte: new Date(Date.now() + (q.renewalDays ?? 60) * DAY_MS) } }, orderBy: { endAt: 'asc' },
          include: { customer: { select: { id: true, name: true } }, vehicles: { where: { endAt: null }, include: { vehicle: { select: { id: true, plate: true } } } } },
        }),
      ]);
      const pickups = [
        ...reservations.map((r) => ({ type: 'reservation' as const, id: r.id, code: r.code, at: r.startAt, until: r.endAt, customer: r.customer, vehicle: r.vehicle, category: r.category.name, late: r.startAt < new Date(), pendencies: null })),
        ...(await Promise.all(approved.map(async (c) => ({
          type: 'contract' as const, id: c.id, code: c.number, at: c.startAt, until: c.endAt, customer: c.customer, vehicle: c.vehicles[0]?.vehicle ?? null,
          category: null, late: c.startAt < new Date(), pendencies: await this.contracts.pendencies(tx, c.id),
        })))),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());
      const returns = active.map((c) => ({ id: c.id, code: c.number, kind: c.kind, at: c.endAt, customer: c.customer, vehicle: c.vehicles[0]?.vehicle ?? null, late: c.endAt < new Date() }));
      const renewalList = renewals.map((c) => ({ id: c.id, code: c.number, at: c.endAt, customer: c.customer, vehicle: c.vehicles[0]?.vehicle ?? null, monthlyAmount: c.monthlyAmount }));
      return { from, to, pickups, returns, renewals: renewalList };
    });
  }

  /* ---------------- Auxiliares ---------------- */

  private async load(tx: Tx, ctx: OrgContext, id: string) {
    const r = await tx.reservation.findFirst({ where: { id, ...branchWhere(ctx) } });
    if (!r) throw new NotFoundException('Reserva não encontrada.');
    return r;
  }

  private async assertCustomer(tx: Tx, customerId: string) {
    const c = await tx.customer.findUnique({ where: { id: customerId } });
    if (!c || c.deletedAt || c.anonymizedAt) throw new BadRequestException('Cliente inválido.');
    if (c.status === 'BLOCKED') throw new ConflictException(`Cliente bloqueado${c.blockReason ? `: ${c.blockReason}` : ''}.`);
    return c;
  }

  private async assertDriver(tx: Tx, organizationId: string, driverId: string, until: Date) {
    const d = await tx.driver.findUnique({ where: { id: driverId } });
    if (!d || !d.active || d.anonymizedAt) throw new BadRequestException('Motorista inválido.');
    const settings = orgSettings((await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } }))?.settings);
    if (settings.blockExpiredCnh && d.cnhExpiresAt < new Date(`${until.toISOString().slice(0, 10)}T00:00:00.000Z`)) {
      throw new ConflictException(`A CNH de ${d.name} vence antes do fim da locação (${d.cnhExpiresAt.toISOString().slice(0, 10).split('-').reverse().join('/')}).`);
    }
    return d;
  }

  private async assertVehicle(tx: Tx, ctx: OrgContext, vehicleId: string, categoryId: string, branchId: string) {
    const v = await tx.vehicleUnit.findUnique({ where: { id: vehicleId } });
    if (!v || v.deletedAt) throw new BadRequestException('Veículo inválido.');
    if (v.categoryId !== categoryId) throw new BadRequestException('O veículo precisa ser da categoria reservada.');
    if (v.branchId !== branchId) throw new BadRequestException('O veículo precisa estar na filial de retirada.');
    if (!ctx.allBranches && !ctx.branchIds.includes(v.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
    await this.availability.assertRentable(tx, v.id);
    return v;
  }
}

const fmt = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(d);

/* ---------------- Controller ---------------- */

@Controller()
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @RequirePermission('reservations.view')
  @Get('reservations')
  list(@OrgCtx() ctx: OrgContext, @Query() q: ReservationQueryDto) {
    return this.reservations.list(ctx, q);
  }

  @RequirePermission('reservations.create')
  @Post('reservations')
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateReservationDto) {
    return this.reservations.create(ctx, dto);
  }

  @RequirePermission('reservations.confirm')
  @Post('reservations/expire')
  @HttpCode(HttpStatus.OK)
  expire(@OrgCtx() ctx: OrgContext) {
    return this.reservations.expire(ctx);
  }

  @RequirePermission('reservations.view')
  @Get('reservations/:id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.get(ctx, id);
  }

  @RequirePermission('reservations.create')
  @Patch('reservations/:id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReservationDto) {
    return this.reservations.update(ctx, id, dto);
  }

  @RequirePermission('reservations.confirm')
  @Post('reservations/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) {
    return this.reservations.confirm(ctx, id, dto);
  }

  @RequirePermission('reservations.cancel')
  @Post('reservations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.reservations.cancel(ctx, id, dto.reason);
  }

  @RequirePermission('reservations.cancel')
  @Post('reservations/:id/no-show')
  @HttpCode(HttpStatus.OK)
  noShow(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.reservations.cancel(ctx, id, dto.reason, 'NO_SHOW');
  }

  @RequirePermission('reservations.confirm')
  @Post('reservations/:id/checkout')
  checkout(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckoutDto) {
    return this.reservations.checkout(ctx, id, dto);
  }

  @RequirePermission('contracts.view')
  @Get('rentals/agenda')
  agenda(@OrgCtx() ctx: OrgContext, @Query() q: AgendaQueryDto) {
    return this.reservations.agenda(ctx, q);
  }
}

@Module({ imports: [ContractsModule], controllers: [ReservationsController], providers: [ReservationsService] })
export class ReservationsModule {}

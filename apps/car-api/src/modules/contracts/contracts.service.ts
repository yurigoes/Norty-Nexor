import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import {
  addMonths, centsToDecimalString, extraKmCharge, formatPlate, fromCents, isoDateInZone, lateDays, toCents, DAY_MS,
  type ContractStatus,
} from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { CounterService } from '../../common/counter.service';
import { AvailabilityService } from '../../common/availability.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { assertApprovalLimit, assertBranch, assertCan, branchWhere, type OrgContext, type RequestContext } from '../../common/context';
import { num, numOrNull } from '../../common/serialize.interceptor';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import { orgSettings } from '../../common/org-settings';
import { PricingService, type QuoteResult } from '../pricing/pricing.service';
import { DepositsService } from '../deposits/deposits';
import { generateDueInstallments } from './rentals.jobs';
import type {
  ActivateDto, AmendDto, CloseDto, ContractQueryDto, CreateContractDto, ExtendDto, RenewDto, SwapDriverDto, SwapVehicleDto, TerminateDto,
} from './dto';

const FINISHED: ContractStatus[] = ['CLOSED', 'TERMINATED', 'CANCELLED'];
const todayDate = () => new Date(`${isoDateInZone(new Date())}T00:00:00.000Z`);
const dateOnly = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00.000Z`) : todayDate());

/** Dados para gravar um contrato novo — vindo do balcão ou da retirada de uma reserva. */
export interface NewContract {
  kind: 'PERIOD' | 'LONG_TERM';
  status: 'DRAFT' | 'APPROVED';
  branchId: string;
  customerId: string;
  driverId: string;
  vehicleUnitId: string;
  startAt: Date;
  endAt: Date;
  reservationId?: string;
  /** Alocação da reserva que vira alocação do contrato (retirada). */
  reservationAllocationId?: string;
  quote?: Record<string, unknown> | null;
  totalAmount?: number | null;
  monthlyAmount?: number | null;
  termMonths?: number | null;
  billingDay?: number | null;
  adjustmentIndex?: string | null;
  kmAllowance?: number | null;
  kmAllowancePeriod?: string | null;
  extraKmRate?: number | null;
  depositRequired: number;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  includedServices?: string[];
  terms?: string | null;
  extras?: { name: string; pricing: 'PER_DAY' | 'FIXED'; price: number; quantity: number }[];
  versionReason: string;
}

/**
 * Contratos de locação: por período e de longo prazo.
 *
 * O contrato é dono do histórico da relação: cada carro que passou por
 * ele tem um intervalo em ContractVehicle, cada motorista um intervalo em
 * ContractDriver, e cada alteração relevante uma versão imutável com o
 * retrato completo. Nada disso é sobrescrito — troca fecha um intervalo
 * e abre outro.
 *
 * A agenda do carro (VehicleAllocation) é reservada desde a proposta: um
 * contrato em análise não perde o veículo para outra reserva.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly counter: CounterService,
    private readonly availability: AvailabilityService,
    private readonly vehicleStatus: VehicleStatusService,
    private readonly pricing: PricingService,
    private readonly deposits: DepositsService,
  ) {}

  /* ================= Consulta ================= */

  async list(ctx: OrgContext, q: ContractQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.RentalContractWhereInput = {
      ...(q.branchId ? (assertBranch(ctx, q.branchId), { branchId: q.branchId }) : branchWhere(ctx)),
      ...(q.status ? { status: q.status as ContractStatus } : {}),
      ...(q.kind ? { kind: q.kind as 'PERIOD' | 'LONG_TERM' } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.vehicleUnitId ? { vehicles: { some: { vehicleUnitId: q.vehicleUnitId } } } : {}),
      ...(q.expiringDays !== undefined ? { status: 'ACTIVE' as const, endAt: { lte: new Date(Date.now() + q.expiringDays * DAY_MS) } } : {}),
    };
    if (q.q) {
      const plate = q.q.toUpperCase().replace(/[^A-Z0-9]/g, '');
      where.OR = [
        { number: { contains: q.q, mode: 'insensitive' } },
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
        ...(plate.length >= 3 ? [{ vehicles: { some: { vehicle: { plate: { contains: plate } } } } }] : []),
      ];
    }
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.rentalContract.findMany({
          where, skip, take,
          orderBy: orderBy(q, ['number', 'startAt', 'endAt', 'createdAt', 'status'], { createdAt: 'desc' }),
          include: {
            customer: { select: { id: true, name: true } },
            vehicles: { orderBy: { startAt: 'desc' }, take: 1, include: { vehicle: { select: { id: true, plate: true, model: { select: { name: true, make: { select: { name: true } } } } } } } },
            drivers: { where: { endAt: null, primary: true }, include: { driver: { select: { id: true, name: true } } } },
          },
        }),
        tx.rentalContract.count({ where }),
      ]);
      const items = rows.map(({ vehicles, drivers, ...c }) => ({
        ...c,
        currentVehicle: vehicles[0] ? { id: vehicles[0].vehicle.id, plate: vehicles[0].vehicle.plate, model: `${vehicles[0].vehicle.model.make.name} ${vehicles[0].vehicle.model.name}` } : null,
        currentDriver: drivers[0]?.driver ?? null,
      }));
      return paginated(items, total, page, pageSize);
    });
  }

  async detail(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await tx.rentalContract.findFirst({
        where: { id, ...branchWhere(ctx) },
        include: {
          customer: { select: { id: true, name: true, document: true, email: true, phone: true, status: true, type: true } },
          vehicles: { orderBy: { startAt: 'asc' }, include: { vehicle: { select: { id: true, plate: true, internalCode: true, color: true, odometerKm: true, model: { select: { name: true, make: { select: { name: true } } } } } } } },
          drivers: { orderBy: { startAt: 'asc' }, include: { driver: { select: { id: true, name: true, cnhExpiresAt: true, cnhCategory: true } } } },
          extras: true,
          versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, reason: true, createdAt: true, createdById: true } },
          receivables: { orderBy: { dueDate: 'asc' } },
          deposit: { include: { entries: { orderBy: { at: 'asc' } } } },
          reservation: { select: { id: true, code: true } },
        },
      });
      if (!c) throw new NotFoundException('Contrato não encontrado.');
      const pendencies = await this.pendencies(tx, c.id);
      const deposit = c.deposit ? (await this.deposits.contractBalance(tx, c.id)) : null;
      return {
        ...c,
        customer: { ...c.customer, document: ctx.permissions.has('customers.sensitive') ? c.customer.document : undefined },
        deposit: c.deposit ? { ...c.deposit, balance: deposit?.balance } : null,
        pendencies,
      };
    });
  }

  async version(ctx: OrgContext, id: string, version: number) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.load(tx, ctx, id);
      const v = await tx.contractVersion.findUnique({ where: { contractId_version: { contractId: id, version } } });
      if (!v) throw new NotFoundException('Versão não encontrada.');
      return v;
    });
  }

  async inspections(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.load(tx, ctx, id);
      return tx.inspection.findMany({
        where: { contractId: id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, number: true, type: true, status: true, vehicleUnitId: true, odometerKm: true, fuelEighths: true, startedAt: true, completedAt: true, vehicle: { select: { plate: true } } },
      });
    });
  }

  /** O que falta para entregar o veículo (vistoria, caução, CNH). */
  async pendencies(tx: Tx, contractId: string) {
    const c = await tx.rentalContract.findUniqueOrThrow({
      where: { id: contractId },
      include: { vehicles: { where: { endAt: null } }, drivers: { where: { endAt: null, primary: true }, include: { driver: true } } },
    });
    const cv = c.vehicles[0];
    const delivery = cv ? await this.findInspection(tx, c.id, cv.vehicleUnitId, 'DELIVERY') : null;
    const dep = await this.deposits.contractBalance(tx, c.id);
    const required = num(c.depositRequired);
    const driver = c.drivers[0]?.driver;
    const cnhValidUntil = driver?.cnhExpiresAt ?? null;
    return {
      deliveryInspectionId: delivery?.id ?? null,
      depositRequired: required,
      depositReceived: dep?.balance.received ?? 0,
      depositOk: required <= 0 || toCents(dep?.balance.available ?? 0) >= toCents(required),
      cnhValidUntil,
      cnhOk: Boolean(cnhValidUntil && cnhValidUntil >= dateOnly(c.endAt.toISOString())),
      vehicleUnitId: cv?.vehicleUnitId ?? null,
    };
  }

  /* ================= Criação ================= */

  async create(ctx: OrgContext, dto: CreateContractDto) {
    assertBranch(ctx, dto.branchId);
    const startAt = new Date(dto.startAt);
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle || vehicle.deletedAt) throw new BadRequestException('Veículo inválido.');
      if (vehicle.branchId !== dto.branchId) throw new BadRequestException('O veículo precisa estar na filial do contrato.');
      const settings = orgSettings((await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }))?.settings);
      const override = ctx.permissions.has('contracts.price_override');

      let data: NewContract;
      if (dto.kind === 'PERIOD') {
        if (!dto.endAt) throw new BadRequestException('Informe a data de devolução.');
        const endAt = new Date(dto.endAt);
        if ((dto.discountPercent ?? 0) > 0 && !override) throw new ForbiddenException('Desconto exige a permissão de alterar valores.');
        if (dto.totalAmount !== undefined && !override) throw new ForbiddenException('Alterar o valor calculado exige a permissão de alterar valores.');
        const quote = await this.pricing.quote(tx, ctx.organizationId, {
          categoryId: vehicle.categoryId, branchId: dto.branchId, startAt, endAt, extras: dto.extras,
          additionalDrivers: dto.additionalDrivers, discountPercent: dto.discountPercent,
        });
        data = {
          kind: 'PERIOD', status: 'DRAFT', branchId: dto.branchId, customerId: dto.customerId, driverId: dto.driverId,
          vehicleUnitId: vehicle.id, startAt, endAt, quote: quoteJson(quote, dto),
          totalAmount: dto.totalAmount ?? quote.total, kmAllowance: quote.includedKm, kmAllowancePeriod: 'TOTAL',
          extraKmRate: quote.extraKmRate, depositRequired: dto.depositRequired ?? quote.depositAmount,
          lateFeePercent: dto.lateFeePercent ?? settings.lateFeePercent, monthlyInterestPercent: dto.monthlyInterestPercent ?? settings.monthlyInterestPercent,
          includedServices: dto.includedServices, terms: dto.terms,
          extras: quote.extras.map((e) => ({ name: e.name, pricing: e.pricing, price: e.price, quantity: e.quantity })),
          versionReason: 'Proposta criada',
        };
      } else {
        if (!dto.termMonths) throw new BadRequestException('Informe o prazo em meses.');
        const rate = await this.pricing.resolveRate(tx, ctx.organizationId, vehicle.categoryId, dto.branchId);
        const reference = numOrNull(rate.longTermMonthly);
        const monthly = dto.monthlyAmount ?? reference;
        if (!monthly) throw new BadRequestException('Não há mensalidade de referência para esta categoria. Informe o valor mensal.');
        if (reference !== null && dto.monthlyAmount !== undefined && toCents(dto.monthlyAmount) !== toCents(reference) && !override) {
          throw new ForbiddenException('Mensalidade diferente da tabela exige a permissão de alterar valores.');
        }
        data = {
          kind: 'LONG_TERM', status: 'DRAFT', branchId: dto.branchId, customerId: dto.customerId, driverId: dto.driverId,
          vehicleUnitId: vehicle.id, startAt, endAt: addMonths(startAt, dto.termMonths),
          quote: { kind: 'LONG_TERM', rateTableId: rate.id, referenceMonthly: reference, lateGraceMinutes: rate.lateGraceMinutes },
          monthlyAmount: monthly, termMonths: dto.termMonths, billingDay: dto.billingDay ?? Math.min(28, startAt.getUTCDate()),
          adjustmentIndex: dto.adjustmentIndex, kmAllowance: dto.kmAllowance ?? rate.longTermKmPerMonth, kmAllowancePeriod: 'MONTH',
          extraKmRate: dto.extraKmRate ?? numOrNull(rate.extraKmRate), depositRequired: dto.depositRequired ?? num(rate.depositAmount),
          lateFeePercent: dto.lateFeePercent ?? settings.lateFeePercent, monthlyInterestPercent: dto.monthlyInterestPercent ?? settings.monthlyInterestPercent,
          includedServices: dto.includedServices, terms: dto.terms, versionReason: 'Proposta criada',
        };
      }
      if (dto.depositRequired !== undefined && !override && toCents(dto.depositRequired) < toCents(data.depositRequired)) {
        throw new ForbiddenException('Reduzir o caução exige a permissão de alterar valores.');
      }
      return this.insert(tx, ctx, data);
    });
  }

  /**
   * Grava contrato, extras, primeiro intervalo de veículo e de motorista,
   * agenda, caução e a versão 1 — tudo ou nada.
   */
  async insert(tx: Tx, ctx: RequestContext, d: NewContract) {
    const organizationId = ctx.organizationId!;
    const customer = await tx.customer.findUnique({ where: { id: d.customerId } });
    if (!customer || customer.deletedAt || customer.anonymizedAt) throw new BadRequestException('Cliente inválido.');
    if (customer.status === 'BLOCKED') throw new ConflictException(`Cliente bloqueado${customer.blockReason ? `: ${customer.blockReason}` : ''}.`);
    await this.assertDriver(tx, organizationId, d.driverId, d.endAt);
    if (d.endAt <= d.startAt) throw new BadRequestException('O fim do contrato precisa ser posterior ao início.');

    const number = await this.counter.next(tx, organizationId, 'contract', 'CTR-');
    const contract = await tx.rentalContract.create({
      data: {
        organizationId, branchId: d.branchId, number, kind: d.kind, status: d.status, customerId: d.customerId,
        reservationId: d.reservationId ?? null, startAt: d.startAt, endAt: d.endAt,
        totalAmount: d.totalAmount !== undefined && d.totalAmount !== null ? centsToDecimalString(toCents(d.totalAmount)) : null,
        quote: (d.quote ?? undefined) as Prisma.InputJsonValue | undefined,
        monthlyAmount: d.monthlyAmount ? centsToDecimalString(toCents(d.monthlyAmount)) : null,
        termMonths: d.termMonths ?? null, billingDay: d.billingDay ?? null, adjustmentIndex: d.adjustmentIndex ?? null,
        kmAllowance: d.kmAllowance ?? null, kmAllowancePeriod: d.kmAllowancePeriod ?? null,
        extraKmRate: d.extraKmRate !== null && d.extraKmRate !== undefined ? centsToDecimalString(toCents(d.extraKmRate)) : null,
        lateFeePercent: d.lateFeePercent, monthlyInterestPercent: d.monthlyInterestPercent,
        depositRequired: centsToDecimalString(toCents(d.depositRequired)), includedServices: d.includedServices ?? [],
        terms: d.terms ?? null, createdById: ctx.userId,
        ...(d.status === 'APPROVED' ? { approvedById: ctx.userId, approvedAt: new Date() } : {}),
      },
    });
    if (d.extras?.length) {
      await tx.contractExtra.createMany({
        data: d.extras.map((e) => ({ organizationId, contractId: contract.id, name: e.name, pricing: e.pricing, price: centsToDecimalString(toCents(e.price)), quantity: e.quantity })),
      });
    }
    const cv = await tx.contractVehicle.create({
      data: { organizationId, contractId: contract.id, vehicleUnitId: d.vehicleUnitId, startAt: d.startAt, reason: 'Veículo inicial' },
    });
    await tx.contractDriver.create({
      data: { organizationId, contractId: contract.id, driverId: d.driverId, primary: true, startAt: d.startAt, reason: 'Motorista principal' },
    });
    if (d.reservationAllocationId) {
      // Retirada: o bloco da reserva vira o bloco do contrato, sem janela em
      // que o carro fique livre na agenda.
      await tx.vehicleAllocation.update({
        where: { id: d.reservationAllocationId },
        data: { kind: 'CONTRACT', contractVehicleId: cv.id, reason: `Contrato ${number}` },
      });
    } else {
      await this.availability.allocate(tx, organizationId, {
        vehicleUnitId: d.vehicleUnitId, kind: 'CONTRACT', startsAt: d.startAt, endsAt: d.endAt,
        contractVehicleId: cv.id, reason: `Contrato ${number}`, createdById: ctx.userId,
      });
    }
    await this.deposits.ensureDeposit(tx, contract);
    await this.newVersion(tx, ctx, contract.id, d.versionReason);
    await this.audit.record(tx, ctx, {
      action: 'contract.created', entityType: 'RentalContract', entityId: contract.id, branchId: d.branchId,
      after: { number, kind: d.kind, status: d.status, totalAmount: d.totalAmount ?? null, monthlyAmount: d.monthlyAmount ?? null, vehicleUnitId: d.vehicleUnitId, customerId: d.customerId },
    });
    return contract;
  }

  /* ================= Fluxo de aprovação ================= */

  async submit(ctx: OrgContext, id: string) {
    return this.transition(ctx, id, ['DRAFT'], 'PENDING_APPROVAL', 'Enviado para aprovação');
  }

  async approve(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(c.status)) throw new ConflictException('Só propostas podem ser aprovadas.');
      const value = c.kind === 'PERIOD' ? num(c.totalAmount) : num(c.monthlyAmount) * (c.termMonths ?? 1);
      assertApprovalLimit(ctx, value, 'este contrato');
      await tx.rentalContract.update({ where: { id }, data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date() } });
      await this.newVersion(tx, ctx, id, 'Contrato aprovado');
      await this.audit.record(tx, ctx, { action: 'contract.approved', entityType: 'RentalContract', entityId: id, branchId: c.branchId, before: { status: c.status }, after: { status: 'APPROVED', value } });
      return { id, status: 'APPROVED' };
    });
  }

  /** Cancela antes da entrega: libera a agenda e fecha os intervalos. */
  async cancel(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(c.status)) throw new ConflictException('Contrato em vigor se encerra ou rescinde; não se cancela.');
      const vehicles = await tx.contractVehicle.findMany({ where: { contractId: id, endAt: null } });
      for (const cv of vehicles) {
        const alloc = await tx.vehicleAllocation.findFirst({ where: { contractVehicleId: cv.id, active: true } });
        if (alloc) await this.availability.release(tx, alloc.id);
        await tx.contractVehicle.update({ where: { id: cv.id }, data: { endAt: maxDate(cv.startAt, new Date()), reason: `${cv.reason ?? ''} · Cancelado`.slice(0, 300) } });
      }
      const drivers = await tx.contractDriver.findMany({ where: { contractId: id, endAt: null } });
      for (const cd of drivers) await tx.contractDriver.update({ where: { id: cd.id }, data: { endAt: maxDate(cd.startAt, new Date()) } });
      await tx.rentalContract.update({ where: { id }, data: { status: 'CANCELLED', closeReason: reason, closedById: ctx.userId } });
      if (c.reservationId) await tx.reservation.update({ where: { id: c.reservationId }, data: { status: 'CANCELLED', cancelReason: `Contrato ${c.number} cancelado: ${reason}`.slice(0, 500), cancelledAt: new Date() } });
      const dep = await tx.securityDeposit.findUnique({ where: { contractId: id } });
      if (dep) await this.deposits.recompute(tx, dep.id);
      for (const cv of vehicles) await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, cv.vehicleUnitId);
      await this.newVersion(tx, ctx, id, `Cancelado: ${reason}`);
      await this.audit.record(tx, ctx, { action: 'contract.cancelled', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason, before: { status: c.status }, after: { status: 'CANCELLED' } });
      return { id, status: 'CANCELLED' };
    });
  }

  /* ================= Entrega ================= */

  /**
   * Entrega do veículo. Só acontece com vistoria de entrega concluída,
   * CNH válida e caução recebido (ou dispensa explícita e auditada).
   */
  async activate(ctx: OrgContext, id: string, dto: ActivateDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (c.status !== 'APPROVED') throw new ConflictException('Só contrato aprovado pode ter o veículo entregue.');
      const cv = await this.openVehicle(tx, id);
      const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: cv.vehicleUnitId } });
      await this.availability.assertRentable(tx, vehicle.id);
      if (vehicle.operationalStatus !== 'RELEASED') {
        throw new ConflictException('O veículo precisa estar liberado para a entrega (situação operacional "Liberado").');
      }
      const delivery = await this.findInspection(tx, id, vehicle.id, 'DELIVERY');
      if (!delivery) {
        throw new ConflictException('Faça e conclua a vistoria de entrega deste veículo, vinculada ao contrato, antes de entregar.');
      }
      const driver = await tx.contractDriver.findFirst({ where: { contractId: id, endAt: null, primary: true } });
      if (!driver) throw new ConflictException('O contrato não tem motorista principal.');
      await this.assertDriver(tx, ctx.organizationId, driver.driverId, c.endAt, true);

      const required = num(c.depositRequired);
      if (required > 0) {
        const dep = await this.deposits.contractBalance(tx, id);
        if (toCents(dep?.balance.available ?? 0) < toCents(required)) {
          if (!dto.waiveDeposit) throw new ConflictException(`Caução de R$ ${required.toFixed(2).replace('.', ',')} ainda não recebido integralmente.`);
          assertCan(ctx, 'deposits.approve');
          if (!dto.waiveReason) throw new BadRequestException('Informe o motivo da entrega sem caução integral.');
          await this.audit.record(tx, ctx, { action: 'contract.deposit_waived', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.waiveReason, after: { required, received: dep?.balance.received ?? 0 } });
        }
      }

      const now = new Date();
      const allocation = await tx.vehicleAllocation.findFirst({ where: { contractVehicleId: cv.id, active: true } });
      if (allocation && now < allocation.startsAt) {
        // Entrega antecipada: a agenda passa a começar agora, se o carro estiver livre.
        await this.moveAllocationStart(tx, allocation.id, now);
      }
      await tx.contractVehicle.update({ where: { id: cv.id }, data: { startAt: now, startKm: delivery.odometerKm ?? vehicle.odometerKm } });
      await tx.contractDriver.update({ where: { id: driver.id }, data: { startAt: now } });
      if (delivery.odometerKm !== null) await this.timeline.odometer(tx, ctx, ctx.organizationId, vehicle.id, delivery.odometerKm, 'CONTRACT', id);
      await tx.rentalContract.update({ where: { id }, data: { status: 'ACTIVE', actualStartAt: now } });

      if (c.kind === 'PERIOD' && num(c.totalAmount) > 0) {
        const existing = await tx.receivable.findFirst({ where: { contractId: id, kind: 'RENTAL', competence: null, status: { not: 'CANCELLED' } } });
        if (!existing) {
          await tx.receivable.create({
            data: {
              organizationId: ctx.organizationId, branchId: c.branchId, customerId: c.customerId, contractId: id, vehicleUnitId: vehicle.id,
              kind: 'RENTAL', description: `Locação — contrato ${c.number}`, amount: centsToDecimalString(toCents(num(c.totalAmount))),
              dueDate: dateOnly(dto.dueDate), createdById: ctx.userId,
            },
          });
        }
      } else if (c.kind === 'LONG_TERM') {
        await generateDueInstallments(tx, ctx.organizationId, 35, id);
      }

      const driverRow = await tx.driver.findUniqueOrThrow({ where: { id: driver.driverId } });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'CONTRACT_STARTED', title: `Entregue no contrato ${c.number}`,
        description: `Hodômetro ${delivery.odometerKm ?? vehicle.odometerKm} km · vistoria ${delivery.number}`, refType: 'RentalContract', refId: id,
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'DRIVER_LINKED', title: `Motorista vinculado: ${driverRow.name}`, refType: 'RentalContract', refId: id,
      });
      await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, vehicle.id);
      await this.newVersion(tx, ctx, id, 'Veículo entregue');
      await this.audit.record(tx, ctx, { action: 'contract.activated', entityType: 'RentalContract', entityId: id, branchId: c.branchId, before: { status: 'APPROVED' }, after: { status: 'ACTIVE', inspectionId: delivery.id } });
      return { id, status: 'ACTIVE' };
    });
  }

  /* ================= Trocas ================= */

  /** Troca de motorista: o vínculo anterior é encerrado, um novo é criado. */
  async swapDriver(ctx: OrgContext, id: string, dto: SwapDriverDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (FINISHED.includes(c.status)) throw new ConflictException('Contrato encerrado.');
      const current = await tx.contractDriver.findFirst({ where: { contractId: id, endAt: null, primary: true }, include: { driver: true } });
      if (current?.driverId === dto.driverId) throw new BadRequestException('Este já é o motorista principal.');
      await this.assertDriver(tx, ctx.organizationId, dto.driverId, c.endAt, c.status === 'ACTIVE');
      if (dto.inspectionId) {
        const insp = await tx.inspection.findFirst({ where: { id: dto.inspectionId, contractId: id, type: 'DRIVER_CHANGE', status: { in: ['COMPLETED', 'APPROVED'] } } });
        if (!insp) throw new BadRequestException('Vistoria de troca de motorista inválida ou não concluída.');
      }
      const now = new Date();
      const at = c.status === 'ACTIVE' ? now : maxDate(current?.startAt ?? c.startAt, now);
      if (current) await tx.contractDriver.update({ where: { id: current.id }, data: { endAt: maxDate(current.startAt, at), reason: `${current.reason ?? ''} · Substituído: ${dto.reason}`.slice(0, 300) } });
      const next = await tx.contractDriver.create({
        data: { organizationId: ctx.organizationId, contractId: id, driverId: dto.driverId, primary: true, startAt: c.status === 'ACTIVE' ? at : current?.startAt ?? c.startAt, reason: dto.reason },
      });
      const newDriver = await tx.driver.findUniqueOrThrow({ where: { id: dto.driverId } });
      const cv = await tx.contractVehicle.findFirst({ where: { contractId: id, endAt: null } });
      if (cv) {
        await this.timeline.record(tx, ctx, ctx.organizationId, {
          vehicleUnitId: cv.vehicleUnitId, type: 'DRIVER_CHANGED',
          title: `Motorista trocado: ${current?.driver.name ?? '—'} → ${newDriver.name}`, description: dto.reason, refType: 'RentalContract', refId: id,
        });
      }
      await this.newVersion(tx, ctx, id, `Troca de motorista: ${dto.reason}`);
      await this.audit.record(tx, ctx, { action: 'contract.driver_changed', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.reason, before: { driverId: current?.driverId ?? null }, after: { driverId: dto.driverId, contractDriverId: next.id, inspectionId: dto.inspectionId ?? null } });
      return { id, contractDriverId: next.id };
    });
  }

  /**
   * Troca de veículo. Em vigor, exige vistoria de devolução do carro que
   * sai e de entrega do que entra; o intervalo antigo é fechado com o km de
   * devolução e um novo é aberto — o histórico mostra os dois.
   */
  async swapVehicle(ctx: OrgContext, id: string, dto: SwapVehicleDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (FINISHED.includes(c.status)) throw new ConflictException('Contrato encerrado.');
      const old = await this.openVehicle(tx, id);
      if (old.vehicleUnitId === dto.newVehicleUnitId) throw new BadRequestException('Escolha um veículo diferente do atual.');
      const next = await tx.vehicleUnit.findUnique({ where: { id: dto.newVehicleUnitId } });
      if (!next || next.deletedAt) throw new BadRequestException('Veículo inválido.');
      if (!ctx.allBranches && !ctx.branchIds.includes(next.branchId)) throw new ForbiddenException('Sem acesso à filial do novo veículo.');
      await this.availability.assertRentable(tx, next.id);
      const oldAlloc = await tx.vehicleAllocation.findFirst({ where: { contractVehicleId: old.id, active: true } });
      const now = new Date();

      if (c.status !== 'ACTIVE') {
        // Antes da entrega: só troca a reserva da agenda.
        if (oldAlloc) await this.availability.release(tx, oldAlloc.id);
        await tx.contractVehicle.update({ where: { id: old.id }, data: { endAt: old.startAt, reason: `${old.reason ?? ''} · Substituído antes da entrega: ${dto.reason}`.slice(0, 300) } });
        const cv = await tx.contractVehicle.create({ data: { organizationId: ctx.organizationId, contractId: id, vehicleUnitId: next.id, startAt: c.startAt, reason: dto.reason } });
        await this.availability.allocate(tx, ctx.organizationId, { vehicleUnitId: next.id, kind: 'CONTRACT', startsAt: c.startAt, endsAt: c.endAt, contractVehicleId: cv.id, reason: `Contrato ${c.number}`, createdById: ctx.userId });
      } else {
        if (now >= c.endAt) throw new ConflictException('O contrato já passou do fim previsto. Prorrogue antes de trocar o veículo.');
        if (next.operationalStatus !== 'RELEASED') throw new ConflictException('O novo veículo precisa estar liberado.');
        const ret = await this.findInspection(tx, id, old.vehicleUnitId, 'RETURN', old.startAt);
        if (!ret) throw new ConflictException('Conclua a vistoria de devolução do veículo atual, vinculada ao contrato.');
        const del = await this.findInspection(tx, id, next.id, 'DELIVERY', old.startAt);
        if (!del) throw new ConflictException('Conclua a vistoria de entrega do novo veículo, vinculada ao contrato.');
        await tx.contractVehicle.update({ where: { id: old.id }, data: { endAt: now, endKm: ret.odometerKm, reason: `${old.reason ?? ''} · Troca: ${dto.reason}`.slice(0, 300) } });
        if (oldAlloc) await this.availability.truncate(tx, ctx.organizationId, oldAlloc.id, now);
        const cv = await tx.contractVehicle.create({ data: { organizationId: ctx.organizationId, contractId: id, vehicleUnitId: next.id, startAt: now, startKm: del.odometerKm, reason: dto.reason } });
        await this.availability.allocate(tx, ctx.organizationId, { vehicleUnitId: next.id, kind: 'CONTRACT', startsAt: now, endsAt: c.endAt, contractVehicleId: cv.id, reason: `Contrato ${c.number}`, createdById: ctx.userId });
        if (ret.odometerKm !== null) await this.timeline.odometer(tx, ctx, ctx.organizationId, old.vehicleUnitId, ret.odometerKm, 'CONTRACT', id);
        if (del.odometerKm !== null) await this.timeline.odometer(tx, ctx, ctx.organizationId, next.id, del.odometerKm, 'CONTRACT', id);
        await this.timeline.record(tx, ctx, ctx.organizationId, { vehicleUnitId: old.vehicleUnitId, type: 'CONTRACT_ENDED', title: `Saiu do contrato ${c.number} (troca de veículo)`, description: dto.reason, refType: 'RentalContract', refId: id });
        await this.timeline.record(tx, ctx, ctx.organizationId, { vehicleUnitId: next.id, type: 'CONTRACT_STARTED', title: `Entrou no contrato ${c.number} (troca de veículo)`, description: dto.reason, refType: 'RentalContract', refId: id });
      }
      await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, old.vehicleUnitId);
      await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, next.id);
      await this.newVersion(tx, ctx, id, `Troca de veículo (${formatPlate((await tx.vehicleUnit.findUniqueOrThrow({ where: { id: old.vehicleUnitId } })).plate)} → ${formatPlate(next.plate)}): ${dto.reason}`);
      await this.audit.record(tx, ctx, { action: 'contract.vehicle_changed', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.reason, before: { vehicleUnitId: old.vehicleUnitId }, after: { vehicleUnitId: next.id } });
      return { id };
    });
  }

  /* ================= Alterações ================= */

  /** Prorrogação: a agenda estende só se o carro estiver livre depois. */
  async extend(ctx: OrgContext, id: string, dto: ExtendDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (!['APPROVED', 'ACTIVE'].includes(c.status)) throw new ConflictException('Só contrato aprovado ou em vigor pode ser prorrogado.');
      let newEnd: Date;
      if (c.kind === 'LONG_TERM') {
        if (!dto.additionalMonths) throw new BadRequestException('Informe os meses adicionais.');
        newEnd = addMonths(c.endAt, dto.additionalMonths);
      } else {
        if (!dto.newEndAt) throw new BadRequestException('Informe a nova data de devolução.');
        newEnd = new Date(dto.newEndAt);
      }
      if (newEnd <= c.endAt) throw new BadRequestException('A nova data precisa ser posterior ao fim atual.');
      const cv = await this.openVehicle(tx, id);
      const alloc = await tx.vehicleAllocation.findFirst({ where: { contractVehicleId: cv.id, active: true } });
      if (alloc) await this.availability.extend(tx, ctx.organizationId, alloc.id, newEnd);

      const data: Prisma.RentalContractUpdateInput = { endAt: newEnd };
      let additional = 0;
      if (c.kind === 'LONG_TERM') {
        data.termMonths = (c.termMonths ?? 0) + dto.additionalMonths!;
      } else {
        const input = (c.quote as { input?: { categoryId: string; extras?: { extraServiceId: string; quantity: number }[]; additionalDrivers?: number; discountPercent?: number } } | null)?.input;
        const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: cv.vehicleUnitId } });
        const quote = await this.pricing.quote(tx, ctx.organizationId, {
          categoryId: input?.categoryId ?? vehicle.categoryId, branchId: c.branchId, startAt: c.startAt, endAt: newEnd,
          extras: input?.extras, additionalDrivers: input?.additionalDrivers, discountPercent: input?.discountPercent,
        });
        additional = Math.max(0, fromCents(toCents(quote.total) - toCents(num(c.totalAmount))));
        data.totalAmount = centsToDecimalString(toCents(num(c.totalAmount)) + toCents(additional));
        data.quote = quoteJson(quote, input ?? { categoryId: vehicle.categoryId }) as Prisma.InputJsonValue;
        if (quote.includedKm !== null) data.kmAllowance = quote.includedKm;
        if (c.status === 'ACTIVE' && additional > 0) {
          await tx.receivable.create({
            data: {
              organizationId: ctx.organizationId, branchId: c.branchId, customerId: c.customerId, contractId: id, vehicleUnitId: cv.vehicleUnitId,
              kind: 'RENTAL', description: `Prorrogação até ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(newEnd)} — contrato ${c.number}`,
              amount: centsToDecimalString(toCents(additional)), dueDate: todayDate(), competence: `ext-${c.currentVersion + 1}`, createdById: ctx.userId,
            },
          });
        }
      }
      await tx.rentalContract.update({ where: { id }, data });
      await this.newVersion(tx, ctx, id, `Prorrogação: ${dto.reason}`);
      await this.audit.record(tx, ctx, { action: 'contract.extended', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.reason, before: { endAt: c.endAt, totalAmount: c.totalAmount }, after: { endAt: newEnd, additional } });
      return { id, endAt: newEnd, additional };
    });
  }

  /** Aditivo: valores exigem `contracts.price_override`; condições, `contracts.edit`. */
  async amend(ctx: OrgContext, id: string, dto: AmendDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (FINISHED.includes(c.status)) throw new ConflictException('Contrato encerrado não recebe aditivo.');
      const valueFields = [dto.monthlyAmount, dto.totalAmount, dto.extraKmRate, dto.depositRequired, dto.kmAllowance, dto.lateFeePercent, dto.monthlyInterestPercent];
      if (valueFields.some((v) => v !== undefined)) assertCan(ctx, 'contracts.price_override');
      if (dto.monthlyAmount !== undefined && c.kind !== 'LONG_TERM') throw new BadRequestException('Mensalidade só existe em contrato de longo prazo.');
      if (dto.totalAmount !== undefined && c.kind !== 'PERIOD') throw new BadRequestException('Valor total só se aplica a contrato por período.');
      if (dto.totalAmount !== undefined && c.status === 'ACTIVE') throw new ConflictException('Com o contrato em vigor, ajuste o valor por título avulso ou desconto no título.');
      const data: Prisma.RentalContractUpdateInput = {
        ...(dto.monthlyAmount !== undefined ? { monthlyAmount: centsToDecimalString(toCents(dto.monthlyAmount)) } : {}),
        ...(dto.totalAmount !== undefined ? { totalAmount: centsToDecimalString(toCents(dto.totalAmount)) } : {}),
        ...(dto.kmAllowance !== undefined ? { kmAllowance: dto.kmAllowance } : {}),
        ...(dto.extraKmRate !== undefined ? { extraKmRate: centsToDecimalString(toCents(dto.extraKmRate)) } : {}),
        ...(dto.depositRequired !== undefined ? { depositRequired: centsToDecimalString(toCents(dto.depositRequired)) } : {}),
        ...(dto.lateFeePercent !== undefined ? { lateFeePercent: dto.lateFeePercent } : {}),
        ...(dto.monthlyInterestPercent !== undefined ? { monthlyInterestPercent: dto.monthlyInterestPercent } : {}),
        ...(dto.includedServices !== undefined ? { includedServices: dto.includedServices } : {}),
        ...(dto.terms !== undefined ? { terms: dto.terms } : {}),
        ...(dto.adjustmentIndex !== undefined ? { adjustmentIndex: dto.adjustmentIndex } : {}),
        ...(dto.nextAdjustmentAt !== undefined ? { nextAdjustmentAt: dateOnly(dto.nextAdjustmentAt) } : {}),
      };
      if (!Object.keys(data).length) throw new BadRequestException('Nada para alterar.');
      const updated = await tx.rentalContract.update({ where: { id }, data });
      if (dto.depositRequired !== undefined) await this.deposits.ensureDeposit(tx, updated);
      await this.newVersion(tx, ctx, id, `Aditivo: ${dto.reason}`);
      await this.audit.record(tx, ctx, { action: 'contract.amended', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.reason, ...AuditService.diff(c as never, data as never) });
      return { id, version: updated.currentVersion + 1 };
    });
  }

  /** Renovação: um contrato novo, ligado ao anterior, começando onde ele termina. */
  async renew(ctx: OrgContext, id: string, dto: RenewDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (c.kind !== 'LONG_TERM' || c.status !== 'ACTIVE') throw new ConflictException('Só contrato de longo prazo em vigor pode ser renovado.');
      if (await tx.rentalContract.findFirst({ where: { renewedFromId: id, status: { notIn: ['CANCELLED'] } } })) throw new ConflictException('Este contrato já tem renovação.');
      if (dto.monthlyAmount !== undefined && toCents(dto.monthlyAmount) !== toCents(num(c.monthlyAmount))) assertCan(ctx, 'contracts.price_override');
      const cv = await this.openVehicle(tx, id);
      const driver = await tx.contractDriver.findFirst({ where: { contractId: id, endAt: null, primary: true } });
      // O carro continua com o mesmo cliente: sem tempo de preparo entre um
      // contrato e o outro, para a renovação caber na agenda.
      const alloc = await tx.vehicleAllocation.findFirst({ where: { contractVehicleId: cv.id, active: true } });
      if (alloc) await tx.vehicleAllocation.update({ where: { id: alloc.id }, data: { blockedUntil: alloc.endsAt } });
      const renewed = await this.insert(tx, ctx, {
        kind: 'LONG_TERM', status: 'DRAFT', branchId: c.branchId, customerId: c.customerId, driverId: driver!.driverId,
        vehicleUnitId: cv.vehicleUnitId, startAt: c.endAt, endAt: addMonths(c.endAt, dto.termMonths),
        quote: c.quote as Record<string, unknown> | null, monthlyAmount: dto.monthlyAmount ?? num(c.monthlyAmount), termMonths: dto.termMonths,
        billingDay: c.billingDay, adjustmentIndex: c.adjustmentIndex, kmAllowance: c.kmAllowance, kmAllowancePeriod: c.kmAllowancePeriod,
        extraKmRate: numOrNull(c.extraKmRate), depositRequired: 0, lateFeePercent: num(c.lateFeePercent),
        monthlyInterestPercent: num(c.monthlyInterestPercent), includedServices: c.includedServices, terms: c.terms,
        versionReason: `Renovação do contrato ${c.number}: ${dto.reason}`,
      });
      await tx.rentalContract.update({ where: { id: renewed.id }, data: { renewedFromId: id } });
      await this.audit.record(tx, ctx, { action: 'contract.renewed', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.reason, after: { renewedContractId: renewed.id, number: renewed.number } });
      return renewed;
    });
  }

  /* ================= Encerramento ================= */

  async close(ctx: OrgContext, id: string, dto: CloseDto) {
    return this.finish(ctx, id, dto, 'CLOSED');
  }

  async terminate(ctx: OrgContext, id: string, dto: TerminateDto) {
    return this.finish(ctx, id, dto, 'TERMINATED');
  }

  /**
   * Devolução e prestação de contas. Diárias de atraso e km excedente saem
   * das funções do domínio compartilhado com os números das vistorias de
   * entrega e devolução; cada cobrança vira um título próprio.
   */
  private async finish(ctx: OrgContext, id: string, dto: CloseDto & Partial<TerminateDto>, status: 'CLOSED' | 'TERMINATED') {
    if (dto.waiveExtras) assertCan(ctx, 'contracts.price_override');
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (c.status !== 'ACTIVE') throw new ConflictException('Só contrato em vigor pode ser encerrado ou rescindido.');
      const cv = await this.openVehicle(tx, id);
      const ret = await this.findInspection(tx, id, cv.vehicleUnitId, 'RETURN', cv.startAt);
      if (!ret && !(status === 'TERMINATED' && dto.vehicleNotReturned)) {
        throw new ConflictException('Conclua a vistoria de devolução do veículo, vinculada ao contrato, antes de encerrar.');
      }
      const returnAt = ret?.completedAt ?? new Date();
      const settings = orgSettings((await tx.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }))?.settings);
      const quote = (c.quote ?? {}) as { rateTableId?: string; includedKm?: number | null; extraKmRate?: number | null; billableDays?: number; lateGraceMinutes?: number };
      const rate = quote.rateTableId ? await tx.rateTable.findUnique({ where: { id: quote.rateTableId } }) : null;
      const grace = rate?.lateGraceMinutes ?? quote.lateGraceMinutes ?? 60;

      // Diárias de atraso
      const late = lateDays(c.endAt, returnAt, grace);
      const dailyValue = c.kind === 'PERIOD'
        ? (rate ? num(rate.dailyRate) : quote.billableDays ? num(c.totalAmount) / quote.billableDays : 0)
        : num(c.monthlyAmount) / 30;
      const lateAmount = fromCents(Math.round(late * toCents(dailyValue)));

      // Quilometragem: soma de todos os intervalos de veículo do contrato
      const intervals = await tx.contractVehicle.findMany({ where: { contractId: id } });
      let driven = 0;
      let missingKm = false;
      for (const i of intervals) {
        const end = i.id === cv.id ? ret?.odometerKm ?? null : i.endKm;
        if (i.startKm === null || end === null) {
          if (!(i.endAt && i.endAt.getTime() === i.startAt.getTime())) missingKm = true;
          continue;
        }
        driven += Math.max(0, end - i.startKm);
      }
      const start = c.actualStartAt ?? c.startAt;
      const months = Math.max(1, Math.ceil((returnAt.getTime() - start.getTime()) / (30 * DAY_MS)));
      const included = c.kmAllowance === null ? null : c.kmAllowancePeriod === 'MONTH' ? c.kmAllowance * months : c.kmAllowance;
      const extraKm = missingKm ? { extraKm: 0, amount: 0 } : extraKmCharge(driven, included, numOrNull(c.extraKmRate));

      const charges: { kind: 'FEE' | 'DAMAGE'; description: string; amount: number }[] = [];
      if (!dto.waiveExtras && late > 0 && lateAmount > 0) charges.push({ kind: 'FEE', description: `Diárias por atraso na devolução (${late}) — contrato ${c.number}`, amount: lateAmount });
      if (!dto.waiveExtras && extraKm.amount > 0) charges.push({ kind: 'FEE', description: `Quilometragem excedente (${extraKm.extraKm} km) — contrato ${c.number}`, amount: extraKm.amount });
      if (dto.fuelCharge) charges.push({ kind: 'FEE', description: `Combustível — contrato ${c.number}`, amount: dto.fuelCharge });
      for (const dmg of dto.damages ?? []) charges.push({ kind: 'DAMAGE', description: `Avaria: ${dmg.description} — contrato ${c.number}`, amount: dmg.amount });
      if (status === 'TERMINATED' && dto.penaltyAmount) charges.push({ kind: 'FEE', description: `Multa rescisória — contrato ${c.number}`, amount: dto.penaltyAmount });
      const due = dateOnly(dto.dueDate);
      for (const ch of charges) {
        await tx.receivable.create({
          data: {
            organizationId: ctx.organizationId, branchId: c.branchId, customerId: c.customerId, contractId: id, vehicleUnitId: cv.vehicleUnitId,
            kind: ch.kind, description: ch.description.slice(0, 200), amount: centsToDecimalString(toCents(ch.amount)), dueDate: due, createdById: ctx.userId,
          },
        });
      }

      // Longo prazo devolvido antes do fim: mensalidades futuras sem pagamento são canceladas.
      if (c.kind === 'LONG_TERM') {
        await tx.receivable.updateMany({
          where: { contractId: id, kind: 'MONTHLY', status: 'OPEN', paidAmount: 0, dueDate: { gt: dateOnly(returnAt.toISOString()) } },
          data: { status: 'CANCELLED', cancelReason: `Contrato ${status === 'CLOSED' ? 'encerrado' : 'rescindido'} em ${isoDateInZone(returnAt)}` },
        });
      }

      await tx.contractVehicle.update({ where: { id: cv.id }, data: { endAt: maxDate(cv.startAt, returnAt), endKm: ret?.odometerKm ?? null } });
      await tx.contractDriver.updateMany({ where: { contractId: id, endAt: null }, data: { endAt: maxDate(c.actualStartAt ?? c.startAt, returnAt) } });
      const alloc = await tx.vehicleAllocation.findFirst({ where: { contractVehicleId: cv.id, active: true } });
      if (alloc) {
        if (returnAt <= alloc.endsAt) await this.availability.truncate(tx, ctx.organizationId, alloc.id, returnAt);
        else await this.availability.extend(tx, ctx.organizationId, alloc.id, returnAt).catch(() => undefined);
      }
      if (ret?.odometerKm !== null && ret?.odometerKm !== undefined) await this.timeline.odometer(tx, ctx, ctx.organizationId, cv.vehicleUnitId, ret.odometerKm, 'CONTRACT', id);

      const settlement = {
        returnAt: returnAt.toISOString(), returnInspectionId: ret?.id ?? null, lateDays: late, lateAmount: dto.waiveExtras ? 0 : lateAmount,
        drivenKm: missingKm ? null : driven, includedKm: included, extraKm: extraKm.extraKm, extraKmAmount: dto.waiveExtras ? 0 : extraKm.amount,
        fuelCharge: dto.fuelCharge ?? 0, damages: dto.damages ?? [], penaltyAmount: dto.penaltyAmount ?? 0,
        waivedExtras: Boolean(dto.waiveExtras), vehicleNotReturned: Boolean(dto.vehicleNotReturned), notes: dto.notes ?? null,
        total: fromCents(charges.reduce((a, ch) => a + toCents(ch.amount), 0)),
        warnings: missingKm ? ['Quilometragem incompleta em algum intervalo: km excedente não calculado.'] : [],
        lateFeePercentDefault: settings.lateFeePercent,
      };
      await tx.rentalContract.update({
        where: { id },
        data: {
          status, actualEndAt: returnAt, closedById: ctx.userId, closeReason: dto.reason ?? dto.notes ?? null,
          finalSettlement: settlement as unknown as Prisma.InputJsonValue,
        },
      });
      const dep = await tx.securityDeposit.findUnique({ where: { contractId: id } });
      if (dep) await this.deposits.recompute(tx, dep.id);
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: cv.vehicleUnitId, type: 'CONTRACT_ENDED',
        title: `${status === 'CLOSED' ? 'Devolvido — contrato encerrado' : 'Contrato rescindido'} ${c.number}`,
        description: ret ? `Hodômetro ${ret.odometerKm ?? '—'} km · vistoria ${ret.number}` : 'Sem vistoria de devolução (veículo não devolvido).',
        refType: 'RentalContract', refId: id,
      });
      await this.vehicleStatus.recomputeCommercial(tx, ctx, ctx.organizationId, cv.vehicleUnitId);
      await this.newVersion(tx, ctx, id, status === 'CLOSED' ? 'Encerrado com devolução' : `Rescindido: ${dto.reason}`);
      await this.audit.record(tx, ctx, { action: status === 'CLOSED' ? 'contract.closed' : 'contract.terminated', entityType: 'RentalContract', entityId: id, branchId: c.branchId, reason: dto.reason ?? null, before: { status: 'ACTIVE' }, after: settlement });
      return { id, status, settlement };
    });
  }

  /* ================= Assinatura ================= */

  /** Contrato assinado em papel: só com o documento digitalizado anexado. */
  async signPhysical(ctx: OrgContext, id: string, fileId: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      const file = await tx.fileAsset.findFirst({ where: { id: fileId, entityType: 'RentalContract', entityId: id, category: 'contrato_assinado', deletedAt: null } });
      if (!file) throw new BadRequestException('Anexe o contrato assinado digitalizado (tipo "Contrato assinado") antes de registrar a assinatura.');
      await tx.rentalContract.update({ where: { id }, data: { signatureStatus: 'SIGNED_PHYSICAL', signedAt: new Date() } });
      await this.newVersion(tx, ctx, id, 'Assinatura em papel registrada');
      await this.audit.record(tx, ctx, { action: 'contract.signed_physical', entityType: 'RentalContract', entityId: id, branchId: c.branchId, after: { fileId, sha256: file.sha256 } });
      return { id, signatureStatus: 'SIGNED_PHYSICAL' };
    });
  }

  signElectronic(): never {
    throw new ServiceUnavailableException({
      code: 'not_configured',
      message: 'Assinatura eletrônica pendente de configuração: nenhum provedor de assinatura está integrado. Use a assinatura em papel com o documento digitalizado.',
    });
  }

  /* ================= Documento ================= */

  async document(ctx: OrgContext, id: string): Promise<string> {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.load(tx, ctx, id);
      const c = await tx.rentalContract.findUniqueOrThrow({
        where: { id },
        include: {
          customer: true, extras: true, versions: { orderBy: { version: 'asc' }, select: { version: true, reason: true, createdAt: true } },
          vehicles: { orderBy: { startAt: 'asc' }, include: { vehicle: { include: { model: { include: { make: true } } } } } },
          drivers: { orderBy: { startAt: 'asc' }, include: { driver: true } },
        },
      });
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: c.branchId } });
      return renderContractHtml(c, org, branch);
    });
  }

  /* ================= Auxiliares ================= */

  async load(tx: Tx, ctx: OrgContext, id: string) {
    const c = await tx.rentalContract.findFirst({ where: { id, ...branchWhere(ctx) } });
    if (!c) throw new NotFoundException('Contrato não encontrado.');
    return c;
  }

  private async transition(ctx: OrgContext, id: string, from: ContractStatus[], to: ContractStatus, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.load(tx, ctx, id);
      if (!from.includes(c.status)) throw new ConflictException('Transição de situação não permitida.');
      await tx.rentalContract.update({ where: { id }, data: { status: to } });
      await this.newVersion(tx, ctx, id, reason);
      await this.audit.record(tx, ctx, { action: `contract.${to.toLowerCase()}`, entityType: 'RentalContract', entityId: id, branchId: c.branchId, before: { status: c.status }, after: { status: to } });
      return { id, status: to };
    });
  }

  private async openVehicle(tx: Tx, contractId: string) {
    const cv = await tx.contractVehicle.findFirst({ where: { contractId, endAt: null } });
    if (!cv) throw new ConflictException('O contrato não tem veículo vinculado em aberto.');
    return cv;
  }

  /** Vistoria concluída do tipo pedido, do contrato e do carro, depois de `since`. */
  async findInspection(tx: Tx, contractId: string, vehicleUnitId: string, type: 'DELIVERY' | 'RETURN', since?: Date) {
    return tx.inspection.findFirst({
      where: {
        contractId, vehicleUnitId, type, status: { in: ['COMPLETED', 'APPROVED'] },
        ...(since ? { completedAt: { gte: new Date(since.getTime() - DAY_MS) } } : {}),
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  /** CNH: precisa existir e, pela regra da empresa, valer até o fim da locação. */
  private async assertDriver(tx: Tx, organizationId: string, driverId: string, until: Date, strictToday = false) {
    const driver = await tx.driver.findUnique({ where: { id: driverId } });
    if (!driver || !driver.active || driver.anonymizedAt) throw new BadRequestException('Motorista inválido ou inativo.');
    const settings = orgSettings((await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } }))?.settings);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
    if (driver.cnhExpiresAt < todayDate() && (settings.blockExpiredCnh || strictToday)) {
      throw new ConflictException(`A CNH de ${driver.name} venceu em ${fmt(driver.cnhExpiresAt)}.`);
    }
    if (settings.blockExpiredCnh && driver.cnhExpiresAt < dateOnly(until.toISOString())) {
      throw new ConflictException(`A CNH de ${driver.name} vence em ${fmt(driver.cnhExpiresAt)}, antes do fim da locação.`);
    }
    return driver;
  }

  private async moveAllocationStart(tx: Tx, allocationId: string, start: Date) {
    try {
      await tx.$executeRaw`SAVEPOINT move_allocation`;
      await tx.vehicleAllocation.update({ where: { id: allocationId }, data: { startsAt: start } });
      await tx.$executeRaw`RELEASE SAVEPOINT move_allocation`;
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT move_allocation`;
      throw new ConflictException('O veículo ainda está ocupado; a entrega antecipada não cabe na agenda.');
    }
  }

  /** Retrato completo e imutável do contrato, a cada alteração relevante. */
  async newVersion(tx: Tx, ctx: RequestContext, contractId: string, reason: string) {
    const c = await tx.rentalContract.findUniqueOrThrow({
      where: { id: contractId },
      include: {
        extras: { select: { name: true, pricing: true, price: true, quantity: true } },
        vehicles: { orderBy: { startAt: 'asc' }, select: { vehicleUnitId: true, startAt: true, endAt: true, startKm: true, endKm: true, reason: true, vehicle: { select: { plate: true } } } },
        drivers: { orderBy: { startAt: 'asc' }, select: { driverId: true, primary: true, startAt: true, endAt: true, reason: true, driver: { select: { name: true } } } },
      },
    });
    const existing = await tx.contractVersion.aggregate({ where: { contractId }, _max: { version: true } });
    const version = (existing._max.version ?? 0) + 1;
    const { finalSettlement, quote, ...rest } = c;
    const snapshot = JSON.parse(JSON.stringify({ ...rest, quote, finalSettlement }));
    await tx.contractVersion.create({
      data: { organizationId: c.organizationId, contractId, version, reason: reason.slice(0, 500), snapshot, createdById: ctx.userId ?? null },
    });
    await tx.rentalContract.update({ where: { id: contractId }, data: { currentVersion: version } });
    return version;
  }
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

/** Cotação gravada no contrato, com os parâmetros usados para recalcular numa prorrogação. */
export function quoteJson(quote: QuoteResult, input: { categoryId?: string; extras?: { extraServiceId: string; quantity: number }[]; additionalDrivers?: number; discountPercent?: number }) {
  return {
    ...quote,
    input: {
      categoryId: quote.categoryId ?? input.categoryId,
      extras: input.extras ?? [],
      additionalDrivers: input.additionalDrivers ?? 0,
      discountPercent: input.discountPercent ?? 0,
    },
  } as unknown as Record<string, unknown>;
}

/* ---------------- Documento imprimível ---------------- */

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const brl = (v: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(v as never));
const dt = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(d) : '—');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderContractHtml(c: any, org: any, branch: any): string {
  const vehicleRows = c.vehicles.map((v: any) => `<tr><td>${esc(formatPlate(v.vehicle.plate))}</td><td>${esc(`${v.vehicle.model.make.name} ${v.vehicle.model.name}`)}</td><td>${esc(v.vehicle.color)}</td><td>${dt(v.startAt)}</td><td>${v.endAt ? dt(v.endAt) : 'em aberto'}</td></tr>`).join('');
  const driverRows = c.drivers.map((d: any) => `<tr><td>${esc(d.driver.name)}</td><td>${esc(d.driver.cnhNumber)} (${esc(d.driver.cnhCategory)})</td><td>${dt(d.startAt)}</td><td>${d.endAt ? dt(d.endAt) : 'em aberto'}</td></tr>`).join('');
  const extras = c.extras.map((e: any) => `<li>${esc(e.name)} — ${brl(e.price)} ${e.pricing === 'PER_DAY' ? 'por dia' : 'fixo'} × ${e.quantity}</li>`).join('');
  const versions = c.versions.map((v: any) => `<li>Versão ${v.version} — ${dt(v.createdAt)}: ${esc(v.reason)}</li>`).join('');
  const values = c.kind === 'PERIOD'
    ? `<p><strong>Valor total da locação:</strong> ${brl(c.totalAmount)}</p>`
    : `<p><strong>Mensalidade:</strong> ${brl(c.monthlyAmount)} · <strong>Prazo:</strong> ${c.termMonths} meses · <strong>Vencimento:</strong> dia ${c.billingDay}${c.adjustmentIndex ? ` · <strong>Reajuste:</strong> ${esc(c.adjustmentIndex)}` : ''}</p>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato ${esc(c.number)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#101828;max-width:820px;margin:32px auto;padding:0 24px;font-size:13px;line-height:1.55}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#344054}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #d0d5dd;padding:6px 8px;text-align:left}th{background:#f2f4f7}
.head{display:flex;justify-content:space-between;border-bottom:2px solid #0B1220;padding-bottom:12px}.muted{color:#667085}
.sign{display:flex;gap:48px;margin-top:64px}.sign div{flex:1;border-top:1px solid #101828;padding-top:6px;text-align:center}
@media print{body{margin:0}}</style></head><body>
<div class="head"><div><h1>${esc(org.legalName ?? org.name)}</h1><div class="muted">${org.document ? `CNPJ ${esc(org.document)} · ` : ''}${esc(branch.name)}${branch.city ? ` · ${esc(branch.city)}/${esc(branch.state ?? '')}` : ''}</div></div>
<div style="text-align:right"><strong>Contrato ${esc(c.number)}</strong><div class="muted">${c.kind === 'PERIOD' ? 'Locação por período' : 'Locação de longo prazo'} · versão ${c.currentVersion}</div></div></div>
<h2>Partes</h2><p><strong>Locadora:</strong> ${esc(org.legalName ?? org.name)}<br><strong>Locatário:</strong> ${esc(c.customer.name)} — ${c.customer.type === 'PF' ? 'CPF' : 'CNPJ'} ${esc(c.customer.document)}<br>${esc([c.customer.street, c.customer.number, c.customer.district, c.customer.city, c.customer.state].filter(Boolean).join(', '))}</p>
<h2>Vigência</h2><p>De ${dt(c.startAt)} a ${dt(c.endAt)}.</p>
<h2>Veículos</h2><table><tr><th>Placa</th><th>Modelo</th><th>Cor</th><th>Início</th><th>Fim</th></tr>${vehicleRows}</table>
<h2>Condutores</h2><table><tr><th>Nome</th><th>CNH</th><th>Início</th><th>Fim</th></tr>${driverRows}</table>
<h2>Condições comerciais</h2>${values}
<p><strong>Quilometragem:</strong> ${c.kmAllowance ? `${c.kmAllowance} km ${c.kmAllowancePeriod === 'MONTH' ? 'por mês' : 'no período'}` : 'livre'}${c.extraKmRate ? ` · excedente ${brl(c.extraKmRate)}/km` : ''}<br>
<strong>Caução:</strong> ${brl(c.depositRequired)} · <strong>Multa por atraso:</strong> ${num(c.lateFeePercent)}% · <strong>Juros:</strong> ${num(c.monthlyInterestPercent)}% ao mês</p>
${extras ? `<h2>Serviços adicionais</h2><ul>${extras}</ul>` : ''}
${c.includedServices?.length ? `<h2>Serviços incluídos</h2><ul>${c.includedServices.map((s: string) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
${c.terms ? `<h2>Cláusulas</h2><div style="white-space:pre-wrap">${esc(c.terms)}</div>` : ''}
<h2>Histórico de versões</h2><ul>${versions}</ul>
<div class="sign"><div>${esc(org.legalName ?? org.name)}</div><div>${esc(c.customer.name)}</div></div>
<p class="muted" style="margin-top:32px">Documento gerado pelo Norty Car em ${dt(new Date())}.</p>
</body></html>`;
}

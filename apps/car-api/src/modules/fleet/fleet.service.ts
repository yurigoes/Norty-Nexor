import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  COMMERCIAL_STATUS_LABEL, centsToDecimalString, isValidPlate, isValidRenavam, isValidVin, normalizePlate, normalizeVin, onlyDigits,
  OPERATIONAL_STATUS_LABEL, toCents, type CommercialStatus, type OperationalStatus,
} from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { CounterService } from '../../common/counter.service';
import { AvailabilityService } from '../../common/availability.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { assertBranch, branchWhere, type OrgContext } from '../../common/context';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import { numOrNull } from '../../common/serialize.interceptor';
import type {
  AvailabilityQueryDto, BlockDto, CreateVehicleDto, DuplicateQueryDto, RangeQueryDto, TimelineQueryDto, UpdateVehicleDto, VehicleQueryDto,
} from './dto';

const LIST_INCLUDE = {
  model: { select: { id: true, name: true, make: { select: { name: true } } } },
  category: { select: { id: true, name: true } },
  version: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.VehicleUnitInclude;

type ListRow = Prisma.VehicleUnitGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Formato de item de lista do contrato `VehicleListItem`. */
export function toListItem(v: ListRow) {
  return {
    id: v.id, plate: v.plate, internalCode: v.internalCode, branchId: v.branchId, color: v.color, odometerKm: v.odometerKm,
    commercialStatus: v.commercialStatus, operationalStatus: v.operationalStatus, yearManufacture: v.yearManufacture, yearModel: v.yearModel,
    fuel: v.fuel, transmission: v.transmission, model: v.model, category: v.category, version: v.version, branch: v.branch,
    deletedAt: v.deletedAt,
  };
}

const date = (v?: string | null) => (v === undefined ? undefined : v === null ? null : new Date(v));
const money = (v?: number | null) => (v === undefined ? undefined : v === null ? null : centsToDecimalString(toCents(v)));

/**
 * Unidades físicas da frota. A placa é um atributo corrigível; a
 * identidade é o id, então corrigir uma placa digitada errado não quebra
 * contratos, multas nem a linha do tempo.
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly counter: CounterService,
    private readonly availability: AvailabilityService,
    private readonly status: VehicleStatusService,
  ) {}

  /* ================= Leitura ================= */

  async list(ctx: OrgContext, q: VehicleQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    if (q.branchId) assertBranch(ctx, q.branchId);
    const term = q.q?.trim();
    const plateTerm = term ? normalizePlate(term) : '';
    const where: Prisma.VehicleUnitWhereInput = {
      ...(q.includeDeleted ? {} : { deletedAt: null }),
      ...(q.branchId ? { branchId: q.branchId } : branchWhere(ctx)),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.modelId ? { modelId: q.modelId } : {}),
      ...(q.operationalStatus ? { operationalStatus: q.operationalStatus as OperationalStatus } : {}),
      ...(q.commercialStatus
        ? { commercialStatus: q.commercialStatus as CommercialStatus }
        : q.includeSold ? {} : { commercialStatus: { not: 'SOLD' } }),
      ...(term ? {
        OR: [
          ...(plateTerm ? [{ plate: { contains: plateTerm } }] : []),
          { internalCode: { contains: term, mode: 'insensitive' } },
          { renavam: { contains: onlyDigits(term) || term } },
          { chassis: { contains: term.toUpperCase() } },
          { model: { name: { contains: term, mode: 'insensitive' } } },
          { model: { make: { name: { contains: term, mode: 'insensitive' } } } },
          { color: { contains: term, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [rows, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.vehicleUnit.findMany({
        where, include: LIST_INCLUDE, skip, take,
        orderBy: orderBy(q, ['plate', 'internalCode', 'odometerKm', 'yearModel', 'createdAt', 'color'], { plate: 'asc' }),
      }),
      tx.vehicleUnit.count({ where }),
    ]));
    return paginated(rows.map(toListItem), total, page, pageSize);
  }

  async detail(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, (tx) => this.loadDetail(tx, ctx, { id }));
  }

  async byPlate(ctx: OrgContext, plate: string) {
    const normalized = normalizePlate(plate);
    if (!isValidPlate(normalized)) throw new BadRequestException('Placa inválida.');
    return this.prisma.tenant(ctx, (tx) => this.loadDetail(tx, ctx, { plate: normalized }));
  }

  private async loadDetail(tx: Tx, ctx: OrgContext, where: { id: string } | { plate: string }) {
    const v = await tx.vehicleUnit.findFirst({
      where: 'id' in where ? { id: where.id } : { plate: where.plate },
      include: { ...LIST_INCLUDE, supplier: { select: { id: true, name: true } } },
    });
    if (!v) throw new NotFoundException('Veículo não encontrado.');
    assertBranch(ctx, v.branchId);
    const open = await tx.contractVehicle.findFirst({
      where: { vehicleUnitId: v.id, endAt: null, contract: { status: { in: ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL', 'DRAFT'] } } },
      include: { contract: { select: { id: true, number: true } } },
    });
    const financial = ctx.permissions.has('fleet.financials');
    return {
      ...toListItem(v),
      renavam: v.renavam, chassis: v.chassis, engineNumber: v.engineNumber, doors: v.doors, tankCapacityLiters: v.tankCapacityLiters,
      initialOdometerKm: v.initialOdometerKm, acquiredAt: v.acquiredAt, supplierId: v.supplierId, supplier: v.supplier,
      location: v.location, blockReason: v.blockReason, licensingDueDate: v.licensingDueDate, ipvaDueDate: v.ipvaDueDate,
      insurancePolicyId: v.insurancePolicyId, publicVisible: v.publicVisible, notes: v.notes, soldAt: v.soldAt,
      createdAt: v.createdAt, updatedAt: v.updatedAt,
      openContract: open ? open.contract : null,
      ...(financial ? { acquisitionValue: numOrNull(v.acquisitionValue), marketValue: numOrNull(v.marketValue) } : {}),
    };
  }

  async timelineOf(ctx: OrgContext, id: string, q: TimelineQueryDto) {
    const { skip, take, page, pageSize } = pageArgs({ page: q.page, pageSize: q.pageSize ?? 50 });
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertVehicle(tx, ctx, id);
      const where: Prisma.VehicleTimelineEventWhereInput = { vehicleUnitId: id, ...(q.type ? { type: q.type } : {}) };
      const [items, total] = await Promise.all([
        tx.vehicleTimelineEvent.findMany({ where, orderBy: { at: 'desc' }, skip, take }),
        tx.vehicleTimelineEvent.count({ where }),
      ]);
      return paginated(items, total, page, pageSize);
    });
  }

  async agenda(ctx: OrgContext, id: string, q: RangeQueryDto) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 86_400_000);
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 60 * 86_400_000);
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertVehicle(tx, ctx, id);
      return this.availability.agenda(tx, id, from, to);
    });
  }

  /** Quadro de agenda da frota (visão gantt): veículos e os blocos no intervalo. */
  async agendaBoard(ctx: OrgContext, q: RangeQueryDto) {
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 14 * 86_400_000);
    if (to <= from) throw new BadRequestException('O fim do intervalo precisa ser posterior ao início.');
    if (to.getTime() - from.getTime() > 92 * 86_400_000) throw new BadRequestException('Intervalo máximo de 92 dias.');
    if (q.branchId) assertBranch(ctx, q.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicles = await tx.vehicleUnit.findMany({
        where: {
          deletedAt: null, commercialStatus: { not: 'SOLD' },
          ...(q.branchId ? { branchId: q.branchId } : branchWhere(ctx)),
          ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        },
        include: { ...LIST_INCLUDE, allocations: { where: { active: true, startsAt: { lt: to }, blockedUntil: { gt: from } }, orderBy: { startsAt: 'asc' } } },
        orderBy: { plate: 'asc' },
        take: 200,
      });
      return {
        from: from.toISOString(), to: to.toISOString(),
        vehicles: vehicles.map(({ allocations, ...v }) => ({ vehicle: toListItem(v as ListRow), blocks: allocations })),
      };
    });
  }

  async findAvailable(ctx: OrgContext, q: AvailabilityQueryDto) {
    const startAt = new Date(q.startAt);
    const endAt = new Date(q.endAt);
    if (q.branchId) assertBranch(ctx, q.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      const units = await this.availability.findAvailable(tx, ctx.organizationId, {
        startAt, endAt, categoryId: q.categoryId, modelId: q.modelId,
        ...(q.branchId ? { branchId: q.branchId } : ctx.allBranches ? {} : { branchIds: ctx.branchIds }),
        internal: true,
      });
      const byCategory = new Map<string, { categoryId: string; categoryName: string; available: number }>();
      for (const u of units) {
        const entry = byCategory.get(u.categoryId) ?? { categoryId: u.categoryId, categoryName: u.category.name, available: 0 };
        entry.available += 1;
        byCategory.set(u.categoryId, entry);
      }
      return {
        startAt: startAt.toISOString(), endAt: endAt.toISOString(),
        units: units.map((u) => toListItem({ ...u, model: { id: u.model.id, name: u.model.name, make: { name: u.model.make.name } } } as unknown as ListRow)),
        byCategory: [...byCategory.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
      };
    });
  }

  async checkDuplicates(ctx: OrgContext, q: DuplicateQueryDto) {
    return this.prisma.tenant(ctx, (tx) => this.duplicates(tx, {
      plate: q.plate ? normalizePlate(q.plate) : undefined,
      renavam: q.renavam ? onlyDigits(q.renavam) : undefined,
      chassis: q.chassis ? normalizeVin(q.chassis) : undefined,
      internalCode: q.internalCode?.trim(),
    }, q.excludeId));
  }

  /**
   * Duplicidade é verificada no banco inteiro da empresa, inclusive
   * veículos vendidos e excluídos: a unicidade do schema também não
   * distingue, e avisar antes evita o 409 no fim do cadastro.
   */
  private async duplicates(tx: Tx, f: { plate?: string; renavam?: string; chassis?: string; internalCode?: string }, excludeId?: string) {
    const not = excludeId ? { id: { not: excludeId } } : {};
    const exists = async (where: Prisma.VehicleUnitWhereInput) => Boolean(await tx.vehicleUnit.findFirst({ where: { ...where, ...not }, select: { id: true } }));
    return {
      plate: f.plate ? await exists({ plate: f.plate }) : false,
      renavam: f.renavam ? await exists({ renavam: f.renavam }) : false,
      chassis: f.chassis ? await exists({ chassis: f.chassis }) : false,
      internalCode: f.internalCode ? await exists({ internalCode: f.internalCode }) : false,
    };
  }

  /* ================= Escrita ================= */

  async create(ctx: OrgContext, dto: CreateVehicleDto) {
    assertBranch(ctx, dto.branchId);
    this.assertFinancialWrite(ctx, dto);
    const plate = this.validPlate(dto.plate);
    const renavam = dto.renavam ? this.validRenavam(dto.renavam) : null;
    const chassis = dto.chassis ? this.validVin(dto.chassis) : null;
    this.assertYears(dto.yearManufacture, dto.yearModel);

    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertPlanLimit(tx, ctx.organizationId);
      const refs = await this.validateRefs(tx, { ...dto, branchId: dto.branchId });
      const dup = await this.duplicates(tx, { plate, renavam: renavam ?? undefined, chassis: chassis ?? undefined, internalCode: dto.internalCode?.trim() });
      this.throwDuplicate(dup);
      const internalCode = dto.internalCode?.trim() || (await this.counter.next(tx, ctx.organizationId, 'vehicle', 'VEI-', 5));

      const vehicle = await tx.vehicleUnit.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: dto.branchId,
          modelId: dto.modelId,
          versionId: dto.versionId ?? null,
          categoryId: refs.categoryId,
          internalCode,
          plate,
          renavam,
          chassis,
          engineNumber: dto.engineNumber?.trim() || null,
          yearManufacture: dto.yearManufacture,
          yearModel: dto.yearModel,
          color: dto.color.trim(),
          fuel: dto.fuel as never,
          transmission: dto.transmission as never,
          doors: dto.doors ?? refs.doors,
          tankCapacityLiters: dto.tankCapacityLiters ?? refs.tankLiters,
          odometerKm: dto.odometerKm,
          initialOdometerKm: dto.odometerKm,
          acquiredAt: date(dto.acquiredAt) ?? null,
          acquisitionValue: money(dto.acquisitionValue) ?? null,
          marketValue: money(dto.marketValue) ?? null,
          supplierId: dto.supplierId ?? null,
          location: dto.location ?? null,
          licensingDueDate: date(dto.licensingDueDate) ?? null,
          ipvaDueDate: date(dto.ipvaDueDate) ?? null,
          insurancePolicyId: dto.insurancePolicyId ?? null,
          publicVisible: dto.publicVisible ?? true,
          notes: dto.notes ?? null,
        },
      });
      await tx.odometerReading.create({
        data: { organizationId: ctx.organizationId, vehicleUnitId: vehicle.id, km: dto.odometerKm, source: 'REGISTRATION', userId: ctx.userId },
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'CREATED', title: `Veículo cadastrado (${internalCode})`,
        description: `Hodômetro inicial: ${dto.odometerKm.toLocaleString('pt-BR')} km`, refType: 'VehicleUnit', refId: vehicle.id,
      });
      await this.audit.record(tx, ctx, { action: 'vehicle.created', entityType: 'VehicleUnit', entityId: vehicle.id, branchId: vehicle.branchId, after: vehicle });
      return { id: vehicle.id, internalCode };
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateVehicleDto) {
    this.assertFinancialWrite(ctx, dto);
    const plate = dto.plate !== undefined ? this.validPlate(dto.plate) : undefined;
    const renavam = dto.renavam === undefined ? undefined : dto.renavam === null ? null : this.validRenavam(dto.renavam);
    const chassis = dto.chassis === undefined ? undefined : dto.chassis === null ? null : this.validVin(dto.chassis);

    return this.prisma.tenant(ctx, async (tx) => {
      const before = await this.assertVehicle(tx, ctx, id);
      if (before.deletedAt) throw new ConflictException('Veículo excluído não pode ser editado.');
      this.assertYears(dto.yearManufacture ?? before.yearManufacture, dto.yearModel ?? before.yearModel);
      const refs = await this.validateRefs(tx, {
        branchId: before.branchId, modelId: dto.modelId ?? before.modelId, versionId: dto.versionId === undefined ? before.versionId : dto.versionId,
        categoryId: dto.categoryId, supplierId: dto.supplierId, insurancePolicyId: dto.insurancePolicyId,
      });
      this.throwDuplicate(await this.duplicates(tx, {
        plate, renavam: renavam ?? undefined, chassis: chassis ?? undefined, internalCode: dto.internalCode?.trim(),
      }, id));

      const data: Prisma.VehicleUnitUncheckedUpdateInput = {
        modelId: dto.modelId,
        versionId: dto.versionId,
        categoryId: dto.categoryId ?? (dto.modelId && dto.modelId !== before.modelId ? refs.categoryId : undefined),
        internalCode: dto.internalCode?.trim(),
        plate, renavam, chassis,
        engineNumber: dto.engineNumber,
        yearManufacture: dto.yearManufacture,
        yearModel: dto.yearModel,
        color: dto.color?.trim(),
        fuel: dto.fuel as never,
        transmission: dto.transmission as never,
        doors: dto.doors,
        tankCapacityLiters: dto.tankCapacityLiters,
        acquiredAt: date(dto.acquiredAt),
        acquisitionValue: money(dto.acquisitionValue),
        marketValue: money(dto.marketValue),
        supplierId: dto.supplierId,
        location: dto.location,
        licensingDueDate: date(dto.licensingDueDate),
        ipvaDueDate: date(dto.ipvaDueDate),
        insurancePolicyId: dto.insurancePolicyId,
        publicVisible: dto.publicVisible,
        notes: dto.notes,
      };
      await tx.vehicleUnit.update({ where: { id }, data });
      const diff = AuditService.diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
      const changed = Object.keys(diff.after);
      if (changed.length) {
        await this.audit.record(tx, ctx, { action: 'vehicle.updated', entityType: 'VehicleUnit', entityId: id, branchId: before.branchId, ...diff });
        await this.timeline.record(tx, ctx, ctx.organizationId, {
          vehicleUnitId: id, type: 'UPDATED', title: 'Cadastro alterado',
          description: `Campos: ${changed.map((c) => FIELD_LABEL[c] ?? c).join(', ')}`, refType: 'VehicleUnit', refId: id,
          data: { fields: changed },
        });
      }
      return { id };
    });
  }

  /**
   * Situação manual. Alugado e Reservado vêm da agenda; Vendido vem do
   * fluxo de venda. Aqui só se decide o que é decisão humana: pôr à
   * venda, tirar da venda, e a situação operacional.
   */
  async changeStatus(ctx: OrgContext, id: string, field: 'COMMERCIAL' | 'OPERATIONAL', to: string, reason?: string) {
    const why = reason?.trim() || null;
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await this.assertVehicle(tx, ctx, id);
      if (vehicle.deletedAt) throw new ConflictException('Veículo excluído.');
      if (vehicle.commercialStatus === 'SOLD') throw new ConflictException('Veículo vendido não muda de situação.');

      if (field === 'OPERATIONAL') {
        if (!(to in OPERATIONAL_STATUS_LABEL)) throw new BadRequestException('Situação operacional inválida.');
        if ((to === 'BLOCKED' || vehicle.operationalStatus === 'BLOCKED') && !why) {
          throw new BadRequestException(to === 'BLOCKED' ? 'Informe o motivo do bloqueio.' : 'Informe o motivo da liberação.');
        }
        await this.status.setOperational(tx, ctx, ctx.organizationId, id, to as OperationalStatus, why);
      } else {
        if (!(to in COMMERCIAL_STATUS_LABEL)) throw new BadRequestException('Situação comercial inválida.');
        if (to === 'SOLD') throw new BadRequestException('A venda é concluída pelo módulo de compra e venda, que confere contratos e pendências.');
        if (to === 'RENTED' || to === 'RESERVED') throw new BadRequestException('Alugado e Reservado são calculados pela agenda (contratos e reservas), não definidos à mão.');
        if (to === 'FOR_SALE') {
          const future = await tx.vehicleAllocation.count({ where: { vehicleUnitId: id, active: true, kind: { in: ['RESERVATION', 'CONTRACT'] }, blockedUntil: { gt: new Date() } } });
          if (future) throw new ConflictException('O veículo tem reserva ou contrato em andamento. Encerre-os antes de colocá-lo à venda.');
          await this.status.setCommercial(tx, ctx, ctx.organizationId, id, 'FOR_SALE', why);
        } else {
          // Tirar da venda: volta ao estado que a agenda indicar.
          if (vehicle.commercialStatus === 'FOR_SALE') await this.status.setCommercial(tx, ctx, ctx.organizationId, id, 'AVAILABLE', why ?? 'Retirado da venda');
          await this.status.recomputeCommercial(tx, ctx, ctx.organizationId, id);
        }
      }
      await this.audit.record(tx, ctx, {
        action: 'vehicle.status_changed', entityType: 'VehicleUnit', entityId: id, branchId: vehicle.branchId, reason: why,
        before: { field, value: field === 'OPERATIONAL' ? vehicle.operationalStatus : vehicle.commercialStatus }, after: { field, value: to },
      });
      return this.loadDetail(tx, ctx, { id });
    });
  }

  async recordOdometer(ctx: OrgContext, id: string, km: number, note?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await this.assertVehicle(tx, ctx, id);
      if (km < vehicle.odometerKm) {
        throw new BadRequestException(`A leitura (${km.toLocaleString('pt-BR')} km) é menor que o hodômetro atual (${vehicle.odometerKm.toLocaleString('pt-BR')} km).`);
      }
      await this.timeline.odometer(tx, ctx, ctx.organizationId, id, km, 'MANUAL');
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: id, type: 'ODOMETER', title: `Hodômetro: ${km.toLocaleString('pt-BR')} km`, description: note ?? null,
      });
      return { odometerKm: km };
    });
  }

  async transfer(ctx: OrgContext, id: string, branchId: string, reason: string) {
    assertBranch(ctx, branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await this.assertVehicle(tx, ctx, id);
      if (vehicle.branchId === branchId) throw new BadRequestException('O veículo já está nesta filial.');
      const target = await tx.branch.findUnique({ where: { id: branchId } });
      if (!target || !target.active) throw new BadRequestException('Filial de destino inválida ou inativa.');
      const busy = await tx.vehicleAllocation.count({ where: { vehicleUnitId: id, active: true, kind: { in: ['RESERVATION', 'CONTRACT'] }, blockedUntil: { gt: new Date() } } });
      if (busy) throw new ConflictException('O veículo tem reserva ou contrato em andamento; transfira depois de encerrá-los.');
      const from = await tx.branch.findUnique({ where: { id: vehicle.branchId } });
      await tx.vehicleUnit.update({ where: { id }, data: { branchId } });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: id, type: 'UPDATED', title: `Transferido de ${from?.name ?? '—'} para ${target.name}`, description: reason,
      });
      await this.audit.record(tx, ctx, { action: 'vehicle.transferred', entityType: 'VehicleUnit', entityId: id, branchId, reason, before: { branchId: vehicle.branchId }, after: { branchId } });
      return { id, branchId };
    });
  }

  /**
   * Exclusão lógica. O veículo some das listas e da disponibilidade, mas
   * o histórico (contratos, multas, OS) continua apontando para ele.
   */
  async remove(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await this.assertVehicle(tx, ctx, id);
      if (vehicle.deletedAt) throw new ConflictException('Veículo já excluído.');
      const open = await tx.contractVehicle.count({ where: { vehicleUnitId: id, endAt: null } });
      if (open) throw new ConflictException('O veículo está vinculado a um contrato em aberto.');
      const future = await tx.vehicleAllocation.count({ where: { vehicleUnitId: id, active: true, blockedUntil: { gt: new Date() } } });
      if (future) throw new ConflictException('O veículo tem compromissos ativos na agenda (reserva, manutenção ou bloqueio). Libere-os antes de excluir.');
      await tx.vehicleUnit.update({ where: { id }, data: { deletedAt: new Date(), publicVisible: false } });
      await this.timeline.record(tx, ctx, ctx.organizationId, { vehicleUnitId: id, type: 'DISPOSAL', title: 'Excluído do cadastro da frota', description: reason });
      await this.audit.record(tx, ctx, { action: 'vehicle.deleted', entityType: 'VehicleUnit', entityId: id, branchId: vehicle.branchId, reason, before: { plate: vehicle.plate, internalCode: vehicle.internalCode } });
    });
  }

  /* ================= Bloqueios de agenda ================= */

  async createBlock(ctx: OrgContext, id: string, dto: BlockDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await this.assertVehicle(tx, ctx, id);
      if (vehicle.deletedAt || vehicle.commercialStatus === 'SOLD') throw new ConflictException('Veículo fora da frota.');
      const allocation = await this.availability.allocate(tx, ctx.organizationId, {
        vehicleUnitId: id, kind: 'BLOCK', startsAt, endsAt, reason: dto.reason, createdById: ctx.userId,
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: id, type: 'STATUS_CHANGED', title: 'Agenda bloqueada', description: dto.reason, refType: 'VehicleAllocation', refId: allocation.id,
        data: { startsAt, endsAt },
      });
      await this.audit.record(tx, ctx, { action: 'vehicle.block_created', entityType: 'VehicleUnit', entityId: id, branchId: vehicle.branchId, reason: dto.reason, after: { allocationId: allocation.id, startsAt, endsAt } });
      return allocation;
    });
  }

  async releaseBlock(ctx: OrgContext, id: string, allocationId: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await this.assertVehicle(tx, ctx, id);
      const allocation = await tx.vehicleAllocation.findUnique({ where: { id: allocationId } });
      if (!allocation || allocation.vehicleUnitId !== id || !allocation.active) throw new NotFoundException('Bloqueio não encontrado.');
      if (allocation.kind !== 'BLOCK') throw new BadRequestException('Só bloqueios manuais são liberados aqui; reservas, contratos e OS têm o próprio fluxo.');
      await this.availability.release(tx, allocationId);
      await this.timeline.record(tx, ctx, ctx.organizationId, { vehicleUnitId: id, type: 'STATUS_CHANGED', title: 'Bloqueio de agenda liberado', description: reason, refType: 'VehicleAllocation', refId: allocationId });
      await this.audit.record(tx, ctx, { action: 'vehicle.block_released', entityType: 'VehicleUnit', entityId: id, branchId: vehicle.branchId, reason, before: { allocationId } });
    });
  }

  /* ================= Auxiliares ================= */

  private async assertVehicle(tx: Tx, ctx: OrgContext, id: string) {
    const v = await tx.vehicleUnit.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Veículo não encontrado.');
    assertBranch(ctx, v.branchId);
    return v;
  }

  private validPlate(raw: string): string {
    const plate = normalizePlate(raw);
    if (!isValidPlate(plate)) throw new BadRequestException('Placa inválida. Use o padrão antigo (ABC1234) ou Mercosul (ABC1D23).');
    return plate;
  }

  private validRenavam(raw: string): string {
    const renavam = onlyDigits(raw).padStart(11, '0');
    if (!isValidRenavam(renavam)) throw new BadRequestException('RENAVAM inválido (dígito verificador não confere).');
    return renavam;
  }

  private validVin(raw: string): string {
    const vin = normalizeVin(raw);
    if (!isValidVin(vin)) throw new BadRequestException('Chassi inválido: 17 caracteres, sem as letras I, O e Q.');
    return vin;
  }

  private assertYears(manufacture: number, model: number) {
    if (model < manufacture || model > manufacture + 1) {
      throw new BadRequestException('O ano-modelo deve ser igual ao ano de fabricação ou o seguinte.');
    }
  }

  private assertFinancialWrite(ctx: OrgContext, dto: { acquisitionValue?: unknown; marketValue?: unknown }) {
    if ((dto.acquisitionValue !== undefined || dto.marketValue !== undefined) && !ctx.permissions.has('fleet.financials')) {
      throw new ForbiddenException('Valores patrimoniais exigem a permissão de valores da frota.');
    }
  }

  private throwDuplicate(dup: { plate: boolean; renavam: boolean; chassis: boolean; internalCode: boolean }) {
    if (dup.plate) throw new ConflictException('Já existe um veículo com esta placa.');
    if (dup.renavam) throw new ConflictException('Já existe um veículo com este RENAVAM.');
    if (dup.chassis) throw new ConflictException('Já existe um veículo com este chassi.');
    if (dup.internalCode) throw new ConflictException('Já existe um veículo com este código interno.');
  }

  private async validateRefs(tx: Tx, r: {
    branchId: string; modelId: string; versionId?: string | null; categoryId?: string; supplierId?: string | null; insurancePolicyId?: string | null;
  }) {
    const branch = await tx.branch.findUnique({ where: { id: r.branchId } });
    if (!branch || !branch.active) throw new BadRequestException('Filial inválida ou inativa.');
    const model = await tx.vehicleModel.findUnique({ where: { id: r.modelId } });
    if (!model) throw new BadRequestException('Modelo inválido.');
    if (r.versionId) {
      const version = await tx.vehicleVersion.findUnique({ where: { id: r.versionId } });
      if (!version || version.modelId !== r.modelId) throw new BadRequestException('A versão não pertence ao modelo escolhido.');
    }
    if (r.categoryId && !(await tx.vehicleCategory.findUnique({ where: { id: r.categoryId } }))) throw new BadRequestException('Categoria inválida.');
    if (r.supplierId && !(await tx.supplier.findUnique({ where: { id: r.supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
    if (r.insurancePolicyId && !(await tx.insurancePolicy.findUnique({ where: { id: r.insurancePolicyId } }))) throw new BadRequestException('Apólice inválida.');
    return { categoryId: r.categoryId ?? model.categoryId, doors: model.doors, tankLiters: model.tankLiters };
  }

  private async assertPlanLimit(tx: Tx, organizationId: string) {
    const sub = await tx.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
    const limit = sub?.plan.maxVehicles;
    if (limit === null || limit === undefined) return;
    const current = await tx.vehicleUnit.count({ where: { deletedAt: null, commercialStatus: { not: 'SOLD' } } });
    if (current >= limit) {
      throw new ForbiddenException(`O plano ${sub!.plan.name} permite até ${limit} veículos em frota. Fale com a Norty para ampliar.`);
    }
  }
}

const FIELD_LABEL: Record<string, string> = {
  plate: 'placa', renavam: 'RENAVAM', chassis: 'chassi', internalCode: 'código interno', color: 'cor', modelId: 'modelo',
  versionId: 'versão', categoryId: 'categoria', yearManufacture: 'ano de fabricação', yearModel: 'ano-modelo', fuel: 'combustível',
  transmission: 'câmbio', doors: 'portas', tankCapacityLiters: 'tanque', acquiredAt: 'data de aquisição', acquisitionValue: 'valor de aquisição',
  marketValue: 'valor de mercado', supplierId: 'fornecedor', location: 'localização', licensingDueDate: 'licenciamento',
  ipvaDueDate: 'IPVA', insurancePolicyId: 'apólice', publicVisible: 'visibilidade no site', notes: 'observações', engineNumber: 'motor',
};


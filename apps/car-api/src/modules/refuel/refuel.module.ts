import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { REFUEL_FLAG_LABEL, checkRefuel, type RefuelFlag } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { OrgCtx, RequirePermission, assertBranch, branchWhere, type OrgContext } from '../../common/context';
import { PageQueryDto, ToBool, pageArgs, paginated } from '../../common/pagination';
import { num } from '../../common/serialize.interceptor';

const FUELS = ['FLEX', 'GASOLINE', 'ETHANOL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG'] as const;
const METHODS = ['PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER'] as const;

class RefuelDto {
  @IsUUID() vehicleUnitId!: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsDateString() at!: string;
  @IsOptional() @IsString() @MaxLength(120) station?: string;
  @IsIn(FUELS) fuel!: (typeof FUELS)[number];
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.1) @Max(2000) liters!: number;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.01) @Max(100) pricePerLiter!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000) total!: number;
  @IsInt() @Min(0) @Max(5_000_000) odometerKm!: number;
  @IsOptional() @IsIn(METHODS) paymentMethod?: (typeof METHODS)[number];
  @IsOptional() @IsBoolean() paidByCompany?: boolean;
  /** Gera conta a pagar de combustível para o posto (fornecedor). */
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() receiptFileId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class RefuelQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @ToBool() @IsBoolean() flagged?: boolean;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/**
 * Abastecimentos. Registro inconsistente não é recusado — o comprovante
 * existe e precisa ficar registrado —, mas é sinalizado, e uma
 * quilometragem menor que a conhecida não move o hodômetro do carro.
 */
@Injectable()
export class RefuelService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService) {}

  async list(ctx: OrgContext, query: RefuelQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const q = query.q?.trim();
    const where: Prisma.RefuelRecordWhereInput = {
      vehicle: { ...branchWhere(ctx), ...(q ? { plate: { contains: q.replace(/[^A-Za-z0-9]/g, '').toUpperCase() } } : {}) },
      ...(query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.flagged ? { NOT: { flags: { isEmpty: true } } } : {}),
      ...(query.from || query.to ? { at: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.refuelRecord.findMany({ where, skip, take, orderBy: { at: 'desc' }, include: { vehicle: { select: { id: true, plate: true } }, driver: { select: { id: true, name: true } } } }),
        tx.refuelRecord.count({ where }),
      ]);
      return paginated(rows.map((r) => ({ ...r, flagLabels: r.flags.map((f) => REFUEL_FLAG_LABEL[f as RefuelFlag] ?? f) })), total, page, pageSize);
    });
  }

  async create(ctx: OrgContext, dto: RefuelDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId }, include: { model: { select: { tankLiters: true } } } });
      if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
      assertBranch(ctx, vehicle.branchId);
      if (dto.driverId && !(await tx.driver.findUnique({ where: { id: dto.driverId }, select: { id: true } }))) throw new BadRequestException('Motorista inválido.');
      if (dto.contractId && !(await tx.rentalContract.findUnique({ where: { id: dto.contractId }, select: { id: true } }))) throw new BadRequestException('Contrato inválido.');
      if (dto.receiptFileId) {
        const file = await tx.fileAsset.findUnique({ where: { id: dto.receiptFileId } });
        if (!file || file.deletedAt) throw new BadRequestException('Comprovante inválido.');
      }
      const at = new Date(dto.at);
      if (at.getTime() > Date.now() + 10 * 60_000) throw new BadRequestException('A data do abastecimento não pode estar no futuro.');
      const previous = await tx.refuelRecord.findFirst({ where: { vehicleUnitId: vehicle.id, at: { lt: at } }, orderBy: { at: 'desc' } });
      const check = checkRefuel({
        liters: dto.liters, pricePerLiter: dto.pricePerLiter, total: dto.total, odometerKm: dto.odometerKm,
        previousOdometerKm: previous?.odometerKm ?? null, tankCapacityLiters: vehicle.tankCapacityLiters ?? vehicle.model.tankLiters,
      });
      const flags = new Set<RefuelFlag>(check.flags);
      // Abaixo do hodômetro já conhecido do carro também é regressão.
      if (dto.odometerKm < vehicle.odometerKm) flags.add('KM_REGRESSION');
      const consistent = !flags.has('KM_REGRESSION');

      const record = await tx.refuelRecord.create({
        data: {
          organizationId: ctx.organizationId, vehicleUnitId: vehicle.id, driverId: dto.driverId ?? null, contractId: dto.contractId ?? null,
          at, station: dto.station ?? null, fuel: dto.fuel, liters: dto.liters, pricePerLiter: dto.pricePerLiter, total: dto.total,
          odometerKm: dto.odometerKm, paymentMethod: dto.paymentMethod ?? null, paidByCompany: dto.paidByCompany ?? true,
          receiptFileId: dto.receiptFileId ?? null, notes: dto.notes ?? null, flags: [...flags],
          consumptionKmL: consistent ? check.consumptionKmPerLiter : null, createdById: ctx.userId,
        },
      });
      if (dto.receiptFileId) await tx.fileAsset.update({ where: { id: dto.receiptFileId }, data: { entityType: 'RefuelRecord', entityId: record.id } });
      if (consistent) await this.timeline.odometer(tx, ctx, ctx.organizationId, vehicle.id, dto.odometerKm, 'REFUEL', record.id);
      if ((dto.paidByCompany ?? true) && dto.supplierId) {
        if (!(await tx.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true } }))) throw new BadRequestException('Fornecedor inválido.');
        await tx.payable.create({
          data: {
            organizationId: ctx.organizationId, branchId: vehicle.branchId, supplierId: dto.supplierId, kind: 'FUEL',
            description: `Abastecimento ${vehicle.plate} — ${dto.liters} L`, amount: dto.total, dueDate: at,
            vehicleUnitId: vehicle.id, createdById: ctx.userId,
          },
        });
      }
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'REFUEL', title: `Abastecimento: ${dto.liters.toLocaleString('pt-BR')} L (R$ ${dto.total.toFixed(2)})`,
        description: flags.size ? `Sinalizado: ${[...flags].map((f) => REFUEL_FLAG_LABEL[f]).join('; ')}` : dto.station ?? null,
        refType: 'RefuelRecord', refId: record.id, at, data: { total: dto.total, liters: dto.liters, flags: [...flags] },
      });
      await this.audit.record(tx, ctx, { action: 'refuel.created', entityType: 'RefuelRecord', entityId: record.id, branchId: vehicle.branchId, after: { ...dto, flags: [...flags] } });
      return { ...record, flagLabels: [...flags].map((f) => REFUEL_FLAG_LABEL[f]) };
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const r = await tx.refuelRecord.findUnique({ where: { id }, include: { vehicle: { select: { id: true, plate: true, branchId: true } }, driver: { select: { id: true, name: true } } } });
      if (!r) throw new NotFoundException('Abastecimento não encontrado.');
      assertBranch(ctx, r.vehicle.branchId);
      return { ...r, flagLabels: r.flags.map((f) => REFUEL_FLAG_LABEL[f as RefuelFlag] ?? f) };
    });
  }

  /** Consumo médio (km/l) das leituras consistentes, por veículo. */
  async consumption(ctx: OrgContext, vehicleUnitId?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const rows = await tx.refuelRecord.findMany({
        where: { ...(vehicleUnitId ? { vehicleUnitId } : {}), vehicle: branchWhere(ctx) },
        include: { vehicle: { select: { id: true, plate: true } } }, orderBy: { at: 'asc' },
      });
      const byVehicle = new Map<string, { vehicleUnitId: string; plate: string; records: number; liters: number; total: number; samples: number[]; flagged: number }>();
      for (const r of rows) {
        const v = byVehicle.get(r.vehicleUnitId) ?? { vehicleUnitId: r.vehicleUnitId, plate: r.vehicle.plate, records: 0, liters: 0, total: 0, samples: [], flagged: 0 };
        v.records += 1;
        v.liters += num(r.liters);
        v.total += num(r.total);
        if (r.consumptionKmL !== null && r.flags.length === 0) v.samples.push(num(r.consumptionKmL));
        if (r.flags.length) v.flagged += 1;
        byVehicle.set(r.vehicleUnitId, v);
      }
      return [...byVehicle.values()].map(({ samples, ...v }) => ({
        ...v, liters: Math.round(v.liters * 100) / 100, total: Math.round(v.total * 100) / 100,
        averageKmPerLiter: samples.length ? Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100 : null,
        averagePricePerLiter: v.liters ? Math.round((v.total / v.liters) * 1000) / 1000 : null,
      }));
    });
  }
}

@Controller('refuels')
class RefuelController {
  constructor(private readonly refuel: RefuelService) {}

  @RequirePermission('refuel.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: RefuelQueryDto) {
    return this.refuel.list(ctx, query);
  }

  @RequirePermission('refuel.view')
  @Get('consumption')
  consumption(@OrgCtx() ctx: OrgContext, @Query('vehicleUnitId') vehicleUnitId?: string) {
    if (vehicleUnitId && !/^[0-9a-f-]{36}$/i.test(vehicleUnitId)) throw new BadRequestException('Veículo inválido.');
    return this.refuel.consumption(ctx, vehicleUnitId);
  }

  @RequirePermission('refuel.manage')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: RefuelDto) {
    return this.refuel.create(ctx, dto);
  }

  @RequirePermission('refuel.view')
  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.refuel.get(ctx, id);
  }
}

@Module({ controllers: [RefuelController], providers: [RefuelService] })
export class RefuelModule {}

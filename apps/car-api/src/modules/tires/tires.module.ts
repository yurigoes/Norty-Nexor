import {
  BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch,
  Post, Query,
} from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { TIRE_POSITION_LABEL, tireCostPerKm, type TirePosition } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { OrgCtx, RequirePermission, assertBranch, type OrgContext } from '../../common/context';
import { PageQueryDto, pageArgs, paginated } from '../../common/pagination';
import { num } from '../../common/serialize.interceptor';

const POSITIONS = ['FL', 'FR', 'RL', 'RR', 'SPARE'] as const;

class TireDto {
  @IsString() @Length(2, 40) code!: string;
  @IsString() @Length(2, 60) brand!: string;
  @IsOptional() @IsString() @MaxLength(60) model?: string;
  @IsString() @Length(4, 30) size!: string;
  @IsOptional() @IsString() @MaxLength(20) dot?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) cost?: number;
}

class UpdateTireDto {
  @IsOptional() @IsString() @Length(2, 60) brand?: string;
  @IsOptional() @IsString() @MaxLength(60) model?: string;
  @IsOptional() @IsString() @Length(4, 30) size?: string;
  @IsOptional() @IsString() @MaxLength(20) dot?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) cost?: number;
}

class TireQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['STOCK', 'INSTALLED', 'REMOVED', 'DISCARDED']) status?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
}

class TireEventDto {
  @IsIn(['INSTALL', 'ROTATE', 'REPAIR', 'REMOVE', 'DISCARD']) type!: 'INSTALL' | 'ROTATE' | 'REPAIR' | 'REMOVE' | 'DISCARD';
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsIn(POSITIONS) position?: TirePosition;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) cost?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

/**
 * Pneus com controle individual. Cada pneu acumula a quilometragem rodada
 * em cada instalação; o custo por km sai do custo de compra mais reparos.
 * O banco impede dois pneus instalados na mesma posição do mesmo carro.
 */
@Injectable()
export class TiresService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService) {}

  async list(ctx: OrgContext, query: TireQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const q = query.q?.trim();
    const where: Prisma.TireWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {}),
      AND: [
        q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }, { size: { contains: q, mode: 'insensitive' } }] } : {},
        // Pneu instalado segue a filial do carro; em estoque é da empresa toda.
        ctx.allBranches ? {} : { OR: [{ vehicleUnitId: null }, { vehicle: { branchId: { in: ctx.branchIds } } }] },
      ],
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.tire.findMany({ where, skip, take, orderBy: { code: 'asc' }, include: { vehicle: { select: { id: true, plate: true, odometerKm: true } }, events: { where: { type: 'REPAIR' }, select: { cost: true } } } }),
        tx.tire.count({ where }),
      ]);
      return paginated(rows.map((t) => this.shape(t)), total, page, pageSize);
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const tire = await tx.tire.findUnique({ where: { id }, include: { vehicle: { select: { id: true, plate: true, odometerKm: true, branchId: true } }, events: { orderBy: { at: 'desc' } } } });
      if (!tire) throw new NotFoundException('Pneu não encontrado.');
      if (tire.vehicle) assertBranch(ctx, tire.vehicle.branchId);
      return { ...this.shape(tire), events: tire.events };
    });
  }

  async create(ctx: OrgContext, dto: TireDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const tire = await tx.tire.create({ data: { ...dto, code: dto.code.trim().toUpperCase(), organizationId: ctx.organizationId } });
      await this.audit.record(tx, ctx, { action: 'tire.created', entityType: 'Tire', entityId: tire.id, after: dto });
      return tire;
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateTireDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      if (!(await tx.tire.findUnique({ where: { id } }))) throw new NotFoundException('Pneu não encontrado.');
      return tx.tire.update({ where: { id }, data: dto });
    });
  }

  async event(ctx: OrgContext, id: string, dto: TireEventDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const tire = await tx.tire.findUnique({ where: { id }, include: { vehicle: true } });
      if (!tire) throw new NotFoundException('Pneu não encontrado.');
      if (tire.status === 'DISCARDED') throw new ConflictException('Pneu descartado não recebe novos eventos.');
      if (tire.vehicle) assertBranch(ctx, tire.vehicle.branchId);
      const km = dto.odometerKm ?? tire.vehicle?.odometerKm ?? null;
      const ran = (endKm: number | null) => (tire.installedKm !== null && endKm !== null ? Math.max(0, endKm - tire.installedKm) : 0);
      let data: Prisma.TireUncheckedUpdateInput = {};
      let vehicleUnitId = tire.vehicleUnitId;

      switch (dto.type) {
        case 'INSTALL': {
          if (tire.status === 'INSTALLED') throw new ConflictException('O pneu já está instalado. Retire-o antes.');
          if (!dto.vehicleUnitId || !dto.position) throw new BadRequestException('Informe o veículo e a posição.');
          const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
          if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
          assertBranch(ctx, vehicle.branchId);
          vehicleUnitId = vehicle.id;
          data = { status: 'INSTALLED', vehicleUnitId: vehicle.id, position: dto.position, installedKm: dto.odometerKm ?? vehicle.odometerKm };
          break;
        }
        case 'ROTATE': {
          if (tire.status !== 'INSTALLED' || !dto.position) throw new BadRequestException('Rodízio é de pneu instalado para uma nova posição.');
          // O trecho rodado até aqui fica acumulado; a contagem recomeça na nova posição.
          data = { position: dto.position, accumulatedKm: tire.accumulatedKm + ran(km), installedKm: km };
          break;
        }
        case 'REPAIR':
          if (!dto.cost && !dto.notes) throw new BadRequestException('Descreva o reparo ou informe o custo.');
          break;
        case 'REMOVE':
          if (tire.status !== 'INSTALLED') throw new ConflictException('O pneu não está instalado.');
          data = { status: 'REMOVED', vehicleUnitId: null, position: null, accumulatedKm: tire.accumulatedKm + ran(km), installedKm: null };
          break;
        case 'DISCARD':
          if (tire.status === 'INSTALLED') throw new ConflictException('Retire o pneu do veículo antes de descartar.');
          if (!dto.notes) throw new BadRequestException('Informe o motivo do descarte.');
          data = { status: 'DISCARDED' };
          break;
      }
      if (Object.keys(data).length) await tx.tire.update({ where: { id }, data });
      const event = await tx.tireEvent.create({
        data: {
          organizationId: ctx.organizationId, tireId: id, type: dto.type, vehicleUnitId, position: dto.position ?? tire.position,
          odometerKm: km, cost: dto.cost ?? null, notes: dto.notes ?? null, userId: ctx.userId,
        },
      });
      if (vehicleUnitId && dto.type !== 'DISCARD') {
        const label: Record<string, string> = { INSTALL: 'instalado', ROTATE: 'em rodízio', REPAIR: 'reparado', REMOVE: 'retirado' };
        const pos = dto.position ?? tire.position;
        await this.timeline.record(tx, ctx, ctx.organizationId, {
          vehicleUnitId, type: 'TIRE', title: `Pneu ${tire.code} ${label[dto.type]}${pos ? ` (${TIRE_POSITION_LABEL[pos as TirePosition]})` : ''}`,
          description: dto.notes ?? null, refType: 'Tire', refId: id, data: { cost: dto.cost ?? null },
        });
      }
      await this.audit.record(tx, ctx, { action: `tire.${dto.type.toLowerCase()}`, entityType: 'Tire', entityId: id, after: dto });
      return event;
    });
  }

  private shape<T extends { cost: Prisma.Decimal; accumulatedKm: number; installedKm: number | null; status: string; vehicle: { odometerKm: number } | null; events: { cost: Prisma.Decimal | null }[] }>(t: T) {
    const running = t.status === 'INSTALLED' && t.installedKm !== null && t.vehicle ? Math.max(0, t.vehicle.odometerKm - t.installedKm) : 0;
    const kmDriven = t.accumulatedKm + running;
    const totalCost = num(t.cost) + t.events.reduce((a, e) => a + num(e.cost), 0);
    return { ...t, kmDriven, totalCost: Math.round(totalCost * 100) / 100, costPerKm: tireCostPerKm(totalCost, kmDriven) };
  }
}

@Controller('tires')
class TiresController {
  constructor(private readonly tires: TiresService) {}

  @RequirePermission('maintenance.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: TireQueryDto) {
    return this.tires.list(ctx, query);
  }

  @RequirePermission('maintenance.view')
  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tires.get(ctx, id);
  }

  @RequirePermission('maintenance.manage')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: TireDto) {
    return this.tires.create(ctx, dto);
  }

  @RequirePermission('maintenance.manage')
  @Patch(':id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTireDto) {
    return this.tires.update(ctx, id, dto);
  }

  @RequirePermission('maintenance.manage')
  @Post(':id/events')
  event(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TireEventDto) {
    return this.tires.event(ctx, id, dto);
  }
}

@Module({ controllers: [TiresController], providers: [TiresService] })
export class TiresModule {}


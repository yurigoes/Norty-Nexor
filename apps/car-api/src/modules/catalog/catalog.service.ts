import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import type { OrgContext } from '../../common/context';
import { toRef } from '../files/files.service';
import type { CategoryDto, ModelDto, UpdateCategoryDto, UpdateModelDto, UpdateVersionDto, VersionDto } from './dto';

/**
 * Catálogo: o que a locadora oferece (categoria, marca, modelo, versão).
 * Separado da unidade física de propósito — várias placas compartilham o
 * mesmo modelo, as mesmas fotos e o mesmo arquivo 3D.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /* ---------------- Categorias ---------------- */

  categories(ctx: OrgContext, includeInactive = false) {
    return this.prisma.tenant(ctx, (tx) => tx.vehicleCategory.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { models: true, units: { where: { deletedAt: null, commercialStatus: { not: 'SOLD' } } } } } },
    }));
  }

  async createCategory(ctx: OrgContext, dto: CategoryDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const category = await tx.vehicleCategory.create({ data: { ...dto, organizationId: ctx.organizationId } });
      await this.audit.record(tx, ctx, { action: 'catalog.category_created', entityType: 'VehicleCategory', entityId: category.id, after: dto });
      return category;
    });
  }

  async updateCategory(ctx: OrgContext, id: string, dto: UpdateCategoryDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.vehicleCategory.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Categoria não encontrada.');
      if (dto.active === false) {
        const units = await tx.vehicleUnit.count({ where: { categoryId: id, deletedAt: null, commercialStatus: { not: 'SOLD' } } });
        if (units) throw new ConflictException(`A categoria ainda tem ${units} veículo(s) em frota.`);
      }
      const category = await tx.vehicleCategory.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'catalog.category_updated', entityType: 'VehicleCategory', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return category;
    });
  }

  /* ---------------- Marcas ---------------- */

  makes(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.vehicleMake.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { models: true } } } }));
  }

  async createMake(ctx: OrgContext, name: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const make = await tx.vehicleMake.create({ data: { organizationId: ctx.organizationId, name: name.trim() } });
      await this.audit.record(tx, ctx, { action: 'catalog.make_created', entityType: 'VehicleMake', entityId: make.id, after: { name } });
      return make;
    });
  }

  /* ---------------- Modelos ---------------- */

  async models(ctx: OrgContext, query: { categoryId?: string; makeId?: string; q?: string; publicOnly?: boolean; includeInactive?: boolean }) {
    return this.prisma.tenant(ctx, async (tx) => {
      const models = await tx.vehicleModel.findMany({
        where: {
          ...(query.includeInactive ? {} : { active: true }),
          ...(query.publicOnly ? { publicVisible: true } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.makeId ? { makeId: query.makeId } : {}),
          ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { make: { name: { contains: query.q, mode: 'insensitive' } } }] } : {}),
        },
        include: {
          make: true, category: true, _count: { select: { versions: true } },
          units: { where: { deletedAt: null, commercialStatus: { not: 'SOLD' } }, select: { id: true, color: true, commercialStatus: true, operationalStatus: true } },
        },
        orderBy: [{ make: { name: 'asc' } }, { name: 'asc' }],
      });
      return models.map(({ units, ...m }) => ({
        ...m,
        unitCount: units.length,
        availableCount: units.filter((u) => u.commercialStatus === 'AVAILABLE' && u.operationalStatus === 'RELEASED').length,
        colors: [...new Set(units.map((u) => u.color))].sort(),
      }));
    });
  }

  async model(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const model = await tx.vehicleModel.findUnique({
        where: { id },
        include: {
          make: true, category: true, versions: { orderBy: { name: 'asc' } },
          units: {
            where: { deletedAt: null },
            select: { id: true, plate: true, internalCode: true, color: true, yearModel: true, commercialStatus: true, operationalStatus: true, branchId: true, odometerKm: true },
            orderBy: { plate: 'asc' },
          },
        },
      });
      if (!model) throw new NotFoundException('Modelo não encontrado.');
      const files = await tx.fileAsset.findMany({ where: { entityType: 'VehicleModel', entityId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
      const live = model.units.filter((u) => u.commercialStatus !== 'SOLD');
      return {
        ...model,
        photos: files.filter((f) => f.category === 'photo').map(toRef),
        model3d: files.find((f) => f.id === model.model3dFileId) ? toRef(files.find((f) => f.id === model.model3dFileId)!) : null,
        colors: [...new Set(live.map((u) => u.color))].sort(),
      };
    });
  }

  async createModel(ctx: OrgContext, dto: ModelDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const makeId = await this.resolveMake(tx, ctx, dto.makeId, dto.makeName);
      if (!(await tx.vehicleCategory.findUnique({ where: { id: dto.categoryId } }))) throw new BadRequestException('Categoria inválida.');
      const { makeName: _unused, specs, hotspots, ...rest } = dto;
      const model = await tx.vehicleModel.create({
        data: {
          ...rest, makeId, organizationId: ctx.organizationId,
          specs: (specs ?? {}) as Prisma.InputJsonValue, hotspots: (hotspots ?? []) as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(tx, ctx, { action: 'catalog.model_created', entityType: 'VehicleModel', entityId: model.id, after: dto });
      return model;
    });
  }

  async updateModel(ctx: OrgContext, id: string, dto: UpdateModelDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.vehicleModel.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Modelo não encontrado.');
      if (dto.categoryId && !(await tx.vehicleCategory.findUnique({ where: { id: dto.categoryId } }))) throw new BadRequestException('Categoria inválida.');
      // Capa e arquivo 3D precisam ser anexos deste próprio modelo.
      for (const [field, category] of [['coverFileId', 'photo'], ['model3dFileId', 'model3d']] as const) {
        const fileId = dto[field];
        if (fileId) {
          const file = await tx.fileAsset.findUnique({ where: { id: fileId } });
          if (!file || file.deletedAt || file.entityType !== 'VehicleModel' || file.entityId !== id || file.category !== category) {
            throw new BadRequestException(field === 'coverFileId' ? 'A capa precisa ser uma foto deste modelo.' : 'O arquivo 3D precisa ser um .glb enviado para este modelo.');
          }
        }
      }
      const { specs, hotspots, ...rest } = dto;
      const model = await tx.vehicleModel.update({
        where: { id },
        data: {
          ...rest,
          ...(specs ? { specs: specs as Prisma.InputJsonValue } : {}),
          ...(hotspots ? { hotspots: hotspots as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'catalog.model_updated', entityType: 'VehicleModel', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return model;
    });
  }

  /* ---------------- Versões ---------------- */

  async createVersion(ctx: OrgContext, modelId: string, dto: VersionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      if (!(await tx.vehicleModel.findUnique({ where: { id: modelId } }))) throw new NotFoundException('Modelo não encontrado.');
      const { specs, ...rest } = dto;
      const version = await tx.vehicleVersion.create({
        data: { ...rest, modelId, organizationId: ctx.organizationId, specs: (specs ?? {}) as Prisma.InputJsonValue } as Prisma.VehicleVersionUncheckedCreateInput,
      });
      await this.audit.record(tx, ctx, { action: 'catalog.version_created', entityType: 'VehicleVersion', entityId: version.id, after: dto });
      return version;
    });
  }

  async updateVersion(ctx: OrgContext, id: string, dto: UpdateVersionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.vehicleVersion.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Versão não encontrada.');
      const { specs, ...rest } = dto;
      const version = await tx.vehicleVersion.update({
        where: { id },
        data: { ...rest, ...(specs ? { specs: specs as Prisma.InputJsonValue } : {}) } as Prisma.VehicleVersionUncheckedUpdateInput,
      });
      await this.audit.record(tx, ctx, { action: 'catalog.version_updated', entityType: 'VehicleVersion', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return version;
    });
  }

  private async resolveMake(tx: Tx, ctx: OrgContext, makeId?: string, makeName?: string): Promise<string> {
    if (makeId) {
      if (!(await tx.vehicleMake.findUnique({ where: { id: makeId } }))) throw new BadRequestException('Marca inválida.');
      return makeId;
    }
    if (!makeName?.trim()) throw new BadRequestException('Informe a marca.');
    const existing = await tx.vehicleMake.findFirst({ where: { name: { equals: makeName.trim(), mode: 'insensitive' } } });
    if (existing) return existing.id;
    const make = await tx.vehicleMake.create({ data: { organizationId: ctx.organizationId, name: makeName.trim() } });
    return make.id;
  }
}

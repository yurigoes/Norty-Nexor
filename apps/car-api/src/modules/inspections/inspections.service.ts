import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_CHECKLIST, INSPECTION_ITEM_STATUS_LABEL, INSPECTION_TYPE_LABEL, VEHICLE_REGIONS, type InspectionItemStatus,
} from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CounterService } from '../../common/counter.service';
import { TimelineService } from '../../common/timeline.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { assertBranch, branchWhere, type OrgContext } from '../../common/context';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import type {
  CompleteInspectionDto, CreateInspectionDto, DamageDto, InspectionQueryDto, ItemDto, PhotoDto, TemplateDto, UpdateInspectionDto,
  UpdateTemplateDto,
} from './dto';

type ChecklistItem = { key: string; label: string; area: string };

const REGION_LABEL = Object.fromEntries(VEHICLE_REGIONS.map((r) => [r.key, r.label])) as Record<string, string>;
const DRAFT_ONLY = 'Vistoria concluída não pode ser alterada. Para registrar algo novo, abra outra vistoria.';

/**
 * Vistorias digitais. Enquanto em preenchimento, tudo pode mudar; ao
 * concluir, os gatilhos do banco congelam itens, avarias e fotos — a
 * evidência não pode ser trocada depois.
 *
 * A comparação entre vistorias aponta diferenças para revisão humana.
 * Ela não diz quem causou um dano: uma diferença na foto pode ser luz,
 * ângulo ou um registro anterior incompleto.
 */
@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counter: CounterService,
    private readonly timeline: TimelineService,
    private readonly status: VehicleStatusService,
  ) {}

  /* ================= Modelos de checklist ================= */

  templates(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.inspectionTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }));
  }

  async createTemplate(ctx: OrgContext, dto: TemplateDto) {
    this.assertUniqueKeys(dto.items);
    return this.prisma.tenant(ctx, async (tx) => {
      if (dto.isDefault) await tx.inspectionTemplate.updateMany({ data: { isDefault: false } });
      const t = await tx.inspectionTemplate.create({ data: { organizationId: ctx.organizationId, name: dto.name, items: dto.items as unknown as Prisma.InputJsonValue, isDefault: dto.isDefault ?? false } });
      await this.audit.record(tx, ctx, { action: 'inspection.template_created', entityType: 'InspectionTemplate', entityId: t.id, after: dto });
      return t;
    });
  }

  async updateTemplate(ctx: OrgContext, id: string, dto: UpdateTemplateDto) {
    if (dto.items) this.assertUniqueKeys(dto.items);
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.inspectionTemplate.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Modelo não encontrado.');
      if (dto.isDefault) await tx.inspectionTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      const t = await tx.inspectionTemplate.update({ where: { id }, data: { name: dto.name, isDefault: dto.isDefault, items: dto.items as unknown as Prisma.InputJsonValue | undefined } });
      await this.audit.record(tx, ctx, { action: 'inspection.template_updated', entityType: 'InspectionTemplate', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return t;
    });
  }

  /* ================= Consulta ================= */

  async list(ctx: OrgContext, query: InspectionQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const q = query.q?.trim();
    const where: Prisma.InspectionWhereInput = {
      ...branchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(q ? { OR: [
        { number: { contains: q, mode: 'insensitive' } },
        { vehicle: { plate: { contains: q.replace(/[^A-Za-z0-9]/g, '').toUpperCase() } } },
        { contract: { number: { contains: q, mode: 'insensitive' } } },
      ] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.inspection.findMany({
          where, skip, take, orderBy: orderBy(query, ['startedAt', 'completedAt', 'number'], { startedAt: 'desc' }),
          include: {
            vehicle: { select: { id: true, plate: true, model: { select: { name: true, make: { select: { name: true } } } } } },
            contract: { select: { id: true, number: true } },
            _count: { select: { photos: true, damages: true } },
            items: { where: { status: { in: ['DAMAGED', 'MISSING'] } }, select: { key: true } },
          },
        }),
        tx.inspection.count({ where }),
      ]);
      return paginated(rows.map(({ items, ...r }) => ({ ...r, issues: items.length })), total, page, pageSize);
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => this.detail(tx, ctx, id));
  }

  private async detail(tx: Tx, ctx: OrgContext, id: string) {
    const inspection = await tx.inspection.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, plate: true, internalCode: true, color: true, odometerKm: true, model: { select: { name: true, make: { select: { name: true } } } } } },
        contract: { select: { id: true, number: true, status: true, customer: { select: { id: true, name: true } } } },
        items: true,
        damages: { orderBy: { createdAt: 'asc' } },
        photos: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inspection) throw new NotFoundException('Vistoria não encontrada.');
    assertBranch(ctx, inspection.branchId);
    const fileIds = [...inspection.photos.map((p) => p.fileId), ...(inspection.signatureFileId ? [inspection.signatureFileId] : [])];
    const files = await tx.fileAsset.findMany({ where: { id: { in: fileIds } }, select: { id: true, originalName: true, mimeType: true, size: true } });
    const [driver, inspector] = await Promise.all([
      inspection.driverId ? tx.driver.findUnique({ where: { id: inspection.driverId }, select: { id: true, name: true } }) : null,
      tx.membership.findFirst({ where: { userId: inspection.inspectorId }, select: { user: { select: { name: true } } } }),
    ]);
    // Ordem do checklist segue o modelo padrão (a do banco é arbitrária);
    // itens de modelos próprios vêm depois, agrupados por área.
    const order = new Map(DEFAULT_CHECKLIST.map((c, i) => [c.key, i]));
    return {
      ...inspection,
      items: [...inspection.items].sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999) || a.area.localeCompare(b.area) || a.label.localeCompare(b.label)),
      photos: inspection.photos.map((p) => ({ ...p, file: files.find((f) => f.id === p.fileId) ?? null })),
      driver,
      inspectorName: inspector?.user.name ?? null,
      damages: inspection.damages.map((d) => ({ ...d, regionLabel: REGION_LABEL[d.region] ?? d.region })),
    };
  }

  /** Vistoria concluída anterior do mesmo veículo — base natural de comparação. */
  async previous(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const current = await tx.inspection.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Vistoria não encontrada.');
      assertBranch(ctx, current.branchId);
      const prev = await tx.inspection.findFirst({
        where: { vehicleUnitId: current.vehicleUnitId, id: { not: id }, status: { in: ['COMPLETED', 'APPROVED'] }, startedAt: { lt: current.startedAt } },
        orderBy: { startedAt: 'desc' }, select: { id: true, number: true, type: true, completedAt: true },
      });
      return prev;
    });
  }

  /* ================= Preenchimento ================= */

  async create(ctx: OrgContext, dto: CreateInspectionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
      assertBranch(ctx, vehicle.branchId);
      let driverId = dto.driverId ?? null;
      if (dto.contractId) {
        const contract = await tx.rentalContract.findUnique({
          where: { id: dto.contractId },
          include: { vehicles: { where: { endAt: null } }, drivers: { where: { endAt: null, primary: true } } },
        });
        if (!contract) throw new NotFoundException('Contrato não encontrado.');
        if (['CLOSED', 'TERMINATED', 'CANCELLED'].includes(contract.status)) throw new ConflictException('O contrato já está encerrado.');
        const open = contract.vehicles[0];
        // Entrega pode ser de um carro novo (troca de veículo); as demais
        // vistorias de contrato são do carro que está com o cliente.
        if (dto.type !== 'DELIVERY' && open && open.vehicleUnitId !== vehicle.id) {
          throw new BadRequestException('Este veículo não é o que está vinculado ao contrato.');
        }
        if (dto.type !== 'DELIVERY' && !open) {
          const reserved = contract.reservationId ? await tx.reservation.findUnique({ where: { id: contract.reservationId }, select: { vehicleUnitId: true } }) : null;
          if (reserved?.vehicleUnitId !== vehicle.id) throw new BadRequestException('O contrato ainda não tem veículo entregue.');
        }
        driverId ??= contract.drivers[0]?.driverId ?? null;
      }
      if (driverId && !(await tx.driver.findUnique({ where: { id: driverId }, select: { id: true } }))) throw new BadRequestException('Motorista inválido.');

      const template = dto.templateId
        ? await tx.inspectionTemplate.findUnique({ where: { id: dto.templateId } })
        : await tx.inspectionTemplate.findFirst({ where: { isDefault: true } });
      if (dto.templateId && !template) throw new BadRequestException('Modelo de checklist inválido.');
      const checklist = ((template?.items as ChecklistItem[] | undefined) ?? DEFAULT_CHECKLIST).filter((i) => i?.key && i?.label);

      const inspection = await tx.inspection.create({
        data: {
          organizationId: ctx.organizationId, branchId: vehicle.branchId,
          number: await this.counter.next(tx, ctx.organizationId, 'inspection', 'VIS-'),
          type: dto.type, vehicleUnitId: vehicle.id, contractId: dto.contractId ?? null, driverId, inspectorId: ctx.userId,
          items: { create: checklist.map((i) => ({ organizationId: ctx.organizationId, key: i.key, label: i.label, area: i.area ?? 'Geral' })) },
        },
      });
      if (vehicle.operationalStatus === 'RELEASED') {
        await this.status.setOperational(tx, ctx, ctx.organizationId, vehicle.id, 'IN_INSPECTION', `Vistoria ${inspection.number}`);
      }
      await this.audit.record(tx, ctx, { action: 'inspection.created', entityType: 'Inspection', entityId: inspection.id, branchId: vehicle.branchId, after: { ...dto, number: inspection.number } });
      return this.detail(tx, ctx, inspection.id);
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateInspectionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const inspection = await this.loadDraft(tx, ctx, id);
      if (dto.driverId && !(await tx.driver.findUnique({ where: { id: dto.driverId }, select: { id: true } }))) throw new BadRequestException('Motorista inválido.');
      await tx.inspection.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'inspection.updated', entityType: 'Inspection', entityId: id, branchId: inspection.branchId, ...AuditService.diff(inspection as never, dto as never) });
      return this.detail(tx, ctx, id);
    });
  }

  async setItem(ctx: OrgContext, id: string, key: string, dto: ItemDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.loadDraft(tx, ctx, id);
      const item = await tx.inspectionItem.findUnique({ where: { inspectionId_key: { inspectionId: id, key } } });
      if (!item) throw new NotFoundException('Item do checklist não encontrado.');
      return tx.inspectionItem.update({ where: { id: item.id }, data: { status: dto.status, notes: dto.notes ?? null } });
    });
  }

  async addDamage(ctx: OrgContext, id: string, dto: DamageDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.loadDraft(tx, ctx, id);
      return tx.inspectionDamage.create({ data: { organizationId: ctx.organizationId, inspectionId: id, ...dto } });
    });
  }

  async removeDamage(ctx: OrgContext, id: string, damageId: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.loadDraft(tx, ctx, id);
      const damage = await tx.inspectionDamage.findUnique({ where: { id: damageId } });
      if (!damage || damage.inspectionId !== id) throw new NotFoundException('Avaria não encontrada.');
      await tx.inspectionDamage.delete({ where: { id: damageId } });
    });
  }

  /** Liga uma foto já enviada (/files) à vistoria. Só imagem desta vistoria e desta empresa. */
  async addPhoto(ctx: OrgContext, id: string, dto: PhotoDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.loadDraft(tx, ctx, id);
      const file = await tx.fileAsset.findUnique({ where: { id: dto.fileId } });
      if (!file || file.deletedAt || file.entityType !== 'Inspection' || file.entityId !== id) {
        throw new BadRequestException('Arquivo não pertence a esta vistoria.');
      }
      if (!file.mimeType.startsWith('image/')) throw new BadRequestException('A evidência da vistoria precisa ser uma imagem.');
      if (dto.itemKey && !(await tx.inspectionItem.findUnique({ where: { inspectionId_key: { inspectionId: id, key: dto.itemKey } } }))) {
        throw new BadRequestException('Item do checklist inválido.');
      }
      if (await tx.inspectionPhoto.findFirst({ where: { inspectionId: id, fileId: dto.fileId } })) throw new ConflictException('Esta foto já está na vistoria.');
      return tx.inspectionPhoto.create({ data: { organizationId: ctx.organizationId, inspectionId: id, ...dto } });
    });
  }

  async removePhoto(ctx: OrgContext, id: string, photoId: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.loadDraft(tx, ctx, id);
      const photo = await tx.inspectionPhoto.findUnique({ where: { id: photoId } });
      if (!photo || photo.inspectionId !== id) throw new NotFoundException('Foto não encontrada.');
      await tx.inspectionPhoto.delete({ where: { id: photoId } });
    });
  }

  /**
   * Conclusão: confere a completude, congela a evidência (o gatilho faz o
   * resto), registra o hodômetro e entra na linha do tempo da placa.
   */
  async complete(ctx: OrgContext, id: string, dto: CompleteInspectionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const inspection = await this.loadDraft(tx, ctx, id);
      if (inspection.odometerKm === null || inspection.odometerKm === undefined) throw new BadRequestException('Informe a quilometragem antes de concluir.');
      if (inspection.fuelEighths === null || inspection.fuelEighths === undefined) throw new BadRequestException('Informe o nível de combustível antes de concluir.');
      const items = await tx.inspectionItem.findMany({ where: { inspectionId: id } });
      const photos = await tx.inspectionPhoto.findMany({ where: { inspectionId: id } });
      const unexplained = items.filter((i) => i.status === 'DAMAGED' && !i.notes?.trim() && !photos.some((p) => p.itemKey === i.key));
      if (unexplained.length) {
        throw new BadRequestException(`Itens avariados precisam de foto ou descrição: ${unexplained.map((i) => i.label).join(', ')}.`);
      }
      if (dto.confirmationType === 'SIGNATURE_DRAWN') {
        if (!dto.signatureFileId) throw new BadRequestException('Envie a assinatura.');
        const sig = await tx.fileAsset.findUnique({ where: { id: dto.signatureFileId } });
        if (!sig || sig.entityType !== 'Inspection' || sig.entityId !== id || !sig.mimeType.startsWith('image/')) {
          throw new BadRequestException('Assinatura inválida para esta vistoria.');
        }
      }
      const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: inspection.vehicleUnitId } });
      const completedAt = new Date();
      await tx.inspection.update({
        where: { id },
        data: {
          status: 'COMPLETED', completedAt, confirmationType: dto.confirmationType, signerName: dto.signerName.trim(),
          signatureFileId: dto.confirmationType === 'SIGNATURE_DRAWN' ? dto.signatureFileId : null,
        },
      });
      await this.timeline.odometer(tx, ctx, ctx.organizationId, vehicle.id, inspection.odometerKm, 'INSPECTION', id);
      const damaged = items.filter((i) => i.status === 'DAMAGED' || i.status === 'MISSING').length;
      const damages = await tx.inspectionDamage.count({ where: { inspectionId: id } });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'INSPECTION', title: `Vistoria de ${INSPECTION_TYPE_LABEL[inspection.type].toLowerCase()} ${inspection.number}`,
        description: `${inspection.odometerKm.toLocaleString('pt-BR')} km · combustível ${inspection.fuelEighths}/8 · ${damaged} item(ns) com ressalva · ${damages} avaria(s) no mapa · ${photos.length} foto(s)`,
        refType: 'Inspection', refId: id, data: { contractId: inspection.contractId, damages, photos: photos.length },
      });
      if (vehicle.operationalStatus === 'IN_INSPECTION') {
        await this.status.setOperational(tx, ctx, ctx.organizationId, vehicle.id, 'RELEASED', `Vistoria ${inspection.number} concluída`);
      }
      await this.audit.record(tx, ctx, {
        action: 'inspection.completed', entityType: 'Inspection', entityId: id, branchId: inspection.branchId,
        after: { odometerKm: inspection.odometerKm, fuelEighths: inspection.fuelEighths, confirmationType: dto.confirmationType, signerName: dto.signerName, photos: photos.length, damages },
      });
      return this.detail(tx, ctx, id);
    });
  }

  async approve(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const inspection = await this.load(tx, ctx, id);
      if (inspection.status !== 'COMPLETED') throw new ConflictException('Só vistoria concluída pode ser aprovada.');
      await tx.inspection.update({ where: { id }, data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'inspection.approved', entityType: 'Inspection', entityId: id, branchId: inspection.branchId });
      return this.detail(tx, ctx, id);
    });
  }

  /** Libera a vistoria e suas fotos no portal do cliente do contrato. */
  async releaseToCustomer(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const inspection = await this.load(tx, ctx, id);
      if (inspection.status === 'DRAFT') throw new ConflictException('Conclua a vistoria antes de liberar ao cliente.');
      if (!inspection.contractId) throw new ConflictException('Só vistorias ligadas a contrato aparecem no portal do cliente.');
      await tx.inspection.update({ where: { id }, data: { visibleToCustomer: true } });
      await tx.fileAsset.updateMany({ where: { entityType: 'Inspection', entityId: id, deletedAt: null }, data: { customerVisible: true } });
      await this.audit.record(tx, ctx, { action: 'inspection.released_to_customer', entityType: 'Inspection', entityId: id, branchId: inspection.branchId });
      return this.detail(tx, ctx, id);
    });
  }

  /**
   * Diferenças entre duas vistorias do mesmo veículo, para revisão humana.
   * "Avaria nova" = região marcada na atual e não na base. Não há atribuição
   * de responsabilidade aqui.
   */
  async compare(ctx: OrgContext, baseId: string, currentId: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const [base, current] = await Promise.all([this.detail(tx, ctx, baseId), this.detail(tx, ctx, currentId)]);
      if (base.vehicleUnitId !== current.vehicleUnitId) throw new BadRequestException('As vistorias precisam ser do mesmo veículo.');
      const keys = [...new Set([...base.items.map((i) => i.key), ...current.items.map((i) => i.key)])];
      const items = keys.map((key) => {
        const b = base.items.find((i) => i.key === key);
        const c = current.items.find((i) => i.key === key);
        const worsened = rank(c?.status) > rank(b?.status);
        return {
          key, label: c?.label ?? b?.label ?? key, area: c?.area ?? b?.area ?? '',
          baseStatus: b?.status ?? null, currentStatus: c?.status ?? null,
          baseLabel: b ? INSPECTION_ITEM_STATUS_LABEL[b.status as InspectionItemStatus] : null,
          currentLabel: c ? INSPECTION_ITEM_STATUS_LABEL[c.status as InspectionItemStatus] : null,
          baseNotes: b?.notes ?? null, currentNotes: c?.notes ?? null,
          changed: (b?.status ?? null) !== (c?.status ?? null), worsened,
        };
      });
      const baseRegions = new Set(base.damages.map((d) => d.region));
      const currentRegions = new Set(current.damages.map((d) => d.region));
      return {
        base: summary(base), current: summary(current),
        items: items.filter((i) => i.changed),
        unchangedItems: items.filter((i) => !i.changed).length,
        damages: {
          newInCurrent: current.damages.filter((d) => !baseRegions.has(d.region)),
          onlyInBase: base.damages.filter((d) => !currentRegions.has(d.region)),
          inBoth: current.damages.filter((d) => baseRegions.has(d.region)),
        },
        odometerDelta: base.odometerKm !== null && current.odometerKm !== null ? current.odometerKm - base.odometerKm : null,
        fuelDelta: base.fuelEighths !== null && current.fuelEighths !== null ? current.fuelEighths - base.fuelEighths : null,
        humanReviewRequired: true,
        notice: 'Diferenças para revisão humana. A comparação não determina responsabilidade: confira as fotos, as condições do registro e o histórico antes de qualquer cobrança.',
        // Comparação visual por IA: estrutura prevista, sem provedor configurado.
        aiVisualComparison: { status: 'NOT_CONFIGURED', message: 'Comparação visual assistida por IA pendente de configuração.' },
      };
    });
  }

  /* ================= Auxiliares ================= */

  private async load(tx: Tx, ctx: OrgContext, id: string) {
    const inspection = await tx.inspection.findUnique({ where: { id } });
    if (!inspection) throw new NotFoundException('Vistoria não encontrada.');
    assertBranch(ctx, inspection.branchId);
    return inspection;
  }

  private async loadDraft(tx: Tx, ctx: OrgContext, id: string) {
    const inspection = await this.load(tx, ctx, id);
    if (inspection.status !== 'DRAFT') throw new ConflictException(DRAFT_ONLY);
    if (inspection.inspectorId !== ctx.userId && !ctx.permissions.has('inspections.approve')) {
      throw new ConflictException('Esta vistoria está sendo preenchida por outro vistoriador.');
    }
    return inspection;
  }

  private assertUniqueKeys(items: { key: string }[]): void {
    if (new Set(items.map((i) => i.key)).size !== items.length) throw new BadRequestException('Cada item do checklist precisa de uma chave única.');
  }
}

/** Gravidade para comparar estados de item: piorou se subiu na escala. */
function rank(status?: string | null): number {
  return status === 'DAMAGED' ? 2 : status === 'MISSING' ? 3 : status === 'OK' ? 1 : 0;
}

function summary(i: { id: string; number: string; type: string; status: string; completedAt: Date | null; startedAt: Date; odometerKm: number | null; fuelEighths: number | null }) {
  return { id: i.id, number: i.number, type: i.type, status: i.status, completedAt: i.completedAt, startedAt: i.startedAt, odometerKm: i.odometerKm, fuelEighths: i.fuelEighths };
}

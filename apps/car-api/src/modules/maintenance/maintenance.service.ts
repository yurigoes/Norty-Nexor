import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WORK_ORDER_STATUS_LABEL, WORK_ORDER_TRANSITIONS, maintenanceDue, type WorkOrderStatus } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CounterService } from '../../common/counter.service';
import { TimelineService } from '../../common/timeline.service';
import { AvailabilityService } from '../../common/availability.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { assertApprovalLimit, assertBranch, branchWhere, can, type OrgContext } from '../../common/context';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import { num } from '../../common/serialize.interceptor';
import { StockService } from '../inventory/stock.service';
import type {
  CompleteDto, PlanDto, PlanQueryDto, ServiceTypeDto, UpdatePlanDto, UpdateServiceTypeDto, UpdateWorkOrderDto, WorkOrderDto,
  WorkOrderItemDto, WorkOrderQueryDto,
} from './dto';

const CLOSED: WorkOrderStatus[] = ['COMPLETED', 'CANCELLED'];
const DEFAULT_BLOCK_DAYS = 3;

const LIST_INCLUDE = {
  vehicle: { select: { id: true, plate: true, internalCode: true, model: { select: { name: true, make: { select: { name: true } } } } } },
  serviceType: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} as const;

/**
 * Ordens de serviço e manutenção preventiva.
 *
 * A OS que bloqueia o veículo ocupa a agenda (alocação MAINTENANCE): a
 * mesma restrição de exclusão que impede duas locações sobrepostas
 * impede locar um carro que está na oficina.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counter: CounterService,
    private readonly timeline: TimelineService,
    private readonly availability: AvailabilityService,
    private readonly status: VehicleStatusService,
    private readonly stock: StockService,
  ) {}

  /* ================= Tipos de serviço ================= */

  serviceTypes(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.maintenanceServiceType.findMany({ orderBy: { name: 'asc' } }));
  }

  createServiceType(ctx: OrgContext, dto: ServiceTypeDto) {
    return this.prisma.tenant(ctx, (tx) => tx.maintenanceServiceType.create({ data: { organizationId: ctx.organizationId, name: dto.name.trim(), active: dto.active ?? true } }));
  }

  async updateServiceType(ctx: OrgContext, id: string, dto: UpdateServiceTypeDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      if (!(await tx.maintenanceServiceType.findUnique({ where: { id } }))) throw new NotFoundException('Tipo de serviço não encontrado.');
      return tx.maintenanceServiceType.update({ where: { id }, data: dto });
    });
  }

  /* ================= Ordens de serviço ================= */

  async list(ctx: OrgContext, query: WorkOrderQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const q = query.q?.trim();
    const where: Prisma.WorkOrderWhereInput = {
      ...branchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status as WorkOrderStatus } : query.open ? { status: { notIn: CLOSED } } : {}),
      ...(query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {}),
      ...(query.claimId ? { claimId: query.claimId } : {}),
      ...(q ? { OR: [
        { number: { contains: q, mode: 'insensitive' } },
        { vehicle: { plate: { contains: q.replace(/[^A-Za-z0-9]/g, '').toUpperCase() } } },
        { description: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.workOrder.findMany({ where, include: LIST_INCLUDE, skip, take, orderBy: orderBy(query, ['openedAt', 'dueAt', 'number', 'priority'], { openedAt: 'desc' }) }),
        tx.workOrder.count({ where }),
      ]);
      const now = Date.now();
      return paginated(rows.map((w) => ({ ...w, overdue: Boolean(w.dueAt && w.dueAt.getTime() < now && !CLOSED.includes(w.status)) })), total, page, pageSize);
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id },
        include: { ...LIST_INCLUDE, items: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { at: 'asc' } } },
      });
      if (!wo) throw new NotFoundException('Ordem de serviço não encontrada.');
      assertBranch(ctx, wo.branchId);
      const allocation = await tx.vehicleAllocation.findFirst({ where: { workOrderId: id }, orderBy: { createdAt: 'desc' } });
      const payables = await tx.payable.findMany({ where: { workOrderId: id }, select: { id: true, amount: true, status: true, approval: true, dueDate: true } });
      const products = await tx.inventoryProduct.findMany({
        where: { id: { in: wo.items.map((i) => i.productId).filter(Boolean) as string[] } }, select: { id: true, sku: true, unit: true },
      });
      const claim = wo.claimId ? await tx.claim.findUnique({ where: { id: wo.claimId }, select: { id: true, number: true, status: true } }) : null;
      const total = num(wo.laborCost) + num(wo.partsCost) + num(wo.otherCost);
      return {
        ...wo,
        items: wo.items.map((i) => ({ ...i, product: products.find((p) => p.id === i.productId) ?? null })),
        allocation, payables, claim,
        totalCost: Math.round(total * 100) / 100,
        exceedsApproval: wo.approvedAmount !== null && total > num(wo.approvedAmount) + 0.004,
        allowedTransitions: WORK_ORDER_TRANSITIONS[wo.status].filter((s) => s !== 'COMPLETED' && s !== 'CANCELLED'),
      };
    });
  }

  async create(ctx: OrgContext, dto: WorkOrderDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
      assertBranch(ctx, vehicle.branchId);
      if (vehicle.commercialStatus === 'SOLD') throw new ConflictException('Veículo vendido não recebe ordem de serviço.');
      if (!(await tx.maintenanceServiceType.findUnique({ where: { id: dto.serviceTypeId } }))) throw new BadRequestException('Tipo de serviço inválido.');
      if (dto.supplierId && !(await tx.supplier.findUnique({ where: { id: dto.supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
      if (dto.maintenancePlanId) {
        const plan = await tx.maintenancePlan.findUnique({ where: { id: dto.maintenancePlanId } });
        if (!plan || plan.vehicleUnitId !== vehicle.id) throw new BadRequestException('Plano de manutenção não é deste veículo.');
      }
      if (dto.claimId) {
        const claim = await tx.claim.findUnique({ where: { id: dto.claimId } });
        if (!claim || claim.vehicleUnitId !== vehicle.id) throw new BadRequestException('O sinistro não é deste veículo.');
        if (claim.workOrderId) throw new ConflictException('Este sinistro já tem ordem de serviço.');
      }
      const blocks = dto.blocksVehicle ?? true;
      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      if (blocks && dueAt && dueAt <= new Date()) throw new BadRequestException('O prazo precisa ser futuro para reservar a agenda do veículo.');

      const wo = await tx.workOrder.create({
        data: {
          organizationId: ctx.organizationId, branchId: vehicle.branchId,
          number: await this.counter.next(tx, ctx.organizationId, 'work_order', 'OS-'),
          vehicleUnitId: vehicle.id, odometerKm: dto.odometerKm ?? vehicle.odometerKm, serviceTypeId: dto.serviceTypeId,
          kind: dto.kind, description: dto.description, priority: dto.priority ?? 'MEDIUM', dueAt,
          supplierId: dto.supplierId ?? null, responsibleId: dto.responsibleId ?? null,
          estimateAmount: dto.estimateAmount ?? null, blocksVehicle: blocks, claimId: dto.claimId ?? null,
          maintenancePlanId: dto.maintenancePlanId ?? null, createdById: ctx.userId,
          status: dto.estimateAmount ? 'AWAITING_APPROVAL' : 'OPEN',
        },
      });
      await tx.workOrderEvent.create({ data: { organizationId: ctx.organizationId, workOrderId: wo.id, toStatus: wo.status, note: 'Ordem aberta', userId: ctx.userId } });

      if (blocks) {
        const now = new Date();
        await this.availability.allocate(tx, ctx.organizationId, {
          vehicleUnitId: vehicle.id, kind: 'MAINTENANCE', startsAt: now,
          endsAt: dueAt ?? new Date(now.getTime() + DEFAULT_BLOCK_DAYS * 86_400_000), bufferHours: 0,
          workOrderId: wo.id, reason: `OS ${wo.number}`, createdById: ctx.userId,
        });
        if (vehicle.operationalStatus !== 'BLOCKED') {
          await this.status.setOperational(tx, ctx, ctx.organizationId, vehicle.id, 'IN_MAINTENANCE', `OS ${wo.number}`);
        }
      }
      if (dto.claimId) await tx.claim.update({ where: { id: dto.claimId }, data: { workOrderId: wo.id } });
      if (dto.odometerKm !== undefined) await this.timeline.odometer(tx, ctx, ctx.organizationId, vehicle.id, dto.odometerKm, 'WORK_ORDER', wo.id);
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'MAINTENANCE', title: `OS ${wo.number} aberta`, description: dto.description,
        refType: 'WorkOrder', refId: wo.id,
      });
      await this.audit.record(tx, ctx, { action: 'work_order.created', entityType: 'WorkOrder', entityId: wo.id, branchId: wo.branchId, after: { ...dto, number: wo.number } });
      return wo;
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateWorkOrderDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      this.assertOpen(wo.status);
      if (dto.estimateAmount !== undefined && wo.approvedAt) {
        throw new ConflictException('O orçamento já foi aprovado. Valores acima do aprovado exigem nova aprovação na conclusão.');
      }
      if (dto.supplierId && !(await tx.supplier.findUnique({ where: { id: dto.supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
      const updated = await tx.workOrder.update({ where: { id }, data: { ...dto, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined } });
      if (dto.dueAt && wo.blocksVehicle) {
        const allocation = await tx.vehicleAllocation.findFirst({ where: { workOrderId: id, active: true } });
        if (allocation) await this.availability.extend(tx, ctx.organizationId, allocation.id, new Date(dto.dueAt));
      }
      await this.audit.record(tx, ctx, { action: 'work_order.updated', entityType: 'WorkOrder', entityId: id, branchId: wo.branchId, ...AuditService.diff(wo as never, dto as never) });
      return updated;
    });
  }

  /** Avanço de situação conforme o fluxo do shared. Concluir e cancelar têm rotas próprias. */
  async transition(ctx: OrgContext, id: string, to: WorkOrderStatus, note?: string) {
    if (to === 'COMPLETED' || to === 'CANCELLED') throw new BadRequestException('Use as ações de concluir ou cancelar.');
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      if (!WORK_ORDER_TRANSITIONS[wo.status].includes(to)) {
        throw new ConflictException(`Não é possível passar de "${WORK_ORDER_STATUS_LABEL[wo.status]}" para "${WORK_ORDER_STATUS_LABEL[to]}".`);
      }
      if (to === 'AWAITING_APPROVAL' && !wo.estimateAmount) throw new BadRequestException('Informe o orçamento antes de pedir aprovação.');
      if (wo.status === 'AWAITING_APPROVAL' && !wo.approvedAt) throw new ForbiddenException('O orçamento precisa ser aprovado antes de seguir.');
      return this.setStatus(tx, ctx, wo, to, note);
    });
  }

  /** Aprovação do orçamento, dentro da alçada de quem aprova. */
  async approve(ctx: OrgContext, id: string, note?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      this.assertOpen(wo.status);
      if (!wo.estimateAmount) throw new BadRequestException('A ordem não tem orçamento para aprovar.');
      if (wo.approvedAt) throw new ConflictException('O orçamento já foi aprovado.');
      const amount = num(wo.estimateAmount);
      assertApprovalLimit(ctx, amount, 'o orçamento desta OS');
      await tx.workOrder.update({ where: { id }, data: { approvedAmount: amount, approvedById: ctx.userId, approvedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'work_order.approved', entityType: 'WorkOrder', entityId: id, branchId: wo.branchId, after: { approvedAmount: amount }, reason: note });
      const next = wo.status === 'AWAITING_APPROVAL' || wo.status === 'OPEN' || wo.status === 'AWAITING_ESTIMATE' ? 'IN_PROGRESS' : wo.status;
      if (next !== wo.status) return this.setStatus(tx, ctx, wo, next, note ?? `Orçamento aprovado: R$ ${amount.toFixed(2)}`);
      return tx.workOrder.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Item da OS. Peça sai do estoque na mesma transação (saída para
   * manutenção, com a placa e o custo médio); repetir a mesma chave não
   * baixa duas vezes.
   */
  async addItem(ctx: OrgContext, id: string, dto: WorkOrderItemDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      this.assertOpen(wo.status);
      let unitCost = dto.unitCost ?? 0;
      let description = dto.description?.trim() ?? '';
      let movementId: string | null = null;
      if (dto.type === 'PART') {
        if (!ctx.permissions.has('inventory.move')) throw new ForbiddenException('Seu perfil não pode baixar peças do estoque.');
        if (!dto.productId || !dto.locationId) throw new BadRequestException('Informe o produto e o local de onde a peça sai.');
        const movement = await this.stock.move(tx, ctx, ctx.organizationId, {
          productId: dto.productId, locationId: dto.locationId, type: 'MAINTENANCE_OUT', quantity: dto.quantity,
          workOrderId: id, vehicleUnitId: wo.vehicleUnitId, reason: `OS ${wo.number}`, idempotencyKey: dto.idempotencyKey,
        });
        const existing = await tx.workOrderItem.findUnique({ where: { movementId: movement.id } });
        if (existing) return existing;
        unitCost = num(movement.unitCost);
        movementId = movement.id;
        description ||= movement.product.description;
      } else if (dto.unitCost === undefined) {
        throw new BadRequestException('Informe o valor unitário.');
      }
      if (!description) throw new BadRequestException('Descreva o item.');
      const item = await tx.workOrderItem.create({
        data: {
          organizationId: ctx.organizationId, workOrderId: id, type: dto.type, description, productId: dto.productId ?? null,
          quantity: dto.quantity, unitCost, total: Math.round(dto.quantity * unitCost * 100) / 100, movementId, createdById: ctx.userId,
        },
      });
      await this.recalc(tx, id);
      await this.audit.record(tx, ctx, { action: 'work_order.item_added', entityType: 'WorkOrder', entityId: id, branchId: wo.branchId, after: { type: dto.type, description, quantity: dto.quantity, total: num(item.total) } });
      return item;
    });
  }

  /** Itens de serviço e despesa podem ser removidos enquanto a OS está aberta; peça volta por devolução ao estoque. */
  async removeItem(ctx: OrgContext, id: string, itemId: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      this.assertOpen(wo.status);
      const item = await tx.workOrderItem.findUnique({ where: { id: itemId } });
      if (!item || item.workOrderId !== id) throw new NotFoundException('Item não encontrado.');
      if (item.type === 'PART') throw new ConflictException('Peça já baixada do estoque: registre a devolução no estoque (estorno da movimentação).');
      await tx.workOrderItem.delete({ where: { id: itemId } });
      await this.recalc(tx, id);
      await this.audit.record(tx, ctx, { action: 'work_order.item_removed', entityType: 'WorkOrder', entityId: id, branchId: wo.branchId, before: { description: item.description, total: num(item.total) } });
    });
  }

  /**
   * Conclusão. Custo total acima do aprovado (ou sem aprovação) exige que
   * quem conclui tenha a permissão e a alçada para o valor final.
   */
  async complete(ctx: OrgContext, id: string, dto: CompleteDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      if (wo.status !== 'IN_PROGRESS') throw new ConflictException('Só uma OS em execução pode ser concluída.');
      const items = await tx.workOrderItem.findMany({ where: { workOrderId: id } });
      if (!items.length) throw new BadRequestException('Registre ao menos um item (peça, mão de obra, serviço ou despesa) antes de concluir.');
      await this.recalc(tx, id);
      const fresh = await tx.workOrder.findUniqueOrThrow({ where: { id } });
      const labor = num(fresh.laborCost);
      const parts = num(fresh.partsCost);
      const other = num(fresh.otherCost);
      const total = Math.round((labor + parts + other) * 100) / 100;
      const approved = fresh.approvedAmount === null ? null : num(fresh.approvedAmount);
      if (total > 0 && (approved === null || total > approved + 0.004)) {
        if (!can(ctx, 'maintenance.approve')) {
          throw new ForbiddenException(approved === null
            ? 'Esta OS tem custos e não passou por aprovação. Peça a aprovação de quem tem alçada.'
            : `O custo final (R$ ${total.toFixed(2)}) excede o aprovado (R$ ${approved.toFixed(2)}). É preciso nova aprovação.`);
        }
        assertApprovalLimit(ctx, total, 'o custo final desta OS');
        await tx.workOrder.update({ where: { id }, data: { approvedAmount: total, approvedById: ctx.userId, approvedAt: new Date() } });
      }
      const thirdParty = Math.round((labor + other) * 100) / 100;
      if (thirdParty > 0 && fresh.supplierId) {
        await tx.payable.create({
          data: {
            organizationId: ctx.organizationId, branchId: fresh.branchId, supplierId: fresh.supplierId, kind: 'MAINTENANCE',
            description: `OS ${fresh.number} — serviços`, amount: thirdParty,
            dueDate: dto.payableDueDate ? new Date(dto.payableDueDate) : new Date(Date.now() + 30 * 86_400_000),
            approval: 'APPROVED', approvedById: fresh.approvedById ?? ctx.userId, approvedAt: fresh.approvedAt ?? new Date(),
            vehicleUnitId: fresh.vehicleUnitId, workOrderId: id, claimId: fresh.claimId, documentNumber: dto.invoiceNumber ?? null, createdById: ctx.userId,
          },
        });
      }
      const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: fresh.vehicleUnitId } });
      const km = dto.odometerKm ?? Math.max(vehicle.odometerKm, fresh.odometerKm ?? 0);
      if (dto.odometerKm !== undefined) await this.timeline.odometer(tx, ctx, ctx.organizationId, vehicle.id, dto.odometerKm, 'WORK_ORDER', id);
      await tx.workOrder.update({ where: { id }, data: { completedAt: new Date(), invoiceNumber: dto.invoiceNumber ?? fresh.invoiceNumber, odometerKm: km } });
      // Planos preventivos do mesmo serviço para este carro recomeçam a contar.
      await tx.maintenancePlan.updateMany({
        where: {
          vehicleUnitId: vehicle.id, active: true,
          OR: [...(fresh.maintenancePlanId ? [{ id: fresh.maintenancePlanId }] : []), { serviceTypeId: fresh.serviceTypeId }],
        },
        data: { lastDoneAt: new Date(), lastDoneKm: km },
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'MAINTENANCE', title: `OS ${fresh.number} concluída`,
        description: `Peças R$ ${parts.toFixed(2)} · mão de obra R$ ${labor.toFixed(2)} · outros R$ ${other.toFixed(2)}`,
        refType: 'WorkOrder', refId: id, data: { total, parts, labor, other },
      });
      if (vehicle.operationalStatus === 'IN_MAINTENANCE') {
        await this.status.setOperational(tx, ctx, ctx.organizationId, vehicle.id, 'AWAITING_RELEASE', `OS ${fresh.number} concluída`);
      }
      return this.setStatus(tx, ctx, fresh, 'COMPLETED', dto.note ?? `Concluída. Total R$ ${total.toFixed(2)}`);
    });
  }

  /** Liberação do veículo: encerra o bloqueio de agenda e devolve o carro à operação. */
  async release(ctx: OrgContext, id: string, note?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      if (wo.status !== 'COMPLETED') throw new ConflictException('Conclua a OS antes de liberar o veículo.');
      if (wo.releasedAt) throw new ConflictException('O veículo já foi liberado nesta OS.');
      await this.freeAgenda(tx, id);
      await tx.workOrder.update({ where: { id }, data: { releasedById: ctx.userId, releasedAt: new Date() } });
      await this.restoreVehicle(tx, ctx, wo.vehicleUnitId, `Liberado após OS ${wo.number}`);
      await tx.workOrderEvent.create({ data: { organizationId: ctx.organizationId, workOrderId: id, fromStatus: 'COMPLETED', toStatus: 'COMPLETED', note: note ?? 'Veículo liberado', userId: ctx.userId } });
      await this.audit.record(tx, ctx, { action: 'work_order.released', entityType: 'WorkOrder', entityId: id, branchId: wo.branchId, reason: note });
      return tx.workOrder.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Cancelamento. Peças já baixadas não voltam sozinhas: a devolução ao estoque é explícita. */
  async cancel(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const wo = await this.load(tx, ctx, id);
      this.assertOpen(wo.status);
      await tx.workOrder.update({ where: { id }, data: { cancelReason: reason } });
      await this.freeAgenda(tx, id);
      await this.restoreVehicle(tx, ctx, wo.vehicleUnitId, `OS ${wo.number} cancelada`);
      const parts = await tx.workOrderItem.count({ where: { workOrderId: id, type: 'PART' } });
      await this.timeline.record(tx, ctx, ctx.organizationId, { vehicleUnitId: wo.vehicleUnitId, type: 'MAINTENANCE', title: `OS ${wo.number} cancelada`, description: reason, refType: 'WorkOrder', refId: id });
      const result = await this.setStatus(tx, ctx, wo, 'CANCELLED', reason);
      return { ...result, partsToReturn: parts };
    });
  }

  /* ================= Planos preventivos ================= */

  async plans(ctx: OrgContext, query: PlanQueryDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const plans = await tx.maintenancePlan.findMany({
        where: { ...(query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {}), vehicle: { deletedAt: null, ...branchWhere(ctx) } },
        include: { vehicle: { select: { id: true, plate: true, odometerKm: true, branchId: true, model: { select: { name: true, make: { select: { name: true } } } } } }, serviceType: { select: { id: true, name: true } } },
      });
      const rows = plans.map((p) => ({
        ...p,
        due: maintenanceDue({
          intervalKm: p.intervalKm, intervalDays: p.intervalDays, lastDoneKm: p.lastDoneKm, lastDoneAt: p.lastDoneAt,
          currentKm: p.vehicle.odometerKm, alertKmBefore: p.alertKmBefore, alertDaysBefore: p.alertDaysBefore,
        }),
      }));
      const order = { OVERDUE: 0, DUE_SOON: 1, NO_BASELINE: 2, OK: 3 };
      return rows
        .filter((r) => !query.state || (r.active && r.due.state === query.state))
        .sort((a, b) => order[a.due.state] - order[b.due.state] || (a.due.kmRemaining ?? 1e9) - (b.due.kmRemaining ?? 1e9));
    });
  }

  async createPlan(ctx: OrgContext, dto: PlanDto) {
    if (!dto.intervalKm && !dto.intervalDays) throw new BadRequestException('Defina o intervalo em km, em dias ou ambos.');
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
      assertBranch(ctx, vehicle.branchId);
      if (!(await tx.maintenanceServiceType.findUnique({ where: { id: dto.serviceTypeId } }))) throw new BadRequestException('Tipo de serviço inválido.');
      const plan = await tx.maintenancePlan.create({
        data: { ...dto, organizationId: ctx.organizationId, lastDoneAt: dto.lastDoneAt ? new Date(dto.lastDoneAt) : null } as Prisma.MaintenancePlanUncheckedCreateInput,
      });
      await this.audit.record(tx, ctx, { action: 'maintenance.plan_created', entityType: 'MaintenancePlan', entityId: plan.id, branchId: vehicle.branchId, after: dto });
      return plan;
    });
  }

  async updatePlan(ctx: OrgContext, id: string, dto: UpdatePlanDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const plan = await tx.maintenancePlan.findUnique({ where: { id }, include: { vehicle: true } });
      if (!plan) throw new NotFoundException('Plano não encontrado.');
      assertBranch(ctx, plan.vehicle.branchId);
      const updated = await tx.maintenancePlan.update({
        where: { id }, data: { ...dto, lastDoneAt: dto.lastDoneAt === undefined ? undefined : dto.lastDoneAt ? new Date(dto.lastDoneAt) : null } as Prisma.MaintenancePlanUncheckedUpdateInput,
      });
      if (!updated.intervalKm && !updated.intervalDays) throw new BadRequestException('Defina o intervalo em km, em dias ou ambos.');
      await this.audit.record(tx, ctx, { action: 'maintenance.plan_updated', entityType: 'MaintenancePlan', entityId: id, branchId: plan.vehicle.branchId, ...AuditService.diff(plan as never, dto as never) });
      return updated;
    });
  }

  /** Histórico e custo acumulado de manutenção do veículo. */
  async vehicleSummary(ctx: OrgContext, vehicleUnitId: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: vehicleUnitId } });
      if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
      assertBranch(ctx, vehicle.branchId);
      const orders = await tx.workOrder.findMany({ where: { vehicleUnitId }, include: { serviceType: { select: { name: true } } }, orderBy: { openedAt: 'desc' } });
      const done = orders.filter((o) => o.status === 'COMPLETED');
      const sum = (f: (o: (typeof done)[number]) => number) => Math.round(done.reduce((a, o) => a + f(o), 0) * 100) / 100;
      return {
        vehicleUnitId,
        totals: { parts: sum((o) => num(o.partsCost)), labor: sum((o) => num(o.laborCost)), other: sum((o) => num(o.otherCost)), total: sum((o) => num(o.partsCost) + num(o.laborCost) + num(o.otherCost)), orders: done.length },
        history: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, serviceType: o.serviceType.name, openedAt: o.openedAt, completedAt: o.completedAt, total: num(o.partsCost) + num(o.laborCost) + num(o.otherCost) })),
      };
    });
  }

  /* ================= Auxiliares ================= */

  private async load(tx: Tx, ctx: OrgContext, id: string) {
    const wo = await tx.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('Ordem de serviço não encontrada.');
    assertBranch(ctx, wo.branchId);
    return wo;
  }

  private assertOpen(status: WorkOrderStatus): void {
    if (CLOSED.includes(status)) throw new ConflictException('A ordem de serviço já está encerrada.');
  }

  private async setStatus(tx: Tx, ctx: OrgContext, wo: { id: string; status: WorkOrderStatus; branchId: string }, to: WorkOrderStatus, note?: string) {
    const updated = await tx.workOrder.update({ where: { id: wo.id }, data: { status: to } });
    await tx.workOrderEvent.create({ data: { organizationId: ctx.organizationId, workOrderId: wo.id, fromStatus: wo.status, toStatus: to, note: note ?? null, userId: ctx.userId } });
    await this.audit.record(tx, ctx, { action: 'work_order.status', entityType: 'WorkOrder', entityId: wo.id, branchId: wo.branchId, before: { status: wo.status }, after: { status: to }, reason: note });
    return updated;
  }

  private async recalc(tx: Tx, id: string): Promise<void> {
    const items = await tx.workOrderItem.findMany({ where: { workOrderId: id } });
    const cents = (type: string[]) => items.filter((i) => type.includes(i.type)).reduce((a, i) => a + Math.round(num(i.total) * 100), 0) / 100;
    await tx.workOrder.update({ where: { id }, data: { partsCost: cents(['PART']), laborCost: cents(['LABOR']), otherCost: cents(['SERVICE', 'EXPENSE']) } });
  }

  /** Encerra o bloco de agenda da OS: futuro é liberado; em curso termina agora. */
  private async freeAgenda(tx: Tx, workOrderId: string): Promise<void> {
    const allocations = await tx.vehicleAllocation.findMany({ where: { workOrderId, active: true } });
    const now = new Date();
    for (const a of allocations) {
      if (a.startsAt >= now) {
        await tx.vehicleAllocation.update({ where: { id: a.id }, data: { active: false, releasedAt: now } });
      } else if (a.endsAt > now) {
        await tx.vehicleAllocation.update({ where: { id: a.id }, data: { endsAt: now, blockedUntil: now, releasedAt: now } });
      }
    }
  }

  /** Volta o carro a "Liberado" se nenhuma outra OS aberta o mantém na oficina. */
  private async restoreVehicle(tx: Tx, ctx: OrgContext, vehicleUnitId: string, reason: string): Promise<void> {
    const vehicle = await tx.vehicleUnit.findUniqueOrThrow({ where: { id: vehicleUnitId } });
    if (!['IN_MAINTENANCE', 'AWAITING_RELEASE'].includes(vehicle.operationalStatus)) return;
    const other = await tx.vehicleAllocation.findFirst({ where: { vehicleUnitId, kind: 'MAINTENANCE', active: true, endsAt: { gt: new Date() } } });
    if (other) return;
    await this.status.setOperational(tx, ctx, ctx.organizationId, vehicleUnitId, 'RELEASED', reason);
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CounterService } from '../../common/counter.service';
import { assertApprovalLimit, assertBranch, assertCan, branchWhere, type OrgContext } from '../../common/context';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import { num } from '../../common/serialize.interceptor';
import { StockService } from './stock.service';
import { lowStockProducts } from './inventory.jobs';
import type {
  CategoryDto, ConsumptionQueryDto, CountOpenDto, CountUpdateDto, LocationDto, MovementDto, MovementQueryDto, ProductDto,
  ProductQueryDto, PurchaseOrderDto, PurchaseQueryDto, ReceiveDto, TransferDto, UpdateLocationDto, UpdateProductDto,
} from './dto';

const OUT_TYPES = ['MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT'] as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counter: CounterService,
    private readonly stock: StockService,
  ) {}

  /* ================= Cadastros ================= */

  categories(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.inventoryCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } }));
  }

  createCategory(ctx: OrgContext, dto: CategoryDto) {
    return this.prisma.tenant(ctx, (tx) => tx.inventoryCategory.create({ data: { organizationId: ctx.organizationId, name: dto.name.trim() } }));
  }

  /** Locais das filiais autorizadas (o almoxarifado de outra loja não aparece para quem não a atende). */
  locations(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.inventoryLocation.findMany({
      where: branchWhere(ctx), include: { branch: { select: { id: true, name: true, code: true } } }, orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
    }));
  }

  async createLocation(ctx: OrgContext, dto: LocationDto) {
    assertBranch(ctx, dto.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      if (!(await tx.branch.findUnique({ where: { id: dto.branchId } }))) throw new BadRequestException('Filial inválida.');
      const location = await tx.inventoryLocation.create({ data: { organizationId: ctx.organizationId, branchId: dto.branchId, name: dto.name.trim() } });
      await this.audit.record(tx, ctx, { action: 'inventory.location_created', entityType: 'InventoryLocation', entityId: location.id, branchId: dto.branchId, after: dto });
      return location;
    });
  }

  async updateLocation(ctx: OrgContext, id: string, dto: UpdateLocationDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const location = await tx.inventoryLocation.findUnique({ where: { id } });
      if (!location) throw new NotFoundException('Local não encontrado.');
      assertBranch(ctx, location.branchId);
      if (dto.active === false) {
        const stocked = await tx.stockBalance.count({ where: { locationId: id, quantity: { gt: 0 } } });
        if (stocked) throw new ConflictException('O local ainda tem saldo. Transfira os itens antes de desativar.');
      }
      return tx.inventoryLocation.update({ where: { id }, data: dto });
    });
  }

  async products(ctx: OrgContext, query: ProductQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const q = query.q?.trim();
    const where: Prisma.InventoryProductWhereInput = {
      ...(query.includeInactive ? {} : { active: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(q ? { OR: [
        { sku: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const locations = await tx.inventoryLocation.findMany({ where: branchWhere(ctx), select: { id: true } });
      const visible = locations.map((l) => l.id).filter((id) => !query.locationId || id === query.locationId);
      const include = {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        balances: { where: { locationId: { in: visible } }, include: { location: { select: { id: true, name: true, branchId: true } } } },
      } as const;
      const shape = (p: Prisma.InventoryProductGetPayload<{ include: typeof include }>) => {
        const total = p.balances.reduce((acc, b) => acc + num(b.quantity), 0);
        return {
          ...p,
          stock: Math.round(total * 1000) / 1000,
          belowMin: num(p.minStock) > 0 && total < num(p.minStock),
          balances: p.balances.map((b) => ({ locationId: b.locationId, location: b.location.name, branchId: b.location.branchId, quantity: num(b.quantity) })),
        };
      };
      if (query.lowStock) {
        // O filtro de mínimo depende do saldo agregado: calcula em memória sobre o conjunto filtrado.
        const all = (await tx.inventoryProduct.findMany({ where, include, orderBy: { description: 'asc' } })).map(shape).filter((p) => p.belowMin);
        return paginated(all.slice(skip, skip + take), all.length, page, pageSize);
      }
      const [rows, total] = await Promise.all([
        tx.inventoryProduct.findMany({ where, include, skip, take, orderBy: orderBy(query, ['sku', 'description', 'createdAt'], { description: 'asc' }) }),
        tx.inventoryProduct.count({ where }),
      ]);
      return paginated(rows.map(shape), total, page, pageSize);
    });
  }

  async product(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const product = await tx.inventoryProduct.findUnique({
        where: { id },
        include: { category: true, supplier: { select: { id: true, name: true } }, balances: { include: { location: { include: { branch: { select: { name: true } } } } } } },
      });
      if (!product) throw new NotFoundException('Produto não encontrado.');
      const balances = product.balances
        .filter((b) => ctx.allBranches || ctx.branchIds.includes(b.location.branchId))
        .map((b) => ({ locationId: b.locationId, location: b.location.name, branch: b.location.branch.name, quantity: num(b.quantity) }));
      return { ...product, balances, stock: balances.reduce((a, b) => a + b.quantity, 0) };
    });
  }

  async createProduct(ctx: OrgContext, dto: ProductDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertProductRefs(tx, dto.categoryId, dto.supplierId);
      if (dto.maxStock !== undefined && dto.maxStock !== null && dto.minStock !== undefined && dto.maxStock < dto.minStock) {
        throw new BadRequestException('O estoque máximo não pode ser menor que o mínimo.');
      }
      const product = await tx.inventoryProduct.create({
        data: { ...dto, sku: dto.sku.trim().toUpperCase(), barcode: dto.barcode?.trim() || null, organizationId: ctx.organizationId } as Prisma.InventoryProductUncheckedCreateInput,
      });
      await this.audit.record(tx, ctx, { action: 'inventory.product_created', entityType: 'InventoryProduct', entityId: product.id, after: dto });
      return product;
    });
  }

  async updateProduct(ctx: OrgContext, id: string, dto: UpdateProductDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.inventoryProduct.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Produto não encontrado.');
      await this.assertProductRefs(tx, dto.categoryId, dto.supplierId);
      const min = dto.minStock ?? num(before.minStock);
      const max = dto.maxStock === undefined ? (before.maxStock === null ? null : num(before.maxStock)) : dto.maxStock;
      if (max !== null && max < min) throw new BadRequestException('O estoque máximo não pode ser menor que o mínimo.');
      const product = await tx.inventoryProduct.update({ where: { id }, data: { ...dto, barcode: dto.barcode === undefined ? undefined : dto.barcode?.trim() || null } as Prisma.InventoryProductUncheckedUpdateInput });
      await this.audit.record(tx, ctx, { action: 'inventory.product_updated', entityType: 'InventoryProduct', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return product;
    });
  }

  /* ================= Movimentações ================= */

  async movements(ctx: OrgContext, query: MovementQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    return this.prisma.tenant(ctx, async (tx) => {
      const locations = await tx.inventoryLocation.findMany({ where: branchWhere(ctx), select: { id: true } });
      const where: Prisma.InventoryMovementWhereInput = {
        locationId: { in: locations.map((l) => l.id).filter((id) => !query.locationId || id === query.locationId) },
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {}),
        ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
        ...(query.type ? { type: query.type as never } : {}),
        ...(query.from || query.to ? { at: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.inventoryMovement.findMany({
          where, skip, take, orderBy: { at: 'desc' },
          include: { product: { select: { id: true, sku: true, description: true, unit: true } }, vehicle: { select: { id: true, plate: true } } },
        }),
        tx.inventoryMovement.count({ where }),
      ]);
      const locs = await tx.inventoryLocation.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.locationId, r.counterpartLocationId].filter(Boolean) as string[]))] } }, select: { id: true, name: true } });
      const name = (id: string | null) => locs.find((l) => l.id === id)?.name ?? null;
      return paginated(rows.map((r) => ({ ...r, location: name(r.locationId), counterpartLocation: name(r.counterpartLocationId) })), total, page, pageSize);
    });
  }

  async move(ctx: OrgContext, dto: MovementDto) {
    if (dto.type === 'ADJUSTMENT' || dto.type === 'LOSS') assertCan(ctx, 'inventory.adjust');
    if (dto.type === 'MANUAL_IN') assertCan(ctx, 'inventory.adjust');
    return this.prisma.tenant(ctx, async (tx) => {
      const movement = await this.stock.move(tx, ctx, ctx.organizationId, {
        ...dto, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      });
      await this.audit.record(tx, ctx, {
        action: 'inventory.moved', entityType: 'InventoryMovement', entityId: movement.id,
        after: { type: dto.type, productId: dto.productId, locationId: dto.locationId, quantity: num(movement.quantity), totalCost: num(movement.totalCost) },
        reason: dto.reason,
      });
      return movement;
    });
  }

  transfer(ctx: OrgContext, dto: TransferDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const result = await this.stock.transfer(tx, ctx, ctx.organizationId, dto);
      await this.audit.record(tx, ctx, { action: 'inventory.transferred', entityType: 'InventoryMovement', entityId: result.transferGroupId, after: dto, reason: dto.reason });
      return result;
    });
  }

  reverse(ctx: OrgContext, id: string, reason: string, idempotencyKey: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const movement = await this.stock.reverse(tx, ctx, ctx.organizationId, id, reason, idempotencyKey);
      await this.audit.record(tx, ctx, { action: 'inventory.reversed', entityType: 'InventoryMovement', entityId: id, reason, after: { reversalId: movement.id } });
      return movement;
    });
  }

  /* ================= Reposição e consumo ================= */

  /** Produtos abaixo do mínimo com sugestão de compra (até o máximo ou 30 dias de consumo). */
  replenishment(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => lowStockProducts(tx, ctx.organizationId, { notify: false }));
  }

  async consumption(ctx: OrgContext, query: ConsumptionQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 90 * 86_400_000);
    const to = query.to ? new Date(query.to) : new Date();
    return this.prisma.tenant(ctx, async (tx) => {
      const locations = await tx.inventoryLocation.findMany({ where: branchWhere(ctx), include: { branch: { select: { id: true, name: true } } } });
      const rows = await tx.inventoryMovement.findMany({
        where: { type: { in: [...OUT_TYPES, 'LOSS'] }, at: { gte: from, lte: to }, locationId: { in: locations.map((l) => l.id) } },
        include: { product: { include: { category: true } }, vehicle: { select: { id: true, plate: true } } },
      });
      const groups = new Map<string, { key: string; label: string; quantity: number; totalCost: number; movements: number }>();
      for (const r of rows) {
        const loc = locations.find((l) => l.id === r.locationId)!;
        const [key, label] =
          query.groupBy === 'vehicle' ? [r.vehicleUnitId ?? 'sem-placa', r.vehicle?.plate ?? 'Sem placa vinculada']
          : query.groupBy === 'branch' ? [loc.branch.id, loc.branch.name]
          : query.groupBy === 'category' ? [r.product.categoryId, r.product.category.name]
          : [r.productId, `${r.product.sku} · ${r.product.description}`];
        const g = groups.get(key) ?? { key, label, quantity: 0, totalCost: 0, movements: 0 };
        g.quantity += Math.abs(num(r.quantity));
        g.totalCost += num(r.totalCost);
        g.movements += 1;
        groups.set(key, g);
      }
      return {
        from: from.toISOString(), to: to.toISOString(), groupBy: query.groupBy,
        rows: [...groups.values()].map((g) => ({ ...g, quantity: Math.round(g.quantity * 1000) / 1000, totalCost: Math.round(g.totalCost * 100) / 100 })).sort((a, b) => b.totalCost - a.totalCost),
      };
    });
  }

  /* ================= Inventário físico ================= */

  counts(ctx: OrgContext) {
    return this.prisma.tenant(ctx, async (tx) => {
      const locations = await tx.inventoryLocation.findMany({ where: branchWhere(ctx), select: { id: true, name: true } });
      const counts = await tx.inventoryCount.findMany({ where: { locationId: { in: locations.map((l) => l.id) } }, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { items: true } } } });
      return counts.map((c) => ({ ...c, location: locations.find((l) => l.id === c.locationId)?.name }));
    });
  }

  async count(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const count = await tx.inventoryCount.findUnique({ where: { id }, include: { items: true } });
      if (!count) throw new NotFoundException('Inventário não encontrado.');
      const location = await tx.inventoryLocation.findUniqueOrThrow({ where: { id: count.locationId } });
      assertBranch(ctx, location.branchId);
      const products = await tx.inventoryProduct.findMany({ where: { id: { in: count.items.map((i) => i.productId) } }, select: { id: true, sku: true, description: true, unit: true } });
      return {
        ...count, location: location.name,
        items: count.items.map((i) => ({ ...i, product: products.find((p) => p.id === i.productId) })).sort((a, b) => (a.product?.description ?? '').localeCompare(b.product?.description ?? '')),
      };
    });
  }

  /** Abre a contagem com o saldo do sistema congelado para comparação. */
  async openCount(ctx: OrgContext, dto: CountOpenDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const location = await tx.inventoryLocation.findUnique({ where: { id: dto.locationId } });
      if (!location) throw new NotFoundException('Local não encontrado.');
      assertBranch(ctx, location.branchId);
      if (await tx.inventoryCount.findFirst({ where: { locationId: dto.locationId, status: 'OPEN' } })) {
        throw new ConflictException('Já existe um inventário aberto para este local.');
      }
      const products = await tx.inventoryProduct.findMany({ where: { active: true }, include: { balances: { where: { locationId: dto.locationId } } } });
      const count = await tx.inventoryCount.create({
        data: {
          organizationId: ctx.organizationId, locationId: dto.locationId, notes: dto.notes ?? null, createdById: ctx.userId,
          items: { create: products.map((p) => ({ organizationId: ctx.organizationId, productId: p.id, systemQty: num(p.balances[0]?.quantity ?? 0) })) },
        },
      });
      await this.audit.record(tx, ctx, { action: 'inventory.count_opened', entityType: 'InventoryCount', entityId: count.id, branchId: location.branchId });
      return count;
    });
  }

  async updateCount(ctx: OrgContext, id: string, dto: CountUpdateDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const count = await tx.inventoryCount.findUnique({ where: { id } });
      if (!count || count.status !== 'OPEN') throw new ConflictException('Inventário não está aberto.');
      for (const item of dto.items) {
        await tx.inventoryCountItem.update({ where: { countId_productId: { countId: id, productId: item.productId } }, data: { countedQty: item.countedQty } });
      }
      return { updated: dto.items.length };
    });
  }

  /**
   * Aplica a contagem: a diferença entre o contado e o saldo ATUAL (não o
   * congelado — pode ter havido movimento durante a contagem) vira ajuste.
   */
  async applyCount(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const count = await tx.inventoryCount.findUnique({ where: { id }, include: { items: true } });
      if (!count || count.status !== 'OPEN') throw new ConflictException('Inventário não está aberto.');
      const location = await tx.inventoryLocation.findUniqueOrThrow({ where: { id: count.locationId } });
      assertBranch(ctx, location.branchId);
      let adjustments = 0;
      for (const item of count.items) {
        if (item.countedQty === null) continue;
        const balance = await tx.stockBalance.findUnique({ where: { productId_locationId: { productId: item.productId, locationId: count.locationId } } });
        const diff = Math.round((num(item.countedQty) - num(balance?.quantity ?? 0)) * 1000) / 1000;
        if (!diff) continue;
        await this.stock.move(tx, ctx, ctx.organizationId, {
          productId: item.productId, locationId: count.locationId, type: 'ADJUSTMENT', quantity: diff,
          reason: `Inventário físico ${id.slice(0, 8)}`, idempotencyKey: `count:${id}:${item.productId}`,
        });
        adjustments += 1;
      }
      await tx.inventoryCount.update({ where: { id }, data: { status: 'APPLIED', appliedById: ctx.userId, appliedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'inventory.count_applied', entityType: 'InventoryCount', entityId: id, branchId: location.branchId, after: { adjustments } });
      return { adjustments };
    });
  }

  async cancelCount(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const count = await tx.inventoryCount.findUnique({ where: { id } });
      if (!count || count.status !== 'OPEN') throw new ConflictException('Inventário não está aberto.');
      return tx.inventoryCount.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }

  /* ================= Compras ================= */

  async purchases(ctx: OrgContext, query: PurchaseQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const q = query.q?.trim();
    const where: Prisma.PurchaseOrderWhereInput = {
      ...branchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.purchaseOrder.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } } }),
        tx.purchaseOrder.count({ where }),
      ]);
      return paginated(rows, total, page, pageSize);
    });
  }

  async purchase(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, items: true } });
      if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
      assertBranch(ctx, order.branchId);
      const products = await tx.inventoryProduct.findMany({ where: { id: { in: order.items.map((i) => i.productId) } }, select: { id: true, sku: true, description: true, unit: true } });
      const payables = await tx.payable.findMany({ where: { purchaseOrderId: id }, select: { id: true, amount: true, status: true, dueDate: true, documentNumber: true } });
      return { ...order, items: order.items.map((i) => ({ ...i, product: products.find((p) => p.id === i.productId) })), payables };
    });
  }

  async createPurchase(ctx: OrgContext, dto: PurchaseOrderDto) {
    assertBranch(ctx, dto.branchId);
    return this.prisma.tenant(ctx, async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier || !supplier.active) throw new BadRequestException('Fornecedor inválido.');
      const count = await tx.inventoryProduct.count({ where: { id: { in: dto.items.map((i) => i.productId) } } });
      if (count !== new Set(dto.items.map((i) => i.productId)).size) throw new BadRequestException('Produto inválido no pedido.');
      const total = dto.items.reduce((acc, i) => acc + Math.round(i.quantity * i.unitCost * 100), 0) / 100;
      const order = await tx.purchaseOrder.create({
        data: {
          organizationId: ctx.organizationId, branchId: dto.branchId, supplierId: dto.supplierId,
          number: await this.counter.next(tx, ctx.organizationId, 'purchase_order', 'PC-'),
          total, expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null, notes: dto.notes ?? null, createdById: ctx.userId,
          items: { create: dto.items.map((i) => ({ organizationId: ctx.organizationId, productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })) },
        },
      });
      await this.audit.record(tx, ctx, { action: 'purchase.created', entityType: 'PurchaseOrder', entityId: order.id, branchId: dto.branchId, after: { number: order.number, total } });
      return order;
    });
  }

  async submitPurchase(ctx: OrgContext, id: string) {
    return this.transitionPurchase(ctx, id, ['DRAFT'], 'PENDING_APPROVAL', 'purchase.submitted');
  }

  /** Autoriza a compra dentro da alçada de quem aprova. */
  async approvePurchase(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
      assertBranch(ctx, order.branchId);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(order.status)) throw new ConflictException('O pedido não está aguardando aprovação.');
      assertApprovalLimit(ctx, num(order.total), 'o valor deste pedido');
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'purchase.approved', entityType: 'PurchaseOrder', entityId: id, branchId: order.branchId, after: { total: num(order.total) } });
      return updated;
    });
  }

  async cancelPurchase(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
      assertBranch(ctx, order.branchId);
      if (order.items.some((i) => num(i.receivedQty) > 0)) throw new ConflictException('Pedido com itens recebidos não pode ser cancelado.');
      if (['RECEIVED', 'CANCELLED'].includes(order.status)) throw new ConflictException('Pedido já encerrado.');
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record(tx, ctx, { action: 'purchase.cancelled', entityType: 'PurchaseOrder', entityId: id, branchId: order.branchId, reason });
      return updated;
    });
  }

  /**
   * Recebimento parcial ou total: cada item vira entrada por compra (custo
   * médio recalculado) e o valor recebido vira uma conta a pagar já
   * aprovada — a aprovação aconteceu no pedido.
   */
  async receive(ctx: OrgContext, id: string, dto: ReceiveDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
      assertBranch(ctx, order.branchId);
      const replay = await tx.inventoryMovement.findFirst({ where: { purchaseOrderId: id, idempotencyKey: { startsWith: `${dto.idempotencyKey}:` } } });
      if (replay) return this.purchaseSummary(tx, id);
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) throw new ConflictException('Só pedido aprovado pode ser recebido.');
      const location = await tx.inventoryLocation.findUnique({ where: { id: dto.locationId } });
      if (!location) throw new NotFoundException('Local não encontrado.');
      if (location.branchId !== order.branchId) throw new BadRequestException('O local precisa ser da filial do pedido.');

      let receivedCents = 0;
      for (const r of dto.items) {
        const item = order.items.find((i) => i.id === r.itemId);
        if (!item) throw new BadRequestException('Item não pertence ao pedido.');
        const pending = Math.round((num(item.quantity) - num(item.receivedQty)) * 1000) / 1000;
        if (r.quantity > pending + 1e-9) throw new BadRequestException(`Quantidade acima do pendente (${pending}).`);
        const unitCost = r.unitCost ?? num(item.unitCost);
        await this.stock.move(tx, ctx, ctx.organizationId, {
          productId: item.productId, locationId: dto.locationId, type: 'PURCHASE_IN', quantity: r.quantity, unitCost,
          purchaseOrderId: id, reason: `Recebimento do pedido ${order.number}`, idempotencyKey: `${dto.idempotencyKey}:${item.id}`,
        });
        await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: r.quantity } } });
        receivedCents += Math.round(r.quantity * unitCost * 100);
      }
      const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      const complete = items.every((i) => num(i.receivedQty) >= num(i.quantity) - 1e-9);
      await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } });
      if (receivedCents > 0) {
        await tx.payable.create({
          data: {
            organizationId: ctx.organizationId, branchId: order.branchId, supplierId: order.supplierId, kind: 'PURCHASE',
            description: `Pedido de compra ${order.number}`, amount: receivedCents / 100,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : new Date(Date.now() + 30 * 86_400_000),
            approval: 'APPROVED', approvedById: order.approvedById, approvedAt: order.approvedAt,
            purchaseOrderId: id, documentNumber: dto.documentNumber ?? null, createdById: ctx.userId,
          },
        });
      }
      await this.audit.record(tx, ctx, { action: 'purchase.received', entityType: 'PurchaseOrder', entityId: id, branchId: order.branchId, after: { items: dto.items, amount: receivedCents / 100, complete } });
      return this.purchaseSummary(tx, id);
    });
  }

  private purchaseSummary(tx: Tx, id: string) {
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  private async transitionPurchase(ctx: OrgContext, id: string, from: string[], to: 'PENDING_APPROVAL', action: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
      assertBranch(ctx, order.branchId);
      if (!from.includes(order.status)) throw new ConflictException('Situação do pedido não permite esta ação.');
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: to } });
      await this.audit.record(tx, ctx, { action, entityType: 'PurchaseOrder', entityId: id, branchId: order.branchId });
      return updated;
    });
  }

  private async assertProductRefs(tx: Tx, categoryId?: string, supplierId?: string | null) {
    if (categoryId && !(await tx.inventoryCategory.findUnique({ where: { id: categoryId } }))) throw new BadRequestException('Categoria inválida.');
    if (supplierId && !(await tx.supplier.findUnique({ where: { id: supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
  }
}

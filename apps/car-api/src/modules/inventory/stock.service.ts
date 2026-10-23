import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MOVEMENT_DIRECTION, MOVEMENT_TYPE_LABEL, weightedAverageCost, type MovementType } from '@nortycar/shared';
import type { Tx } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { orgSettings } from '../../common/org-settings';
import { num } from '../../common/serialize.interceptor';
import type { RequestContext } from '../../common/context';

export interface MoveInput {
  productId: string;
  locationId: string;
  type: MovementType;
  /** Positiva; no ajuste, com sinal. */
  quantity: number;
  /** Custo unitário das entradas. Saídas usam o custo médio do produto. */
  unitCost?: number;
  counterpartLocationId?: string | null;
  transferGroupId?: string | null;
  vehicleUnitId?: string | null;
  driverId?: string | null;
  workOrderId?: string | null;
  purchaseOrderId?: string | null;
  reversalOfId?: string | null;
  lot?: string | null;
  expiresAt?: Date | null;
  reason?: string | null;
  idempotencyKey: string;
}

/** Tipos cuja entrada recompõe o custo médio. Devolução e transferência não mudam o custo. */
const COST_ENTRIES: MovementType[] = ['PURCHASE_IN', 'MANUAL_IN'];

/** Arredonda quantidades para as 3 casas do banco, sem lixo de ponto flutuante. */
const q3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Coração do estoque: toda variação de saldo passa por `move`, sempre
 * dentro da transação de quem chamou (OS, compra, inventário).
 *
 * - Saída é um UPDATE condicional (`quantity >= x`): duas baixas
 *   simultâneas do último item não passam juntas — a segunda encontra o
 *   saldo já reduzido e recebe 409. O CHECK do banco é a rede de segurança.
 * - `idempotencyKey` única por empresa: a mesma requisição repetida
 *   (falha de rede, clique duplo) devolve o movimento já gravado.
 * - O movimento é imutável (gatilho). Erro se corrige com estorno.
 */
@Injectable()
export class StockService {
  constructor(private readonly timeline: TimelineService) {}

  async move(tx: Tx, ctx: RequestContext | null, organizationId: string, input: MoveInput) {
    const existing = await tx.inventoryMovement.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
      include: { product: true },
    });
    if (existing) return existing;

    const direction = MOVEMENT_DIRECTION[input.type];
    if (!input.quantity || (direction !== 0 && input.quantity < 0)) {
      throw new BadRequestException('Informe uma quantidade positiva.');
    }
    const signed = q3(direction === 0 ? input.quantity : direction * Math.abs(input.quantity));

    const location = await tx.inventoryLocation.findUnique({ where: { id: input.locationId } });
    if (!location || !location.active) throw new NotFoundException('Local de estoque não encontrado.');
    if (ctx && !ctx.allBranches && ctx.kind !== 'PLATFORM' && !ctx.branchIds.includes(location.branchId)) {
      throw new ForbiddenException('Sem acesso ao estoque desta filial.');
    }

    // Trava o produto: custo médio e saldo total ficam coerentes mesmo com
    // entradas simultâneas do mesmo item.
    const locked = await tx.$queryRaw<{ averageCost: unknown; active: boolean }[]>`
      SELECT "averageCost", "active" FROM "inventory_products" WHERE "id" = ${input.productId}::uuid FOR UPDATE`;
    const productRow = locked[0];
    if (!productRow) throw new NotFoundException('Produto não encontrado.');
    if (!productRow.active && signed > 0 && input.type !== 'RETURN_IN' && input.type !== 'TRANSFER_IN') {
      throw new ConflictException('Produto inativo não recebe entradas.');
    }

    await this.assertLinks(tx, organizationId, input, signed);

    const currentAvg = num(productRow.averageCost as never);
    let unitCost = currentAvg;
    if (signed > 0 && COST_ENTRIES.includes(input.type)) {
      if (input.unitCost === undefined || input.unitCost < 0) throw new BadRequestException('Informe o custo unitário da entrada.');
      unitCost = input.unitCost;
    } else if (input.unitCost !== undefined && signed > 0 && input.type === 'ADJUSTMENT') {
      unitCost = input.unitCost;
    }

    let balanceAfter: number;
    if (signed < 0) {
      const amount = String(Math.abs(signed));
      const rows = await tx.$queryRaw<{ quantity: unknown }[]>`
        UPDATE "stock_balances" SET "quantity" = "quantity" - ${amount}::numeric, "updatedAt" = now()
         WHERE "productId" = ${input.productId}::uuid AND "locationId" = ${input.locationId}::uuid
           AND "quantity" >= ${amount}::numeric
        RETURNING "quantity"`;
      if (!rows.length) {
        const balance = await tx.stockBalance.findUnique({ where: { productId_locationId: { productId: input.productId, locationId: input.locationId } } });
        throw new ConflictException(`Saldo insuficiente: há ${num(balance?.quantity ?? 0)} no local e a saída pede ${Math.abs(signed)}.`);
      }
      balanceAfter = num(rows[0]!.quantity as never);
    } else {
      // Entrada recompõe o custo médio sobre o saldo total do produto.
      if (COST_ENTRIES.includes(input.type) || (input.type === 'ADJUSTMENT' && input.unitCost !== undefined)) {
        const totals = await tx.stockBalance.aggregate({ where: { productId: input.productId }, _sum: { quantity: true } });
        const totalQty = num(totals._sum.quantity ?? 0);
        const avg = weightedAverageCost(totalQty, currentAvg, signed, unitCost);
        await tx.inventoryProduct.update({
          where: { id: input.productId },
          data: { averageCost: avg, ...(COST_ENTRIES.includes(input.type) ? { lastCost: Math.round(unitCost * 100) / 100 } : {}) },
        });
      }
      const amount = String(signed);
      const rows = await tx.$queryRaw<{ quantity: unknown }[]>`
        INSERT INTO "stock_balances" ("organizationId", "productId", "locationId", "quantity", "updatedAt")
        VALUES (${organizationId}::uuid, ${input.productId}::uuid, ${input.locationId}::uuid, ${amount}::numeric, now())
        ON CONFLICT ("productId", "locationId") DO UPDATE
          SET "quantity" = "stock_balances"."quantity" + ${amount}::numeric, "updatedAt" = now()
        RETURNING "quantity"`;
      balanceAfter = num(rows[0]!.quantity as never);
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId,
        productId: input.productId,
        locationId: input.locationId,
        type: input.type,
        quantity: signed,
        unitCost: Math.round(unitCost * 10_000) / 10_000,
        totalCost: Math.round(Math.abs(signed) * unitCost * 100) / 100,
        balanceAfter,
        counterpartLocationId: input.counterpartLocationId ?? null,
        transferGroupId: input.transferGroupId ?? null,
        vehicleUnitId: input.vehicleUnitId ?? null,
        driverId: input.driverId ?? null,
        workOrderId: input.workOrderId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        reversalOfId: input.reversalOfId ?? null,
        lot: input.lot ?? null,
        expiresAt: input.expiresAt ?? null,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        userId: ctx?.userId ?? null,
      },
      include: { product: true },
    });

    if (input.vehicleUnitId && signed < 0) {
      await this.timeline.record(tx, ctx, organizationId, {
        vehicleUnitId: input.vehicleUnitId,
        type: 'PART_USED',
        title: `${movement.product.description}: ${Math.abs(signed)} ${movement.product.unit}`,
        description: `${MOVEMENT_TYPE_LABEL[input.type]} · custo R$ ${num(movement.totalCost).toFixed(2)}`,
        refType: 'InventoryMovement',
        refId: movement.id,
        data: { workOrderId: input.workOrderId ?? null, totalCost: num(movement.totalCost) },
      });
    }
    return movement;
  }

  /** Transferência: saída e entrada na mesma transação, ligadas por um grupo. */
  async transfer(tx: Tx, ctx: RequestContext, organizationId: string, input: {
    productId: string; fromLocationId: string; toLocationId: string; quantity: number; reason?: string; idempotencyKey: string;
  }) {
    if (input.fromLocationId === input.toLocationId) throw new BadRequestException('Origem e destino precisam ser diferentes.');
    const already = await tx.inventoryMovement.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `${input.idempotencyKey}:out` } },
    });
    if (already) {
      const pair = await tx.inventoryMovement.findMany({ where: { transferGroupId: already.transferGroupId } });
      return { transferGroupId: already.transferGroupId, movements: pair };
    }
    const destination = await tx.inventoryLocation.findUnique({ where: { id: input.toLocationId } });
    if (!destination || !destination.active) throw new NotFoundException('Local de destino não encontrado.');
    const group = randomUUID();
    const out = await this.move(tx, ctx, organizationId, {
      productId: input.productId, locationId: input.fromLocationId, type: 'TRANSFER_OUT', quantity: input.quantity,
      counterpartLocationId: input.toLocationId, transferGroupId: group, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:out`,
    });
    // A entrada vai para outra filial: a permissão foi conferida na origem.
    const inn = await this.move(tx, { ...ctx, allBranches: true } as RequestContext, organizationId, {
      productId: input.productId, locationId: input.toLocationId, type: 'TRANSFER_IN', quantity: input.quantity,
      counterpartLocationId: input.fromLocationId, transferGroupId: group, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:in`,
    });
    return { transferGroupId: group, movements: [out, inn] };
  }

  /** Estorno: movimento oposto que referencia o original. Cada movimento só é estornado uma vez. */
  async reverse(tx: Tx, ctx: RequestContext, organizationId: string, movementId: string, reason: string, idempotencyKey: string) {
    const original = await tx.inventoryMovement.findUnique({ where: { id: movementId } });
    if (!original) throw new NotFoundException('Movimentação não encontrada.');
    const done = await tx.inventoryMovement.findFirst({ where: { reversalOfId: movementId } });
    if (done) {
      if (done.idempotencyKey === idempotencyKey) return done;
      throw new ConflictException('Esta movimentação já foi estornada.');
    }
    if (original.reversalOfId) throw new ConflictException('Um estorno não pode ser estornado; registre um novo movimento.');
    if (original.transferGroupId) throw new ConflictException('Transferências se corrigem com uma transferência no sentido contrário.');
    const qty = -num(original.quantity);
    return this.move(tx, ctx, organizationId, {
      productId: original.productId, locationId: original.locationId, type: 'ADJUSTMENT', quantity: qty,
      unitCost: num(original.unitCost), vehicleUnitId: original.vehicleUnitId, workOrderId: original.workOrderId,
      reversalOfId: original.id, reason: `Estorno: ${reason}`, idempotencyKey,
    });
  }

  /**
   * Vínculos obrigatórios por tipo de saída, conforme a configuração da
   * empresa, e coerência dos registros vinculados.
   */
  private async assertLinks(tx: Tx, organizationId: string, input: MoveInput, signed: number): Promise<void> {
    if (input.workOrderId) {
      const wo = await tx.workOrder.findUnique({ where: { id: input.workOrderId }, select: { status: true, vehicleUnitId: true } });
      if (!wo) throw new BadRequestException('Ordem de serviço inválida.');
      if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') throw new ConflictException('A ordem de serviço já está encerrada.');
      if (input.vehicleUnitId && wo.vehicleUnitId !== input.vehicleUnitId) throw new BadRequestException('A placa não é a da ordem de serviço.');
      // A peça usada na OS fica ligada à placa da OS, mesmo sem informá-la.
      input.vehicleUnitId ??= wo.vehicleUnitId;
    }
    if (signed < 0) {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
      const settings = orgSettings(org?.settings);
      if (settings.requireVehicleFor.includes(input.type) && !input.vehicleUnitId) {
        throw new BadRequestException(`A empresa exige a placa em "${MOVEMENT_TYPE_LABEL[input.type]}".`);
      }
      if (settings.requireWorkOrderFor.includes(input.type) && !input.workOrderId) {
        throw new BadRequestException(`A empresa exige a ordem de serviço em "${MOVEMENT_TYPE_LABEL[input.type]}".`);
      }
      if (input.type === 'DRIVER_OUT' && !input.driverId) throw new BadRequestException('Informe o motorista da saída.');
    }
    if (input.vehicleUnitId) {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: input.vehicleUnitId }, select: { id: true } });
      if (!vehicle) throw new BadRequestException('Veículo inválido.');
    }
    if (input.driverId && !(await tx.driver.findUnique({ where: { id: input.driverId }, select: { id: true } }))) {
      throw new BadRequestException('Motorista inválido.');
    }
  }
}

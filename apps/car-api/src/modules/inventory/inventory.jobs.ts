/**
 * Rotinas de estoque para a rotina agendada (sem injeção de dependência:
 * recebem a transação já escopada pela empresa).
 */
import type { Tx } from '../../common/prisma.service';
import { NotifyService } from '../../common/notify.service';
import { num } from '../../common/serialize.interceptor';

export interface LowStockRow {
  productId: string;
  sku: string;
  description: string;
  unit: string;
  stock: number;
  minStock: number;
  maxStock: number | null;
  /** Consumo médio diário dos últimos 90 dias (saídas para uso). */
  dailyConsumption: number;
  /** Quantidade sugerida: até o máximo, ou 30 dias de consumo acima do mínimo. */
  suggestedQty: number;
  lastCost: number;
  estimatedCost: number;
  supplier: { id: string; name: string } | null;
}

const CONSUMPTION = ['MAINTENANCE_OUT', 'VEHICLE_OUT', 'DRIVER_OUT'] as const;

/**
 * Produtos abaixo do mínimo, com sugestão de reposição. Por padrão também
 * gera a notificação (uma por produto por dia, pela chave de deduplicação).
 */
export async function lowStockProducts(tx: Tx, organizationId: string, options: { notify?: boolean } = {}): Promise<LowStockRow[]> {
  const products = await tx.inventoryProduct.findMany({
    where: { organizationId, active: true, minStock: { gt: 0 } },
    include: { balances: true, supplier: { select: { id: true, name: true } } },
  });
  const since = new Date(Date.now() - 90 * 86_400_000);
  const usage = await tx.inventoryMovement.groupBy({
    by: ['productId'],
    where: { organizationId, type: { in: [...CONSUMPTION] }, at: { gte: since } },
    _sum: { quantity: true },
  });
  const rows: LowStockRow[] = [];
  for (const p of products) {
    const stock = p.balances.reduce((acc, b) => acc + num(b.quantity), 0);
    const min = num(p.minStock);
    if (stock >= min) continue;
    const used = Math.abs(num(usage.find((u) => u.productId === p.id)?._sum.quantity ?? 0));
    const daily = Math.round((used / 90) * 1000) / 1000;
    const max = p.maxStock === null ? null : num(p.maxStock);
    const target = max ?? Math.max(min * 2, min + daily * 30);
    const suggested = Math.max(0, Math.ceil((target - stock) * 1000) / 1000);
    rows.push({
      productId: p.id, sku: p.sku, description: p.description, unit: p.unit, stock: Math.round(stock * 1000) / 1000, minStock: min, maxStock: max,
      dailyConsumption: daily, suggestedQty: suggested, lastCost: num(p.lastCost),
      estimatedCost: Math.round(suggested * num(p.lastCost) * 100) / 100, supplier: p.supplier,
    });
  }
  if (options.notify !== false) {
    const notify = new NotifyService();
    const day = new Date().toISOString().slice(0, 10);
    for (const r of rows) {
      await notify.notify(tx, organizationId, {
        type: 'inventory.low_stock', severity: 'WARNING', audiencePermission: 'inventory.view',
        title: `Estoque abaixo do mínimo: ${r.description}`,
        body: `Saldo ${r.stock} ${r.unit} (mínimo ${r.minStock}). Sugestão de compra: ${r.suggestedQty} ${r.unit}.`,
        link: `/operacao/estoque?produto=${r.productId}`, dedupeKey: `low_stock:${r.productId}:${day}`,
      });
    }
  }
  return rows.sort((a, b) => a.stock / (a.minStock || 1) - b.stock / (b.minStock || 1));
}

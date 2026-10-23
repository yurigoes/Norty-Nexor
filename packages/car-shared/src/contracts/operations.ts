/* =========================================================
   Contratos de API da operação: vistorias, estoque, compras,
   manutenção, pneus e abastecimentos. Valores monetários e
   quantidades chegam como number (o Decimal vira número na
   fronteira da API).
   ========================================================= */

import type {
  ConfirmationType, InspectionItemStatus, InspectionStatus, InspectionType, MaintenanceKind, MovementType, Priority,
  PurchaseOrderStatus, TireEventType, TirePosition, TireStatus, WorkOrderItemType, WorkOrderStatus,
} from '../domain';
import type { DueState, RefuelFlag } from '../rules/operations';

/* ---------------- Vistorias ---------------- */

export interface InspectionListItem {
  id: string;
  number: string;
  type: InspectionType;
  status: InspectionStatus;
  startedAt: string;
  completedAt: string | null;
  odometerKm: number | null;
  vehicle: { id: string; plate: string; model: { name: string; make: { name: string } } };
  contract: { id: string; number: string } | null;
  issues: number;
  visibleToCustomer: boolean;
  _count: { photos: number; damages: number };
}

export interface InspectionItemRow { id: string; key: string; label: string; area: string; status: InspectionItemStatus; notes: string | null }
export interface InspectionDamageRow { id: string; region: string; regionLabel: string; severity: 'LIGHT' | 'MEDIUM' | 'SEVERE'; description: string }
export interface InspectionPhotoRow { id: string; fileId: string; itemKey: string | null; region: string | null; caption: string | null; file: { id: string; originalName: string; mimeType: string } | null }

export interface InspectionDetail {
  id: string;
  number: string;
  type: InspectionType;
  status: InspectionStatus;
  branchId: string;
  vehicleUnitId: string;
  contractId: string | null;
  inspectorId: string;
  inspectorName: string | null;
  odometerKm: number | null;
  fuelEighths: number | null;
  notes: string | null;
  pendencies: string | null;
  confirmationType: ConfirmationType | null;
  signerName: string | null;
  signatureFileId: string | null;
  visibleToCustomer: boolean;
  startedAt: string;
  completedAt: string | null;
  approvedAt: string | null;
  vehicle: { id: string; plate: string; internalCode: string; color: string; odometerKm: number; model: { name: string; make: { name: string } } };
  contract: { id: string; number: string; status: string; customer: { id: string; name: string } } | null;
  driver: { id: string; name: string } | null;
  items: InspectionItemRow[];
  damages: InspectionDamageRow[];
  photos: InspectionPhotoRow[];
}

export interface InspectionComparison {
  base: { id: string; number: string; type: InspectionType; odometerKm: number | null; fuelEighths: number | null; completedAt: string | null };
  current: { id: string; number: string; type: InspectionType; odometerKm: number | null; fuelEighths: number | null; completedAt: string | null };
  items: { key: string; label: string; area: string; baseLabel: string | null; currentLabel: string | null; baseNotes: string | null; currentNotes: string | null; worsened: boolean }[];
  unchangedItems: number;
  damages: { newInCurrent: InspectionDamageRow[]; onlyInBase: InspectionDamageRow[]; inBoth: InspectionDamageRow[] };
  odometerDelta: number | null;
  fuelDelta: number | null;
  humanReviewRequired: true;
  notice: string;
  aiVisualComparison: { status: 'NOT_CONFIGURED' | 'AVAILABLE'; message: string };
}

/* ---------------- Estoque ---------------- */

export interface InventoryLocationRow { id: string; name: string; branchId: string; active: boolean; branch: { id: string; name: string; code: string } }

export interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  description: string;
  categoryId: string;
  category: { id: string; name: string };
  brand: string | null;
  manufacturer: string | null;
  unit: string;
  reference: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  lastCost: number;
  averageCost: number;
  referencePrice: number | null;
  minStock: number;
  maxStock: number | null;
  trackLot: boolean;
  trackExpiry: boolean;
  active: boolean;
  stock: number;
  belowMin: boolean;
  balances: { locationId: string; location: string; branchId?: string; branch?: string; quantity: number }[];
}

export interface MovementRow {
  id: string;
  type: MovementType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceAfter: number;
  at: string;
  reason: string | null;
  location: string | null;
  counterpartLocation: string | null;
  workOrderId: string | null;
  reversalOfId: string | null;
  transferGroupId: string | null;
  product: { id: string; sku: string; description: string; unit: string };
  vehicle: { id: string; plate: string } | null;
}

export interface ReplenishmentRow {
  productId: string; sku: string; description: string; unit: string; stock: number; minStock: number; maxStock: number | null;
  dailyConsumption: number; suggestedQty: number; lastCost: number; estimatedCost: number; supplier: { id: string; name: string } | null;
}

export interface PurchaseOrderRow {
  id: string; number: string; status: PurchaseOrderStatus; total: number; branchId: string; expectedAt: string | null; createdAt: string;
  supplier: { id: string; name: string }; _count?: { items: number };
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  notes: string | null;
  approvedAt: string | null;
  items: { id: string; productId: string; quantity: number; unitCost: number; receivedQty: number; product?: { id: string; sku: string; description: string; unit: string } }[];
  payables: { id: string; amount: number; status: string; dueDate: string; documentNumber: string | null }[];
}

/* ---------------- Manutenção ---------------- */

export interface WorkOrderRow {
  id: string;
  number: string;
  status: WorkOrderStatus;
  kind: MaintenanceKind;
  priority: Priority;
  description: string;
  openedAt: string;
  dueAt: string | null;
  completedAt: string | null;
  overdue: boolean;
  branchId: string;
  vehicle: { id: string; plate: string; internalCode: string; model: { name: string; make: { name: string } } };
  serviceType: { id: string; name: string };
  supplier: { id: string; name: string } | null;
}

export interface WorkOrderDetail extends WorkOrderRow {
  odometerKm: number | null;
  estimateAmount: number | null;
  approvedAmount: number | null;
  approvedAt: string | null;
  laborCost: number;
  partsCost: number;
  otherCost: number;
  totalCost: number;
  invoiceNumber: string | null;
  releasedAt: string | null;
  blocksVehicle: boolean;
  cancelReason: string | null;
  claimId: string | null;
  claim: { id: string; number: string; status: string } | null;
  exceedsApproval: boolean;
  allowedTransitions: WorkOrderStatus[];
  items: { id: string; type: WorkOrderItemType; description: string; quantity: number; unitCost: number; total: number; product: { id: string; sku: string; unit: string } | null; createdAt: string }[];
  events: { id: string; fromStatus: string | null; toStatus: string; note: string | null; at: string }[];
  allocation: { id: string; startsAt: string; endsAt: string; active: boolean } | null;
  payables: { id: string; amount: number; status: string; approval: string; dueDate: string }[];
}

export interface MaintenancePlanRow {
  id: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneAt: string | null;
  lastDoneKm: number | null;
  alertKmBefore: number;
  alertDaysBefore: number;
  blockWhenOverdue: boolean;
  active: boolean;
  vehicleUnitId: string;
  serviceTypeId: string;
  vehicle: { id: string; plate: string; odometerKm: number; model: { name: string; make: { name: string } } };
  serviceType: { id: string; name: string };
  due: { nextKm: number | null; nextDate: string | null; kmRemaining: number | null; daysRemaining: number | null; state: DueState };
}

/* ---------------- Pneus e abastecimentos ---------------- */

export interface TireRow {
  id: string; code: string; brand: string; model: string | null; size: string; dot: string | null; cost: number;
  status: TireStatus; position: TirePosition | null; installedKm: number | null; accumulatedKm: number;
  vehicle: { id: string; plate: string; odometerKm: number } | null;
  kmDriven: number; totalCost: number; costPerKm: number | null;
}

export interface TireEventRow { id: string; type: TireEventType; position: string | null; odometerKm: number | null; cost: number | null; notes: string | null; at: string }

export interface RefuelRow {
  id: string; at: string; station: string | null; fuel: string; liters: number; pricePerLiter: number; total: number; odometerKm: number;
  paidByCompany: boolean; flags: RefuelFlag[]; flagLabels: string[]; consumptionKmL: number | null;
  vehicle: { id: string; plate: string }; driver: { id: string; name: string } | null;
}

/* Contratos de API do financeiro da locadora. */
import type { ApprovalStatus, DepositEntryType, DepositStatus, PaymentMethod, PaymentStatus, PayableKind, ReceivableKind, TitleStatus } from '../domain';
import type { Paginated } from '../api';

export interface ReceivableRow {
  id: string;
  branchId: string;
  kind: ReceivableKind;
  description: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  competence: string | null;
  status: TitleStatus;
  overdue: boolean;
  daysOverdue: number;
  lateFine: number;
  lateInterest: number;
  updatedBalance: number;
  cancelReason: string | null;
  customer: { id: string; name: string } | null;
  contract: { id: string; number: string } | null;
  costCenter: { id: string; name: string } | null;
  payments?: PaymentRow[];
}

export interface PayableRow {
  id: string;
  branchId: string;
  kind: PayableKind;
  description: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  status: TitleStatus;
  approval: ApprovalStatus;
  documentNumber: string | null;
  supplier: { id: string; name: string } | null;
  vehicle: { id: string; plate: string } | null;
  costCenter: { id: string; name: string } | null;
  payments?: PaymentRow[];
}

export type TitlePage<T> = Paginated<T> & { totals: { amount: number; paid: number } };

export interface PaymentRow {
  id: string;
  direction: 'IN' | 'OUT';
  method: PaymentMethod;
  amount: number;
  paidAt: string;
  status: PaymentStatus;
  provider: string | null;
  bankReference: string | null;
  reconciled: boolean;
  reconciledAt: string | null;
  notes: string | null;
  receivable?: { id: string; description: string; kind: string; customer: { name: string } | null } | null;
  payable?: { id: string; description: string; kind: string; supplier: { name: string } | null } | null;
}

export interface FinanceSummary {
  period: { from: string; to: string };
  revenue: {
    expected: number;
    paidOfExpected: number;
    received: number;
    reconciled: number;
    pending: number;
    overdue: number;
    overdueCount: number;
    overdueCustomers: number;
    collectionRate: number | null;
    delinquencyRate: number | null;
  };
  expenses: { paid: number; open: number; openCount: number };
  deposits: { held: number; pendingRefund: number; pendingReceipt: number; count: number };
}

export interface CashflowBucket {
  key: string;
  expectedIn: number;
  expectedOut: number;
  realizedIn: number;
  realizedOut: number;
  netRealized: number;
  cumulativeRealized: number;
}

export interface Cashflow {
  groupBy: 'day' | 'month';
  from: string;
  to: string;
  series: CashflowBucket[];
}

export interface DepositBalanceView {
  received: number;
  used: number;
  refunded: number;
  adjustments: number;
  available: number;
  pendingDeductions: number;
}

export interface DepositRow {
  id: string;
  status: DepositStatus;
  expectedAmount: number;
  contractId: string;
  customer: { id: string; name: string };
  contract: { id: string; number: string; status: string; branchId: string };
  balance: DepositBalanceView;
  pendingApprovals?: number;
  entries?: DepositEntryRow[];
  updatedAt: string;
}

export interface DepositEntryRow {
  id: string;
  type: DepositEntryType;
  amount: number;
  method: PaymentMethod | null;
  at: string;
  reason: string | null;
  status: ApprovalStatus;
  receivableId: string | null;
  approvedAt: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  document: string | null;
  kinds: string[];
  email: string | null;
  phone: string | null;
  contactName: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
}

export const SUPPLIER_KIND_LABEL: Record<string, string> = {
  WORKSHOP: 'Oficina',
  PARTS: 'Peças',
  INSURER: 'Seguradora',
  FUEL: 'Combustível',
  DEALER: 'Concessionária',
  SERVICES: 'Serviços',
  TAX: 'Órgão público',
  OTHER: 'Outro',
};

export interface CostCenterRow { id: string; code: string; name: string; active: boolean }

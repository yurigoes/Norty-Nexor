/* Contratos de API: infrações, sinistros, seguros e venda de frota. */
import type {
  ClaimStatus, ClaimType, InfractionAdminStatus, InfractionFinancialStatus, ProposalStatus, SaleStatus, TitleStatus,
  ApprovalStatus, PayableKind,
} from '../domain';

export interface InfractionListItem {
  id: string;
  autoNumber: string;
  authority: string;
  infractionCode: string | null;
  description: string;
  occurredAt: string;
  location: string | null;
  vehicleUnitId: string;
  driverId: string | null;
  contractId: string | null;
  customerId: string | null;
  notifiedAt: string | null;
  driverIndicationDeadline: string | null;
  defenseDeadline: string | null;
  originalAmount: number;
  discountAmount: number;
  interestAmount: number;
  finalAmount: number;
  dueDate: string | null;
  adminStatus: InfractionAdminStatus;
  financialStatus: InfractionFinancialStatus;
  appealProtocol: string | null;
  result: string | null;
  notes: string | null;
  points: number | null;
  payableId: string | null;
  receivableId: string | null;
  driverIndicatedAt: string | null;
  vehicle: { id: string; plate: string; branchId: string };
  driver: { id: string; name: string } | null;
  contract: { id: string; number: string } | null;
}

export interface InfractionEventItem {
  id: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  userId: string | null;
  at: string;
}

export interface InfractionDetail extends InfractionListItem {
  vehicle: InfractionListItem['vehicle'] & { internalCode: string; model: { name: string; make: { name: string } } };
  customer: { id: string; name: string } | null;
  events: InfractionEventItem[];
}

export interface DriverSuggestion {
  found: boolean;
  reason: string;
  contract: { id: string; number: string; customerId: string; customer: { id: string; name: string } } | null;
  driver: { id: string; name: string; cnhNumber: string; cnhExpiresAt: string } | null;
}

export interface PolicyItem {
  id: string;
  insurerId: string;
  policyNumber: string;
  startsAt: string;
  endsAt: string;
  coverage: string | null;
  deductible: number | null;
  premium: number | null;
  notes: string | null;
  active: boolean;
  insurer: { id: string; name: string };
  vehicles: { id: string; plate: string }[];
  _count: { claims: number };
}

export interface ClaimListItem {
  id: string;
  number: string;
  type: ClaimType;
  status: ClaimStatus;
  occurredAt: string;
  description: string;
  vehicleUnitId: string;
  estimatedCost: number | null;
  indemnityAmount: number | null;
  blocksVehicle: boolean;
  vehicle: { id: string; plate: string };
  policy: { id: string; policyNumber: string } | null;
}

export interface TitleRef {
  id: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: TitleStatus;
  approval?: ApprovalStatus;
  kind?: PayableKind | string;
}

export interface ClaimDetail extends ClaimListItem {
  location: string | null;
  contractId: string | null;
  driverId: string | null;
  policyId: string | null;
  insurerClaimNumber: string | null;
  policeReportNumber: string | null;
  deductibleAmount: number | null;
  workOrderId: string | null;
  closedAt: string | null;
  vehicle: { id: string; plate: string; operationalStatus: string; branchId: string; model: { name: string; make: { name: string } } };
  contract: { id: string; number: string; customer: { id: string; name: string } } | null;
  driver: { id: string; name: string } | null;
  policy: (PolicyItem & { insurer: { id: string; name: string } }) | null;
  events: { id: string; fromStatus: string | null; toStatus: string | null; note: string; at: string }[];
  payables: TitleRef[];
  indemnities: TitleRef[];
  workOrder: { id: string; number: string; status: string } | null;
}

export interface SaleListItem {
  id: string;
  vehicleUnitId: string;
  status: SaleStatus;
  appraisalValue: number | null;
  askingPrice: number;
  minimumPrice: number | null;
  listedAt: string;
  adChannels: string[];
  soldAt: string | null;
  salePrice: number | null;
  buyerName: string | null;
  bookValueAtSale: number | null;
  notes: string | null;
  vehicle: { id: string; plate: string; yearModel: number; odometerKm: number; color: string; model: { name: string; make: { name: string } } };
  _count?: { proposals: number };
}

export interface SaleDetail extends SaleListItem {
  proposals: { id: string; name: string; contact: string | null; amount: number; status: ProposalStatus; notes: string | null; createdAt: string }[];
  expenses: TitleRef[];
  checks: { canClose: boolean; blockers: string[]; warnings: string[] };
}

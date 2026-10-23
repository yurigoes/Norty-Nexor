/* Contratos de API de reservas e contratos de locação. */
import type { ContractKind, ContractStatus, ReservationStatus, SignatureStatus, DepositStatus } from '../domain';
import type { Quote } from '../rules/pricing';

export interface Ref { id: string; name: string }
export interface VehicleRef { id: string; plate: string; model?: string }

export interface ReservationQuote extends Quote {
  rateTableId: string;
  categoryId: string;
  extras: { extraServiceId: string; name: string; pricing: 'PER_DAY' | 'FIXED'; price: number; quantity: number }[];
  computedAt: string;
  input?: { categoryId: string; extras: { extraServiceId: string; quantity: number }[]; additionalDrivers: number; discountPercent: number };
}

export interface ReservationRow {
  id: string;
  code: string;
  status: ReservationStatus;
  source: string;
  branchId: string;
  startAt: string;
  endAt: string;
  total: number;
  depositAmount: number;
  customerId: string;
  driverId: string | null;
  vehicleUnitId: string | null;
  categoryId: string;
  notes: string | null;
  cancelReason: string | null;
  quote: ReservationQuote;
  customer: Ref;
  category: Ref;
  vehicle: { id: string; plate: string; model: { name: string; make: { name: string } } } | null;
  contract: { id: string; number: string } | null;
  createdAt: string;
}

export interface ContractRow {
  id: string;
  number: string;
  kind: ContractKind;
  status: ContractStatus;
  branchId: string;
  startAt: string;
  endAt: string;
  totalAmount: number | null;
  monthlyAmount: number | null;
  termMonths: number | null;
  signatureStatus: SignatureStatus;
  customer: Ref;
  currentVehicle: VehicleRef | null;
  currentDriver: Ref | null;
  createdAt: string;
}

export interface ContractPendencies {
  deliveryInspectionId: string | null;
  depositRequired: number;
  depositReceived: number;
  depositOk: boolean;
  cnhValidUntil: string | null;
  cnhOk: boolean;
  vehicleUnitId: string | null;
}

export interface ContractDetail extends Omit<ContractRow, 'currentVehicle' | 'currentDriver' | 'customer'> {
  customer: Ref & { document?: string; email: string | null; phone: string | null; status: string; type: string };
  actualStartAt: string | null;
  actualEndAt: string | null;
  billingDay: number | null;
  adjustmentIndex: string | null;
  kmAllowance: number | null;
  kmAllowancePeriod: string | null;
  extraKmRate: number | null;
  lateFeePercent: number;
  monthlyInterestPercent: number;
  depositRequired: number;
  includedServices: string[];
  terms: string | null;
  currentVersion: number;
  closeReason: string | null;
  finalSettlement: ContractSettlement | null;
  renewedFromId: string | null;
  quote: Record<string, unknown> | null;
  vehicles: { id: string; vehicleUnitId: string; startAt: string; endAt: string | null; startKm: number | null; endKm: number | null; reason: string | null; vehicle: { id: string; plate: string; internalCode: string; color: string; odometerKm: number; model: { name: string; make: { name: string } } } }[];
  drivers: { id: string; driverId: string; primary: boolean; startAt: string; endAt: string | null; reason: string | null; driver: { id: string; name: string; cnhExpiresAt: string; cnhCategory: string } }[];
  extras: { id: string; name: string; pricing: 'PER_DAY' | 'FIXED'; price: number; quantity: number }[];
  versions: { id: string; version: number; reason: string; createdAt: string; createdById: string | null }[];
  receivables: { id: string; kind: string; description: string; amount: number; paidAmount: number; dueDate: string; status: string; competence: string | null }[];
  deposit: { id: string; status: DepositStatus; expectedAmount: number; balance?: { received: number; used: number; refunded: number; available: number; pendingDeductions: number } } | null;
  reservation: { id: string; code: string } | null;
  pendencies: ContractPendencies;
}

export interface ContractSettlement {
  returnAt: string;
  returnInspectionId: string | null;
  lateDays: number;
  lateAmount: number;
  drivenKm: number | null;
  includedKm: number | null;
  extraKm: number;
  extraKmAmount: number;
  fuelCharge: number;
  damages: { description: string; amount: number }[];
  penaltyAmount: number;
  total: number;
  warnings: string[];
}

export interface AgendaItem {
  type?: 'reservation' | 'contract';
  id: string;
  code: string;
  at: string;
  until?: string;
  customer: Ref;
  vehicle: { id: string; plate: string } | null;
  late: boolean;
  category?: string | null;
  pendencies?: ContractPendencies | null;
  kind?: ContractKind;
  monthlyAmount?: number | null;
}

export interface RentalAgenda {
  from: string;
  to: string;
  pickups: AgendaItem[];
  returns: AgendaItem[];
  renewals: AgendaItem[];
}

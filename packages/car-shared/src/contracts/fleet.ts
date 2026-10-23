/* Contratos de API do grupo Frota e Pessoas (veículos, catálogo, clientes, motoristas, documentos). */
import type { AllocationKind, CommercialStatus, CustomerStatus, FuelType, OperationalStatus, PersonType, Transmission } from '../domain';

export interface VehicleListItem {
  id: string;
  plate: string;
  internalCode: string;
  branchId: string;
  color: string;
  odometerKm: number;
  commercialStatus: CommercialStatus;
  operationalStatus: OperationalStatus;
  yearManufacture: number;
  yearModel: number;
  fuel: FuelType;
  transmission: Transmission;
  model: { id: string; name: string; make: { name: string } };
  category: { id: string; name: string };
  version: { id: string; name: string } | null;
  branch: { id: string; name: string };
  deletedAt?: string | null;
}

export interface VehicleDetail extends VehicleListItem {
  renavam: string | null;
  chassis: string | null;
  engineNumber: string | null;
  doors: number | null;
  tankCapacityLiters: number | null;
  initialOdometerKm: number | null;
  acquiredAt: string | null;
  /** Só com `fleet.financials`; sem ela, os campos não vêm. */
  acquisitionValue?: number | null;
  marketValue?: number | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  location: string | null;
  blockReason: string | null;
  licensingDueDate: string | null;
  ipvaDueDate: string | null;
  insurancePolicyId: string | null;
  publicVisible: boolean;
  notes: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  openContract: { id: string; number: string } | null;
}

export interface AgendaBlock {
  id: string;
  vehicleUnitId: string;
  kind: AllocationKind;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  reason: string | null;
  reservationId: string | null;
  contractVehicleId: string | null;
  workOrderId: string | null;
}

export interface AvailabilityResult {
  startAt: string;
  endAt: string;
  units: VehicleListItem[];
  byCategory: { categoryId: string; categoryName: string; available: number }[];
}

export interface DuplicateCheck {
  plate: boolean;
  renavam: boolean;
  chassis: boolean;
  internalCode: boolean;
}

export interface CustomerListItem {
  id: string;
  type: PersonType;
  name: string;
  tradeName: string | null;
  /** Mascarado sem `customers.sensitive`. */
  document: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: CustomerStatus;
  anonymizedAt: string | null;
  createdAt: string;
}

export interface DriverListItem {
  id: string;
  name: string;
  cpf: string;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  phone: string | null;
  email: string | null;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiresAt: string;
  cnhDaysLeft: number;
  active: boolean;
}

export type ExpiringDocumentType = 'CNH' | 'LICENSING' | 'IPVA' | 'FILE' | 'INSURANCE';

export interface ExpiringDocument {
  type: ExpiringDocumentType;
  label: string;
  reference: string;
  dueDate: string;
  daysLeft: number;
  link: string;
  entityId: string;
}

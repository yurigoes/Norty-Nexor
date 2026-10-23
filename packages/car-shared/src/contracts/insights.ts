/* Contratos de API: dashboard, notificações, relatórios, rentabilidade, busca e Norty IA. */
import type { NotificationSeverity } from '../domain';

export interface ContractBrief {
  id: string;
  number: string;
  customer: string;
  startAt: string;
  endAt: string;
}

export interface DashboardData {
  period: { from: string; to: string };
  branchId: string | null;
  fleet?: {
    total: number;
    byCommercial: Record<string, number>;
    byOperational: Record<string, number>;
    occupancyRate: number | null;
  };
  rentals?: {
    activeContracts?: number;
    expiringContracts?: number;
    overdueReturns?: number;
    expiring?: ContractBrief[];
    deliveriesToday?: ContractBrief[];
    returnsToday?: ContractBrief[];
    futureReservations?: number;
    pickupsToday?: { id: string; code: string; customer: string; startAt: string }[];
  };
  finance?: {
    revenue: number;
    received: number;
    pending: number;
    overdue: number;
    delinquencyRate: number | null;
    collectionRate: number | null;
    payablesOpen: number;
    series: { month: string; forecast: number; received: number }[];
  };
  deposits?: { held: number; pendingRefund: number; pendingRefundCount: number };
  infractions?: { dueSoon: number; dueSoonAmount: number; awaitingDriver: number };
  maintenance?: {
    openOrders: number;
    lateOrders: number;
    dueSoon: number;
    overdue: number;
    upcoming: { planId: string; name: string; vehicleUnitId: string; plate: string; state: string; kmRemaining: number | null; daysRemaining: number | null }[];
  };
  inventory?: { critical: number; items: { id: string; sku: string; description: string; unit: string; minStock: number; balance: number }[] };
  vehicles?: {
    mostProfitable: VehicleBrief[];
    highestCost: VehicleBrief[];
  };
}

export interface VehicleBrief {
  vehicleUnitId: string;
  plate: string;
  model: string;
  revenue: number;
  costs: number;
  operatingResult: number;
  margin: number | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
  branchId: string | null;
  createdAt: string;
  readAt: string | null;
}

export type ReportColumnType = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'percent';

export interface ReportMeta {
  key: string;
  title: string;
  group: 'Frota' | 'Locações' | 'Financeiro' | 'Operação' | 'Regularização' | 'Rentabilidade';
  description: string;
  financial: boolean;
  permissions: string[];
  period: boolean;
  filters: { key: string; label: string; type: 'date' | 'text' | 'number' | 'select'; required?: boolean; options?: { value: string; label: string }[] }[];
  columns: { key: string; label: string; type: ReportColumnType }[];
}

export interface ReportPage {
  report: ReportMeta;
  from: string;
  to: string;
  items: Record<string, string | number | null>[];
  total: number;
  page: number;
  pageSize: number;
  totals: Record<string, number>;
}

export interface ProfitabilityRow {
  vehicleUnitId: string;
  plate: string;
  model: string;
  branchId: string;
  commercialStatus: string;
  revenue: number;
  costs: number;
  depreciation: number | null;
  operatingResult: number;
  resultAfterDepreciation: number | null;
  margin: number | null;
  occupancy: number | null;
  idleDays: number;
  revenuePerAvailableDay: number | null;
  costPerKm: number | null;
  roi: number | null;
  missing: string[];
  daysInFleet: number;
  daysRented: number;
  daysUnavailable: number;
  kmDriven: number | null;
  breakdown: Record<'maintenance' | 'parts' | 'tires' | 'insurance' | 'taxes' | 'documentation' | 'fuel' | 'other', number>;
}

export interface ProfitabilityResponse {
  from: string;
  to: string;
  totals: { revenue: number; costs: number; operatingResult: number };
  vehicles: ProfitabilityRow[];
  incomplete: number;
}

export interface AiStatus {
  configured: boolean;
  model: string | null;
  tools: { name: string; description: string }[];
  message: string;
}

export interface AiAnswer {
  answer: string;
  toolsUsed: string[];
  model: string;
}

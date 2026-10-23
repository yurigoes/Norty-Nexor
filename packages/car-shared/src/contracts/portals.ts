/* =========================================================
   Contratos de API do Master Norty, do portal do cliente,
   do site público, de domínios e de integrações.
   ========================================================= */
import type {
  ContractKind, ContractStatus, DepositStatus, DomainKind, DomainStatus, InfractionAdminStatus, InfractionFinancialStatus,
  InspectionStatus, InspectionType, IntegrationStatus, LeadKind, LeadStatus, OrganizationStatus, PlatformRole,
  ServiceRequestStatus, ServiceRequestType, SubscriptionStatus, TitleStatus,
} from '../domain';

/* ---------------- Master ---------------- */

export interface PlatformDashboard {
  organizations: { total: number; active: number; trial: number; suspended: number; closed: number };
  vehicles: number;
  users: number;
  mrr: number;
  payingSubscriptions: number;
  overdueInvoices: { count: number; amount: number };
  openTickets: number;
  misconfiguredDomains: number;
  pendingGrants: number;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  legalName: string | null;
  document: string | null;
  slug: string;
  email: string | null;
  phone: string | null;
  status: OrganizationStatus;
  statusReason: string | null;
  createdAt: string;
  extraModules: string[];
  subscription: { id: string; status: SubscriptionStatus; planId: string; planName: string; price: number; priceOverride: number | null; trialEndsAt: string | null } | null;
  usage: { branches: number; users: number; vehicles: number };
  limits: { vehicles: number | null; branches: number | null; users: number | null } | null;
}

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  maxVehicles: number | null;
  maxBranches: number | null;
  maxUsers: number | null;
  modules: string[];
  active: boolean;
  _count: { subscriptions: number };
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  active: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
}

export interface IntegrationHealth {
  provider: string;
  name: string;
  status: IntegrationStatus;
  detail: string;
}

/** Resposta de criação com link de acesso (quando o e-mail não foi enviado). */
export interface AccessLinkResult {
  accessLink: string | null;
  emailStatus: string;
  isNewUser: boolean;
}

/* ---------------- Portal do cliente ---------------- */

export interface PortalTitle {
  id: string;
  description: string;
  kind: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  status: TitleStatus;
  competence: string | null;
}

export interface PortalOverview {
  activeContracts: { id: string; number: string; kind: ContractKind; startAt: string; endAt: string; vehicle: { plate: string; model: string; color: string } | null }[];
  upcoming: PortalTitle[];
  overdue: PortalTitle[];
  openRequests: number;
}

export interface PortalContractRow {
  id: string;
  number: string;
  kind: ContractKind;
  status: ContractStatus;
  startAt: string;
  endAt: string;
  monthlyAmount: number | null;
  totalAmount: number | null;
  vehicle: { plate: string; model: string } | null;
}

export interface PortalDeposit {
  expected: number;
  status: DepositStatus;
  received: number;
  used: number;
  refunded: number;
  available: number;
  pendingDeductions: number;
}

export interface PortalInspection {
  id: string;
  number: string;
  type: InspectionType;
  status: InspectionStatus;
  completedAt: string | null;
  odometerKm: number | null;
  fuelEighths: number | null;
  plate: string;
  contractNumber: string | null;
  notes: string | null;
  pendencies: string | null;
  items: { label: string; area: string; status: string; notes: string | null }[];
  damages: { region: string; severity: string; description: string }[];
  photos: { fileId: string; caption: string | null; region: string | null }[];
}

export interface PortalInfraction {
  id: string;
  autoNumber: string;
  authority: string;
  description: string;
  occurredAt: string;
  location: string | null;
  plate: string;
  driverName: string | null;
  finalAmount: number;
  dueDate: string | null;
  driverIndicationDeadline: string | null;
  adminStatus: InfractionAdminStatus;
  financialStatus: InfractionFinancialStatus;
}

export interface ServiceRequestRow {
  id: string;
  type: ServiceRequestType;
  subject: string;
  description: string;
  status: ServiceRequestStatus;
  contractId: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string };
  messages: { id: string; body: string; fromCustomer: boolean; createdAt: string }[];
}

/* ---------------- Site público ---------------- */

export interface PublicCategory {
  id: string;
  name: string;
  fromDaily: number | null;
  weekly: number | null;
  longTermMonthly: number | null;
  longTermKmPerMonth: number | null;
  includedKmPerDay: number | null;
  extraKmRate: number | null;
  depositAmount: number | null;
  lateGraceMinutes: number | null;
}

export interface PublicSite {
  slug: string;
  name: string;
  legalName: string | null;
  document: string | null;
  logoFileId: string | null;
  bannerFileId: string | null;
  primaryColor: string;
  accentColor: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  about: string | null;
  faq: { question: string; answer: string }[];
  terms: string | null;
  privacy: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  citiesServed: string[];
  featuredModelIds: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  primaryDomain: string | null;
  branches: { id: string; name: string; city: string | null; state: string | null; street: string | null; number: string | null; district: string | null; phone: string | null }[];
  categories: PublicCategory[];
  extras: { id: string; name: string; description: string | null; pricing: 'PER_DAY' | 'FIXED'; price: number }[];
}

export interface PublicModel {
  id: string;
  name: string;
  make: string;
  category: { id: string; name: string };
  bodyType: string | null;
  seats: number | null;
  doors: number | null;
  trunkLiters: number | null;
  coverFileId: string | null;
  hasModel3d: boolean;
  versions: { id: string; name: string; engine: string | null; fuel: string | null; transmission: string | null }[];
  fromDaily: number | null;
  /** Há ao menos uma unidade publicada desse modelo. */
  fleetSize: boolean;
  colors: { color: string; available: boolean | null }[];
  /** Nulo quando nenhum período foi informado. */
  available: boolean | null;
  availableCount: number | null;
}

export interface PublicModelDetail extends PublicModel {
  description: string | null;
  tankLiters: number | null;
  specs: Record<string, unknown>;
  hotspots: { key: string; label: string; description?: string; position: [number, number, number] }[];
  model3dFileId: string | null;
  photoFileIds: string[];
}

export interface LeadRow {
  id: string;
  kind: LeadKind;
  status: LeadStatus;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  categoryId: string | null;
  categoryName: string | null;
  modelId: string | null;
  modelName: string | null;
  branchId: string | null;
  startAt: string | null;
  endAt: string | null;
  quote: { total: number; billableDays: number } | null;
  reservationId: string | null;
  createdAt: string;
}

/* ---------------- Domínios e integrações ---------------- */

export interface DomainRow {
  id: string;
  organizationId: string;
  hostname: string;
  kind: DomainKind;
  status: DomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckError: string | null;
  isPrimary: boolean;
  createdAt: string;
  instructions: { txt: { type: string; name: string; value: string }; pointer: { type: string; name: string; value: string; note: string } } | null;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastDeliveryAt: string | null;
  createdAt: string;
}

/* =========================================================
   my Home — Tipos da camada de dados do aplicativo web
   ---------------------------------------------------------
   O domínio mora em `@myhome/shared` e é compartilhado com a
   API. Aqui fica apenas o que é específico do banco provisório
   de demonstração: o formato do estado completo em memória.
   ========================================================= */

export * from '@myhome/shared';

import type {
  Tenant, Condominium, Tower, Unit, Resident, User, CommonArea, Gate, Camera, Visitor,
  Staff, Vehicle, AccessLog, Delivery, Reservation, CondoEvent, Invoice, LedgerEntry,
  Ticket, Incident, MaintenanceOrder, Announcement, DocumentFile, Assembly,
  AppNotification, AuditEntry, DeviceSession, Professional, ProfessionalReview,
  ServiceRequest,
} from '@myhome/shared';

/* ---------- Estado completo do banco provisório ---------- */

export interface MyHomeDatabase {
  version: number;
  createdAt: string;
  tenants: Tenant[];
  condominiums: Condominium[];
  towers: Tower[];
  units: Unit[];
  residents: Resident[];
  users: User[];
  commonAreas: CommonArea[];
  gates: Gate[];
  cameras: Camera[];
  visitors: Visitor[];
  staff: Staff[];
  vehicles: Vehicle[];
  accessLogs: AccessLog[];
  deliveries: Delivery[];
  reservations: Reservation[];
  events: CondoEvent[];
  invoices: Invoice[];
  ledger: LedgerEntry[];
  tickets: Ticket[];
  incidents: Incident[];
  maintenance: MaintenanceOrder[];
  announcements: Announcement[];
  documents: DocumentFile[];
  assemblies: Assembly[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  sessions: DeviceSession[];
  professionals: Professional[];
  professionalReviews: ProfessionalReview[];
  serviceRequests: ServiceRequest[];
}

export type CollectionName = {
  [K in keyof MyHomeDatabase]: MyHomeDatabase[K] extends Array<infer _T> ? K : never;
}[keyof MyHomeDatabase];

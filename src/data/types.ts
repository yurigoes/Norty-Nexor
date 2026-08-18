/* =========================================================
   my Home — Modelo de domínio
   Estes tipos são a fronteira entre a UI e a persistência.
   A troca do banco provisório pelo definitivo (Fase 2) não
   deve alterar nada aqui: apenas a implementação dos
   repositories em data/repositories.
   ========================================================= */

export type ID = string;

/* ---------- Identidade e acesso ---------- */

export type UserRole = 'morador' | 'sindico' | 'administrador' | 'portaria' | 'administradora';

export interface Tenant {
  id: ID;
  name: string;
  legalName: string;
  document: string;
  logoInitials: string;
  city: string;
  state: string;
  plan: 'essential' | 'professional' | 'enterprise';
}

export interface Condominium {
  id: ID;
  tenantId: ID;
  name: string;
  shortName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  document: string;
  unitsCount: number;
  residentsCount: number;
  vehiclesCount: number;
  staffCount: number;
  towersCount: number;
  managerName: string;
  createdAt: string;
  /** Métricas consolidadas exibidas no painel da administradora. */
  metrics: {
    delinquencyRate: number;
    openTickets: number;
    accessesToday: number;
    occupancyRate: number;
    monthlyRevenue: number;
  };
}

export interface Tower {
  id: ID;
  condominiumId: ID;
  name: string;
  floors: number;
  unitsPerFloor: number;
  unitsCount: number;
}

export type UnitStatus = 'ocupada' | 'vaga' | 'reformando' | 'alugada';

export interface Unit {
  id: ID;
  condominiumId: ID;
  towerId: ID;
  label: string;
  floor: number;
  block: string;
  bedrooms: number;
  area: number;
  status: UnitStatus;
  ownerName: string;
  parkingSpots: string[];
  monthlyFee: number;
  delinquent: boolean;
}

export type ResidentType = 'proprietario' | 'inquilino' | 'dependente';

export interface Resident {
  id: ID;
  condominiumId: ID;
  unitId: ID;
  userId?: ID;
  name: string;
  document: string;
  email: string;
  phone: string;
  type: ResidentType;
  active: boolean;
  since: string;
  isMainContact: boolean;
}

export interface User {
  id: ID;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  tenantId: ID;
  /** Vazio para administradora (acesso a todos do tenant). */
  condominiumIds: ID[];
  unitId?: ID;
  residentId?: ID;
  phone: string;
  avatarColorSeed?: string;
  jobTitle?: string;
  lastLoginAt?: string;
  /** Permissões extras concedidas além das do papel. */
  extraPermissions?: Permission[];
}

export type Permission =
  | 'dashboard.view'
  | 'residents.view' | 'residents.manage'
  | 'units.view'
  | 'visitors.view' | 'visitors.manage' | 'visitors.approve'
  | 'vehicles.view' | 'vehicles.manage'
  | 'access.view' | 'access.register'
  | 'gates.operate'
  | 'cameras.view'
  | 'deliveries.view' | 'deliveries.manage'
  | 'reservations.view' | 'reservations.manage' | 'reservations.approve'
  | 'finance.personal' | 'finance.admin'
  | 'tickets.view' | 'tickets.manage'
  | 'incidents.view' | 'incidents.manage'
  | 'announcements.view' | 'announcements.publish'
  | 'documents.view' | 'documents.manage'
  | 'assemblies.view' | 'assemblies.manage' | 'assemblies.vote'
  | 'staff.view' | 'staff.manage'
  | 'professionals.view' | 'professionals.manage'
  | 'maintenance.view' | 'maintenance.manage'
  | 'security.view'
  | 'audit.view'
  | 'portfolio.view'
  | 'settings.manage'
  | 'concierge.use';

/* ---------- Estrutura física ---------- */

export type CommonAreaKind =
  | 'salao_festas' | 'churrasqueira' | 'academia' | 'piscina' | 'salao_gourmet'
  | 'brinquedoteca' | 'quadra' | 'coworking' | 'espaco_pet' | 'cinema';

export interface CommonArea {
  id: ID;
  condominiumId: ID;
  name: string;
  kind: CommonAreaKind;
  capacity: number;
  fee: number;
  deposit: number;
  autoApprove: boolean;
  slots: string[];
  rules: string[];
  openDays: number[];
  active: boolean;
}

export type GateStatus = 'online' | 'offline' | 'manutencao';

export interface Gate {
  id: ID;
  condominiumId: ID;
  name: string;
  kind: 'principal' | 'garagem' | 'servico' | 'pedestre';
  status: GateStatus;
  lastOpenedAt?: string;
  lastOpenedBy?: string;
}

export interface Camera {
  id: ID;
  condominiumId: ID;
  name: string;
  location: string;
  status: 'online' | 'offline';
  hasMotion: boolean;
  channel: number;
}

/* ---------- Pessoas e autorizações ---------- */

export type AuthorizationKind = 'unica' | 'temporaria' | 'recorrente' | 'permanente';
export type VisitorStatus = 'aguardando' | 'liberado' | 'no_local' | 'finalizado' | 'revogado' | 'expirado' | 'recusado';

export interface Visitor {
  id: ID;
  condominiumId: ID;
  unitId: ID;
  residentId: ID;
  name: string;
  document: string;
  phone?: string;
  kind: AuthorizationKind;
  status: VisitorStatus;
  expectedDate: string;
  expectedTime: string;
  validUntil?: string;
  recurrenceDays?: number[];
  notes?: string;
  vehiclePlate?: string;
  companyName?: string;
  category: 'visita' | 'prestador' | 'entrega' | 'convidado_evento';
  eventId?: ID;
  code: string;
  createdAt: string;
  createdBy: string;
  checkInAt?: string;
  checkOutAt?: string;
}

export type StaffKind = 'funcionario_condominio' | 'funcionario_unidade' | 'prestador';

export interface Staff {
  id: ID;
  condominiumId: ID;
  unitId?: ID;
  name: string;
  document: string;
  role: string;
  company?: string;
  phone: string;
  kind: StaffKind;
  workDays: number[];
  shiftStart: string;
  shiftEnd: string;
  accessValidUntil?: string;
  active: boolean;
  admittedAt: string;
}

/* ---------- Veículos e acesso ---------- */

export type VehicleOwnerKind = 'morador' | 'visitante' | 'prestador' | 'funcionario';

export interface Vehicle {
  id: ID;
  condominiumId: ID;
  unitId?: ID;
  ownerId?: ID;
  ownerName: string;
  ownerKind: VehicleOwnerKind;
  plate: string;
  brand: string;
  model: string;
  color: string;
  kind: 'carro' | 'moto' | 'utilitario' | 'bicicleta';
  parkingSpot?: string;
  authorized: boolean;
  validUntil?: string;
  createdAt: string;
}

export type AccessDirection = 'entrada' | 'saida';
export type AccessSubject = 'morador' | 'visitante' | 'veiculo' | 'prestador' | 'funcionario' | 'entrega';

export interface AccessLog {
  id: ID;
  condominiumId: ID;
  unitId?: ID;
  subjectType: AccessSubject;
  subjectId?: ID;
  subjectName: string;
  direction: AccessDirection;
  gateId: ID;
  gateName: string;
  plate?: string;
  at: string;
  registeredBy: string;
  method: 'manual' | 'qrcode' | 'placa' | 'biometria' | 'tag';
  authorized: boolean;
  photoSeed?: string;
}

/* ---------- Encomendas ---------- */

export type DeliveryStatus = 'recebida' | 'notificada' | 'retirada' | 'devolvida';

export interface Delivery {
  id: ID;
  condominiumId: ID;
  unitId: ID;
  residentId?: ID;
  carrier: string;
  trackingCode: string;
  size: 'pequena' | 'media' | 'grande';
  status: DeliveryStatus;
  receivedAt: string;
  receivedBy: string;
  shelf: string;
  pickedUpAt?: string;
  pickedUpBy?: string;
  notes?: string;
  requiresSignature: boolean;
}

/* ---------- Reservas ---------- */

export type ReservationStatus = 'pendente' | 'confirmada' | 'recusada' | 'cancelada' | 'concluida';

export interface Reservation {
  id: ID;
  condominiumId: ID;
  areaId: ID;
  unitId: ID;
  residentId: ID;
  residentName: string;
  date: string;
  slot: string;
  guests: number;
  status: ReservationStatus;
  fee: number;
  createdAt: string;
  notes?: string;
  eventId?: ID;
}

/* ---------- Eventos e convites ---------- */

export interface CondoEvent {
  id: ID;
  condominiumId: ID;
  unitId: ID;
  residentId: ID;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  expectedGuests: number;
  areaId?: ID;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  createdAt: string;
  inviteCode: string;
}

/* ---------- Financeiro ---------- */

export type InvoiceStatus = 'aberto' | 'pago' | 'vencido' | 'cancelado';

export interface Invoice {
  id: ID;
  condominiumId: ID;
  unitId: ID;
  reference: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  paidAt?: string;
  barcode: string;
  items: { label: string; amount: number }[];
}

export type LedgerKind = 'receita' | 'despesa';

export interface LedgerEntry {
  id: ID;
  condominiumId: ID;
  kind: LedgerKind;
  category: string;
  description: string;
  amount: number;
  date: string;
  status: 'pago' | 'pendente' | 'atrasado';
  supplier?: string;
}

/* ---------- Chamados, ocorrências, manutenção ---------- */

export type TicketStatus = 'aberto' | 'em_andamento' | 'resolvido' | 'cancelado';
export type TicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente';

export interface Ticket {
  id: ID;
  condominiumId: ID;
  unitId?: ID;
  code: string;
  category: string;
  location: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  openedBy: string;
  openedById?: ID;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  hasAttachment: boolean;
  updates: { id: ID; at: string; author: string; message: string; status?: TicketStatus }[];
}

export type IncidentSeverity = 'baixa' | 'media' | 'alta' | 'critica';
export type IncidentStatus = 'registrada' | 'em_analise' | 'notificada' | 'encerrada';

export interface Incident {
  id: ID;
  condominiumId: ID;
  unitId?: ID;
  code: string;
  type: 'barulho' | 'danos' | 'acidente' | 'seguranca' | 'estrutural' | 'regras' | 'outros';
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  location: string;
  reportedBy: string;
  involved: string[];
  createdAt: string;
  actions: { id: ID; at: string; author: string; message: string }[];
  attachments: { id: ID; kind: 'foto' | 'video' | 'audio'; label: string }[];
}

export type MaintenanceStatus = 'agendada' | 'em_execucao' | 'concluida' | 'atrasada';

export interface MaintenanceOrder {
  id: ID;
  condominiumId: ID;
  asset: string;
  description: string;
  supplier: string;
  scheduledFor: string;
  status: MaintenanceStatus;
  cost: number;
  recurrence: 'unica' | 'mensal' | 'trimestral' | 'semestral' | 'anual';
  lastExecutedAt?: string;
}

/* ---------- Comunicação ---------- */

export type AnnouncementPriority = 'normal' | 'importante' | 'urgente';

export interface Announcement {
  id: ID;
  condominiumId: ID;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  audience: { kind: 'todos' | 'torre' | 'unidade'; ids?: ID[]; label: string };
  publishedAt: string;
  author: string;
  readBy: ID[];
  pinned: boolean;
}

export interface DocumentFile {
  id: ID;
  condominiumId: ID;
  name: string;
  category: 'convencao' | 'regimento' | 'atas' | 'contratos' | 'balancetes' | 'comunicados' | 'administrativo';
  sizeKb: number;
  format: 'pdf' | 'docx' | 'xlsx' | 'jpg';
  uploadedAt: string;
  uploadedBy: string;
  restricted: boolean;
  downloads: number;
}

/* ---------- Assembleias ---------- */

export type AssemblyStatus = 'agendada' | 'em_votacao' | 'encerrada';

export interface AssemblyAgendaItem {
  id: ID;
  order: number;
  title: string;
  description: string;
  options: string[];
  votes: { unitId: ID; option: string; at: string; voterName: string }[];
}

export interface Assembly {
  id: ID;
  condominiumId: ID;
  title: string;
  kind: 'ordinaria' | 'extraordinaria';
  date: string;
  time: string;
  location: string;
  status: AssemblyStatus;
  quorumRequired: number;
  agenda: AssemblyAgendaItem[];
  minutesDocumentId?: ID;
}

/* ---------- Notificações e auditoria ---------- */

export type NotificationKind =
  | 'visitante_chegou' | 'encomenda' | 'veiculo' | 'aviso' | 'boleto'
  | 'reserva' | 'chamado' | 'ocorrencia' | 'acesso' | 'autorizacao' | 'assembleia'
  | 'servico';

export interface AppNotification {
  id: ID;
  condominiumId: ID;
  /** Destinatário: id do usuário, ou papel para broadcast operacional. */
  userId?: ID;
  role?: UserRole;
  unitId?: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Ações inline (liberar/recusar visitante, por exemplo). */
  actions?: { id: string; label: string; tone: 'primary' | 'danger' | 'secondary' }[];
  link?: string;
  refId?: ID;
}

export interface AuditEntry {
  id: ID;
  condominiumId: ID;
  at: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  detail?: string;
  ip: string;
  module: string;
}

export interface DeviceSession {
  id: ID;
  userId: ID;
  device: string;
  browser: string;
  location: string;
  lastActiveAt: string;
  current: boolean;
}

/* ---------- Profissionais recomendados ---------- */

export type ProfessionalCategory =
  | 'eletrica' | 'hidraulica' | 'reformas' | 'limpeza' | 'climatizacao'
  | 'montagem' | 'chaveiro' | 'pintura' | 'tecnologia' | 'jardinagem'
  | 'pet' | 'aulas' | 'mudancas' | 'dedetizacao';

export interface Professional {
  id: ID;
  condominiumId: ID;
  name: string;
  document: string;
  company?: string;
  category: ProfessionalCategory;
  specialties: string[];
  phone: string;
  email?: string;
  bio: string;
  serviceArea: string;
  /** Atende o condomínio desde. */
  since: string;
  /** Atendimentos concluídos dentro do condomínio. */
  jobsInCondo: number;
  rating: number;
  reviewsCount: number;
  priceFrom?: number;
  responseTime: string;
  /** Documentação conferida pela administração. */
  verified: boolean;
  /** Indicado formalmente pelo condomínio, não apenas cadastrado. */
  recommendedByCondo: boolean;
  recommendedBy?: string;
  emergency: boolean;
  active: boolean;
  createdAt: string;
}

export interface ProfessionalReview {
  id: ID;
  professionalId: ID;
  condominiumId: ID;
  unitId: ID;
  authorName: string;
  /** De 1 a 5. */
  rating: number;
  service: string;
  comment: string;
  at: string;
}

export type ServiceRequestStatus = 'enviado' | 'respondido' | 'contratado' | 'concluido' | 'cancelado';

export interface ServiceRequest {
  id: ID;
  condominiumId: ID;
  professionalId: ID;
  unitId: ID;
  residentName: string;
  service: string;
  description: string;
  preferredDate?: string;
  status: ServiceRequestStatus;
  createdAt: string;
  quotedAmount?: number;
  respondedAt?: string;
}

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

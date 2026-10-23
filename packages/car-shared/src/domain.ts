/* =========================================================
   Norty Car — Vocabulário do domínio
   ---------------------------------------------------------
   Cada união abaixo espelha um enum do schema Prisma da API
   (apps/car-api/prisma/schema.prisma). Mudou lá, muda aqui —
   e o TypeScript aponta o aplicativo e a API ao mesmo tempo.

   Os rótulos em pt-BR moram junto do valor para que tela,
   relatório e exportação digam a mesma coisa.
   ========================================================= */

export const PRODUCT_NAME = 'Norty Car';
export const PRODUCT_TAGLINE = 'Sistema de Controle de Carros';
export const PRODUCT_FULL_NAME = `${PRODUCT_NAME} | ${PRODUCT_TAGLINE}`;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/* ---------------- Plataforma e contexto ---------------- */

export type OrganizationStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export const ORGANIZATION_STATUS_LABEL: Record<OrganizationStatus, string> = {
  TRIAL: 'Em avaliação',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  CLOSED: 'Encerrada',
};

export type PlatformRole = 'NONE' | 'SUPPORT' | 'ADMIN' | 'SUPER';
export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  NONE: 'Sem acesso',
  SUPPORT: 'Suporte Norty',
  ADMIN: 'Administrador Norty',
  SUPER: 'Superadministrador Norty',
};

/** O tipo de contexto em que uma sessão está operando. */
export type ContextKind = 'STAFF' | 'CUSTOMER' | 'PLATFORM' | 'SUPPORT';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: 'Em avaliação',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Em atraso',
  CANCELED: 'Cancelada',
};

export type SaasInvoiceStatus = 'OPEN' | 'PAID' | 'OVERDUE' | 'VOID';
export const SAAS_INVOICE_STATUS_LABEL: Record<SaasInvoiceStatus, string> = {
  OPEN: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  VOID: 'Cancelada',
};

export type SupportGrantStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
export const SUPPORT_GRANT_STATUS_LABEL: Record<SupportGrantStatus, string> = {
  REQUESTED: 'Aguardando autorização',
  APPROVED: 'Autorizado',
  REJECTED: 'Recusado',
  REVOKED: 'Revogado',
  EXPIRED: 'Expirado',
};

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export const SUPPORT_TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  WAITING_CUSTOMER: 'Aguardando empresa',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

export type DomainKind = 'SUBDOMAIN' | 'CUSTOM';
export type DomainStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'ACTIVE' | 'MISCONFIGURED' | 'REMOVED';
export const DOMAIN_STATUS_LABEL: Record<DomainStatus, string> = {
  PENDING_VERIFICATION: 'Aguardando verificação',
  VERIFIED: 'Propriedade verificada',
  ACTIVE: 'Ativo',
  MISCONFIGURED: 'Configuração incorreta',
  REMOVED: 'Removido',
};

/* ---------------- Frota ---------------- */

export type CommercialStatus = 'AVAILABLE' | 'RESERVED' | 'RENTED' | 'FOR_SALE' | 'SOLD';
export const COMMERCIAL_STATUS_LABEL: Record<CommercialStatus, string> = {
  AVAILABLE: 'Disponível',
  RESERVED: 'Reservado',
  RENTED: 'Alugado',
  FOR_SALE: 'À venda',
  SOLD: 'Vendido',
};

export type OperationalStatus = 'RELEASED' | 'IN_INSPECTION' | 'IN_MAINTENANCE' | 'BLOCKED' | 'AWAITING_RELEASE';
export const OPERATIONAL_STATUS_LABEL: Record<OperationalStatus, string> = {
  RELEASED: 'Liberado',
  IN_INSPECTION: 'Em vistoria',
  IN_MAINTENANCE: 'Em manutenção',
  BLOCKED: 'Bloqueado',
  AWAITING_RELEASE: 'Aguardando liberação',
};

export type FuelType = 'FLEX' | 'GASOLINE' | 'ETHANOL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'CNG';
export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  FLEX: 'Flex',
  GASOLINE: 'Gasolina',
  ETHANOL: 'Etanol',
  DIESEL: 'Diesel',
  ELECTRIC: 'Elétrico',
  HYBRID: 'Híbrido',
  CNG: 'GNV',
};

export type Transmission = 'MANUAL' | 'AUTOMATIC' | 'CVT' | 'AUTOMATED';
export const TRANSMISSION_LABEL: Record<Transmission, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automático',
  CVT: 'CVT',
  AUTOMATED: 'Automatizado',
};

/** Tipos de bloco na agenda do veículo — a base do motor de disponibilidade. */
export type AllocationKind = 'RESERVATION' | 'CONTRACT' | 'MAINTENANCE' | 'BLOCK' | 'INSPECTION';
export const ALLOCATION_KIND_LABEL: Record<AllocationKind, string> = {
  RESERVATION: 'Reserva',
  CONTRACT: 'Contrato',
  MAINTENANCE: 'Manutenção',
  BLOCK: 'Bloqueio',
  INSPECTION: 'Vistoria',
};

export type TimelineEventType =
  | 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'RESERVATION' | 'CONTRACT_STARTED' | 'CONTRACT_ENDED'
  | 'DRIVER_LINKED' | 'DRIVER_CHANGED' | 'ODOMETER' | 'INSPECTION' | 'MAINTENANCE' | 'PART_USED'
  | 'INFRACTION' | 'CLAIM' | 'EXPENSE' | 'REVENUE' | 'REFUEL' | 'TIRE' | 'DOCUMENT' | 'SALE' | 'DISPOSAL';

/* ---------------- Pessoas ---------------- */

export type PersonType = 'PF' | 'PJ';
export type CustomerStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING_REVIEW';
export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  ACTIVE: 'Ativo',
  BLOCKED: 'Bloqueado',
  PENDING_REVIEW: 'Em análise',
};

export type CnhCategory = 'A' | 'B' | 'AB' | 'C' | 'D' | 'E' | 'AC' | 'AD' | 'AE';

/* ---------------- Reservas e contratos ---------------- */

export type ReservationStatus = 'REQUESTED' | 'CONFIRMED' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW' | 'EXPIRED';
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  REQUESTED: 'Solicitada',
  CONFIRMED: 'Confirmada',
  CHECKED_OUT: 'Retirada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'Não compareceu',
  EXPIRED: 'Expirada',
};

export type ReservationSource = 'INTERNAL' | 'PUBLIC_SITE' | 'PORTAL';

export type ContractKind = 'PERIOD' | 'LONG_TERM';
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  PERIOD: 'Locação por período',
  LONG_TERM: 'Contrato mensal',
};

export type ContractStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'CLOSED' | 'TERMINATED' | 'CANCELLED';
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  ACTIVE: 'Em vigor',
  CLOSED: 'Encerrado',
  TERMINATED: 'Rescindido',
  CANCELLED: 'Cancelado',
};

export type SignatureStatus = 'NOT_REQUIRED' | 'PENDING' | 'SIGNED_PHYSICAL' | 'SIGNED_ELECTRONIC';
export const SIGNATURE_STATUS_LABEL: Record<SignatureStatus, string> = {
  NOT_REQUIRED: 'Não exigida',
  PENDING: 'Pendente',
  SIGNED_PHYSICAL: 'Assinado em papel',
  SIGNED_ELECTRONIC: 'Assinado eletronicamente',
};

export type ExtraPricing = 'PER_DAY' | 'FIXED';

/* ---------------- Financeiro ---------------- */

export type ReceivableKind =
  | 'RENTAL' | 'MONTHLY' | 'EXTRA' | 'DAMAGE' | 'INFRACTION_REIMBURSEMENT' | 'FEE' | 'VEHICLE_SALE' | 'OTHER';
export const RECEIVABLE_KIND_LABEL: Record<ReceivableKind, string> = {
  RENTAL: 'Locação',
  MONTHLY: 'Mensalidade',
  EXTRA: 'Serviço adicional',
  DAMAGE: 'Avaria',
  INFRACTION_REIMBURSEMENT: 'Reembolso de multa',
  FEE: 'Taxa',
  VEHICLE_SALE: 'Venda de veículo',
  OTHER: 'Outros',
};

export type PayableKind =
  | 'MAINTENANCE' | 'PARTS' | 'INSURANCE' | 'TAX' | 'FINE' | 'FUEL' | 'PURCHASE' | 'SALE_PREPARATION'
  | 'DOCUMENTATION' | 'VEHICLE_ACQUISITION' | 'OTHER';
export const PAYABLE_KIND_LABEL: Record<PayableKind, string> = {
  MAINTENANCE: 'Manutenção',
  PARTS: 'Peças',
  INSURANCE: 'Seguro',
  TAX: 'Impostos',
  FINE: 'Multa',
  FUEL: 'Combustível',
  PURCHASE: 'Compras',
  SALE_PREPARATION: 'Preparação para venda',
  DOCUMENTATION: 'Documentação',
  VEHICLE_ACQUISITION: 'Aquisição de veículo',
  OTHER: 'Outros',
};

export type TitleStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export const TITLE_STATUS_LABEL: Record<TitleStatus, string> = {
  OPEN: 'Em aberto',
  PARTIAL: 'Parcial',
  PAID: 'Quitado',
  CANCELLED: 'Cancelado',
};

export type PaymentMethod = 'PIX' | 'BOLETO' | 'CARD' | 'CASH' | 'TRANSFER' | 'DEPOSIT_OFFSET';
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CARD: 'Cartão',
  CASH: 'Dinheiro',
  TRANSFER: 'Transferência',
  DEPOSIT_OFFSET: 'Compensação de caução',
};

export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'REVERSED';
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  FAILED: 'Recusado',
  REFUNDED: 'Estornado',
  REVERSED: 'Revertido',
};

export type PaymentDirection = 'IN' | 'OUT';

export type DepositStatus = 'PENDING' | 'HELD' | 'PARTIALLY_USED' | 'REFUND_PENDING' | 'REFUNDED' | 'CLOSED';
export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  PENDING: 'Aguardando recebimento',
  HELD: 'Retido',
  PARTIALLY_USED: 'Parcialmente utilizado',
  REFUND_PENDING: 'Devolução pendente',
  REFUNDED: 'Devolvido',
  CLOSED: 'Encerrado',
};

export type DepositEntryType = 'RECEIPT' | 'DEDUCTION' | 'REFUND' | 'ADJUSTMENT';
export const DEPOSIT_ENTRY_TYPE_LABEL: Record<DepositEntryType, string> = {
  RECEIPT: 'Recebimento',
  DEDUCTION: 'Utilização',
  REFUND: 'Devolução',
  ADJUSTMENT: 'Ajuste',
};

export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
};

/* ---------------- Estoque ---------------- */

export type MovementType =
  | 'PURCHASE_IN' | 'MANUAL_IN' | 'RETURN_IN' | 'TRANSFER_IN'
  | 'MAINTENANCE_OUT' | 'VEHICLE_OUT' | 'DRIVER_OUT' | 'TRANSFER_OUT' | 'LOSS'
  | 'ADJUSTMENT';
export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE_IN: 'Entrada por compra',
  MANUAL_IN: 'Entrada manual autorizada',
  RETURN_IN: 'Devolução de material',
  TRANSFER_IN: 'Transferência recebida',
  MAINTENANCE_OUT: 'Saída para manutenção',
  VEHICLE_OUT: 'Saída vinculada à placa',
  DRIVER_OUT: 'Saída vinculada ao motorista',
  TRANSFER_OUT: 'Transferência enviada',
  LOSS: 'Baixa por perda ou avaria',
  ADJUSTMENT: 'Ajuste de inventário',
};
/** Sentido de cada movimentação: +1 entra, -1 sai, 0 depende do sinal do ajuste. */
export const MOVEMENT_DIRECTION: Record<MovementType, 1 | -1 | 0> = {
  PURCHASE_IN: 1,
  MANUAL_IN: 1,
  RETURN_IN: 1,
  TRANSFER_IN: 1,
  MAINTENANCE_OUT: -1,
  VEHICLE_OUT: -1,
  DRIVER_OUT: -1,
  TRANSFER_OUT: -1,
  LOSS: -1,
  ADJUSTMENT: 0,
};

export type PurchaseOrderStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  PARTIALLY_RECEIVED: 'Recebido parcialmente',
  RECEIVED: 'Recebido',
  CANCELLED: 'Cancelado',
};

export type InventoryCountStatus = 'OPEN' | 'APPLIED' | 'CANCELLED';

/* ---------------- Manutenção ---------------- */

export type WorkOrderStatus =
  | 'OPEN' | 'AWAITING_ESTIMATE' | 'AWAITING_APPROVAL' | 'AWAITING_PARTS' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  OPEN: 'Aberta',
  AWAITING_ESTIMATE: 'Aguardando orçamento',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  AWAITING_PARTS: 'Aguardando peças',
  IN_PROGRESS: 'Em execução',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};
/** Transições permitidas da OS. Concluída e cancelada são finais. */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ['AWAITING_ESTIMATE', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'IN_PROGRESS', 'CANCELLED'],
  AWAITING_ESTIMATE: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['AWAITING_PARTS', 'IN_PROGRESS', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export type MaintenanceKind = 'PREVENTIVE' | 'CORRECTIVE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export type WorkOrderItemType = 'PART' | 'LABOR' | 'SERVICE' | 'EXPENSE';
export const WORK_ORDER_ITEM_TYPE_LABEL: Record<WorkOrderItemType, string> = {
  PART: 'Peça do estoque',
  LABOR: 'Mão de obra',
  SERVICE: 'Serviço de terceiro',
  EXPENSE: 'Despesa',
};

export type TireStatus = 'STOCK' | 'INSTALLED' | 'REMOVED' | 'DISCARDED';
export const TIRE_STATUS_LABEL: Record<TireStatus, string> = {
  STOCK: 'Em estoque',
  INSTALLED: 'Instalado',
  REMOVED: 'Retirado',
  DISCARDED: 'Descartado',
};
export type TireEventType = 'INSTALL' | 'ROTATE' | 'REPAIR' | 'REMOVE' | 'DISCARD';
export type TirePosition = 'FL' | 'FR' | 'RL' | 'RR' | 'SPARE';
export const TIRE_POSITION_LABEL: Record<TirePosition, string> = {
  FL: 'Dianteiro esquerdo',
  FR: 'Dianteiro direito',
  RL: 'Traseiro esquerdo',
  RR: 'Traseiro direito',
  SPARE: 'Estepe',
};

/* ---------------- Vistorias ---------------- */

export type InspectionType = 'DELIVERY' | 'PERIODIC' | 'DRIVER_CHANGE' | 'RETURN';
export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  DELIVERY: 'Entrega',
  PERIODIC: 'Periódica',
  DRIVER_CHANGE: 'Troca de motorista',
  RETURN: 'Devolução',
};
export type InspectionStatus = 'DRAFT' | 'COMPLETED' | 'APPROVED';
export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  DRAFT: 'Em preenchimento',
  COMPLETED: 'Concluída',
  APPROVED: 'Aprovada',
};
export type InspectionItemStatus = 'OK' | 'DAMAGED' | 'MISSING' | 'NA';
export const INSPECTION_ITEM_STATUS_LABEL: Record<InspectionItemStatus, string> = {
  OK: 'Normal',
  DAMAGED: 'Avariado',
  MISSING: 'Ausente',
  NA: 'Não aplicável',
};
export type ConfirmationType = 'SIGNATURE_DRAWN' | 'ACKNOWLEDGED_IN_PERSON';

/** Regiões do mapa de avarias. A ordem segue a leitura do desenho, da frente para trás. */
export const VEHICLE_REGIONS = [
  { key: 'front_bumper', label: 'Para-choque dianteiro' },
  { key: 'hood', label: 'Capô' },
  { key: 'windshield', label: 'Para-brisa' },
  { key: 'roof', label: 'Teto' },
  { key: 'rear_window', label: 'Vidro traseiro' },
  { key: 'trunk', label: 'Tampa traseira' },
  { key: 'rear_bumper', label: 'Para-choque traseiro' },
  { key: 'left_front_fender', label: 'Paralama dianteiro esquerdo' },
  { key: 'left_front_door', label: 'Porta dianteira esquerda' },
  { key: 'left_rear_door', label: 'Porta traseira esquerda' },
  { key: 'left_rear_fender', label: 'Lateral traseira esquerda' },
  { key: 'right_front_fender', label: 'Paralama dianteiro direito' },
  { key: 'right_front_door', label: 'Porta dianteira direita' },
  { key: 'right_rear_door', label: 'Porta traseira direita' },
  { key: 'right_rear_fender', label: 'Lateral traseira direita' },
  { key: 'left_mirror', label: 'Retrovisor esquerdo' },
  { key: 'right_mirror', label: 'Retrovisor direito' },
  { key: 'wheel_fl', label: 'Roda dianteira esquerda' },
  { key: 'wheel_fr', label: 'Roda dianteira direita' },
  { key: 'wheel_rl', label: 'Roda traseira esquerda' },
  { key: 'wheel_rr', label: 'Roda traseira direita' },
  { key: 'interior', label: 'Interior' },
] as const;
export type VehicleRegion = (typeof VEHICLE_REGIONS)[number]['key'];

/** Checklist padrão. Cada empresa pode editar o seu modelo de vistoria. */
export const DEFAULT_CHECKLIST: { key: string; label: string; area: string }[] = [
  { key: 'hood', label: 'Capô', area: 'Externo' },
  { key: 'roof', label: 'Teto', area: 'Externo' },
  { key: 'doors', label: 'Portas', area: 'Externo' },
  { key: 'bumpers', label: 'Para-choques', area: 'Externo' },
  { key: 'glass', label: 'Vidros', area: 'Externo' },
  { key: 'mirrors', label: 'Retrovisores', area: 'Externo' },
  { key: 'wheels', label: 'Rodas', area: 'Rodagem' },
  { key: 'tires', label: 'Pneus', area: 'Rodagem' },
  { key: 'spare', label: 'Estepe', area: 'Rodagem' },
  { key: 'headlights', label: 'Faróis', area: 'Iluminação' },
  { key: 'taillights', label: 'Lanternas', area: 'Iluminação' },
  { key: 'seats', label: 'Bancos', area: 'Interno' },
  { key: 'dashboard', label: 'Painel', area: 'Interno' },
  { key: 'seatbelts', label: 'Cintos', area: 'Interno' },
  { key: 'mats', label: 'Tapetes', area: 'Interno' },
  { key: 'air_conditioning', label: 'Ar-condicionado', area: 'Interno' },
  { key: 'equipment', label: 'Equipamentos obrigatórios', area: 'Itens' },
  { key: 'documents', label: 'Documentos do veículo', area: 'Itens' },
];

/* ---------------- Regularização ---------------- */

export type InfractionAdminStatus =
  | 'RECEIVED' | 'UNDER_REVIEW' | 'AWAITING_DRIVER_ID' | 'DRIVER_INDICATED' | 'APPEALING'
  | 'GRANTED' | 'DENIED' | 'CANCELLED' | 'FINISHED';
export const INFRACTION_ADMIN_STATUS_LABEL: Record<InfractionAdminStatus, string> = {
  RECEIVED: 'Recebida',
  UNDER_REVIEW: 'Em análise',
  AWAITING_DRIVER_ID: 'Aguardando identificação do condutor',
  DRIVER_INDICATED: 'Condutor indicado',
  APPEALING: 'Em defesa ou recurso',
  GRANTED: 'Deferida',
  DENIED: 'Indeferida',
  CANCELLED: 'Cancelada',
  FINISHED: 'Finalizada',
};
export type InfractionFinancialStatus =
  | 'PENDING' | 'BILLING' | 'PAID_BY_COMPANY' | 'AWAITING_REIMBURSEMENT' | 'REIMBURSED' | 'CANCELLED';
export const INFRACTION_FINANCIAL_STATUS_LABEL: Record<InfractionFinancialStatus, string> = {
  PENDING: 'Pendente',
  BILLING: 'Em cobrança',
  PAID_BY_COMPANY: 'Paga pela locadora',
  AWAITING_REIMBURSEMENT: 'Aguardando reembolso',
  REIMBURSED: 'Reembolsada',
  CANCELLED: 'Cancelada',
};

export type ClaimType = 'ACCIDENT' | 'COLLISION' | 'DAMAGE' | 'THEFT' | 'ROBBERY' | 'GLASS' | 'NATURAL_EVENT' | 'OTHER';
export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  ACCIDENT: 'Acidente',
  COLLISION: 'Colisão',
  DAMAGE: 'Dano',
  THEFT: 'Furto',
  ROBBERY: 'Roubo',
  GLASS: 'Vidros',
  NATURAL_EVENT: 'Evento natural',
  OTHER: 'Outro',
};
export type ClaimStatus =
  | 'OPEN' | 'INSURER_NOTIFIED' | 'UNDER_REVIEW' | 'REPAIRING' | 'INDEMNIFIED' | 'DENIED' | 'CLOSED';
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  OPEN: 'Aberto',
  INSURER_NOTIFIED: 'Seguradora acionada',
  UNDER_REVIEW: 'Em análise',
  REPAIRING: 'Em reparo',
  INDEMNIFIED: 'Indenizado',
  DENIED: 'Negado',
  CLOSED: 'Encerrado',
};

/* ---------------- Venda de frota ---------------- */

export type SaleStatus = 'LISTED' | 'NEGOTIATING' | 'SOLD' | 'WITHDRAWN';
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  LISTED: 'Anunciado',
  NEGOTIATING: 'Em negociação',
  SOLD: 'Vendido',
  WITHDRAWN: 'Retirado da venda',
};
export type ProposalStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

/* ---------------- Site e portal ---------------- */

export type LeadKind = 'QUOTE' | 'CONTACT' | 'MONTHLY' | 'RESERVATION_REQUEST';
export const LEAD_KIND_LABEL: Record<LeadKind, string> = {
  QUOTE: 'Orçamento',
  CONTACT: 'Contato',
  MONTHLY: 'Contrato mensal',
  RESERVATION_REQUEST: 'Pedido de reserva',
};
export type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'CONVERTED' | 'DISCARDED';
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Novo',
  IN_PROGRESS: 'Em atendimento',
  CONVERTED: 'Convertido',
  DISCARDED: 'Descartado',
};

export type ServiceRequestType =
  | 'MAINTENANCE' | 'ASSISTANCE' | 'VEHICLE_SWAP' | 'RENEWAL' | 'TERMINATION' | 'DATA_CORRECTION' | 'DATA_ACCESS' | 'OTHER';
export const SERVICE_REQUEST_TYPE_LABEL: Record<ServiceRequestType, string> = {
  MAINTENANCE: 'Manutenção',
  ASSISTANCE: 'Assistência',
  VEHICLE_SWAP: 'Troca de veículo',
  RENEWAL: 'Renovação',
  TERMINATION: 'Encerramento',
  DATA_CORRECTION: 'Correção de dados pessoais (LGPD)',
  DATA_ACCESS: 'Acesso aos dados pessoais (LGPD)',
  OTHER: 'Outro',
};
export type ServiceRequestStatus = 'OPEN' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';
export const SERVICE_REQUEST_STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em atendimento',
  ANSWERED: 'Respondida',
  CLOSED: 'Encerrada',
};

/* ---------------- Notificações e auditoria ---------------- */

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'WEBHOOK';
export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED';

export type ActorType = 'USER' | 'PLATFORM' | 'SUPPORT' | 'CUSTOMER' | 'SYSTEM' | 'INTEGRATION' | 'PUBLIC';

export type IntegrationStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'VERIFIED' | 'ERROR';
export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  NOT_CONFIGURED: 'Pendente de configuração',
  CONFIGURED: 'Configurada, não testada',
  VERIFIED: 'Comunicação verificada',
  ERROR: 'Falha na comunicação',
};

/* ---------------- Catálogo inicial ---------------- */

/**
 * Referências iniciais do catálogo. São modelos de mercado, não
 * unidades: nenhuma placa, RENAVAM ou chassi é criado a partir daqui.
 * A ficha técnica é deixada em branco de propósito — quem cadastra a
 * frota preenche com os dados do documento do veículo.
 */
export const INITIAL_CATEGORIES = [
  { code: 'COMPACTO', name: 'Compacto' },
  { code: 'SEDA', name: 'Sedã' },
  { code: 'MINIVAN', name: 'Minivan' },
  { code: 'SUV', name: 'SUV' },
] as const;

export const INITIAL_CATALOG = [
  { make: 'Chevrolet', model: 'Onix', category: 'COMPACTO', doors: 4, seats: 5 },
  { make: 'Chevrolet', model: 'Spin', category: 'MINIVAN', doors: 4, seats: 7 },
  { make: 'Volkswagen', model: 'Voyage', category: 'SEDA', doors: 4, seats: 5 },
  { make: 'Fiat', model: 'Cronos', category: 'SEDA', doors: 4, seats: 5 },
  { make: 'Renault', model: 'Duster', category: 'SUV', doors: 4, seats: 5 },
] as const;

export const INITIAL_INVENTORY_CATEGORIES = [
  'Pneus', 'Óleo de motor', 'Filtros', 'Lâmpadas', 'Componentes elétricos',
  'Peças mecânicas', 'Produtos de limpeza', 'Materiais de manutenção', 'Outros',
] as const;

export const INITIAL_SERVICE_TYPES = [
  'Revisão', 'Troca de óleo', 'Troca de filtros', 'Alinhamento', 'Balanceamento', 'Pneus',
  'Freios', 'Suspensão', 'Mecânica', 'Elétrica', 'Lanternagem', 'Ar-condicionado', 'Outros',
] as const;

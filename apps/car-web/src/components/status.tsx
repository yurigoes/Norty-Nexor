/* Rótulo + cor de cada situação do domínio, num lugar só. */
import {
  APPROVAL_STATUS_LABEL, CLAIM_STATUS_LABEL, COMMERCIAL_STATUS_LABEL, CONTRACT_STATUS_LABEL, CUSTOMER_STATUS_LABEL,
  DEPOSIT_STATUS_LABEL, DOMAIN_STATUS_LABEL, INFRACTION_ADMIN_STATUS_LABEL, INFRACTION_FINANCIAL_STATUS_LABEL,
  INSPECTION_STATUS_LABEL, INTEGRATION_STATUS_LABEL, LEAD_STATUS_LABEL, OPERATIONAL_STATUS_LABEL, ORGANIZATION_STATUS_LABEL,
  PAYMENT_STATUS_LABEL, PURCHASE_ORDER_STATUS_LABEL, RESERVATION_STATUS_LABEL, SALE_STATUS_LABEL, SERVICE_REQUEST_STATUS_LABEL,
  SIGNATURE_STATUS_LABEL, SUBSCRIPTION_STATUS_LABEL, SUPPORT_GRANT_STATUS_LABEL, SUPPORT_TICKET_STATUS_LABEL, TIRE_STATUS_LABEL,
  TITLE_STATUS_LABEL, WORK_ORDER_STATUS_LABEL, SAAS_INVOICE_STATUS_LABEL,
} from '@nortycar/shared';
import { Badge, type Tone } from './ui';

type Map = Record<string, string>;
const TONES: Record<string, Record<string, Tone>> = {
  commercial: { AVAILABLE: 'success', RESERVED: 'info', RENTED: 'brand', FOR_SALE: 'warning', SOLD: 'neutral' },
  operational: { RELEASED: 'success', IN_INSPECTION: 'info', IN_MAINTENANCE: 'warning', BLOCKED: 'danger', AWAITING_RELEASE: 'warning' },
  reservation: { REQUESTED: 'warning', CONFIRMED: 'info', CHECKED_OUT: 'success', CANCELLED: 'neutral', NO_SHOW: 'danger', EXPIRED: 'neutral' },
  contract: { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', APPROVED: 'info', ACTIVE: 'success', CLOSED: 'neutral', TERMINATED: 'danger', CANCELLED: 'neutral' },
  title: { OPEN: 'warning', PARTIAL: 'info', PAID: 'success', CANCELLED: 'neutral' },
  payment: { PENDING: 'warning', CONFIRMED: 'success', FAILED: 'danger', REFUNDED: 'neutral', REVERSED: 'neutral' },
  deposit: { PENDING: 'warning', HELD: 'info', PARTIALLY_USED: 'warning', REFUND_PENDING: 'warning', REFUNDED: 'success', CLOSED: 'neutral' },
  approval: { PENDING_APPROVAL: 'warning', APPROVED: 'success', REJECTED: 'danger' },
  workOrder: { OPEN: 'info', AWAITING_ESTIMATE: 'warning', AWAITING_APPROVAL: 'warning', AWAITING_PARTS: 'warning', IN_PROGRESS: 'brand', COMPLETED: 'success', CANCELLED: 'neutral' },
  inspection: { DRAFT: 'warning', COMPLETED: 'info', APPROVED: 'success' },
  infractionAdmin: { RECEIVED: 'info', UNDER_REVIEW: 'info', AWAITING_DRIVER_ID: 'warning', DRIVER_INDICATED: 'brand', APPEALING: 'warning', GRANTED: 'success', DENIED: 'danger', CANCELLED: 'neutral', FINISHED: 'neutral' },
  infractionFinancial: { PENDING: 'warning', BILLING: 'info', PAID_BY_COMPANY: 'brand', AWAITING_REIMBURSEMENT: 'warning', REIMBURSED: 'success', CANCELLED: 'neutral' },
  claim: { OPEN: 'warning', INSURER_NOTIFIED: 'info', UNDER_REVIEW: 'info', REPAIRING: 'brand', INDEMNIFIED: 'success', DENIED: 'danger', CLOSED: 'neutral' },
  customer: { ACTIVE: 'success', BLOCKED: 'danger', PENDING_REVIEW: 'warning' },
  sale: { LISTED: 'info', NEGOTIATING: 'warning', SOLD: 'success', WITHDRAWN: 'neutral' },
  purchase: { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', APPROVED: 'info', PARTIALLY_RECEIVED: 'warning', RECEIVED: 'success', CANCELLED: 'neutral' },
  tire: { STOCK: 'info', INSTALLED: 'success', REMOVED: 'warning', DISCARDED: 'neutral' },
  lead: { NEW: 'warning', IN_PROGRESS: 'info', CONVERTED: 'success', DISCARDED: 'neutral' },
  request: { OPEN: 'warning', IN_PROGRESS: 'info', ANSWERED: 'success', CLOSED: 'neutral' },
  org: { TRIAL: 'info', ACTIVE: 'success', SUSPENDED: 'danger', CLOSED: 'neutral' },
  subscription: { TRIALING: 'info', ACTIVE: 'success', PAST_DUE: 'danger', CANCELED: 'neutral' },
  domain: { PENDING_VERIFICATION: 'warning', VERIFIED: 'info', ACTIVE: 'success', MISCONFIGURED: 'danger', REMOVED: 'neutral' },
  grant: { REQUESTED: 'warning', APPROVED: 'success', REJECTED: 'danger', REVOKED: 'neutral', EXPIRED: 'neutral' },
  ticket: { OPEN: 'warning', IN_PROGRESS: 'info', WAITING_CUSTOMER: 'warning', RESOLVED: 'success', CLOSED: 'neutral' },
  integration: { NOT_CONFIGURED: 'warning', CONFIGURED: 'info', VERIFIED: 'success', ERROR: 'danger' },
  signature: { NOT_REQUIRED: 'neutral', PENDING: 'warning', SIGNED_PHYSICAL: 'success', SIGNED_ELECTRONIC: 'success' },
  saasInvoice: { OPEN: 'warning', PAID: 'success', OVERDUE: 'danger', VOID: 'neutral' },
};
const LABELS: Record<string, Map> = {
  commercial: COMMERCIAL_STATUS_LABEL, operational: OPERATIONAL_STATUS_LABEL, reservation: RESERVATION_STATUS_LABEL,
  contract: CONTRACT_STATUS_LABEL, title: TITLE_STATUS_LABEL, payment: PAYMENT_STATUS_LABEL, deposit: DEPOSIT_STATUS_LABEL,
  approval: APPROVAL_STATUS_LABEL, workOrder: WORK_ORDER_STATUS_LABEL, inspection: INSPECTION_STATUS_LABEL,
  infractionAdmin: INFRACTION_ADMIN_STATUS_LABEL, infractionFinancial: INFRACTION_FINANCIAL_STATUS_LABEL, claim: CLAIM_STATUS_LABEL,
  customer: CUSTOMER_STATUS_LABEL, sale: SALE_STATUS_LABEL, purchase: PURCHASE_ORDER_STATUS_LABEL, tire: TIRE_STATUS_LABEL,
  lead: LEAD_STATUS_LABEL, request: SERVICE_REQUEST_STATUS_LABEL, org: ORGANIZATION_STATUS_LABEL, subscription: SUBSCRIPTION_STATUS_LABEL,
  domain: DOMAIN_STATUS_LABEL, grant: SUPPORT_GRANT_STATUS_LABEL, ticket: SUPPORT_TICKET_STATUS_LABEL, integration: INTEGRATION_STATUS_LABEL,
  signature: SIGNATURE_STATUS_LABEL, saasInvoice: SAAS_INVOICE_STATUS_LABEL,
};

export type StatusKind = keyof typeof TONES;

export function Status({ kind, value }: { kind: StatusKind; value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  return <Badge tone={TONES[kind]?.[value] ?? 'neutral'} dot>{LABELS[kind]?.[value] ?? value}</Badge>;
}

export function statusLabel(kind: StatusKind, value: string): string {
  return LABELS[kind]?.[value] ?? value;
}

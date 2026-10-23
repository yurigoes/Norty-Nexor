/* =========================================================
   Norty Car — Contratos de API do núcleo
   ---------------------------------------------------------
   Formato de erro, paginação, autenticação e contexto.
   Os contratos de cada módulo ficam em ./contracts.
   ========================================================= */

import type { ContextKind, OrganizationStatus, PlatformRole } from './domain';
import type { ModuleKey } from './permissions';

export const API_VERSION = 'v1';

export type ApiErrorCode =
  | 'validation_error' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'rate_limited' | 'mfa_required' | 'not_configured' | 'internal_error';

export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/* ---------------- Autenticação ---------------- */

/** Um lugar onde o usuário pode operar. A lista vem sempre do servidor. */
export interface ContextOption {
  kind: ContextKind;
  /** Identificador opaco usado em /auth/context. */
  key: string;
  organizationId?: string;
  organizationName?: string;
  organizationStatus?: OrganizationStatus;
  /** Perfil (equipe) ou nome do cadastro (cliente). */
  label: string;
  description?: string;
  branchCount?: number;
  expiresAt?: string;
}

export interface LoginStep {
  /** `mfa` = falta o segundo fator; `context` = escolher onde operar; `ready` = sessão pronta. */
  step: 'mfa' | 'context' | 'ready';
  /** Ticket curto que autoriza o próximo passo (MFA ou escolha de contexto). */
  ticket?: string;
  contexts?: ContextOption[];
  session?: SessionTokens;
  mustChangePassword?: boolean;
}

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
}

export interface BranchRef {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  state?: string | null;
}

export interface SessionInfo {
  user: {
    id: string;
    name: string;
    email: string;
    mfaEnabled: boolean;
    platformRole: PlatformRole;
    mustChangePassword: boolean;
  };
  context: {
    kind: ContextKind;
    key: string;
    organizationId?: string;
    organizationName?: string;
    organizationSlug?: string;
    organizationStatus?: OrganizationStatus;
    timezone: string;
    roleName?: string;
    membershipId?: string;
    customerId?: string;
    customerName?: string;
    supportGrantId?: string;
    supportExpiresAt?: string;
    /** Todas as filiais quando `allBranches`; senão só as autorizadas. */
    allBranches: boolean;
    branches: BranchRef[];
    enabledModules: ModuleKey[];
    approvalLimit: number | null;
  };
  permissions: string[];
  availableContexts: number;
}

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

/* ---------------- Utilidades de resposta ---------------- */

export interface IdResponse {
  id: string;
}

export interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  at: string;
  refType?: string | null;
  refId?: string | null;
  actorName?: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorType: string;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

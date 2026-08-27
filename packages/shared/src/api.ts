/* =========================================================
   my Home — Contratos da API
   ---------------------------------------------------------
   O que trafega entre `myhome.norty.com.br` e
   `api-myhome.norty.com.br`. O cliente HTTP do aplicativo e os
   controllers do NestJS tipam contra estes mesmos contratos,
   então uma mudança de resposta quebra a compilação do lado
   que ficou para trás — em vez de quebrar em produção.
   ========================================================= */

import type { Condominium, ID, Permission, Tenant, Unit, User } from './domain';

/** Prefixo de versão da API. Uma quebra de contrato entra como /v2. */
export const API_VERSION = 'v1';

/* ---------- Autenticação ---------- */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Segundos até o access token expirar. */
  expiresIn: number;
}

/**
 * O refresh token não aparece aqui de propósito: ele viaja em cookie
 * httpOnly + SameSite=Strict, fora do alcance de JavaScript. Só o access
 * token, de vida curta, fica em memória no cliente.
 */
export interface LoginResponse extends AuthTokens {
  user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: ID;
  name: string;
  email: string;
  role: User['role'];
  avatarColor?: string;
  jobTitle?: string;
  unitId?: ID;
  tenantId: ID;
  condominiumIds: ID[];
  permissions: Permission[];
}

export interface SessionResponse {
  user: AuthenticatedUser;
  tenant: Tenant;
  condominium: Condominium;
  unit?: Unit;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/* ---------- Paginação e filtros ---------- */

export interface PageQuery {
  page?: number;
  pageSize?: number;
  /** Busca textual livre; cada módulo decide sobre quais campos aplica. */
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/* ---------- Erros ---------- */

/**
 * Formato único de erro da API. O cliente sabe que sempre pode ler
 * `message` para mostrar ao usuário e `code` para decidir o que fazer.
 */
export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** Erros de validação por campo, quando houver. */
  fields?: Record<string, string>;
  requestId?: string;
}

export type ApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error';

/* ---------- Saúde ---------- */

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
  database: 'up' | 'down';
  time: string;
}

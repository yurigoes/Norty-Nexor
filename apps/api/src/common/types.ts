import type { Permission, UserRole } from '@myhome/shared';

/** O que o token carrega e o que os guards colocam em `request.user`. */
export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  unitId?: string;
  condominiumIds: string[];
  permissions: Permission[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  /** Identificador da sessão de dispositivo, para revogação. */
  sid: string;
}

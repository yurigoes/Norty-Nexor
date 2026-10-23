import { ForbiddenException, SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ContextKind, Permission, PlatformPermission, PlatformRole } from '@nortycar/shared';

/**
 * Quem está fazendo a requisição e de onde. Montado pelo AuthGuard a
 * partir do token *e* do banco — nunca de um id enviado pelo cliente.
 */
export interface RequestContext {
  userId: string;
  userName: string;
  email: string;
  sessionId: string;
  platformRole: PlatformRole;
  kind: ContextKind;
  organizationId?: string;
  organizationName?: string;
  membershipId?: string;
  roleName?: string;
  /** Visão de todas as filiais (proprietário, administrador). */
  allBranches: boolean;
  /** Filiais autorizadas. Vazio + allBranches=false = nenhuma. */
  branchIds: string[];
  customerId?: string;
  supportGrantId?: string;
  permissions: Set<string>;
  enabledModules: string[];
  approvalLimit: number | null;
  timezone: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Contexto já validado como pertencente a uma empresa. */
export type OrgContext = RequestContext & { organizationId: string };

export const IS_PUBLIC = 'nortycar:public';
export const REQUIRED_PERMISSIONS = 'nortycar:permissions';
export const ALLOWED_KINDS = 'nortycar:kinds';
export const ALLOW_TICKET = 'nortycar:ticket';

/** Rota aberta: sem token. Login, saúde, site público e webhooks. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Exige permissões da mesma matriz que monta o menu do aplicativo.
 * Esconder o botão no frontend é conveniência; esta linha é a proteção.
 */
export const RequirePermission = (...permissions: (Permission | PlatformPermission)[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/**
 * Em que tipo de contexto a rota funciona. Padrão: equipe da empresa
 * (STAFF) e suporte com acesso autorizado (SUPPORT).
 */
export const ContextKinds = (...kinds: ContextKind[]) => SetMetadata(ALLOWED_KINDS, kinds);
export const AnyContext = () => SetMetadata(ALLOWED_KINDS, ['STAFF', 'SUPPORT', 'CUSTOMER', 'PLATFORM']);

/** Aceita também o ticket de login (antes de escolher o contexto). */
export const AllowTicket = () => SetMetadata(ALLOW_TICKET, true);

export const Ctx = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  return ctx.switchToHttp().getRequest().ctx as RequestContext;
});

/** Contexto de empresa. Falha se a rota for chamada fora de uma empresa. */
export const OrgCtx = createParamDecorator((_data: unknown, ctx: ExecutionContext): OrgContext => {
  const context = ctx.switchToHttp().getRequest().ctx as RequestContext;
  if (!context?.organizationId) throw new ForbiddenException('Selecione uma empresa para continuar.');
  return context as OrgContext;
});

/* ---------------- Escopo de filial ---------------- */

/**
 * Filtro por filial para entidades com `branchId`. Gerente de loja só
 * enxerga as lojas que lhe foram atribuídas.
 */
export function branchWhere(ctx: RequestContext, field = 'branchId'): Record<string, unknown> {
  if (ctx.allBranches) return {};
  return { [field]: { in: ctx.branchIds } };
}

/** Garante que a filial informada é uma das autorizadas para o usuário. */
export function assertBranch(ctx: RequestContext, branchId: string | null | undefined): void {
  if (!branchId) throw new ForbiddenException('Filial não informada.');
  if (ctx.allBranches) return;
  if (!ctx.branchIds.includes(branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
}

export function can(ctx: RequestContext, permission: Permission | PlatformPermission): boolean {
  return ctx.permissions.has(permission);
}

export function assertCan(ctx: RequestContext, permission: Permission | PlatformPermission): void {
  if (!ctx.permissions.has(permission)) {
    throw new ForbiddenException(`Seu perfil não tem permissão para esta ação (${permission}).`);
  }
}

/**
 * Alçada de aprovação: além da permissão, o valor precisa caber no
 * limite do usuário quando a empresa definiu um.
 */
export function assertApprovalLimit(ctx: RequestContext, amount: number, what = 'este valor'): void {
  if (ctx.approvalLimit !== null && amount > ctx.approvalLimit) {
    throw new ForbiddenException(
      `Sua alçada de aprovação (R$ ${ctx.approvalLimit.toFixed(2)}) não cobre ${what} (R$ ${amount.toFixed(2)}).`,
    );
  }
}

export function actorType(ctx: RequestContext): 'USER' | 'PLATFORM' | 'SUPPORT' | 'CUSTOMER' {
  switch (ctx.kind) {
    case 'SUPPORT':
      return 'SUPPORT';
    case 'PLATFORM':
      return 'PLATFORM';
    case 'CUSTOMER':
      return 'CUSTOMER';
    default:
      return 'USER';
  }
}

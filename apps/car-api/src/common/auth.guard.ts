import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  ALWAYS_ON_MODULES, PLATFORM_ROLE_PERMISSIONS, SUPPORT_GRANTABLE, effectivePermissions,
  type ContextKind,
} from '@nortycar/shared';
import { PrismaService } from './prisma.service';
import { ALLOWED_KINDS, ALLOW_TICKET, IS_PUBLIC, type RequestContext } from './context';
import type { AnyPayload } from './tokens';
import { num } from './serialize.interceptor';

const DEFAULT_KINDS: ContextKind[] = ['STAFF', 'SUPPORT'];

/**
 * Identifica o usuário e monta o contexto da requisição.
 *
 * Tudo o que importa é relido do banco a cada requisição: vínculo ativo,
 * perfil, filiais, módulos do plano, prazo do acesso de suporte. Revogar
 * um acesso vale na hora, sem esperar o token expirar.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = extractToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Token de acesso ausente.');

    let payload: AnyPayload;
    try {
      payload = await this.jwt.verifyAsync<AnyPayload>(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    if (payload.typ === 'ticket') {
      if (!this.reflector.getAllAndOverride<boolean>(ALLOW_TICKET, targets)) {
        throw new UnauthorizedException('Escolha uma empresa ou contexto para continuar.');
      }
      request.ticket = payload;
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<ContextKind[]>(ALLOWED_KINDS, targets) ?? DEFAULT_KINDS;
    if (!allowed.includes(payload.kind)) {
      throw new ForbiddenException('Esta área não está disponível no contexto atual.');
    }

    request.ctx = await this.buildContext(payload, request);
    return true;
  }

  private async buildContext(payload: Extract<AnyPayload, { typ: 'access' }>, request: {
    ip?: string; headers: Record<string, unknown>;
  }): Promise<RequestContext> {
    return this.prisma.platform(async (tx) => {
      const session = await tx.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
      if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
        throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
      }
      if (session.contextKind !== payload.kind || (session.organizationId ?? undefined) !== payload.org) {
        throw new UnauthorizedException('O contexto da sessão mudou. Entre novamente.');
      }
      const user = session.user;
      if (!user.active) throw new UnauthorizedException('Usuário inativo.');

      // Atualiza "última atividade" no máximo a cada 5 minutos.
      if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {
        await tx.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
      }

      const base: RequestContext = {
        userId: user.id,
        userName: user.name,
        email: user.email,
        sessionId: session.id,
        platformRole: user.platformRole,
        kind: payload.kind,
        allBranches: false,
        branchIds: [],
        permissions: new Set(),
        enabledModules: [...ALWAYS_ON_MODULES],
        approvalLimit: null,
        timezone: 'America/Sao_Paulo',
        ip: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
        requestId: typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
      };

      if (payload.kind === 'PLATFORM') {
        if (user.platformRole === 'NONE') throw new ForbiddenException('Sem acesso ao Master Norty.');
        base.permissions = new Set(PLATFORM_ROLE_PERMISSIONS[user.platformRole]);
        return base;
      }

      const organization = payload.org
        ? await tx.organization.findUnique({
            where: { id: payload.org },
            include: { subscription: { include: { plan: true } } },
          })
        : null;
      if (!organization) throw new ForbiddenException('Empresa não encontrada.');
      if (organization.status === 'CLOSED') throw new ForbiddenException('Esta empresa está encerrada.');
      if (organization.status === 'SUSPENDED' && payload.kind !== 'SUPPORT') {
        throw new ForbiddenException(`Esta empresa está suspensa${organization.statusReason ? `: ${organization.statusReason}` : ''}.`);
      }

      const modules = [
        ...ALWAYS_ON_MODULES,
        ...(organization.subscription?.plan.modules ?? []),
        ...organization.extraModules,
      ];
      base.organizationId = organization.id;
      base.organizationName = organization.name;
      base.timezone = organization.timezone;
      base.enabledModules = [...new Set(modules)];

      if (payload.kind === 'STAFF') {
        const membership = await tx.membership.findUnique({
          where: { id: payload.mid ?? '' },
          include: { role: true, branches: true },
        });
        if (!membership || !membership.active || membership.userId !== user.id || membership.organizationId !== organization.id) {
          throw new ForbiddenException('Seu acesso a esta empresa foi encerrado.');
        }
        base.membershipId = membership.id;
        base.roleName = membership.role.name;
        base.allBranches = membership.allBranches;
        base.branchIds = membership.branches.map((b) => b.branchId);
        base.approvalLimit = membership.approvalLimit === null ? null : num(membership.approvalLimit);
        base.permissions = new Set(effectivePermissions(membership.role.permissions, base.enabledModules));
        return base;
      }

      if (payload.kind === 'SUPPORT') {
        const grant = await tx.supportAccessGrant.findUnique({ where: { id: payload.gid ?? '' } });
        if (
          !grant || grant.status !== 'APPROVED' || !grant.expiresAt || grant.expiresAt < new Date() ||
          grant.requestedById !== user.id || grant.organizationId !== organization.id
        ) {
          throw new ForbiddenException('O acesso de suporte expirou ou foi revogado.');
        }
        const grantable = new Set<string>(SUPPORT_GRANTABLE);
        base.supportGrantId = grant.id;
        base.roleName = 'Suporte Norty (acesso excepcional)';
        base.allBranches = true;
        base.permissions = new Set(effectivePermissions(grant.scope.filter((p) => grantable.has(p)), base.enabledModules));
        return base;
      }

      // CUSTOMER
      const link = await tx.customerLink.findFirst({
        where: { userId: user.id, customerId: payload.cid ?? '', organizationId: organization.id, active: true },
      });
      if (!link) throw new ForbiddenException('Seu acesso a este cadastro foi encerrado.');
      base.customerId = link.customerId;
      return base;
    });
  }
}

function extractToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

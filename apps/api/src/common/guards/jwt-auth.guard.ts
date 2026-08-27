import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { permissionsFor } from '@myhome/shared';
import type { Permission, User } from '@myhome/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC } from '../decorators';
import type { JwtPayload, RequestUser } from '../types';

/**
 * Valida o token, carrega o usuário e fixa o condomínio da requisição.
 *
 * O condomínio é resolvido aqui, uma vez, e não em cada service: assim
 * nenhum módulo novo pode esquecer de escopar e acabar lendo dados de
 * outro cliente.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = extractToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Token de acesso ausente.');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: { select: { condominiumId: true } } },
    });
    if (!user || !user.active) throw new UnauthorizedException('Usuário inativo.');

    // A sessão precisa continuar viva: um logout em outro dispositivo
    // ou uma revogação pelo síndico invalidam o token na hora, mesmo
    // que ele ainda não tenha expirado.
    const session = await this.prisma.deviceSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }

    const condominiumIds = user.memberships.map((m) => m.condominiumId);
    const permissions = [
      ...permissionsFor({
        role: user.role,
        extraPermissions: user.extraPermissions as Permission[],
      } as User),
    ];

    const requestUser: RequestUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      unitId: user.unitId ?? undefined,
      condominiumIds,
      permissions,
    };
    request.user = requestUser;
    request.sessionId = payload.sid;
    request.condominiumId = resolveCondominium(request.headers['x-condominium-id'], condominiumIds);

    return true;
  }
}

function extractToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/**
 * Aceitar o condomínio pedido só se o usuário tiver vínculo com ele.
 * Sem esta verificação, trocar um cabeçalho daria acesso à carteira
 * inteira de qualquer administradora.
 */
function resolveCondominium(requested: unknown, allowed: string[]): string {
  if (typeof requested === 'string' && requested) {
    if (!allowed.includes(requested)) {
      throw new ForbiddenException('Sem acesso a este condomínio.');
    }
    return requested;
  }
  const first = allowed[0];
  if (!first) throw new ForbiddenException('Usuário sem condomínio vinculado.');
  return first;
}

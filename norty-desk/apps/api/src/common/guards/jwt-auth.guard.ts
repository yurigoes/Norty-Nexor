import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from '../decorators/current-user.decorator';

type Payload = { sub: string; org: string };

/**
 * Resolve `request.user` — inclusive `organizationId` — uma única vez,
 * validando o vínculo (`Membership`) do usuário.
 *
 * Nenhum service abaixo daqui pode confiar num id de organização vindo do
 * corpo da requisição (CLAUDE.md, regra 3).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Credenciais ausentes.');
    }

    let payload: Payload;
    try {
      payload = await this.jwt.verifyAsync<Payload>(header.slice(7));
    } catch {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const vinculo = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: payload.sub, organizationId: payload.org } },
      include: { user: { select: { isActive: true } } },
    });

    if (!vinculo || !vinculo.user.isActive) {
      throw new UnauthorizedException('Vínculo inexistente ou inativo.');
    }

    const times = await this.prisma.teamMember.findMany({
      where: { userId: payload.sub, team: { organizationId: payload.org } },
      select: { teamId: true },
    });

    const usuario: UsuarioAutenticado = {
      userId: vinculo.userId,
      organizationId: vinculo.organizationId,
      role: vinculo.role,
      teamIds: times.map((t) => t.teamId),
    };

    request.user = usuario;
    return true;
  }
}

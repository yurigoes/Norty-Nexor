import {
  ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { permissionsFor } from '@myhome/shared';
import type {
  AuthenticatedUser, Condominium, LoginResponse, Permission, SessionResponse, Tenant, Unit, User,
} from '@myhome/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadConfig } from '../../config/env';
import type { JwtPayload } from '../../common/types';

const config = loadConfig();

export interface DeviceInfo {
  device: string;
  browser: string;
  location: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return hash(plain);
  }

  async login(email: string, password: string, device: DeviceInfo): Promise<{
    response: LoginResponse;
    refreshToken: string;
    refreshExpiresAt: Date;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { memberships: { select: { condominiumId: true } } },
    });

    // Mesma mensagem para e-mail inexistente e senha errada: distinguir
    // os dois casos transforma o login num verificador de cadastro.
    const invalid = new UnauthorizedException('E-mail ou senha incorretos.');
    if (!user) {
      // Gasta o mesmo tempo do caminho válido para não vazar a
      // existência da conta pela diferença de resposta.
      await verify(DUMMY_HASH, password).catch(() => false);
      throw invalid;
    }

    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw invalid;
    if (!user.active) throw new ForbiddenException('Conta desativada. Procure a administração.');

    const { token: refreshToken, hash: refreshHash } = createRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    const session = await this.prisma.deviceSession.create({
      data: {
        userId: user.id,
        refreshHash,
        device: device.device,
        browser: device.browser,
        location: device.location,
        ip: device.ip,
        expiresAt: refreshExpiresAt,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const condominiumIds = user.memberships.map((m) => m.condominiumId);
    const accessToken = await this.signAccess(user, session.id);

    this.logger.log(`Login: ${user.email} (${user.role})`);

    return {
      response: {
        accessToken,
        expiresIn: ttlSeconds(config.jwt.accessTtl),
        user: toAuthenticatedUser(user, condominiumIds),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  /**
   * Rotação de refresh token: cada uso queima o token e emite outro.
   * Se um token vazado for usado depois do legítimo, ele já não existe
   * mais e a tentativa falha.
   */
  async refresh(rawToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshExpiresAt: Date;
  }> {
    const session = await this.prisma.deviceSession.findUnique({
      where: { refreshHash: hashToken(rawToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }
    if (!session.user.active) throw new ForbiddenException('Conta desativada.');

    const { token: refreshToken, hash: refreshHash } = createRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.deviceSession.update({
      where: { id: session.id },
      data: { refreshHash, expiresAt: refreshExpiresAt, lastActiveAt: new Date() },
    });

    return {
      accessToken: await this.signAccess(session.user, session.id),
      expiresIn: ttlSeconds(config.jwt.accessTtl),
      refreshToken,
      refreshExpiresAt,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.deviceSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Encerra todas as outras sessões — usado ao trocar a senha. */
  async revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
    const { count } = await this.prisma.deviceSession.updateMany({
      where: { userId, id: { not: keepSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async changePassword(userId: string, current: string, next: string, sessionId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const ok = await verify(user.passwordHash, current).catch(() => false);
    if (!ok) throw new UnauthorizedException('Senha atual incorreta.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(next), mustChangePassword: false },
    });

    // Trocar a senha precisa expulsar quem estiver logado em outro lugar,
    // senão a troca não resolve o motivo mais comum de trocá-la.
    await this.revokeOtherSessions(userId, sessionId);
  }

  async session(userId: string, condominiumId: string): Promise<SessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { select: { condominiumId: true } },
        unit: { include: { tower: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const condominium = await this.prisma.condominium.findUnique({
      where: { id: condominiumId },
      include: { tenant: true, _count: { select: { units: true, residents: true, vehicles: true, staff: true, towers: true } } },
    });
    if (!condominium) throw new NotFoundException('Condomínio não encontrado.');

    const condominiumIds = user.memberships.map((m) => m.condominiumId);

    return {
      user: toAuthenticatedUser(user, condominiumIds),
      tenant: condominium.tenant as unknown as Tenant,
      condominium: {
        id: condominium.id,
        tenantId: condominium.tenantId,
        name: condominium.name,
        shortName: condominium.shortName,
        address: condominium.address,
        city: condominium.city,
        state: condominium.state,
        zip: condominium.zip,
        document: condominium.document,
        unitsCount: condominium._count.units,
        residentsCount: condominium._count.residents,
        vehiclesCount: condominium._count.vehicles,
        staffCount: condominium._count.staff,
        towersCount: condominium._count.towers,
        managerName: condominium.managerName,
        createdAt: condominium.createdAt.toISOString(),
        // As métricas do painel são calculadas pelo módulo de analytics;
        // guardá-las no banco criaria um número que envelhece sozinho.
        metrics: {
          delinquencyRate: 0,
          openTickets: 0,
          accessesToday: 0,
          occupancyRate: 0,
          monthlyRevenue: 0,
        },
      } as Condominium,
      unit: user.unit
        ? ({
            id: user.unit.id,
            condominiumId: user.unit.condominiumId,
            towerId: user.unit.towerId,
            label: user.unit.label,
            floor: user.unit.floor,
            block: user.unit.block,
            bedrooms: user.unit.bedrooms,
            area: user.unit.area,
            status: user.unit.status,
            ownerName: user.unit.ownerName,
            parkingSpots: user.unit.parkingSpots,
            monthlyFee: Number(user.unit.monthlyFee),
            delinquent: false,
          } as Unit)
        : undefined,
    };
  }

  private signAccess(
    user: { id: string; email: string; role: JwtPayload['role']; tenantId: string },
    sessionId: string,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      sid: sessionId,
    };
    return this.jwt.signAsync(payload);
  }
}

/* ---------------- Auxiliares ---------------- */

/** Hash descartável usado só para igualar o tempo de resposta. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$H3Fx3lRz5m8k1nQ2wZ1YXJ6b5vQ8mJ9pKk1lRzL0aQo';

function createRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ttlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * multiplier;
}

function toAuthenticatedUser(
  user: {
    id: string; name: string; email: string; role: JwtPayload['role'];
    avatarColorSeed: string | null; jobTitle: string | null; unitId: string | null;
    tenantId: string; extraPermissions: string[];
  },
  condominiumIds: string[],
): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarColor: user.avatarColorSeed ?? undefined,
    jobTitle: user.jobTitle ?? undefined,
    unitId: user.unitId ?? undefined,
    tenantId: user.tenantId,
    condominiumIds,
    permissions: [
      ...permissionsFor({
        role: user.role,
        extraPermissions: user.extraPermissions as Permission[],
      } as User),
    ],
  };
}

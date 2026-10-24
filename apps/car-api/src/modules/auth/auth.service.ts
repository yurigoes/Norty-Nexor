import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type ContextOption, type LoginStep, type ModuleKey, type SessionInfo, type SessionTokens,
} from '@nortycar/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { MailService } from '../../common/mail.service';
import { loadConfig } from '../../config/env';
import { DUMMY_HASH, assertPasswordPolicy, hashPassword, verifyPassword } from '../../common/password';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../common/totp';
import type { AccessPayload, TicketPayload } from '../../common/tokens';
import type { RequestContext } from '../../common/context';

const config = loadConfig();

export interface DeviceInfo {
  ip?: string;
  userAgent?: string;
}

export interface LoginResult {
  step: LoginStep;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Tentativas com e-mail inexistente: contadas em memória para o bloqueio parecer igual. */
const ghostAttempts = new Map<string, { count: number; until: number }>();

const MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
  ) {}

  /* ================= Login ================= */

  async login(emailRaw: string, password: string, device: DeviceInfo): Promise<LoginResult> {
    const email = emailRaw.toLowerCase().trim();
    // Mesma mensagem para e-mail inexistente e senha errada: distinguir os
    // dois casos transformaria o login num verificador de cadastro.
    const invalid = new UnauthorizedException('E-mail ou senha incorretos.');
    const locked = new HttpException(
      { message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', code: 'rate_limited' },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    const user = await this.prisma.platform((tx) => tx.user.findUnique({ where: { email } }));

    if (!user) {
      const ghost = ghostAttempts.get(email);
      if (ghost && ghost.until > Date.now()) throw locked;
      await verifyPassword(DUMMY_HASH, password);
      const count = (ghost?.count ?? 0) + 1;
      ghostAttempts.set(email, { count, until: count >= MAX_ATTEMPTS ? Date.now() + 15 * 60_000 : 0 });
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw locked;

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      // Bloqueio progressivo: 15 min na 5ª falha, dobrando a cada nova, até 24 h.
      const lockMinutes = failed >= MAX_ATTEMPTS ? Math.min(24 * 60, 15 * 2 ** (failed - MAX_ATTEMPTS)) : 0;
      await this.prisma.platform(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { failedLogins: failed, lockedUntil: lockMinutes ? new Date(Date.now() + lockMinutes * 60_000) : null },
        });
        if (lockMinutes) {
          await this.audit.record(tx, null, {
            action: 'auth.lockout', entityType: 'User', entityId: user.id, platformScope: true,
            after: { failedLogins: failed, lockMinutes }, reason: `IP ${device.ip ?? 'desconhecido'}`,
          });
        }
      });
      throw invalid;
    }
    if (!user.active) throw new ForbiddenException('Conta desativada. Procure o administrador.');

    const { token: refreshToken, hash: refreshHash } = newRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 86_400_000);

    const session = await this.prisma.platform(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
      return tx.session.create({
        data: {
          userId: user.id, refreshHash, ip: device.ip, userAgent: device.userAgent?.slice(0, 300),
          expiresAt: refreshExpiresAt, mfaVerified: !user.mfaEnabled,
        },
      });
    });

    if (user.mfaEnabled) {
      return { step: { step: 'mfa', ticket: await this.signTicket(user.id, session.id, true) }, refreshToken, refreshExpiresAt };
    }
    return { step: await this.afterAuthentication(user.id, session.id), refreshToken, refreshExpiresAt };
  }

  async verifyMfa(ticket: TicketPayload, code: string): Promise<LoginStep> {
    const user = await this.prisma.platform((tx) => tx.user.findUnique({ where: { id: ticket.sub } }));
    if (!user?.mfaEnabled || !user.mfaSecretEnc) throw new UnauthorizedException('MFA não configurado.');
    if (!verifyTotp(this.crypto.decrypt(user.mfaSecretEnc), code)) {
      throw new UnauthorizedException('Código inválido.');
    }
    await this.prisma.platform((tx) => tx.session.update({ where: { id: ticket.sid }, data: { mfaVerified: true } }));
    return this.afterAuthentication(user.id, ticket.sid);
  }

  /** Depois da senha (e do MFA): um contexto entra direto; vários pedem escolha. */
  private async afterAuthentication(userId: string, sessionId: string): Promise<LoginStep> {
    const contexts = await this.listContexts(userId);
    const user = await this.prisma.platform((tx) => tx.user.findUniqueOrThrow({ where: { id: userId } }));
    if (contexts.length === 1 && contexts[0]!.kind !== 'PLATFORM') {
      const tokens = await this.selectContext(userId, sessionId, contexts[0]!.key, null);
      return { step: 'ready', session: tokens, mustChangePassword: user.mustChangePassword };
    }
    if (contexts.length === 0) {
      throw new ForbiddenException('Sua conta não tem acesso a nenhuma empresa ativa. Procure o administrador.');
    }
    return {
      step: 'context',
      ticket: await this.signTicket(userId, sessionId, false),
      contexts,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /** Contextos que o usuário realmente tem. Sempre do banco, nunca do cliente. */
  async listContexts(userId: string): Promise<ContextOption[]> {
    return this.prisma.platform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const [memberships, links, grants] = await Promise.all([
        tx.membership.findMany({
          where: { userId, active: true, organization: { status: { not: 'CLOSED' } } },
          include: { organization: { include: { _count: { select: { branches: true } } } }, role: true, branches: true },
          orderBy: { organization: { name: 'asc' } },
        }),
        tx.customerLink.findMany({
          where: { userId, active: true, organization: { status: { in: ['ACTIVE', 'TRIAL'] } } },
          include: { organization: true, customer: true },
        }),
        tx.supportAccessGrant.findMany({
          where: { requestedById: userId, status: 'APPROVED', expiresAt: { gt: new Date() } },
          include: { organization: true },
        }),
      ]);
      const contexts: ContextOption[] = [];
      for (const m of memberships) {
        contexts.push({
          kind: 'STAFF', key: `staff:${m.id}`, organizationId: m.organizationId,
          organizationName: m.organization.name, organizationStatus: m.organization.status,
          label: m.role.name,
          description: m.allBranches ? 'Todas as filiais' : `${m.branches.length} filial(is) autorizada(s)`,
          branchCount: m.allBranches ? m.organization._count.branches : m.branches.length,
        });
      }
      for (const l of links) {
        contexts.push({
          kind: 'CUSTOMER', key: `customer:${l.id}`, organizationId: l.organizationId,
          organizationName: l.organization.name, organizationStatus: l.organization.status,
          label: 'Portal do cliente', description: l.customer.name,
        });
      }
      for (const g of grants) {
        contexts.push({
          kind: 'SUPPORT', key: `support:${g.id}`, organizationId: g.organizationId,
          organizationName: g.organization.name, organizationStatus: g.organization.status,
          label: 'Acesso de suporte autorizado', description: g.purpose, expiresAt: g.expiresAt?.toISOString(),
        });
      }
      if (user.platformRole !== 'NONE') {
        contexts.push({ kind: 'PLATFORM', key: 'platform', label: 'Master Norty', description: 'Administração da plataforma' });
      }
      return contexts;
    });
  }

  /**
   * Fixa o contexto na sessão e emite o token. A escolha é validada
   * contra o banco: trocar a chave no navegador não dá acesso a nada
   * que o usuário não tenha.
   */
  async selectContext(userId: string, sessionId: string, key: string, current: RequestContext | null): Promise<SessionTokens> {
    return this.prisma.platform(async (tx) => {
      const session = await tx.session.findUnique({ where: { id: sessionId }, include: { user: true } });
      if (!session || session.revokedAt || session.userId !== userId || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
      }
      if (!session.mfaVerified) throw new UnauthorizedException('Confirme o segundo fator antes de continuar.');
      const user = session.user;
      const [kind, id] = key.split(':');
      const payload: AccessPayload = { typ: 'access', sub: userId, sid: sessionId, kind: 'STAFF' };
      const update: { contextKind: AccessPayload['kind']; organizationId: string | null; membershipId: string | null; customerId: string | null; supportGrantId: string | null } = {
        contextKind: 'STAFF', organizationId: null, membershipId: null, customerId: null, supportGrantId: null,
      };

      if (kind === 'staff') {
        const m = await tx.membership.findUnique({ where: { id: id ?? '' }, include: { organization: true } });
        if (!m || m.userId !== userId || !m.active) throw new ForbiddenException('Vínculo não encontrado.');
        if (m.organization.status === 'SUSPENDED') throw new ForbiddenException(`Empresa suspensa${m.organization.statusReason ? `: ${m.organization.statusReason}` : ''}.`);
        if (m.organization.status === 'CLOSED') throw new ForbiddenException('Empresa encerrada.');
        Object.assign(payload, { kind: 'STAFF', org: m.organizationId, mid: m.id });
        Object.assign(update, { contextKind: 'STAFF', organizationId: m.organizationId, membershipId: m.id });
      } else if (kind === 'customer') {
        const l = await tx.customerLink.findUnique({ where: { id: id ?? '' }, include: { organization: true } });
        if (!l || l.userId !== userId || !l.active || !['ACTIVE', 'TRIAL'].includes(l.organization.status)) {
          throw new ForbiddenException('Acesso ao portal não encontrado.');
        }
        Object.assign(payload, { kind: 'CUSTOMER', org: l.organizationId, cid: l.customerId });
        Object.assign(update, { contextKind: 'CUSTOMER', organizationId: l.organizationId, customerId: l.customerId });
      } else if (kind === 'support') {
        const g = await tx.supportAccessGrant.findUnique({ where: { id: id ?? '' } });
        if (!g || g.requestedById !== userId || g.status !== 'APPROVED' || !g.expiresAt || g.expiresAt < new Date()) {
          throw new ForbiddenException('Acesso de suporte não autorizado ou expirado.');
        }
        if (user.platformRole === 'NONE') throw new ForbiddenException('Somente a equipe Norty usa acesso de suporte.');
        Object.assign(payload, { kind: 'SUPPORT', org: g.organizationId, gid: g.id });
        Object.assign(update, { contextKind: 'SUPPORT', organizationId: g.organizationId, supportGrantId: g.id });
        // O início de um acesso excepcional fica na trilha da empresa acessada.
        await this.audit.record(tx, current, {
          action: 'support.session_started', entityType: 'SupportAccessGrant', entityId: g.id,
          organizationId: g.organizationId, reason: g.purpose,
          after: { userId, expiresAt: g.expiresAt },
        });
      } else if (kind === 'platform') {
        if (user.platformRole === 'NONE') throw new ForbiddenException('Sem acesso ao Master Norty.');
        if (config.mfaRequiredForPlatform && !user.mfaEnabled) {
          throw new ForbiddenException('Ative a verificação em duas etapas (MFA) para acessar o Master Norty.');
        }
        Object.assign(payload, { kind: 'PLATFORM' });
        Object.assign(update, { contextKind: 'PLATFORM' });
      } else {
        throw new BadRequestException('Contexto inválido.');
      }

      await tx.session.update({ where: { id: sessionId }, data: { ...update, lastUsedAt: new Date() } });
      return { accessToken: await this.jwt.signAsync(payload, { expiresIn: config.jwt.accessTtlSeconds }), expiresIn: config.jwt.accessTtlSeconds };
    });
  }

  /**
   * Rotação de refresh token: cada uso queima o token e emite outro. Se
   * um token vazado for usado depois do legítimo, ele já não existe.
   */
  async refresh(rawToken: string): Promise<{ tokens: SessionTokens; refreshToken: string; refreshExpiresAt: Date }> {
    return this.prisma.platform(async (tx) => {
      const session = await tx.session.findUnique({ where: { refreshHash: CryptoService.sha256(rawToken) }, include: { user: true } });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Sessão expirada. Entre novamente.');
      }
      if (!session.user.active) throw new ForbiddenException('Conta desativada.');
      if (!session.contextKind || !session.mfaVerified) throw new UnauthorizedException('Entre novamente para escolher o contexto.');

      const { token, hash } = newRefreshToken();
      const refreshExpiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 86_400_000);
      await tx.session.update({ where: { id: session.id }, data: { refreshHash: hash, expiresAt: refreshExpiresAt, lastUsedAt: new Date() } });

      const payload: AccessPayload = {
        typ: 'access', sub: session.userId, sid: session.id, kind: session.contextKind,
        org: session.organizationId ?? undefined, mid: session.membershipId ?? undefined,
        cid: session.customerId ?? undefined, gid: session.supportGrantId ?? undefined,
      };
      const accessToken = await this.jwt.signAsync(payload, { expiresIn: config.jwt.accessTtlSeconds });
      return { tokens: { accessToken, expiresIn: config.jwt.accessTtlSeconds }, refreshToken: token, refreshExpiresAt };
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.platform((tx) => tx.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } }));
  }

  /* ================= Sessão corrente ================= */

  async sessionInfo(ctx: RequestContext): Promise<SessionInfo> {
    return this.prisma.platform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      const contexts = await this.listContexts(ctx.userId);
      let branches: SessionInfo['context']['branches'] = [];
      let organizationSlug: string | undefined;
      let organizationStatus: SessionInfo['context']['organizationStatus'];
      let customerName: string | undefined;
      let supportExpiresAt: string | undefined;
      if (ctx.organizationId) {
        const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
        organizationSlug = org.slug;
        organizationStatus = org.status;
        const list = await tx.branch.findMany({
          where: { organizationId: ctx.organizationId, active: true, ...(ctx.allBranches || ctx.kind === 'CUSTOMER' ? {} : { id: { in: ctx.branchIds } }) },
          orderBy: { name: 'asc' },
        });
        branches = ctx.kind === 'CUSTOMER' ? [] : list.map((b) => ({ id: b.id, name: b.name, code: b.code, city: b.city, state: b.state }));
      }
      let key = contextKey(ctx);
      if (ctx.customerId) {
        customerName = (await tx.customer.findUnique({ where: { id: ctx.customerId } }))?.name;
        const link = await tx.customerLink.findFirst({ where: { userId: ctx.userId, customerId: ctx.customerId } });
        if (link) key = `customer:${link.id}`;
      }
      if (ctx.supportGrantId) {
        supportExpiresAt = (await tx.supportAccessGrant.findUnique({ where: { id: ctx.supportGrantId } }))?.expiresAt?.toISOString();
      }
      return {
        user: {
          id: user.id, name: user.name, email: user.email, mfaEnabled: user.mfaEnabled,
          platformRole: user.platformRole, mustChangePassword: user.mustChangePassword,
        },
        context: {
          kind: ctx.kind,
          key,
          organizationId: ctx.organizationId,
          organizationName: ctx.organizationName,
          organizationSlug,
          organizationStatus,
          timezone: ctx.timezone,
          roleName: ctx.roleName,
          membershipId: ctx.membershipId,
          customerId: ctx.customerId,
          customerName,
          supportGrantId: ctx.supportGrantId,
          supportExpiresAt,
          allBranches: ctx.allBranches,
          branches,
          enabledModules: ctx.enabledModules as ModuleKey[],
          approvalLimit: ctx.approvalLimit,
        },
        permissions: [...ctx.permissions],
        availableContexts: contexts.length,
        demo: await this.demoInfo(tx, ctx),
      };
    });
  }

  /* ================= Modo apresentação ================= */

  private isDemoAccount(ctx: RequestContext): boolean {
    return config.demoRoleSwitchEmails.includes(ctx.email.toLowerCase());
  }

  private async demoInfo(tx: Parameters<Parameters<PrismaService['platform']>[0]>[0], ctx: RequestContext): Promise<SessionInfo['demo']> {
    if (!this.isDemoAccount(ctx) || ctx.kind !== 'STAFF' || !ctx.membershipId || !ctx.organizationId) return null;
    const [roles, membership] = await Promise.all([
      tx.role.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: 'asc' }, select: { id: true, key: true, name: true } }),
      tx.membership.findUniqueOrThrow({ where: { id: ctx.membershipId } }),
    ]);
    return { roles, currentRoleId: membership.roleId };
  }

  /**
   * Troca o perfil da própria conta de apresentação. Só vale para e-mails
   * listados em DEMO_ROLE_SWITCH_EMAILS; qualquer outra conta recebe 403.
   * A troca vale na próxima requisição (o guard relê o vínculo) e fica na
   * auditoria da empresa.
   */
  async switchDemoRole(ctx: RequestContext, roleId: string): Promise<void> {
    if (!this.isDemoAccount(ctx) || ctx.kind !== 'STAFF' || !ctx.membershipId || !ctx.organizationId) {
      throw new ForbiddenException('Troca de perfil disponível só na conta de apresentação.');
    }
    await this.prisma.tenant({ organizationId: ctx.organizationId }, async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundException('Perfil não encontrado.');
      const before = await tx.membership.findUniqueOrThrow({ where: { id: ctx.membershipId! } });
      await tx.membership.update({ where: { id: before.id }, data: { roleId: role.id, allBranches: true } });
      await this.audit.record(tx, ctx, { action: 'demo.role_switched', entityType: 'Membership', entityId: before.id, before: { roleId: before.roleId }, after: { roleId: role.id, role: role.name } });
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.platform((tx) => tx.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    }));
    return sessions.map((s) => ({
      id: s.id, current: s.id === currentSessionId, ip: s.ip, userAgent: s.userAgent,
      contextKind: s.contextKind, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const { count } = await this.prisma.platform((tx) => tx.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() },
    }));
    if (!count) throw new NotFoundException('Sessão não encontrada.');
  }

  async revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
    const { count } = await this.prisma.platform((tx) => tx.session.updateMany({
      where: { userId, id: { not: keepSessionId }, revokedAt: null }, data: { revokedAt: new Date() },
    }));
    return count;
  }

  /* ================= Senha ================= */

  async changePassword(ctx: RequestContext, current: string, next: string): Promise<void> {
    assertPasswordPolicy(next);
    await this.prisma.platform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!(await verifyPassword(user.passwordHash, current))) throw new UnauthorizedException('Senha atual incorreta.');
      if (await verifyPassword(user.passwordHash, next)) throw new BadRequestException('A nova senha precisa ser diferente da atual.');
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() },
      });
      // Trocar a senha expulsa as outras sessões — senão a troca não resolve
      // o motivo mais comum de trocá-la.
      await tx.session.updateMany({ where: { userId: user.id, id: { not: ctx.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'auth.password_changed', entityType: 'User', entityId: user.id, platformScope: !ctx.organizationId });
    });
  }

  /**
   * Pedido de recuperação. Responde igual exista ou não a conta. Sem
   * SMTP configurado o e-mail não sai — e isso fica registrado; o
   * administrador da empresa pode gerar o link pela tela de usuários.
   */
  async requestReset(emailRaw: string): Promise<void> {
    const email = emailRaw.toLowerCase().trim();
    const user = await this.prisma.platform((tx) => tx.user.findUnique({ where: { email } }));
    if (!user || !user.active) return;
    const token = await this.createResetToken(user.id);
    const link = `${config.appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const result = await this.mail.send(
      user.email,
      'Norty Car — redefinição de senha',
      `Olá, ${user.name}.\n\nPara definir uma nova senha, acesse o link abaixo em até 60 minutos:\n\n${link}\n\nSe você não pediu a troca, ignore esta mensagem.`,
    );
    if (result.status !== 'SENT') {
      this.logger.warn(`Recuperação de senha sem envio (${result.status}) para o usuário ${user.id}.`);
    }
  }

  async createResetToken(userId: string): Promise<string> {
    const token = CryptoService.randomToken(32);
    await this.prisma.platform(async (tx) => {
      // Um pedido novo invalida os anteriores.
      await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.create({
        data: { userId, tokenHash: CryptoService.sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
      });
    });
    return token;
  }

  async confirmReset(token: string, newPassword: string): Promise<void> {
    assertPasswordPolicy(newPassword);
    await this.prisma.platform(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: CryptoService.sha256(token) } });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw new BadRequestException('Link de redefinição inválido ou expirado. Peça um novo.');
      }
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date(),
          failedLogins: 0, lockedUntil: null,
        },
      });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, null, { action: 'auth.password_reset', entityType: 'User', entityId: record.userId, platformScope: true });
    });
  }

  /* ================= MFA ================= */

  async mfaSetup(ctx: RequestContext): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = generateTotpSecret();
    await this.prisma.platform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (user.mfaEnabled) throw new BadRequestException('O MFA já está ativo. Desative antes de configurar outro aparelho.');
      await tx.user.update({ where: { id: ctx.userId }, data: { mfaSecretEnc: this.crypto.encrypt(secret) } });
    });
    return { secret, otpauthUrl: otpauthUrl(secret, ctx.email) };
  }

  async mfaEnable(ctx: RequestContext, code: string): Promise<void> {
    await this.prisma.platform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!user.mfaSecretEnc) throw new BadRequestException('Inicie a configuração do MFA primeiro.');
      if (!verifyTotp(this.crypto.decrypt(user.mfaSecretEnc), code)) throw new BadRequestException('Código inválido.');
      await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      await this.audit.record(tx, ctx, { action: 'auth.mfa_enabled', entityType: 'User', entityId: user.id, platformScope: !ctx.organizationId });
    });
  }

  async mfaDisable(ctx: RequestContext, password: string, code: string): Promise<void> {
    await this.prisma.platform(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (!user.mfaEnabled || !user.mfaSecretEnc) throw new BadRequestException('O MFA não está ativo.');
      if (!(await verifyPassword(user.passwordHash, password))) throw new UnauthorizedException('Senha incorreta.');
      if (!verifyTotp(this.crypto.decrypt(user.mfaSecretEnc), code)) throw new BadRequestException('Código inválido.');
      if (user.platformRole !== 'NONE' && config.mfaRequiredForPlatform) {
        throw new ForbiddenException('Contas da equipe Norty precisam manter o MFA ativo.');
      }
      await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null } });
      await this.audit.record(tx, ctx, { action: 'auth.mfa_disabled', entityType: 'User', entityId: user.id, platformScope: !ctx.organizationId });
    });
  }

  private signTicket(userId: string, sessionId: string, mfaPending: boolean): Promise<string> {
    const payload: TicketPayload = { typ: 'ticket', sub: userId, sid: sessionId, mfaPending };
    return this.jwt.signAsync(payload, { expiresIn: 600 });
  }
}

/* ---------------- Auxiliares ---------------- */

function newRefreshToken(): { token: string; hash: string } {
  const token = CryptoService.randomToken(48);
  return { token, hash: CryptoService.sha256(token) };
}

export function contextKey(ctx: RequestContext): string {
  switch (ctx.kind) {
    case 'STAFF':
      return `staff:${ctx.membershipId}`;
    case 'SUPPORT':
      return `support:${ctx.supportGrantId}`;
    case 'PLATFORM':
      return 'platform';
    default:
      return `customer:${ctx.customerId}`;
  }
}

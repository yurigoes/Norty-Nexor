import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MODULE_LABEL, SUPPORT_GRANTABLE, centsToDecimalString, isValidCnpj, onlyDigits, toCents } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/mail.service';
import { StorageService } from '../../common/storage.service';
import { CryptoService } from '../../common/crypto.service';
import { provisionOrganization } from '../../common/provisioning';
import { hashPassword } from '../../common/password';
import { pageArgs, paginated } from '../../common/pagination';
import { num } from '../../common/serialize.interceptor';
import type { RequestContext } from '../../common/context';
import { loadConfig } from '../../config/env';
import { AuthService } from '../auth/auth.service';
import type {
  CreateOrganizationDto, GenerateInvoicesDto, GrantRequestDto, ListQueryDto, PlanDto, StaffDto, SubscriptionDto,
  TicketUpdateDto, UpdateOrganizationAdminDto, UpdatePlanDto, UpdateStaffDto,
} from './dto';

const MODULE_KEYS = new Set(Object.keys(MODULE_LABEL));

/**
 * Master Norty: administração da plataforma.
 *
 * Fronteira deliberada: daqui se vê empresas, planos, assinaturas,
 * domínios e números agregados — nunca veículos, clientes ou contratos.
 * Dado operacional de uma locadora só por acesso de suporte autorizado
 * pela própria empresa, com prazo e auditoria.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly auth: AuthService,
  ) {}

  /* ================= Painel ================= */

  async dashboard() {
    return this.prisma.platform(async (tx) => {
      const [byStatus, vehicles, users, subs, overdue, tickets, badDomains, grants] = await Promise.all([
        tx.organization.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.vehicleUnit.count({ where: { deletedAt: null, commercialStatus: { not: 'SOLD' } } }),
        tx.membership.count({ where: { active: true } }),
        tx.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } }, include: { plan: true } }),
        tx.saasInvoice.aggregate({ where: { status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lt: new Date() } }, _sum: { amount: true }, _count: { _all: true } }),
        tx.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        tx.domain.count({ where: { status: 'MISCONFIGURED' } }),
        tx.supportAccessGrant.count({ where: { status: 'REQUESTED' } }),
      ]);
      const mrrCents = subs.reduce((acc, s) => acc + toCents(num(s.priceOverride ?? s.plan.priceMonthly)), 0);
      const count = (status: string) => byStatus.find((b) => b.status === status)?._count._all ?? 0;
      return {
        organizations: { total: byStatus.reduce((a, b) => a + b._count._all, 0), active: count('ACTIVE'), trial: count('TRIAL'), suspended: count('SUSPENDED'), closed: count('CLOSED') },
        vehicles,
        users,
        mrr: mrrCents / 100,
        payingSubscriptions: subs.length,
        overdueInvoices: { count: overdue._count._all, amount: num(overdue._sum.amount) },
        openTickets: tickets,
        misconfiguredDomains: badDomains,
        pendingGrants: grants,
      };
    });
  }

  /* ================= Empresas ================= */

  async organizations(query: ListQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { slug: { contains: query.q.toLowerCase() } }, { document: { contains: onlyDigits(query.q) || query.q } }] } : {}),
    };
    return this.prisma.platform(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.organization.findMany({
          where, skip, take, orderBy: { createdAt: 'desc' },
          include: { subscription: { include: { plan: true } }, _count: { select: { branches: true, memberships: true, vehicles: true } } },
        }),
        tx.organization.count({ where }),
      ]);
      return paginated(rows.map((o) => this.summary(o)), total, page, pageSize);
    });
  }

  private summary(o: Prisma.OrganizationGetPayload<{ include: { subscription: { include: { plan: true } }; _count: { select: { branches: true; memberships: true; vehicles: true } } } }>) {
    return {
      id: o.id, name: o.name, legalName: o.legalName, document: o.document, slug: o.slug, email: o.email, phone: o.phone,
      status: o.status, statusReason: o.statusReason, createdAt: o.createdAt, extraModules: o.extraModules,
      subscription: o.subscription ? {
        id: o.subscription.id, status: o.subscription.status, planId: o.subscription.planId, planName: o.subscription.plan.name,
        price: num(o.subscription.priceOverride ?? o.subscription.plan.priceMonthly), priceOverride: o.subscription.priceOverride === null ? null : num(o.subscription.priceOverride),
        trialEndsAt: o.subscription.trialEndsAt,
      } : null,
      usage: { branches: o._count.branches, users: o._count.memberships, vehicles: o._count.vehicles },
      limits: o.subscription ? { vehicles: o.subscription.plan.maxVehicles, branches: o.subscription.plan.maxBranches, users: o.subscription.plan.maxUsers } : null,
    };
  }

  async organization(id: string) {
    return this.prisma.platform(async (tx) => {
      const o = await tx.organization.findUnique({
        where: { id },
        include: { subscription: { include: { plan: true } }, _count: { select: { branches: true, memberships: true, vehicles: true } } },
      });
      if (!o) throw new NotFoundException('Empresa não encontrada.');
      const [owners, domains, invoices, grants] = await Promise.all([
        // Só o nome e o e-mail de quem administra — contato da conta, não dado operacional.
        tx.membership.findMany({ where: { organizationId: id, active: true, role: { key: { in: ['owner', 'admin'] } } }, include: { user: { select: { name: true, email: true, mfaEnabled: true } }, role: { select: { name: true } } } }),
        tx.domain.findMany({ where: { organizationId: id } }),
        tx.saasInvoice.findMany({ where: { organizationId: id }, orderBy: { competence: 'desc' }, take: 24 }),
        tx.supportAccessGrant.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: { requestedBy: { select: { name: true } } } }),
      ]);
      const history = await tx.auditLog.findMany({
        where: { entityType: 'Organization', entityId: id, organizationId: null }, orderBy: { at: 'desc' }, take: 30,
      });
      return {
        ...this.summary(o),
        administrators: owners.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role.name, mfaEnabled: m.user.mfaEnabled })),
        domains, invoices, grants, history,
      };
    });
  }

  async createOrganization(ctx: RequestContext, dto: CreateOrganizationDto) {
    if (dto.document && !isValidCnpj(dto.document)) throw new BadRequestException('CNPJ inválido.');
    const ownerEmail = dto.ownerEmail.toLowerCase().trim();
    const trialDefault = await this.setting<number>('trialDays', 14);
    const result = await this.prisma.platform(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { id: dto.planId } });
      if (!plan || !plan.active) throw new BadRequestException('Plano inválido ou inativo.');
      if (await tx.organization.findUnique({ where: { slug: dto.slug } })) throw new ConflictException('Este identificador de empresa já está em uso.');
      const { organization, roles } = await provisionOrganization(tx, {
        name: dto.name, legalName: dto.legalName, document: dto.document ? onlyDigits(dto.document) : null, slug: dto.slug,
        email: dto.email, phone: dto.phone, planId: plan.id, trialDays: dto.trialDays ?? trialDefault,
        firstBranch: { code: dto.branchCode, name: dto.branchName, city: dto.branchCity, state: dto.branchState?.toUpperCase() },
      });
      let owner = await tx.user.findUnique({ where: { email: ownerEmail } });
      const isNewUser = !owner;
      if (!owner) {
        owner = await tx.user.create({
          data: { email: ownerEmail, name: dto.ownerName, passwordHash: await hashPassword(CryptoService.randomToken(32)), mustChangePassword: true },
        });
      }
      await tx.membership.create({ data: { organizationId: organization.id, userId: owner.id, roleId: roles.owner!, allBranches: true } });
      await this.audit.record(tx, ctx, {
        action: 'platform.organization_created', entityType: 'Organization', entityId: organization.id, platformScope: true,
        after: { name: organization.name, slug: organization.slug, planId: plan.id, ownerEmail },
      });
      await this.audit.record(tx, ctx, {
        action: 'organization.created_by_norty', entityType: 'Organization', entityId: organization.id, organizationId: organization.id,
        after: { ownerEmail, plan: plan.name },
      });
      return { organization, ownerId: owner.id, isNewUser };
    });

    let accessLink: string | null = null;
    let emailStatus = 'NOT_NEEDED';
    if (result.isNewUser) {
      const token = await this.auth.createResetToken(result.ownerId);
      const link = `${loadConfig().appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
      const sent = await this.mail.send(ownerEmail, 'Norty Car — sua conta foi criada', `Olá, ${dto.ownerName}.\n\nA conta da ${dto.name} no Norty Car está pronta. Defina sua senha em até 60 minutos:\n\n${link}`);
      emailStatus = sent.status;
      if (sent.status !== 'SENT') accessLink = link;
    }
    return { id: result.organization.id, slug: result.organization.slug, isNewUser: result.isNewUser, emailStatus, accessLink };
  }

  async updateOrganization(ctx: RequestContext, id: string, dto: UpdateOrganizationAdminDto) {
    if (dto.extraModules?.some((m) => !MODULE_KEYS.has(m))) throw new BadRequestException('Módulo desconhecido.');
    return this.prisma.platform(async (tx) => {
      const before = await tx.organization.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Empresa não encontrada.');
      const updated = await tx.organization.update({ where: { id }, data: dto });
      const diff = AuditService.diff(before as never, dto as never);
      await this.audit.record(tx, ctx, { action: 'platform.organization_updated', entityType: 'Organization', entityId: id, platformScope: true, ...diff });
      if (dto.extraModules) await this.audit.record(tx, ctx, { action: 'organization.modules_changed_by_norty', entityType: 'Organization', entityId: id, organizationId: id, ...diff });
      return updated;
    });
  }

  /**
   * Suspensão, reativação e encerramento, sempre com motivo. A suspensão
   * vale na próxima requisição de qualquer usuário da empresa (o AuthGuard
   * relê a situação a cada chamada) e o motivo aparece para eles.
   */
  async changeStatus(ctx: RequestContext, id: string, status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED', reason: string) {
    return this.prisma.platform(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id } });
      if (!org) throw new NotFoundException('Empresa não encontrada.');
      if (org.status === 'CLOSED') throw new ConflictException('Empresa encerrada não pode ser reativada por aqui.');
      if (org.status === status) throw new ConflictException('A empresa já está nesta situação.');
      const updated = await tx.organization.update({ where: { id }, data: { status, statusReason: status === 'ACTIVE' ? null : reason } });
      if (status === 'CLOSED') {
        await tx.session.updateMany({ where: { organizationId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.subscription.updateMany({ where: { organizationId: id }, data: { status: 'CANCELED', canceledAt: new Date() } });
      }
      const entry = { entityType: 'Organization', entityId: id, reason, before: { status: org.status }, after: { status } };
      await this.audit.record(tx, ctx, { ...entry, action: `platform.organization_${status.toLowerCase()}`, platformScope: true });
      await this.audit.record(tx, ctx, { ...entry, action: `organization.status_changed_by_norty`, organizationId: id });
      return updated;
    });
  }

  /* ================= Planos e assinaturas ================= */

  plans() {
    return this.prisma.platform((tx) => tx.plan.findMany({ orderBy: { priceMonthly: 'asc' }, include: { _count: { select: { subscriptions: true } } } }));
  }

  async createPlan(ctx: RequestContext, dto: PlanDto) {
    this.assertModules(dto.modules);
    return this.prisma.platform(async (tx) => {
      if (await tx.plan.findUnique({ where: { code: dto.code } })) throw new ConflictException('Já existe plano com este código.');
      const plan = await tx.plan.create({ data: { ...dto, priceMonthly: centsToDecimalString(toCents(dto.priceMonthly)) } });
      await this.audit.record(tx, ctx, { action: 'platform.plan_created', entityType: 'Plan', entityId: plan.id, platformScope: true, after: dto });
      return plan;
    });
  }

  async updatePlan(ctx: RequestContext, id: string, dto: UpdatePlanDto) {
    if (dto.modules) this.assertModules(dto.modules);
    return this.prisma.platform(async (tx) => {
      const before = await tx.plan.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Plano não encontrado.');
      const plan = await tx.plan.update({ where: { id }, data: { ...dto, priceMonthly: dto.priceMonthly === undefined ? undefined : centsToDecimalString(toCents(dto.priceMonthly)) } });
      await this.audit.record(tx, ctx, { action: 'platform.plan_updated', entityType: 'Plan', entityId: id, platformScope: true, ...AuditService.diff(before as never, dto as never) });
      return plan;
    });
  }

  private assertModules(modules: string[]) {
    const unknown = modules.filter((m) => !MODULE_KEYS.has(m));
    if (unknown.length) throw new BadRequestException(`Módulos desconhecidos: ${unknown.join(', ')}`);
  }

  async updateSubscription(ctx: RequestContext, organizationId: string, dto: SubscriptionDto) {
    return this.prisma.platform(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { organizationId } });
      if (!sub) throw new NotFoundException('Assinatura não encontrada.');
      if (dto.planId && !(await tx.plan.findUnique({ where: { id: dto.planId } }))) throw new BadRequestException('Plano inválido.');
      const data = {
        planId: dto.planId, status: dto.status,
        priceOverride: dto.priceOverride === undefined ? undefined : dto.priceOverride === null ? null : centsToDecimalString(toCents(dto.priceOverride)),
        canceledAt: dto.status === 'CANCELED' ? new Date() : undefined,
      };
      const updated = await tx.subscription.update({ where: { organizationId }, data });
      const diff = AuditService.diff(sub as never, data as never);
      await this.audit.record(tx, ctx, { action: 'platform.subscription_updated', entityType: 'Organization', entityId: organizationId, platformScope: true, reason: dto.reason, ...diff });
      await this.audit.record(tx, ctx, { action: 'organization.subscription_changed_by_norty', entityType: 'Subscription', entityId: sub.id, organizationId, reason: dto.reason, ...diff });
      return updated;
    });
  }

  invoices(query: ListQueryDto) {
    return this.prisma.platform(async (tx) => {
      const { skip, take, page, pageSize } = pageArgs(query);
      const where: Prisma.SaasInvoiceWhereInput = query.status === 'OVERDUE'
        ? { status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lt: new Date() } }
        : query.status ? { status: query.status as never } : {};
      const [rows, total] = await Promise.all([
        tx.saasInvoice.findMany({ where, skip, take, orderBy: [{ competence: 'desc' }, { dueDate: 'asc' }], include: { organization: { select: { id: true, name: true, slug: true } } } }),
        tx.saasInvoice.count({ where }),
      ]);
      return paginated(rows, total, page, pageSize);
    });
  }

  /**
   * Gera as faturas de uma competência para as assinaturas cobráveis. A
   * unicidade (empresa, competência) torna a geração idempotente: rodar
   * de novo só cria as que faltam. Nenhuma cobrança é emitida — a fatura
   * é o registro do valor devido; a baixa é manual, com referência.
   */
  async generateInvoices(ctx: RequestContext, dto: GenerateInvoicesDto) {
    return this.prisma.platform(async (tx) => {
      const subs = await tx.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } }, include: { plan: true } });
      const [y, m] = dto.competence.split('-').map(Number);
      const dueDate = new Date(Date.UTC(y!, m! - 1, dto.dueDay));
      const data = subs
        .map((s) => ({ organizationId: s.organizationId, competence: dto.competence, amount: centsToDecimalString(toCents(num(s.priceOverride ?? s.plan.priceMonthly))), dueDate }))
        .filter((d) => toCents(d.amount) > 0);
      const created = await tx.saasInvoice.createMany({ data, skipDuplicates: true });
      await this.audit.record(tx, ctx, { action: 'platform.invoices_generated', entityType: 'SaasInvoice', platformScope: true, after: { competence: dto.competence, created: created.count, eligible: data.length } });
      return { created: created.count, eligible: data.length, skippedZero: subs.length - data.length };
    });
  }

  async payInvoice(ctx: RequestContext, id: string, reference: string) {
    return this.prisma.platform(async (tx) => {
      const inv = await tx.saasInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException('Fatura não encontrada.');
      if (inv.status === 'PAID' || inv.status === 'VOID') throw new ConflictException('Fatura já quitada ou cancelada.');
      const updated = await tx.saasInvoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), notes: `Baixa manual: ${reference}` } });
      await this.audit.record(tx, ctx, { action: 'platform.invoice_paid', entityType: 'SaasInvoice', entityId: id, platformScope: true, reason: reference, after: { amount: inv.amount, competence: inv.competence } });
      return updated;
    });
  }

  async voidInvoice(ctx: RequestContext, id: string, reason: string) {
    return this.prisma.platform(async (tx) => {
      const inv = await tx.saasInvoice.findUnique({ where: { id } });
      if (!inv) throw new NotFoundException('Fatura não encontrada.');
      if (inv.status === 'PAID') throw new ConflictException('Fatura quitada não pode ser cancelada.');
      const updated = await tx.saasInvoice.update({ where: { id }, data: { status: 'VOID', notes: `Cancelada: ${reason}` } });
      await this.audit.record(tx, ctx, { action: 'platform.invoice_voided', entityType: 'SaasInvoice', entityId: id, platformScope: true, reason });
      return updated;
    });
  }

  /* ================= Suporte ================= */

  tickets(status?: string) {
    return this.prisma.platform((tx) => tx.supportTicket.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { updatedAt: 'desc' }, take: 200,
      include: { organization: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    }));
  }

  async updateTicket(ctx: RequestContext, id: string, dto: TicketUpdateDto) {
    return this.prisma.platform(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
      if (!ticket) throw new NotFoundException('Chamado não encontrado.');
      if (dto.message) await tx.supportTicketMessage.create({ data: { ticketId: id, authorId: ctx.userId, fromNorty: true, body: dto.message } });
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: dto.status ?? (dto.message ? 'WAITING_CUSTOMER' : undefined), assignedToId: ticket.assignedToId ?? ctx.userId },
      });
      return updated;
    });
  }

  /**
   * Pedido de acesso excepcional. A plataforma só pede: quem autoriza é a
   * empresa (tela Suporte Norty, permissão support.approve). Escopo
   * limitado a permissões de leitura.
   */
  async requestGrant(ctx: RequestContext, dto: GrantRequestDto) {
    const allowed = new Set<string>(SUPPORT_GRANTABLE);
    const invalid = dto.scope.filter((p) => !allowed.has(p));
    if (!dto.scope.length || invalid.length) throw new BadRequestException(`Escopo inválido: o suporte só pode pedir permissões de leitura${invalid.length ? ` (${invalid.join(', ')})` : ''}.`);
    return this.prisma.platform(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: dto.organizationId } });
      if (!org || org.status === 'CLOSED') throw new NotFoundException('Empresa não encontrada.');
      const grant = await tx.supportAccessGrant.create({
        data: { organizationId: org.id, requestedById: ctx.userId, purpose: dto.purpose, scope: [...new Set(dto.scope)], durationHours: dto.durationHours },
      });
      await this.audit.record(tx, ctx, { action: 'support.grant_requested', entityType: 'SupportAccessGrant', entityId: grant.id, organizationId: org.id, reason: dto.purpose, after: { scope: grant.scope, durationHours: grant.durationHours } });
      return grant;
    });
  }

  myGrants(ctx: RequestContext) {
    return this.prisma.platform((tx) => tx.supportAccessGrant.findMany({
      where: { requestedById: ctx.userId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { organization: { select: { id: true, name: true } } },
    }));
  }

  /* ================= Saúde ================= */

  async health() {
    const started = Date.now();
    const database = await this.prisma.isHealthy();
    const dbLatencyMs = Date.now() - started;
    const storage = await this.storage.healthy();
    const queue = await this.prisma.platform(async (tx) => {
      const [deliveries, failedHooks, lastNotification, sessions] = await Promise.all([
        tx.notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.inboundWebhookEvent.count({ where: { OR: [{ lastError: { not: null } }, { signatureValid: false }] } }),
        tx.notification.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        tx.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      ]);
      const by = (s: string) => deliveries.find((d) => d.status === s)?._count._all ?? 0;
      return { pending: by('PENDING'), failed: by('FAILED'), skippedNotConfigured: by('SKIPPED_NOT_CONFIGURED'), sent: by('SENT'), failedInboundWebhooks: failedHooks, lastNotificationAt: lastNotification?.createdAt ?? null, activeSessions: sessions };
    });
    const config = loadConfig();
    return {
      status: database && storage ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? '1.0.0',
      nodeEnv: config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      database: { ok: database, latencyMs: dbLatencyMs },
      storage: { ok: storage, driver: config.storage.driver },
      jobs: { enabled: config.jobs.enabled, intervalSeconds: config.jobs.intervalSeconds },
      queue,
      checkedAt: new Date().toISOString(),
    };
  }

  /* ================= Auditoria administrativa ================= */

  async platformAudit(query: ListQueryDto & { action?: string }) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.AuditLogWhereInput = {
      organizationId: null,
      ...(query.q ? { OR: [{ action: { contains: query.q } }, { actorName: { contains: query.q, mode: 'insensitive' } }, { entityType: { contains: query.q } }] } : {}),
    };
    return this.prisma.platform(async (tx) => {
      const [rows, total] = await Promise.all([tx.auditLog.findMany({ where, skip, take, orderBy: { at: 'desc' } }), tx.auditLog.count({ where })]);
      return paginated(rows, total, page, pageSize);
    });
  }

  /* ================= Equipe Norty ================= */

  staff() {
    return this.prisma.platform((tx) => tx.user.findMany({
      where: { platformRole: { not: 'NONE' } }, orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, platformRole: true, active: true, mfaEnabled: true, lastLoginAt: true, mustChangePassword: true, createdAt: true },
    }));
  }

  async createStaff(ctx: RequestContext, dto: StaffDto) {
    if (dto.platformRole === 'SUPER' && ctx.platformRole !== 'SUPER') throw new ForbiddenException('Só um superadministrador cria outro.');
    const email = dto.email.toLowerCase().trim();
    const { userId, isNew } = await this.prisma.platform(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing && existing.platformRole !== 'NONE') throw new ConflictException('Este usuário já faz parte da equipe Norty.');
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { platformRole: dto.platformRole } })
        : await tx.user.create({ data: { email, name: dto.name, platformRole: dto.platformRole, mustChangePassword: true, passwordHash: await hashPassword(CryptoService.randomToken(32)) } });
      await this.audit.record(tx, ctx, { action: 'platform.staff_added', entityType: 'User', entityId: user.id, platformScope: true, after: { email, platformRole: dto.platformRole } });
      return { userId: user.id, isNew: !existing };
    });
    let accessLink: string | null = null;
    let emailStatus = 'NOT_NEEDED';
    if (isNew) {
      const link = `${loadConfig().appUrl}/redefinir-senha?token=${encodeURIComponent(await this.auth.createResetToken(userId))}`;
      const sent = await this.mail.send(email, 'Norty Car — acesso da equipe Norty', `Olá, ${dto.name}.\n\nDefina sua senha em até 60 minutos e ative a verificação em duas etapas no primeiro acesso:\n\n${link}`);
      emailStatus = sent.status;
      if (sent.status !== 'SENT') accessLink = link;
    }
    return { id: userId, isNewUser: isNew, emailStatus, accessLink };
  }

  async updateStaff(ctx: RequestContext, id: string, dto: UpdateStaffDto) {
    if (id === ctx.userId) throw new ConflictException('Você não pode alterar o próprio acesso.');
    if (dto.platformRole === 'SUPER' && ctx.platformRole !== 'SUPER') throw new ForbiddenException('Só um superadministrador promove a superadministrador.');
    return this.prisma.platform(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || user.platformRole === 'NONE') throw new NotFoundException('Membro da equipe não encontrado.');
      if (user.platformRole === 'SUPER' && ctx.platformRole !== 'SUPER') throw new ForbiddenException('Só um superadministrador altera outro.');
      const updated = await tx.user.update({ where: { id }, data: dto, select: { id: true, platformRole: true, active: true } });
      if (dto.active === false || dto.platformRole === 'NONE') {
        // Sem acesso, sem sessão: tanto as do Master quanto as de suporte.
        await tx.session.updateMany({ where: { userId: id, contextKind: { in: ['PLATFORM', 'SUPPORT'] }, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record(tx, ctx, { action: 'platform.staff_updated', entityType: 'User', entityId: id, platformScope: true, before: { platformRole: user.platformRole, active: user.active }, after: dto });
      return updated;
    });
  }

  /* ================= Configurações e integrações globais ================= */

  async settings() {
    const rows = await this.prisma.platform((tx) => tx.platformSetting.findMany({ orderBy: { key: 'asc' } }));
    return { trialDays: 14, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }

  async setting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.platform((tx) => tx.platformSetting.findUnique({ where: { key } }));
    return (row?.value as T | undefined) ?? fallback;
  }

  async saveSetting(ctx: RequestContext, key: string, value: unknown) {
    if (key === 'trialDays' && (typeof value !== 'number' || value < 0 || value > 90)) throw new BadRequestException('Dias de avaliação: número entre 0 e 90.');
    return this.prisma.platform(async (tx) => {
      const before = await tx.platformSetting.findUnique({ where: { key } });
      const row = await tx.platformSetting.upsert({
        where: { key }, create: { key, value: value as Prisma.InputJsonValue, updatedBy: ctx.userId }, update: { value: value as Prisma.InputJsonValue, updatedBy: ctx.userId },
      });
      await this.audit.record(tx, ctx, { action: 'platform.setting_changed', entityType: 'PlatformSetting', entityId: null, platformScope: true, before: { [key]: before?.value ?? null }, after: { [key]: value } });
      return row;
    });
  }

  /**
   * Situação das integrações globais. "Verificada" só quando houve teste
   * real; sem credencial, "pendente de configuração".
   */
  async integrations(test = false) {
    const config = loadConfig();
    const smtp = test ? await this.mail.verify() : null;
    return [
      {
        provider: 'smtp', name: 'E-mail (SMTP)',
        status: !this.mail.configured ? 'NOT_CONFIGURED' : smtp ? (smtp.ok ? 'VERIFIED' : 'ERROR') : 'CONFIGURED',
        detail: smtp?.message ?? (this.mail.configured ? `Servidor ${config.smtp.host}:${config.smtp.port}` : 'Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM.'),
      },
      {
        provider: 'anthropic', name: 'Norty IA (Anthropic)',
        status: config.ai.anthropicApiKey ? 'CONFIGURED' : 'NOT_CONFIGURED',
        detail: config.ai.anthropicApiKey ? `Chave presente; modelo ${config.ai.model}. Comunicação não testada por aqui.` : 'Defina ANTHROPIC_API_KEY.',
      },
      { provider: 'storage', name: 'Armazenamento de arquivos', status: (await this.storage.healthy()) ? 'VERIFIED' : 'ERROR', detail: `Driver ${config.storage.driver} em ${config.storage.dir}. S3/MinIO: pendente de configuração.` },
      { provider: 'whatsapp', name: 'WhatsApp Business', status: 'NOT_CONFIGURED', detail: 'Integração oficial não configurada. Nenhuma mensagem é enviada.' },
      { provider: 'esign', name: 'Assinatura eletrônica', status: 'NOT_CONFIGURED', detail: 'Provedor não configurado. Contratos aceitam assinatura em papel digitalizada.' },
    ];
  }
}

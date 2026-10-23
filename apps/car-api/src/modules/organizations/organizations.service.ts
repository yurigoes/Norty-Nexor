import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isPermission, isValidCnpj, onlyDigits, PERMISSIONS } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/mail.service';
import { CryptoService } from '../../common/crypto.service';
import { hashPassword } from '../../common/password';
import { orgSettings } from '../../common/org-settings';
import { pageArgs, paginated } from '../../common/pagination';
import type { OrgContext } from '../../common/context';
import { AuthService } from '../auth/auth.service';
import { loadConfig } from '../../config/env';
import type {
  AuditQueryDto, BranchDto, InviteUserDto, RoleDto, UpdateBranchDto, UpdateMembershipDto, UpdateOrganizationDto, UpdateRoleDto,
} from './dto';

/** Permissões sem as quais ninguém mais consegue administrar a empresa. */
const ADMIN_KEYS = ['users.manage', 'roles.manage'];

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  /* ================= Empresa ================= */

  async profile(ctx: OrgContext) {
    return this.prisma.platform(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
        include: { subscription: { include: { plan: true } }, _count: { select: { branches: true, memberships: true, vehicles: true } } },
      });
      return {
        id: org.id, name: org.name, legalName: org.legalName, document: org.document, slug: org.slug,
        email: org.email, phone: org.phone, status: org.status, timezone: org.timezone,
        settings: orgSettings(org.settings),
        plan: org.subscription ? {
          code: org.subscription.plan.code, name: org.subscription.plan.name, status: org.subscription.status,
          trialEndsAt: org.subscription.trialEndsAt, maxVehicles: org.subscription.plan.maxVehicles,
          maxBranches: org.subscription.plan.maxBranches, maxUsers: org.subscription.plan.maxUsers,
        } : null,
        enabledModules: ctx.enabledModules,
        usage: { branches: org._count.branches, users: org._count.memberships, vehicles: org._count.vehicles },
      };
    });
  }

  async update(ctx: OrgContext, dto: UpdateOrganizationDto) {
    if (dto.document && !isValidCnpj(dto.document)) throw new BadRequestException('CNPJ inválido.');
    await this.prisma.platform(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
      const settings = dto.settings ? { ...orgSettings(before.settings), ...dto.settings, notificationChannels: { ...orgSettings(before.settings).notificationChannels, ...(dto.settings.notificationChannels ?? {}) } } : undefined;
      const data = {
        name: dto.name, legalName: dto.legalName, document: dto.document ? onlyDigits(dto.document) : undefined,
        email: dto.email, phone: dto.phone, timezone: dto.timezone,
        settings: settings as unknown as Prisma.InputJsonValue | undefined,
      };
      await tx.organization.update({ where: { id: ctx.organizationId }, data });
      const diff = AuditService.diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
      await this.audit.record(tx, ctx, { action: 'organization.updated', entityType: 'Organization', entityId: ctx.organizationId, ...diff });
    });
    return this.profile(ctx);
  }

  /* ================= Filiais ================= */

  async branches(ctx: OrgContext, includeInactive = false) {
    return this.prisma.tenant(ctx, (tx) => tx.branch.findMany({
      where: {
        ...(includeInactive && ctx.permissions.has('branches.manage') ? {} : { active: true }),
        ...(ctx.allBranches ? {} : { id: { in: ctx.branchIds } }),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { vehicles: true } } },
    }));
  }

  async createBranch(ctx: OrgContext, dto: BranchDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertLimit(tx, ctx.organizationId, 'maxBranches', await tx.branch.count({ where: { active: true } }), 'filiais');
      const branch = await tx.branch.create({ data: { ...dto, organizationId: ctx.organizationId } });
      await tx.inventoryLocation.create({ data: { organizationId: ctx.organizationId, branchId: branch.id, name: 'Almoxarifado' } });
      await this.audit.record(tx, ctx, { action: 'branch.created', entityType: 'Branch', entityId: branch.id, branchId: branch.id, after: branch });
      return branch;
    });
  }

  async updateBranch(ctx: OrgContext, id: string, dto: UpdateBranchDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.branch.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Filial não encontrada.');
      if (dto.active === false) {
        const vehicles = await tx.vehicleUnit.count({ where: { branchId: id, deletedAt: null, commercialStatus: { not: 'SOLD' } } });
        if (vehicles) throw new ConflictException(`A filial ainda tem ${vehicles} veículo(s). Transfira-os antes de desativar.`);
      }
      const branch = await tx.branch.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'branch.updated', entityType: 'Branch', entityId: id, branchId: id, ...AuditService.diff(before as never, dto as never) });
      return branch;
    });
  }

  /* ================= Perfis ================= */

  async roles(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.role.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { memberships: { where: { active: true } } } } },
    }));
  }

  async createRole(ctx: OrgContext, dto: RoleDto) {
    const permissions = validPermissions(dto.permissions);
    return this.prisma.tenant(ctx, async (tx) => {
      const key = `custom-${CryptoService.randomToken(6).toLowerCase()}`;
      const role = await tx.role.create({ data: { organizationId: ctx.organizationId, key, name: dto.name, description: dto.description, permissions } });
      await this.audit.record(tx, ctx, { action: 'role.created', entityType: 'Role', entityId: role.id, after: { name: role.name, permissions } });
      return role;
    });
  }

  async updateRole(ctx: OrgContext, id: string, dto: UpdateRoleDto) {
    const permissions = dto.permissions ? validPermissions(dto.permissions) : undefined;
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.role.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Perfil não encontrado.');
      const role = await tx.role.update({ where: { id }, data: { name: dto.name, description: dto.description, permissions } });
      await this.assertAdministrable(tx);
      // Mudança de permissão é sensível: a trilha guarda o antes e o depois.
      await this.audit.record(tx, ctx, {
        action: 'role.updated', entityType: 'Role', entityId: id,
        before: { name: before.name, permissions: before.permissions },
        after: { name: role.name, permissions: role.permissions },
      });
      return role;
    });
  }

  async deleteRole(ctx: OrgContext, id: string) {
    await this.prisma.tenant(ctx, async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, include: { _count: { select: { memberships: true } } } });
      if (!role) throw new NotFoundException('Perfil não encontrado.');
      if (role.templateKey) throw new ConflictException('Perfis-modelo podem ser editados, mas não excluídos.');
      if (role._count.memberships) throw new ConflictException('Há usuários com este perfil. Troque o perfil deles antes de excluir.');
      await tx.role.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'role.deleted', entityType: 'Role', entityId: id, before: { name: role.name, permissions: role.permissions } });
    });
  }

  /* ================= Usuários ================= */

  async members(ctx: OrgContext) {
    const rows = await this.prisma.tenant(ctx, (tx) => tx.membership.findMany({
      include: { user: true, role: true, branches: { include: { branch: true } } },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    }));
    return rows.map((m) => ({
      id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, active: m.active && m.user.active,
      title: m.title, role: { id: m.role.id, name: m.role.name }, allBranches: m.allBranches,
      branches: m.branches.map((b) => ({ id: b.branchId, name: b.branch.name })),
      approvalLimit: m.approvalLimit, mfaEnabled: m.user.mfaEnabled, lastLoginAt: m.user.lastLoginAt,
      mustChangePassword: m.user.mustChangePassword, createdAt: m.createdAt,
    }));
  }

  /**
   * Convida um usuário. Conta nova nasce sem senha utilizável e com troca
   * obrigatória: recebe o link por e-mail ou, sem SMTP configurado, o
   * administrador recebe o link uma única vez para entregar em mãos.
   */
  async invite(ctx: OrgContext, dto: InviteUserDto) {
    const email = dto.email.toLowerCase().trim();
    const { membership, userId, isNew } = await this.prisma.tenant(ctx, async (tx) => {
      await this.assertLimit(tx, ctx.organizationId, 'maxUsers', await tx.membership.count({ where: { active: true } }), 'usuários');
      const role = await tx.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new BadRequestException('Perfil inválido.');
      await this.assertBranches(tx, dto.allBranches, dto.branchIds);

      // Usuário é identidade de plataforma (sem RLS): o mesmo e-mail pode
      // trabalhar em várias locadoras.
      let user = await tx.user.findUnique({ where: { email } });
      const isNew = !user;
      if (!user) {
        user = await tx.user.create({
          data: { email, name: dto.name, passwordHash: await hashPassword(CryptoService.randomToken(32)), mustChangePassword: true },
        });
      }
      const existing = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: user.id } } });
      if (existing) throw new ConflictException('Este usuário já faz parte da empresa.');
      const membership = await tx.membership.create({
        data: {
          organizationId: ctx.organizationId, userId: user.id, roleId: role.id, allBranches: dto.allBranches,
          approvalLimit: dto.approvalLimit ?? null, title: dto.title ?? null,
          branches: dto.allBranches ? undefined : { create: (dto.branchIds ?? []).map((branchId) => ({ branchId, organizationId: ctx.organizationId })) },
        },
      });
      await this.audit.record(tx, ctx, {
        action: 'user.invited', entityType: 'Membership', entityId: membership.id,
        after: { email, role: role.name, allBranches: dto.allBranches, branchIds: dto.branchIds ?? [], approvalLimit: dto.approvalLimit ?? null },
      });
      return { membership, userId: user.id, isNew };
    });

    let accessLink: string | null = null;
    let emailStatus: string = 'NOT_NEEDED';
    if (isNew) {
      const token = await this.auth.createResetToken(userId);
      const link = `${loadConfig().appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
      const sent = await this.mail.send(email, 'Norty Car — seu acesso', `Olá, ${dto.name}.\n\nVocê recebeu acesso à ${ctx.organizationName} no Norty Car. Defina sua senha em até 60 minutos:\n\n${link}`);
      emailStatus = sent.status;
      if (sent.status !== 'SENT') accessLink = link;
    }
    return { membershipId: membership.id, isNewUser: isNew, emailStatus, accessLink };
  }

  async updateMember(ctx: OrgContext, id: string, dto: UpdateMembershipDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.membership.findUnique({ where: { id }, include: { branches: true, role: true } });
      if (!before) throw new NotFoundException('Usuário não encontrado nesta empresa.');
      if (dto.roleId) {
        const role = await tx.role.findUnique({ where: { id: dto.roleId } });
        if (!role) throw new BadRequestException('Perfil inválido.');
      }
      const allBranches = dto.allBranches ?? before.allBranches;
      if (dto.branchIds || dto.allBranches !== undefined) await this.assertBranches(tx, allBranches, dto.branchIds ?? before.branches.map((b) => b.branchId));
      await tx.membership.update({
        where: { id },
        data: { roleId: dto.roleId, allBranches: dto.allBranches, approvalLimit: dto.approvalLimit, title: dto.title, active: dto.active },
      });
      if (dto.branchIds || dto.allBranches !== undefined) {
        await tx.membershipBranch.deleteMany({ where: { membershipId: id } });
        if (!allBranches) {
          await tx.membershipBranch.createMany({ data: (dto.branchIds ?? before.branches.map((b) => b.branchId)).map((branchId) => ({ membershipId: id, branchId, organizationId: ctx.organizationId })) });
        }
      }
      await this.assertAdministrable(tx);
      if (dto.active === false) {
        // Desativar encerra as sessões abertas nesta empresa na hora.
        await tx.session.updateMany({ where: { membershipId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record(tx, ctx, {
        action: dto.active === false ? 'user.deactivated' : 'user.updated', entityType: 'Membership', entityId: id,
        before: { roleId: before.roleId, role: before.role.name, allBranches: before.allBranches, branchIds: before.branches.map((b) => b.branchId), approvalLimit: before.approvalLimit, active: before.active },
        after: dto,
      });
      return { id };
    });
  }

  /** Link de definição de senha gerado pelo administrador (sem SMTP, entrega em mãos). */
  async resetLink(ctx: OrgContext, membershipId: string) {
    const membership = await this.prisma.tenant(ctx, (tx) => tx.membership.findUnique({ where: { id: membershipId } }));
    if (!membership) throw new NotFoundException('Usuário não encontrado nesta empresa.');
    const token = await this.auth.createResetToken(membership.userId);
    await this.prisma.tenant(ctx, (tx) => this.audit.record(tx, ctx, { action: 'user.reset_link_generated', entityType: 'Membership', entityId: membershipId }));
    return { link: `${loadConfig().appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`, expiresInMinutes: 60 };
  }

  /* ================= Acesso de suporte ================= */

  async supportGrants(ctx: OrgContext) {
    return this.prisma.platform((tx) => tx.supportAccessGrant.findMany({
      where: { organizationId: ctx.organizationId },
      include: { requestedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }));
  }

  /**
   * Autorização do acesso excepcional. O prazo começa a contar na
   * aprovação; o escopo é o pedido, filtrado para leitura.
   */
  async decideGrant(ctx: OrgContext, id: string, decision: 'APPROVED' | 'REJECTED' | 'REVOKED', note?: string) {
    return this.prisma.platform(async (tx) => {
      const grant = await tx.supportAccessGrant.findUnique({ where: { id } });
      if (!grant || grant.organizationId !== ctx.organizationId) throw new NotFoundException('Solicitação não encontrada.');
      if (decision !== 'REVOKED' && grant.status !== 'REQUESTED') throw new ConflictException('Esta solicitação já foi decidida.');
      if (decision === 'REVOKED' && grant.status !== 'APPROVED') throw new ConflictException('Só um acesso autorizado pode ser revogado.');
      const updated = await tx.supportAccessGrant.update({
        where: { id },
        data: {
          status: decision, decidedByUserId: ctx.userId, decidedAt: new Date(), decisionNote: note ?? null,
          expiresAt: decision === 'APPROVED' ? new Date(Date.now() + grant.durationHours * 3_600_000) : decision === 'REVOKED' ? new Date() : null,
        },
      });
      if (decision === 'REVOKED') {
        await tx.session.updateMany({ where: { supportGrantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record(tx, ctx, {
        action: `support.grant_${decision.toLowerCase()}`, entityType: 'SupportAccessGrant', entityId: id,
        organizationId: ctx.organizationId, reason: note ?? grant.purpose,
        after: { status: decision, scope: grant.scope, expiresAt: updated.expiresAt },
      });
      return updated;
    });
  }

  async supportTickets(ctx: OrgContext) {
    return this.prisma.platform((tx) => tx.supportTicket.findMany({
      where: { organizationId: ctx.organizationId }, orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } }, take: 100,
    }));
  }

  async openTicket(ctx: OrgContext, subject: string, description: string) {
    return this.prisma.platform((tx) => tx.supportTicket.create({
      data: { organizationId: ctx.organizationId, openedById: ctx.userId, subject, description },
    }));
  }

  async replyTicket(ctx: OrgContext, id: string, body: string) {
    return this.prisma.platform(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
      if (!ticket || ticket.organizationId !== ctx.organizationId) throw new NotFoundException('Chamado não encontrado.');
      await tx.supportTicket.update({ where: { id }, data: { status: ticket.status === 'WAITING_CUSTOMER' ? 'IN_PROGRESS' : ticket.status } });
      return tx.supportTicketMessage.create({ data: { ticketId: id, authorId: ctx.userId, body, fromNorty: false } });
    });
  }

  /* ================= Auditoria ================= */

  async auditLog(ctx: OrgContext, query: AuditQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.AuditLogWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.actorType ? { actorType: query.actorType as never } : {}),
      ...(query.from || query.to ? { at: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      ...(ctx.allBranches ? {} : { OR: [{ branchId: null }, { branchId: { in: ctx.branchIds } }] }),
    };
    const [items, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip, take }),
      tx.auditLog.count({ where }),
    ]));
    return paginated(items, total, page, pageSize);
  }

  /* ================= Auxiliares ================= */

  private async assertLimit(tx: Tx, organizationId: string, field: 'maxBranches' | 'maxUsers' | 'maxVehicles', current: number, label: string) {
    const sub = await tx.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
    const limit = sub?.plan[field];
    if (limit !== null && limit !== undefined && current >= limit) {
      throw new ForbiddenException(`O plano ${sub!.plan.name} permite até ${limit} ${label}. Fale com a Norty para ampliar.`);
    }
  }

  private async assertBranches(tx: Tx, allBranches: boolean, branchIds?: string[]) {
    if (allBranches) return;
    if (!branchIds?.length) throw new BadRequestException('Escolha ao menos uma filial ou marque "todas as filiais".');
    const count = await tx.branch.count({ where: { id: { in: branchIds } } });
    if (count !== new Set(branchIds).size) throw new BadRequestException('Filial inválida.');
  }

  /**
   * Garante que sobra ao menos um usuário ativo capaz de administrar a
   * empresa. Sem isso, um clique tiraria de todos o acesso às configurações.
   */
  private async assertAdministrable(tx: Tx) {
    const admins = await tx.membership.count({
      where: { active: true, role: { permissions: { hasEvery: ADMIN_KEYS } } },
    });
    if (admins === 0) throw new ConflictException('A empresa precisa manter ao menos um usuário ativo que administre usuários e perfis.');
  }
}

function validPermissions(list: string[]): string[] {
  const invalid = list.filter((p) => !isPermission(p));
  if (invalid.length) throw new BadRequestException(`Permissões desconhecidas: ${invalid.join(', ')}`);
  return [...new Set(list)].sort((a, b) => Object.keys(PERMISSIONS).indexOf(a) - Object.keys(PERMISSIONS).indexOf(b));
}

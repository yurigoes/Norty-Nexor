import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { depositBalance, formatPlate, maskDocument, SERVICE_REQUEST_TYPE_LABEL, type ServiceRequestType } from '@nortycar/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotifyService } from '../../common/notify.service';
import { MailService } from '../../common/mail.service';
import { CryptoService } from '../../common/crypto.service';
import { hashPassword } from '../../common/password';
import { num } from '../../common/serialize.interceptor';
import type { OrgContext } from '../../common/context';
import { loadConfig } from '../../config/env';
import { AuthService } from '../auth/auth.service';

/**
 * Portal do cliente. Toda consulta começa por `customerId` do contexto —
 * que vem do vínculo validado no AuthGuard, nunca da URL. Um id de
 * contrato de outro cliente simplesmente não é encontrado.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  private customerId(ctx: OrgContext): string {
    if (!ctx.customerId) throw new ForbiddenException('Área exclusiva do cliente.');
    return ctx.customerId;
  }

  async me(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
      return {
        id: c.id, type: c.type, name: c.name, tradeName: c.tradeName, document: maskDocument(c.document), email: c.email, phone: c.phone,
        address: [c.street, c.number, c.complement, c.district, c.city && `${c.city}/${c.state ?? ''}`, c.zip].filter(Boolean).join(', '),
        organizationName: ctx.organizationName,
      };
    });
  }

  async overview(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const [contracts, upcoming, overdue, requests] = await Promise.all([
        tx.rentalContract.findMany({
          where: { customerId, status: 'ACTIVE' },
          include: { vehicles: { where: { endAt: null }, include: { vehicle: { include: { model: { include: { make: true } } } } } } },
          orderBy: { startAt: 'desc' },
        }),
        tx.receivable.findMany({ where: { customerId, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { gte: today() } }, orderBy: { dueDate: 'asc' }, take: 5 }),
        tx.receivable.findMany({ where: { customerId, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: today() } }, orderBy: { dueDate: 'asc' } }),
        tx.serviceRequest.count({ where: { customerId, status: { in: ['OPEN', 'IN_PROGRESS', 'ANSWERED'] } } }),
      ]);
      return {
        activeContracts: contracts.map((c) => ({
          id: c.id, number: c.number, kind: c.kind, startAt: c.startAt, endAt: c.endAt,
          vehicle: c.vehicles[0] ? { plate: formatPlate(c.vehicles[0].vehicle.plate), model: `${c.vehicles[0].vehicle.model.make.name} ${c.vehicles[0].vehicle.model.name}`, color: c.vehicles[0].vehicle.color } : null,
        })),
        upcoming: upcoming.map(title),
        overdue: overdue.map(title),
        openRequests: requests,
      };
    });
  }

  async contracts(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    const rows = await this.prisma.tenant(ctx, (tx) => tx.rentalContract.findMany({
      where: { customerId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      include: { vehicles: { orderBy: { startAt: 'desc' }, take: 1, include: { vehicle: { include: { model: { include: { make: true } } } } } } },
      orderBy: { startAt: 'desc' },
    }));
    return rows.map((c) => ({
      id: c.id, number: c.number, kind: c.kind, status: c.status, startAt: c.startAt, endAt: c.endAt,
      monthlyAmount: c.monthlyAmount, totalAmount: c.totalAmount,
      vehicle: c.vehicles[0] ? { plate: formatPlate(c.vehicles[0].vehicle.plate), model: `${c.vehicles[0].vehicle.model.make.name} ${c.vehicles[0].vehicle.model.name}` } : null,
    }));
  }

  async contract(ctx: OrgContext, id: string) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await tx.rentalContract.findFirst({
        where: { id, customerId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
        include: {
          vehicles: { orderBy: { startAt: 'asc' }, include: { vehicle: { include: { model: { include: { make: true } } } } } },
          drivers: { orderBy: { startAt: 'asc' }, include: { driver: true } },
          extras: true,
          deposit: { include: { entries: true } },
        },
      });
      if (!c) throw new NotFoundException('Contrato não encontrado.');
      const documents = await tx.fileAsset.findMany({ where: { entityType: 'RentalContract', entityId: id, customerVisible: true, deletedAt: null }, orderBy: { createdAt: 'desc' } });
      return {
        id: c.id, number: c.number, kind: c.kind, status: c.status, startAt: c.startAt, endAt: c.endAt, actualStartAt: c.actualStartAt, actualEndAt: c.actualEndAt,
        totalAmount: c.totalAmount, monthlyAmount: c.monthlyAmount, termMonths: c.termMonths, billingDay: c.billingDay,
        kmAllowance: c.kmAllowance, kmAllowancePeriod: c.kmAllowancePeriod, extraKmRate: c.extraKmRate,
        lateFeePercent: c.lateFeePercent, monthlyInterestPercent: c.monthlyInterestPercent, includedServices: c.includedServices,
        terms: c.terms, signatureStatus: c.signatureStatus,
        vehicles: c.vehicles.map((v) => ({ plate: formatPlate(v.vehicle.plate), model: `${v.vehicle.model.make.name} ${v.vehicle.model.name}`, color: v.vehicle.color, startAt: v.startAt, endAt: v.endAt, current: !v.endAt })),
        drivers: c.drivers.map((d) => ({ name: d.driver.name, primary: d.primary, startAt: d.startAt, endAt: d.endAt })),
        extras: c.extras.map((e) => ({ name: e.name, pricing: e.pricing, price: e.price, quantity: e.quantity })),
        deposit: c.deposit ? { expected: num(c.deposit.expectedAmount), status: c.deposit.status, ...depositBalance(c.deposit.entries.map((e) => ({ type: e.type, amount: num(e.amount), status: e.status }))) } : null,
        documents: documents.map((f) => ({ id: f.id, name: f.originalName, mimeType: f.mimeType, size: f.size, category: f.category, createdAt: f.createdAt })),
      };
    });
  }

  async finance(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const [receivables, deposits] = await Promise.all([
        tx.receivable.findMany({
          where: { customerId, status: { not: 'CANCELLED' } },
          include: { payments: { where: { status: 'CONFIRMED' }, orderBy: { paidAt: 'asc' } }, contract: { select: { number: true } } },
          orderBy: { dueDate: 'desc' },
          take: 200,
        }),
        tx.securityDeposit.findMany({ where: { customerId }, include: { entries: true, contract: { select: { number: true } } } }),
      ]);
      return {
        titles: receivables.map((r) => ({
          ...title(r), contractNumber: r.contract?.number ?? null,
          payments: r.payments.map((p) => ({ id: p.id, amount: p.amount, paidAt: p.paidAt, method: p.method })),
        })),
        deposits: deposits.map((d) => ({
          contractNumber: d.contract.number, status: d.status, expected: num(d.expectedAmount),
          ...depositBalance(d.entries.map((e) => ({ type: e.type, amount: num(e.amount), status: e.status }))),
        })),
      };
    });
  }

  /** Recibo imprimível de um pagamento confirmado do próprio cliente. */
  async receipt(ctx: OrgContext, paymentId: string): Promise<string> {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const p = await tx.payment.findFirst({
        where: { id: paymentId, status: 'CONFIRMED', direction: 'IN', receivable: { customerId } },
        include: { receivable: { include: { customer: true, contract: { select: { number: true } } } } },
      });
      if (!p || !p.receivable) throw new NotFoundException('Pagamento não encontrado.');
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
      const brl = (v: unknown) => num(v as never).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const when = new Intl.DateTimeFormat('pt-BR', { timeZone: org.timezone, dateStyle: 'long' }).format(p.paidAt);
      return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(p.id.slice(0, 8))}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#101828;max-width:680px;margin:40px auto;padding:0 24px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #e7ecf3}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#667085;font-size:13px}@media print{button{display:none}}</style></head>
<body><button onclick="print()">Imprimir ou salvar em PDF</button>
<h1>Recibo de pagamento</h1><p class="muted">${esc(org.legalName ?? org.name)}${org.document ? ` · CNPJ ${esc(org.document)}` : ''}</p>
<p>Recebemos de <strong>${esc(p.receivable.customer?.name ?? '')}</strong> a importância de <strong>${brl(p.amount)}</strong>, referente a ${esc(p.receivable.description)}${p.receivable.contract ? ` (contrato ${esc(p.receivable.contract.number)})` : ''}.</p>
<table><tr><td>Data do pagamento</td><td>${esc(when)}</td></tr><tr><td>Forma</td><td>${esc(p.method)}</td></tr><tr><td>Valor</td><td>${brl(p.amount)}</td></tr><tr><td>Identificador</td><td>${esc(p.id)}</td></tr></table>
<p class="muted">Documento gerado pelo Norty Car a partir de pagamento confirmado no sistema da locadora.</p></body></html>`;
    });
  }

  async infractions(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    const rows = await this.prisma.tenant(ctx, (tx) => tx.trafficInfraction.findMany({
      where: { customerId }, include: { vehicle: { select: { plate: true } }, driver: { select: { name: true } } }, orderBy: { occurredAt: 'desc' },
    }));
    return rows.map((i) => ({
      id: i.id, autoNumber: i.autoNumber, authority: i.authority, description: i.description, occurredAt: i.occurredAt, location: i.location,
      plate: formatPlate(i.vehicle.plate), driverName: i.driver?.name ?? null, finalAmount: i.finalAmount, dueDate: i.dueDate,
      driverIndicationDeadline: i.driverIndicationDeadline, adminStatus: i.adminStatus, financialStatus: i.financialStatus,
    }));
  }

  async inspections(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    const rows = await this.prisma.tenant(ctx, (tx) => tx.inspection.findMany({
      where: { visibleToCustomer: true, status: { not: 'DRAFT' }, contract: { customerId } },
      include: { vehicle: { select: { plate: true } }, contract: { select: { number: true } }, items: true, damages: true, photos: true },
      orderBy: { startedAt: 'desc' },
    }));
    return rows.map((i) => ({
      id: i.id, number: i.number, type: i.type, status: i.status, completedAt: i.completedAt, odometerKm: i.odometerKm, fuelEighths: i.fuelEighths,
      plate: formatPlate(i.vehicle.plate), contractNumber: i.contract?.number ?? null, notes: i.notes, pendencies: i.pendencies,
      items: i.items.filter((it) => it.status !== 'OK').map((it) => ({ label: it.label, area: it.area, status: it.status, notes: it.notes })),
      damages: i.damages.map((d) => ({ region: d.region, severity: d.severity, description: d.description })),
      photos: i.photos.map((p) => ({ fileId: p.fileId, caption: p.caption, region: p.region })),
    }));
  }

  async documents(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const [contracts, inspections, receivables] = await Promise.all([
        tx.rentalContract.findMany({ where: { customerId }, select: { id: true, number: true } }),
        tx.inspection.findMany({ where: { visibleToCustomer: true, contract: { customerId } }, select: { id: true, number: true } }),
        tx.receivable.findMany({ where: { customerId }, select: { id: true, description: true } }),
      ]);
      const label = new Map<string, string>([
        ...contracts.map((c) => [c.id, `Contrato ${c.number}`] as [string, string]),
        ...inspections.map((i) => [i.id, `Vistoria ${i.number}`] as [string, string]),
        ...receivables.map((r) => [r.id, r.description] as [string, string]),
      ]);
      const files = await tx.fileAsset.findMany({
        where: {
          customerVisible: true, deletedAt: null,
          OR: [
            { entityType: 'RentalContract', entityId: { in: contracts.map((c) => c.id) } },
            { entityType: 'Inspection', entityId: { in: inspections.map((i) => i.id) } },
            { entityType: 'Receivable', entityId: { in: receivables.map((r) => r.id) } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      return files.map((f) => ({ id: f.id, name: f.originalName, mimeType: f.mimeType, size: f.size, category: f.category, createdAt: f.createdAt, reference: label.get(f.entityId ?? '') ?? f.entityType }));
    });
  }

  /* ---------------- Solicitações ---------------- */

  async requests(ctx: OrgContext) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, (tx) => tx.serviceRequest.findMany({
      where: { customerId }, orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    }));
  }

  async createRequest(ctx: OrgContext, dto: { type: ServiceRequestType; subject: string; description: string; contractId?: string }) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      if (dto.contractId && !(await tx.rentalContract.findFirst({ where: { id: dto.contractId, customerId } }))) {
        throw new NotFoundException('Contrato não encontrado.');
      }
      const request = await tx.serviceRequest.create({
        data: { organizationId: ctx.organizationId, customerId, contractId: dto.contractId ?? null, type: dto.type, subject: dto.subject, description: dto.description, createdByUserId: ctx.userId },
      });
      await this.notify.notify(tx, ctx.organizationId, {
        type: 'portal.request', severity: dto.type === 'ASSISTANCE' ? 'WARNING' : 'INFO',
        title: `Nova solicitação do portal: ${SERVICE_REQUEST_TYPE_LABEL[dto.type]}`, body: dto.subject,
        link: `/pessoas/solicitacoes?id=${request.id}`, audiencePermission: 'portal.manage', dedupeKey: `portal-request:${request.id}`,
      });
      await this.audit.record(tx, ctx, { action: 'portal.request_created', entityType: 'ServiceRequest', entityId: request.id, after: { type: dto.type, subject: dto.subject } });
      return request;
    });
  }

  async customerMessage(ctx: OrgContext, id: string, body: string) {
    const customerId = this.customerId(ctx);
    return this.prisma.tenant(ctx, async (tx) => {
      const request = await tx.serviceRequest.findFirst({ where: { id, customerId } });
      if (!request) throw new NotFoundException('Solicitação não encontrada.');
      if (request.status === 'CLOSED') throw new ConflictException('Solicitação encerrada. Abra uma nova.');
      await tx.serviceRequest.update({ where: { id }, data: { status: 'OPEN' } });
      await this.notify.notify(tx, ctx.organizationId, {
        type: 'portal.request_message', title: 'Cliente respondeu uma solicitação', body: request.subject,
        link: `/pessoas/solicitacoes?id=${id}`, audiencePermission: 'portal.manage', dedupeKey: `portal-request-msg:${id}:${Date.now()}`,
      });
      return tx.serviceRequestMessage.create({ data: { organizationId: ctx.organizationId, requestId: id, authorUserId: ctx.userId, fromCustomer: true, body } });
    });
  }

  /* ---------------- Atendimento (equipe) ---------------- */

  async staffRequests(ctx: OrgContext, status?: string) {
    return this.prisma.tenant(ctx, (tx) => tx.serviceRequest.findMany({
      where: status ? { status: status as never } : {},
      include: { customer: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 300,
    }));
  }

  async staffReply(ctx: OrgContext, id: string, body: string, close: boolean) {
    return this.prisma.tenant(ctx, async (tx) => {
      const request = await tx.serviceRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Solicitação não encontrada.');
      if (request.status === 'CLOSED') throw new ConflictException('Solicitação já encerrada.');
      const message = await tx.serviceRequestMessage.create({ data: { organizationId: ctx.organizationId, requestId: id, authorUserId: ctx.userId, fromCustomer: false, body } });
      await tx.serviceRequest.update({ where: { id }, data: { status: close ? 'CLOSED' : 'ANSWERED' } });
      await this.notify.notify(tx, ctx.organizationId, {
        type: 'portal.request_answered', severity: 'INFO', title: close ? 'Sua solicitação foi encerrada' : 'Sua solicitação foi respondida',
        body: request.subject, link: `/cliente/solicitacoes?id=${id}`, customerId: request.customerId, dedupeKey: `portal-answer:${message.id}`,
      });
      await this.audit.record(tx, ctx, { action: close ? 'portal.request_closed' : 'portal.request_answered', entityType: 'ServiceRequest', entityId: id });
      return message;
    });
  }

  async staffStatus(ctx: OrgContext, id: string, status: 'IN_PROGRESS' | 'CLOSED') {
    return this.prisma.tenant(ctx, async (tx) => {
      const request = await tx.serviceRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Solicitação não encontrada.');
      await this.audit.record(tx, ctx, { action: 'portal.request_status', entityType: 'ServiceRequest', entityId: id, before: { status: request.status }, after: { status } });
      return tx.serviceRequest.update({ where: { id }, data: { status } });
    });
  }

  /* ---------------- Acesso ao portal (equipe) ---------------- */

  /**
   * Libera o portal para um cliente. A conta é por e-mail: quem já usa o
   * Norty Car (até em outra locadora) ganha só mais um vínculo e escolhe
   * o contexto no login.
   */
  async grantAccess(ctx: OrgContext, customerId: string) {
    const result = await this.prisma.tenant(ctx, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer || customer.deletedAt || customer.anonymizedAt) throw new NotFoundException('Cliente não encontrado.');
      if (!customer.email) throw new BadRequestException('Cadastre o e-mail do cliente antes de liberar o portal.');
      const email = customer.email.toLowerCase().trim();
      let user = await tx.user.findUnique({ where: { email } });
      const isNewUser = !user;
      if (!user) {
        user = await tx.user.create({ data: { email, name: customer.name, passwordHash: await hashPassword(CryptoService.randomToken(32)), mustChangePassword: true } });
      }
      const existing = await tx.customerLink.findUnique({ where: { userId_customerId: { userId: user.id, customerId } } });
      if (existing?.active) throw new ConflictException('Este cliente já tem acesso ao portal.');
      if (existing) await tx.customerLink.update({ where: { id: existing.id }, data: { active: true } });
      else await tx.customerLink.create({ data: { organizationId: ctx.organizationId, userId: user.id, customerId } });
      await this.audit.record(tx, ctx, { action: 'portal.access_granted', entityType: 'Customer', entityId: customerId, after: { email, isNewUser } });
      return { userId: user.id, email, name: customer.name, isNewUser };
    });
    let accessLink: string | null = null;
    let emailStatus = 'NOT_NEEDED';
    if (result.isNewUser) {
      const link = `${loadConfig().appUrl}/redefinir-senha?token=${encodeURIComponent(await this.auth.createResetToken(result.userId))}`;
      const sent = await this.mail.send(result.email, `${ctx.organizationName} — acesso ao portal do cliente`, `Olá, ${result.name}.\n\nSeu acesso ao portal da ${ctx.organizationName} está liberado. Defina sua senha em até 60 minutos:\n\n${link}`);
      emailStatus = sent.status;
      if (sent.status !== 'SENT') accessLink = link;
    } else {
      const sent = await this.mail.send(result.email, `${ctx.organizationName} — portal do cliente`, `Olá, ${result.name}.\n\nSeu acesso ao portal da ${ctx.organizationName} foi liberado. Entre com o e-mail e a senha que você já usa no Norty Car.\n\n${loadConfig().appUrl}/entrar`);
      emailStatus = sent.status;
    }
    return { accessLink, emailStatus, isNewUser: result.isNewUser };
  }

  async revokeAccess(ctx: OrgContext, customerId: string, reason?: string) {
    await this.prisma.tenant(ctx, async (tx) => {
      const links = await tx.customerLink.findMany({ where: { customerId, active: true } });
      if (!links.length) throw new NotFoundException('Este cliente não tem acesso ativo ao portal.');
      await tx.customerLink.updateMany({ where: { customerId }, data: { active: false } });
      // Sessões abertas nesse vínculo caem na hora.
      await tx.session.updateMany({ where: { customerId, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'portal.access_revoked', entityType: 'Customer', entityId: customerId, reason: reason ?? null });
    });
  }

  async accessStatus(ctx: OrgContext, customerId: string) {
    const link = await this.prisma.tenant(ctx, (tx) => tx.customerLink.findFirst({ where: { customerId, active: true }, include: { user: { select: { email: true, lastLoginAt: true } } } }));
    return link ? { active: true, email: link.user.email, lastLoginAt: link.user.lastLoginAt, since: link.createdAt } : { active: false };
  }
}

function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function title(r: { id: string; description: string; kind: string; amount: unknown; paidAmount: unknown; dueDate: Date; status: string; competence: string | null }) {
  return {
    id: r.id, description: r.description, kind: r.kind, amount: num(r.amount as never), paidAmount: num(r.paidAmount as never),
    balance: Math.round((num(r.amount as never) - num(r.paidAmount as never)) * 100) / 100,
    dueDate: r.dueDate.toISOString().slice(0, 10), status: r.status, competence: r.competence,
  };
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

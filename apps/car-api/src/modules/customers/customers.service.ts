import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatDocument, isValidCpf, isValidPersonDocument, maskDocument, onlyDigits } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import type { OrgContext } from '../../common/context';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import { num } from '../../common/serialize.interceptor';
import type {
  AsDriverDto, CreateCustomerDto, CreateDriverDto, CustomerQueryDto, DriverQueryDto, UpdateCustomerDto, UpdateDriverDto,
} from './dto';

const OPEN_CONTRACT = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] as const;
const DAY = 86_400_000;

const date = (v?: string | null) => (v === undefined ? undefined : v === null ? null : new Date(v));
const trimOrNull = (v?: string | null) => (v === undefined ? undefined : v === null ? null : v.trim() || null);

/**
 * Clientes (locatários) e motoristas.
 *
 * Minimização de dados (LGPD): quem atende vê o suficiente para
 * reconhecer o cliente — documento parcialmente oculto, sem data de
 * nascimento. O dado completo exige `customers.sensitive`, e a
 * exportação do titular fica registrada na auditoria.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /* ================= Clientes ================= */

  async list(ctx: OrgContext, q: CustomerQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const term = q.q?.trim();
    const digits = term ? onlyDigits(term) : '';
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.type ? { type: q.type as never } : {}),
      ...(term ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { tradeName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ document: { contains: digits } }, { phone: { contains: digits } }] : []),
        ],
      } : {}),
    };
    const [rows, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.customer.findMany({ where, skip, take, orderBy: orderBy(q, ['name', 'createdAt', 'city'], { name: 'asc' }) }),
      tx.customer.count({ where }),
    ]));
    return paginated(rows.map((c) => this.listItem(ctx, c)), total, page, pageSize);
  }

  private listItem(ctx: OrgContext, c: Prisma.CustomerGetPayload<object>) {
    const sensitive = ctx.permissions.has('customers.sensitive');
    return {
      id: c.id, type: c.type, name: c.name, tradeName: c.tradeName,
      document: c.anonymizedAt ? '—' : sensitive ? formatDocument(c.document) : maskDocument(c.document),
      email: c.email, phone: c.phone, city: c.city, state: c.state, status: c.status, anonymizedAt: c.anonymizedAt, createdAt: c.createdAt,
    };
  }

  async detail(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await tx.customer.findUnique({ where: { id } });
      if (!c || (c.deletedAt && !c.anonymizedAt)) throw new NotFoundException('Cliente não encontrado.');
      const sensitive = ctx.permissions.has('customers.sensitive');
      const [drivers, contracts, receivables, deposits, infractions, links] = await Promise.all([
        tx.driver.findMany({ where: { customerId: id }, orderBy: { name: 'asc' } }),
        tx.rentalContract.findMany({
          where: { customerId: id }, orderBy: { startAt: 'desc' }, take: 50,
          select: { id: true, number: true, kind: true, status: true, startAt: true, endAt: true, totalAmount: true, monthlyAmount: true },
        }),
        tx.receivable.findMany({ where: { customerId: id, status: { in: ['OPEN', 'PARTIAL'] } }, select: { amount: true, paidAmount: true, dueDate: true } }),
        tx.securityDeposit.findMany({ where: { customerId: id }, select: { id: true, status: true, expectedAmount: true, contractId: true } }),
        tx.trafficInfraction.count({ where: { customerId: id } }),
        tx.customerLink.count({ where: { customerId: id, active: true } }),
      ]);
      const today = new Date();
      const openBalance = receivables.reduce((acc, r) => acc + num(r.amount) - num(r.paidAmount), 0);
      const overdue = receivables.filter((r) => r.dueDate < today);
      return {
        ...this.listItem(ctx, c),
        birthDate: sensitive ? c.birthDate : null,
        street: c.street, number: c.number, complement: c.complement, district: c.district, zip: c.zip,
        emergencyContact: c.emergencyContact, preferredPayment: c.preferredPayment, blockReason: c.blockReason,
        internalNotes: c.internalNotes, updatedAt: c.updatedAt,
        drivers: drivers.map((d) => this.driverItem(ctx, d, null)),
        contracts,
        summary: {
          contracts: contracts.length,
          activeContracts: contracts.filter((x) => x.status === 'ACTIVE').length,
          openReceivables: receivables.length,
          openBalance: Math.round(openBalance * 100) / 100,
          overdueReceivables: overdue.length,
          deposits: deposits.length,
          infractions,
          portalAccess: links > 0,
        },
        deposits,
      };
    });
  }

  async create(ctx: OrgContext, dto: CreateCustomerDto) {
    const document = this.validDocument(dto.type, dto.document);
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertDocumentFree(tx, document);
      const customer = await tx.customer.create({
        data: {
          organizationId: ctx.organizationId, type: dto.type, name: dto.name.trim(), document,
          ...this.fields(dto),
        } as Prisma.CustomerUncheckedCreateInput,
      });
      await this.audit.record(tx, ctx, { action: 'customer.created', entityType: 'Customer', entityId: customer.id, after: { type: dto.type, name: customer.name } });
      return { id: customer.id };
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateCustomerDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await this.assertCustomer(tx, id);
      const document = dto.document ? this.validDocument(before.type, dto.document) : undefined;
      if (document && document !== before.document) await this.assertDocumentFree(tx, document, id);
      const data = { name: dto.name?.trim(), document, ...this.fields(dto) } as Prisma.CustomerUncheckedUpdateInput;
      await tx.customer.update({ where: { id }, data });
      // A trilha registra quais campos mudaram, não os valores pessoais.
      const diff = AuditService.diff(before as never, data as never);
      await this.audit.record(tx, ctx, { action: 'customer.updated', entityType: 'Customer', entityId: id, after: { fields: Object.keys(diff.after) } });
      return { id };
    });
  }

  async setBlocked(ctx: OrgContext, id: string, blocked: boolean, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.assertCustomer(tx, id);
      if (blocked && c.status === 'BLOCKED') throw new ConflictException('O cliente já está bloqueado.');
      if (!blocked && c.status !== 'BLOCKED') throw new ConflictException('O cliente não está bloqueado.');
      await tx.customer.update({ where: { id }, data: { status: blocked ? 'BLOCKED' : 'ACTIVE', blockReason: blocked ? reason : null } });
      await this.audit.record(tx, ctx, {
        action: blocked ? 'customer.blocked' : 'customer.unblocked', entityType: 'Customer', entityId: id, reason,
        before: { status: c.status }, after: { status: blocked ? 'BLOCKED' : 'ACTIVE' },
      });
      return { id, status: blocked ? 'BLOCKED' : 'ACTIVE' };
    });
  }

  /**
   * Anonimização (LGPD). Só quando não há relação em aberto: contrato
   * vigente e título a receber dependem da identificação do titular. O
   * histórico financeiro e operacional permanece, desvinculado da pessoa.
   */
  async anonymize(ctx: OrgContext, id: string, reason: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.assertCustomer(tx, id);
      const activeContracts = await tx.rentalContract.count({ where: { customerId: id, status: { in: [...OPEN_CONTRACT] } } });
      if (activeContracts) throw new ConflictException('O cliente tem contrato em andamento. A anonimização só é possível depois do encerramento.');
      const openTitles = await tx.receivable.count({ where: { customerId: id, status: { in: ['OPEN', 'PARTIAL'] } } });
      if (openTitles) throw new ConflictException('O cliente tem títulos em aberto. Quite ou cancele antes de anonimizar.');
      const drivers = await tx.driver.findMany({ where: { customerId: id } });
      const driverIds = drivers.map((d) => d.id);
      const driving = driverIds.length ? await tx.contractDriver.count({ where: { driverId: { in: driverIds }, endAt: null } }) : 0;
      if (driving) throw new ConflictException('Um motorista deste cliente está vinculado a um contrato em aberto.');

      const now = new Date();
      await tx.customer.update({
        where: { id },
        data: {
          name: 'Titular anonimizado', tradeName: null, document: `anon-${id.replace(/-/g, '').slice(0, 14)}`, birthDate: null, email: null,
          phone: null, street: null, number: null, complement: null, district: null, city: null, state: null, zip: null,
          emergencyContact: undefined, preferredPayment: null, internalNotes: null, blockReason: null, deletedAt: now, anonymizedAt: now,
        },
      });
      await tx.$executeRaw`UPDATE "customers" SET "emergencyContact" = NULL WHERE "id" = ${id}::uuid`;
      for (const d of drivers) {
        await tx.driver.update({
          where: { id: d.id },
          data: {
            name: 'Condutor anonimizado', cpf: `anon-${d.id.replace(/-/g, '').slice(0, 14)}`, birthDate: null, email: null, phone: null,
            cnhNumber: 'ANONIMIZADO', notes: null, active: false, anonymizedAt: now,
          },
        });
      }
      await tx.customerLink.updateMany({ where: { customerId: id }, data: { active: false } });
      await this.audit.record(tx, ctx, {
        action: 'customer.anonymized', entityType: 'Customer', entityId: id, reason,
        // Nada pessoal na trilha: só o fato e o alcance.
        after: { drivers: driverIds.length, previousStatus: c.status },
      });
      return { id, anonymizedAt: now };
    });
  }

  /** Dados pessoais do titular, para atender pedido de acesso (LGPD, art. 18). */
  async personalData(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.assertCustomer(tx, id);
      const [drivers, contracts, receivables, infractions] = await Promise.all([
        tx.driver.findMany({ where: { customerId: id } }),
        tx.rentalContract.findMany({ where: { customerId: id }, select: { number: true, kind: true, status: true, startAt: true, endAt: true } }),
        tx.receivable.findMany({ where: { customerId: id }, select: { description: true, amount: true, paidAmount: true, dueDate: true, status: true } }),
        tx.trafficInfraction.findMany({ where: { customerId: id }, select: { autoNumber: true, authority: true, description: true, occurredAt: true, finalAmount: true } }),
      ]);
      await this.audit.record(tx, ctx, { action: 'customer.personal_data_exported', entityType: 'Customer', entityId: id });
      const { organizationId: _o, ...customer } = c;
      return {
        generatedAt: new Date().toISOString(),
        customer,
        drivers: drivers.map(({ organizationId: _x, ...d }) => d),
        contracts, receivables, infractions,
      };
    });
  }

  /** Cliente PF que também dirige: aproveita nome, CPF e contato. */
  async asDriver(ctx: OrgContext, id: string, dto: AsDriverDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const c = await this.assertCustomer(tx, id);
      if (c.type !== 'PF') throw new BadRequestException('Só cliente pessoa física pode ser cadastrado como motorista.');
      if (await tx.driver.findFirst({ where: { cpf: c.document } })) throw new ConflictException('Já existe um motorista com este CPF.');
      const driver = await tx.driver.create({
        data: {
          organizationId: ctx.organizationId, customerId: id, name: c.name, cpf: c.document, birthDate: c.birthDate, email: c.email, phone: c.phone,
          cnhNumber: dto.cnhNumber, cnhCategory: dto.cnhCategory, cnhExpiresAt: new Date(dto.cnhExpiresAt),
          cnhFirstIssueAt: date(dto.cnhFirstIssueAt) ?? null,
        },
      });
      await this.audit.record(tx, ctx, { action: 'driver.created', entityType: 'Driver', entityId: driver.id, after: { customerId: id, cnhCategory: dto.cnhCategory, cnhExpiresAt: dto.cnhExpiresAt } });
      return { id: driver.id };
    });
  }

  /* ================= Motoristas ================= */

  async drivers(ctx: OrgContext, q: DriverQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const term = q.q?.trim();
    const digits = term ? onlyDigits(term) : '';
    const where: Prisma.DriverWhereInput = {
      anonymizedAt: null,
      ...(q.includeInactive ? {} : { active: true }),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.cnhExpiringDays !== undefined ? { cnhExpiresAt: { lte: new Date(Date.now() + q.cnhExpiringDays * DAY) } } : {}),
      ...(term ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ cpf: { contains: digits } }, { cnhNumber: { contains: digits } }] : []),
        ],
      } : {}),
    };
    const [rows, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.driver.findMany({ where, skip, take, include: { customer: { select: { id: true, name: true } } }, orderBy: orderBy(q, ['name', 'cnhExpiresAt', 'createdAt'], q.cnhExpiringDays !== undefined ? { cnhExpiresAt: 'asc' } : { name: 'asc' }) }),
      tx.driver.count({ where }),
    ]));
    return paginated(rows.map((d) => this.driverItem(ctx, d, d.customer)), total, page, pageSize);
  }

  private driverItem(ctx: OrgContext, d: Prisma.DriverGetPayload<object>, customer: { id: string; name: string } | null) {
    const sensitive = ctx.permissions.has('customers.sensitive');
    return {
      id: d.id, name: d.name, cpf: d.anonymizedAt ? '—' : sensitive ? formatDocument(d.cpf) : maskDocument(d.cpf),
      customerId: d.customerId, customer, phone: d.phone, email: d.email,
      cnhNumber: sensitive ? d.cnhNumber : maskDocument(d.cnhNumber), cnhCategory: d.cnhCategory,
      cnhExpiresAt: d.cnhExpiresAt.toISOString().slice(0, 10), cnhDaysLeft: Math.ceil((d.cnhExpiresAt.getTime() - Date.now()) / DAY),
      active: d.active,
    };
  }

  async driver(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const d = await tx.driver.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true } } } });
      if (!d || d.anonymizedAt) throw new NotFoundException('Motorista não encontrado.');
      const contracts = await tx.contractDriver.findMany({
        where: { driverId: id }, orderBy: { startAt: 'desc' }, take: 30,
        include: { contract: { select: { id: true, number: true, status: true } } },
      });
      const sensitive = ctx.permissions.has('customers.sensitive');
      return {
        ...this.driverItem(ctx, d, d.customer), birthDate: sensitive ? d.birthDate : null,
        cnhFirstIssueAt: d.cnhFirstIssueAt, notes: d.notes, createdAt: d.createdAt,
        contracts: contracts.map((c) => ({ id: c.id, primary: c.primary, startAt: c.startAt, endAt: c.endAt, contract: c.contract })),
      };
    });
  }

  async createDriver(ctx: OrgContext, dto: CreateDriverDto) {
    const cpf = onlyDigits(dto.cpf);
    if (!isValidCpf(cpf)) throw new BadRequestException('CPF inválido.');
    return this.prisma.tenant(ctx, async (tx) => {
      if (dto.customerId) await this.assertCustomer(tx, dto.customerId);
      if (await tx.driver.findFirst({ where: { cpf } })) throw new ConflictException('Já existe um motorista com este CPF.');
      const driver = await tx.driver.create({
        data: {
          organizationId: ctx.organizationId, customerId: dto.customerId ?? null, name: dto.name.trim(), cpf,
          birthDate: date(dto.birthDate) ?? null, email: trimOrNull(dto.email) ?? null, phone: trimOrNull(dto.phone) ?? null,
          cnhNumber: dto.cnhNumber, cnhCategory: dto.cnhCategory, cnhExpiresAt: new Date(dto.cnhExpiresAt),
          cnhFirstIssueAt: date(dto.cnhFirstIssueAt) ?? null, notes: trimOrNull(dto.notes) ?? null,
        },
      });
      await this.audit.record(tx, ctx, { action: 'driver.created', entityType: 'Driver', entityId: driver.id, after: { customerId: dto.customerId ?? null, cnhCategory: dto.cnhCategory, cnhExpiresAt: dto.cnhExpiresAt } });
      return { id: driver.id };
    });
  }

  async updateDriver(ctx: OrgContext, id: string, dto: UpdateDriverDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.driver.findUnique({ where: { id } });
      if (!before || before.anonymizedAt) throw new NotFoundException('Motorista não encontrado.');
      if (dto.customerId) await this.assertCustomer(tx, dto.customerId);
      const data: Prisma.DriverUncheckedUpdateInput = {
        customerId: dto.customerId, name: dto.name?.trim(), birthDate: date(dto.birthDate), email: trimOrNull(dto.email), phone: trimOrNull(dto.phone),
        cnhNumber: dto.cnhNumber, cnhCategory: dto.cnhCategory, cnhExpiresAt: date(dto.cnhExpiresAt) ?? undefined,
        cnhFirstIssueAt: date(dto.cnhFirstIssueAt), active: dto.active, notes: trimOrNull(dto.notes),
      };
      await tx.driver.update({ where: { id }, data });
      const diff = AuditService.diff(before as never, data as never);
      await this.audit.record(tx, ctx, {
        action: 'driver.updated', entityType: 'Driver', entityId: id,
        after: { fields: Object.keys(diff.after), ...(dto.cnhExpiresAt ? { cnhExpiresAt: dto.cnhExpiresAt } : {}) },
      });
      return { id };
    });
  }

  /* ================= Auxiliares ================= */

  private async assertCustomer(tx: Tx, id: string) {
    const c = await tx.customer.findUnique({ where: { id } });
    if (!c || c.deletedAt) throw new NotFoundException('Cliente não encontrado.');
    return c;
  }

  private validDocument(type: 'PF' | 'PJ', raw: string): string {
    const document = onlyDigits(raw);
    if (!isValidPersonDocument(type, document)) throw new BadRequestException(type === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.');
    return document;
  }

  private async assertDocumentFree(tx: Tx, document: string, excludeId?: string) {
    const existing = await tx.customer.findFirst({ where: { document, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException('Já existe um cliente com este documento.');
  }

  private fields(dto: Partial<CreateCustomerDto>) {
    return {
      tradeName: trimOrNull(dto.tradeName),
      birthDate: date(dto.birthDate),
      email: dto.email === undefined ? undefined : dto.email?.toLowerCase().trim() || null,
      phone: trimOrNull(dto.phone),
      street: trimOrNull(dto.street), number: trimOrNull(dto.number), complement: trimOrNull(dto.complement),
      district: trimOrNull(dto.district), city: trimOrNull(dto.city),
      state: dto.state === undefined ? undefined : dto.state?.toUpperCase() || null,
      zip: dto.zip === undefined ? undefined : dto.zip ? onlyDigits(dto.zip) : null,
      emergencyContact: dto.emergencyContact === undefined ? undefined : (dto.emergencyContact as unknown as Prisma.InputJsonValue) ?? undefined,
      preferredPayment: dto.preferredPayment,
      internalNotes: trimOrNull(dto.internalNotes),
    };
  }
}

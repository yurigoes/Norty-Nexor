import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { centsToDecimalString, fromCents, isValidPersonDocument, onlyDigits, toCents, type SaleStatus } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { num, numOrNull } from '../../common/serialize.interceptor';
import { orgSettings } from '../../common/org-settings';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import type { OrgContext } from '../../common/context';
import { day } from '../infractions/infractions.service';
import type { CloseSaleDto, CreateSaleDto, ProposalDto, ProposalStatusDto, SaleExpenseDto, SaleQueryDto, UpdateSaleDto, WithdrawSaleDto } from './dto';

const OPEN: SaleStatus[] = ['LISTED', 'NEGOTIATING'];

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly status: VehicleStatusService,
  ) {}

  private scope(ctx: OrgContext): Prisma.VehicleSaleWhereInput {
    return ctx.allBranches ? {} : { vehicle: { branchId: { in: ctx.branchIds } } };
  }

  async list(ctx: OrgContext, query: SaleQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.VehicleSaleWhereInput = {
      AND: [
        this.scope(ctx),
        query.branchId ? { vehicle: { branchId: query.branchId } } : {},
        query.status ? { status: query.status as SaleStatus } : {},
        query.q ? { vehicle: { OR: [{ plate: { contains: query.q.toUpperCase().replace(/[^A-Z0-9]/g, '') || query.q } }, { model: { name: { contains: query.q, mode: 'insensitive' } } }] } } : {},
      ],
    };
    const [items, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.vehicleSale.findMany({
        where, skip, take, orderBy: orderBy(query, ['listedAt', 'askingPrice', 'soldAt'], { listedAt: 'desc' }),
        include: {
          vehicle: { select: { id: true, plate: true, yearModel: true, odometerKm: true, color: true, model: { select: { name: true, make: { select: { name: true } } } } } },
          _count: { select: { proposals: true } },
        },
      }),
      tx.vehicleSale.count({ where }),
    ]));
    return paginated(items, total, page, pageSize);
  }

  private async load(tx: Tx, ctx: OrgContext, id: string) {
    const sale = await tx.vehicleSale.findFirst({
      where: { id, ...this.scope(ctx) },
      include: {
        vehicle: { select: { id: true, plate: true, branchId: true, yearModel: true, odometerKm: true, color: true, acquisitionValue: true, acquiredAt: true, commercialStatus: true, model: { select: { name: true, make: { select: { name: true } } } } } },
        proposals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!sale) throw new NotFoundException('Anúncio não encontrado.');
    return sale;
  }

  async detail(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const sale = await this.load(tx, ctx, id);
      const expenses = await tx.payable.findMany({ where: { saleId: id }, orderBy: { createdAt: 'desc' } });
      const checks = await this.checks(tx, sale.vehicleUnitId);
      return { ...sale, expenses, checks };
    });
  }

  /**
   * O que impede ou exige atenção para concluir a venda. Impeditivos:
   * contrato em vigor, compromisso futuro na agenda, OS aberta. Alerta:
   * infrações ainda não encerradas (acompanham o histórico, não somem).
   */
  async checks(tx: Tx, vehicleUnitId: string) {
    const now = new Date();
    const [activeContracts, futureAllocations, openWorkOrders, openInfractions] = await Promise.all([
      tx.contractVehicle.count({ where: { vehicleUnitId, endAt: null, contract: { status: { in: ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL'] } } } }),
      tx.vehicleAllocation.count({ where: { vehicleUnitId, active: true, blockedUntil: { gt: now }, kind: { in: ['RESERVATION', 'CONTRACT', 'MAINTENANCE'] } } }),
      tx.workOrder.count({ where: { vehicleUnitId, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      tx.trafficInfraction.count({ where: { vehicleUnitId, adminStatus: { notIn: ['CANCELLED', 'FINISHED'] } } }),
    ]);
    const blockers: string[] = [];
    if (activeContracts) blockers.push(`${activeContracts} contrato(s) em vigor ou a iniciar com este veículo.`);
    if (futureAllocations) blockers.push(`${futureAllocations} compromisso(s) na agenda (reserva, contrato ou manutenção).`);
    if (openWorkOrders) blockers.push(`${openWorkOrders} ordem(ns) de serviço em aberto.`);
    const warnings = openInfractions ? [`${openInfractions} infração(ões) ainda não encerrada(s) — seguem no histórico da placa.`] : [];
    return { canClose: blockers.length === 0, blockers, warnings };
  }

  async create(ctx: OrgContext, dto: CreateSaleDto) {
    if (dto.minimumPrice !== undefined && dto.minimumPrice > dto.askingPrice) throw new BadRequestException('O preço mínimo não pode ser maior que o pretendido.');
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
      if (!ctx.allBranches && !ctx.branchIds.includes(vehicle.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
      if (vehicle.commercialStatus === 'SOLD') throw new ConflictException('Este veículo já foi vendido.');
      const sale = await tx.vehicleSale.create({
        data: {
          organizationId: ctx.organizationId, vehicleUnitId: vehicle.id, appraisalValue: dto.appraisalValue ?? null,
          askingPrice: centsToDecimalString(toCents(dto.askingPrice)), minimumPrice: dto.minimumPrice ?? null,
          adChannels: dto.adChannels ?? [], notes: dto.notes ?? null, createdById: ctx.userId,
        },
      });
      // À venda sai da oferta de locação: o motor de disponibilidade ignora FOR_SALE.
      await this.status.setCommercial(tx, ctx, ctx.organizationId, vehicle.id, 'FOR_SALE', 'Anunciado para venda');
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'SALE', title: 'Anunciado para venda', refType: 'VehicleSale', refId: sale.id,
        data: { askingPrice: dto.askingPrice },
      });
      await this.audit.record(tx, ctx, { action: 'sale.listed', entityType: 'VehicleSale', entityId: sale.id, branchId: vehicle.branchId, after: dto });
      return sale;
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateSaleDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await this.load(tx, ctx, id);
      if (!OPEN.includes(before.status)) throw new ConflictException('Anúncio encerrado não pode ser alterado.');
      const asking = dto.askingPrice ?? num(before.askingPrice);
      const minimum = dto.minimumPrice ?? numOrNull(before.minimumPrice);
      if (minimum !== null && minimum > asking) throw new BadRequestException('O preço mínimo não pode ser maior que o pretendido.');
      const sale = await tx.vehicleSale.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'sale.updated', entityType: 'VehicleSale', entityId: id, branchId: before.vehicle.branchId, ...AuditService.diff(before as never, dto as never) });
      return sale;
    });
  }

  async addProposal(ctx: OrgContext, id: string, dto: ProposalDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const sale = await this.load(tx, ctx, id);
      if (!OPEN.includes(sale.status)) throw new ConflictException('O anúncio não está aberto a propostas.');
      const proposal = await tx.saleProposal.create({
        data: { organizationId: ctx.organizationId, saleId: id, name: dto.name, contact: dto.contact ?? null, amount: centsToDecimalString(toCents(dto.amount)), notes: dto.notes ?? null },
      });
      await this.audit.record(tx, ctx, { action: 'sale.proposal_added', entityType: 'VehicleSale', entityId: id, after: { proposalId: proposal.id, amount: dto.amount } });
      return proposal;
    });
  }

  async setProposalStatus(ctx: OrgContext, id: string, proposalId: string, dto: ProposalStatusDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const sale = await this.load(tx, ctx, id);
      const proposal = sale.proposals.find((p) => p.id === proposalId);
      if (!proposal) throw new NotFoundException('Proposta não encontrada.');
      if (!OPEN.includes(sale.status)) throw new ConflictException('Anúncio encerrado.');
      await tx.saleProposal.update({ where: { id: proposalId }, data: { status: dto.status } });
      if (dto.status === 'ACCEPTED' && sale.status === 'LISTED') await tx.vehicleSale.update({ where: { id }, data: { status: 'NEGOTIATING' } });
      await this.audit.record(tx, ctx, { action: 'sale.proposal_status', entityType: 'VehicleSale', entityId: id, before: { proposalId, status: proposal.status }, after: { proposalId, status: dto.status } });
      return this.load(tx, ctx, id);
    });
  }

  async addExpense(ctx: OrgContext, id: string, dto: SaleExpenseDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const sale = await this.load(tx, ctx, id);
      if (dto.supplierId && !(await tx.supplier.findUnique({ where: { id: dto.supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
      const payable = await tx.payable.create({
        data: {
          organizationId: ctx.organizationId, branchId: sale.vehicle.branchId, supplierId: dto.supplierId ?? null, kind: 'SALE_PREPARATION',
          description: `Preparação para venda: ${dto.description}`, amount: centsToDecimalString(toCents(dto.amount)), dueDate: day(dto.dueDate)!,
          vehicleUnitId: sale.vehicleUnitId, saleId: id, approval: 'PENDING_APPROVAL', createdById: ctx.userId,
        },
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: sale.vehicleUnitId, type: 'EXPENSE', title: 'Despesa de preparação para venda', description: dto.description,
        refType: 'Payable', refId: payable.id, data: { amount: dto.amount },
      });
      await this.audit.record(tx, ctx, { action: 'sale.expense_added', entityType: 'VehicleSale', entityId: id, after: { payableId: payable.id, ...dto } });
      return payable;
    });
  }

  async withdraw(ctx: OrgContext, id: string, dto: WithdrawSaleDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const sale = await this.load(tx, ctx, id);
      if (!OPEN.includes(sale.status)) throw new ConflictException('Anúncio já encerrado.');
      await tx.vehicleSale.update({ where: { id }, data: { status: 'WITHDRAWN' } });
      // Volta à operação: a situação comercial é recalculada pela agenda.
      await this.status.setCommercial(tx, ctx, ctx.organizationId, sale.vehicleUnitId, 'AVAILABLE', `Retirado da venda: ${dto.reason}`);
      await this.status.recomputeCommercial(tx, ctx, ctx.organizationId, sale.vehicleUnitId);
      await this.timeline.record(tx, ctx, ctx.organizationId, { vehicleUnitId: sale.vehicleUnitId, type: 'SALE', title: 'Retirado da venda', description: dto.reason, refType: 'VehicleSale', refId: id });
      await this.audit.record(tx, ctx, { action: 'sale.withdrawn', entityType: 'VehicleSale', entityId: id, reason: dto.reason });
      return this.load(tx, ctx, id);
    });
  }

  /**
   * Conclusão da venda e baixa patrimonial. Recusa com contrato em vigor,
   * agenda futura ou OS aberta. Contratos, documentos e histórico do carro
   * ficam intactos — só a situação vira "Vendido" e ele sai da locação.
   */
  async close(ctx: OrgContext, id: string, dto: CloseSaleDto) {
    if (dto.buyerDocument && !isValidPersonDocument(onlyDigits(dto.buyerDocument).length === 14 ? 'PJ' : 'PF', dto.buyerDocument)) {
      throw new BadRequestException('CPF ou CNPJ do comprador inválido.');
    }
    return this.prisma.tenant(ctx, async (tx) => {
      const sale = await this.load(tx, ctx, id);
      if (!OPEN.includes(sale.status)) throw new ConflictException('Anúncio já encerrado.');
      const checks = await this.checks(tx, sale.vehicleUnitId);
      if (!checks.canClose) throw new ConflictException(`Não é possível concluir a venda: ${checks.blockers.join(' ')}`);

      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } });
      const bookValue = bookValueAt(numOrNull(sale.vehicle.acquisitionValue), sale.vehicle.acquiredAt, orgSettings(org.settings).annualDepreciationPercent, new Date());
      const soldAt = dto.soldAt ? new Date(dto.soldAt) : new Date();
      const receivable = await tx.receivable.create({
        data: {
          organizationId: ctx.organizationId, branchId: sale.vehicle.branchId, vehicleUnitId: sale.vehicleUnitId, kind: 'VEHICLE_SALE',
          description: `Venda do veículo ${sale.vehicle.plate} — ${dto.buyerName}`, amount: centsToDecimalString(toCents(dto.salePrice)),
          dueDate: day(dto.dueDate)!, createdById: ctx.userId,
        },
      });
      await tx.vehicleSale.update({
        where: { id },
        data: {
          status: 'SOLD', soldAt, salePrice: centsToDecimalString(toCents(dto.salePrice)), buyerName: dto.buyerName,
          buyerDocument: dto.buyerDocument ? onlyDigits(dto.buyerDocument) : null, receivableId: receivable.id,
          bookValueAtSale: bookValue === null ? null : centsToDecimalString(bookValue), notes: dto.notes ?? sale.notes,
        },
      });
      await tx.saleProposal.updateMany({ where: { saleId: id, status: 'OPEN' }, data: { status: 'REJECTED' } });
      await this.status.setCommercial(tx, ctx, ctx.organizationId, sale.vehicleUnitId, 'SOLD', `Vendido para ${dto.buyerName}`);
      const result = bookValue === null ? null : fromCents(toCents(dto.salePrice) - bookValue);
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: sale.vehicleUnitId, type: 'SALE', title: `Vendido para ${dto.buyerName}`, refType: 'VehicleSale', refId: id, at: soldAt,
        data: { salePrice: dto.salePrice, bookValue: bookValue === null ? null : fromCents(bookValue), result },
      });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: sale.vehicleUnitId, type: 'DISPOSAL', title: 'Baixa patrimonial', at: soldAt,
        description: bookValue === null ? 'Valor contábil não calculado: falta valor de aquisição ou política de depreciação.' : null,
        refType: 'VehicleSale', refId: id,
      });
      await this.audit.record(tx, ctx, {
        action: 'sale.closed', entityType: 'VehicleSale', entityId: id, branchId: sale.vehicle.branchId,
        after: { ...dto, receivableId: receivable.id, bookValue: bookValue === null ? null : fromCents(bookValue) },
      });
      return { ...(await this.load(tx, ctx, id)), warnings: checks.warnings };
    });
  }
}

/**
 * Valor contábil pela depreciação linear da política da empresa. Sem
 * valor de aquisição, data ou política, não há valor — nulo, nunca zero.
 */
export function bookValueAt(acquisition: number | null, acquiredAt: Date | null, annualPercent: number | null, at: Date): number | null {
  if (acquisition === null || !acquiredAt || annualPercent === null) return null;
  const years = Math.max(0, (at.getTime() - acquiredAt.getTime()) / (365 * 86_400_000));
  const cents = toCents(acquisition);
  return Math.max(0, Math.round(cents - cents * (annualPercent / 100) * years));
}

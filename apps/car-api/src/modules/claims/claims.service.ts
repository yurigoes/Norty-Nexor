import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CLAIM_STATUS_LABEL, CLAIM_TYPE_LABEL, centsToDecimalString, toCents, type ClaimStatus, type ClaimType } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { TimelineService } from '../../common/timeline.service';
import { CounterService } from '../../common/counter.service';
import { VehicleStatusService } from '../../common/vehicle-status.service';
import { orderBy, pageArgs, paginated } from '../../common/pagination';
import type { OrgContext } from '../../common/context';
import { day } from '../infractions/infractions.service';
import type {
  ClaimExpenseDto, ClaimIndemnityDto, ClaimNoteDto, ClaimQueryDto, ClaimStatusDto, CreateClaimDto, PolicyDto, PolicyVehiclesDto,
  UpdateClaimDto, UpdatePolicyDto,
} from './dto';

/** Transições do sinistro. Encerrado é final; negado ainda pode ser encerrado. */
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN: ['INSURER_NOTIFIED', 'UNDER_REVIEW', 'REPAIRING', 'CLOSED'],
  INSURER_NOTIFIED: ['UNDER_REVIEW', 'REPAIRING', 'INDEMNIFIED', 'DENIED', 'CLOSED'],
  UNDER_REVIEW: ['REPAIRING', 'INDEMNIFIED', 'DENIED', 'CLOSED'],
  REPAIRING: ['INDEMNIFIED', 'CLOSED'],
  INDEMNIFIED: ['CLOSED'],
  DENIED: ['REPAIRING', 'CLOSED'],
  CLOSED: [],
};

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly counter: CounterService,
    private readonly status: VehicleStatusService,
  ) {}

  /* ================= Apólices ================= */

  policies(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.insurancePolicy.findMany({
      orderBy: [{ active: 'desc' }, { endsAt: 'asc' }],
      include: {
        insurer: { select: { id: true, name: true } },
        vehicles: { where: { deletedAt: null }, select: { id: true, plate: true } },
        _count: { select: { claims: true } },
      },
    }));
  }

  async createPolicy(ctx: OrgContext, dto: PolicyDto) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) throw new BadRequestException('O fim da vigência precisa ser posterior ao início.');
    return this.prisma.tenant(ctx, async (tx) => {
      const insurer = await tx.supplier.findUnique({ where: { id: dto.insurerId } });
      if (!insurer) throw new BadRequestException('Seguradora não encontrada no cadastro de fornecedores.');
      const policy = await tx.insurancePolicy.create({
        data: {
          organizationId: ctx.organizationId, insurerId: insurer.id, policyNumber: dto.policyNumber.trim(),
          startsAt: day(dto.startsAt)!, endsAt: day(dto.endsAt)!, coverage: dto.coverage ?? null,
          deductible: dto.deductible ?? null, premium: dto.premium ?? null, notes: dto.notes ?? null, active: dto.active ?? true,
        },
      });
      await this.audit.record(tx, ctx, { action: 'insurance.policy_created', entityType: 'InsurancePolicy', entityId: policy.id, after: dto });
      return policy;
    });
  }

  async updatePolicy(ctx: OrgContext, id: string, dto: UpdatePolicyDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.insurancePolicy.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Apólice não encontrada.');
      const data: Prisma.InsurancePolicyUpdateInput = {
        policyNumber: dto.policyNumber, coverage: dto.coverage, deductible: dto.deductible, premium: dto.premium,
        notes: dto.notes, active: dto.active,
        startsAt: dto.startsAt ? day(dto.startsAt)! : undefined, endsAt: dto.endsAt ? day(dto.endsAt)! : undefined,
      };
      const starts = (data.startsAt as Date | undefined) ?? before.startsAt;
      const ends = (data.endsAt as Date | undefined) ?? before.endsAt;
      if (ends <= starts) throw new BadRequestException('O fim da vigência precisa ser posterior ao início.');
      const policy = await tx.insurancePolicy.update({ where: { id }, data });
      await this.audit.record(tx, ctx, { action: 'insurance.policy_updated', entityType: 'InsurancePolicy', entityId: id, ...AuditService.diff(before as never, data as never) });
      return policy;
    });
  }

  /** Vincula os veículos cobertos (substitui a lista atual). */
  async setPolicyVehicles(ctx: OrgContext, id: string, dto: PolicyVehiclesDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const policy = await tx.insurancePolicy.findUnique({ where: { id } });
      if (!policy) throw new NotFoundException('Apólice não encontrada.');
      const vehicles = await tx.vehicleUnit.findMany({ where: { id: { in: dto.vehicleUnitIds }, deletedAt: null } });
      if (vehicles.length !== new Set(dto.vehicleUnitIds).size) throw new BadRequestException('Veículo inválido na lista.');
      const before = await tx.vehicleUnit.findMany({ where: { insurancePolicyId: id }, select: { id: true } });
      await tx.vehicleUnit.updateMany({ where: { insurancePolicyId: id, id: { notIn: dto.vehicleUnitIds } }, data: { insurancePolicyId: null } });
      await tx.vehicleUnit.updateMany({ where: { id: { in: dto.vehicleUnitIds } }, data: { insurancePolicyId: id } });
      await this.audit.record(tx, ctx, {
        action: 'insurance.policy_vehicles', entityType: 'InsurancePolicy', entityId: id,
        before: { vehicleUnitIds: before.map((v) => v.id) }, after: { vehicleUnitIds: dto.vehicleUnitIds },
      });
      return { linked: dto.vehicleUnitIds.length };
    });
  }

  /* ================= Sinistros ================= */

  private scope(ctx: OrgContext): Prisma.ClaimWhereInput {
    return ctx.allBranches ? {} : { branchId: { in: ctx.branchIds } };
  }

  async list(ctx: OrgContext, query: ClaimQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.ClaimWhereInput = {
      AND: [
        this.scope(ctx),
        query.branchId ? { branchId: query.branchId } : {},
        query.status ? { status: query.status as ClaimStatus } : {},
        query.type ? { type: query.type as ClaimType } : {},
        query.vehicleUnitId ? { vehicleUnitId: query.vehicleUnitId } : {},
        query.q
          ? {
              OR: [
                { number: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { insurerClaimNumber: { contains: query.q, mode: 'insensitive' } },
                { vehicle: { plate: { contains: query.q.toUpperCase().replace(/[^A-Z0-9]/g, '') || query.q } } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.claim.findMany({
        where, skip, take, orderBy: orderBy(query, ['occurredAt', 'number', 'createdAt'], { occurredAt: 'desc' }),
        include: { vehicle: { select: { id: true, plate: true } }, policy: { select: { id: true, policyNumber: true } } },
      }),
      tx.claim.count({ where }),
    ]));
    return paginated(items, total, page, pageSize);
  }

  private async load(tx: Tx, ctx: OrgContext, id: string) {
    const claim = await tx.claim.findFirst({
      where: { id, ...this.scope(ctx) },
      include: {
        vehicle: { select: { id: true, plate: true, operationalStatus: true, branchId: true, model: { select: { name: true, make: { select: { name: true } } } } } },
        contract: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
        policy: { include: { insurer: { select: { id: true, name: true } } } },
      },
    });
    if (!claim) throw new NotFoundException('Sinistro não encontrado.');
    return claim;
  }

  async detail(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const claim = await this.load(tx, ctx, id);
      const [events, payables, workOrder] = await Promise.all([
        tx.claimEvent.findMany({ where: { claimId: id }, orderBy: { at: 'desc' } }),
        tx.payable.findMany({ where: { claimId: id }, orderBy: { createdAt: 'desc' } }),
        claim.workOrderId ? tx.workOrder.findUnique({ where: { id: claim.workOrderId }, select: { id: true, number: true, status: true } }) : null,
      ]);
      const indemnities = await tx.receivable.findMany({
        where: { vehicleUnitId: claim.vehicleUnitId, kind: 'OTHER', description: { startsWith: `Indenização ${claim.number}` } },
        orderBy: { createdAt: 'desc' },
      });
      const driver = claim.driverId ? await tx.driver.findUnique({ where: { id: claim.driverId }, select: { id: true, name: true } }) : null;
      return { ...claim, driver, events, payables, indemnities, workOrder };
    });
  }

  async create(ctx: OrgContext, dto: CreateClaimDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const vehicle = await tx.vehicleUnit.findUnique({ where: { id: dto.vehicleUnitId } });
      if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Veículo não encontrado.');
      if (!ctx.allBranches && !ctx.branchIds.includes(vehicle.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
      if (dto.policyId && !(await tx.insurancePolicy.findUnique({ where: { id: dto.policyId } }))) throw new BadRequestException('Apólice inválida.');
      if (dto.contractId && !(await tx.rentalContract.findUnique({ where: { id: dto.contractId } }))) throw new BadRequestException('Contrato inválido.');
      if (dto.driverId && !(await tx.driver.findUnique({ where: { id: dto.driverId } }))) throw new BadRequestException('Motorista inválido.');
      const number = await this.counter.next(tx, ctx.organizationId, 'claim', 'SIN-');
      const claim = await tx.claim.create({
        data: {
          organizationId: ctx.organizationId, branchId: vehicle.branchId, number, vehicleUnitId: vehicle.id,
          contractId: dto.contractId ?? null, driverId: dto.driverId ?? null, type: dto.type as ClaimType,
          occurredAt: new Date(dto.occurredAt), location: dto.location ?? null, description: dto.description,
          policyId: dto.policyId ?? vehicle.insurancePolicyId ?? null, insurerClaimNumber: dto.insurerClaimNumber ?? null,
          policeReportNumber: dto.policeReportNumber ?? null, deductibleAmount: dto.deductibleAmount ?? null,
          estimatedCost: dto.estimatedCost ?? null, responsibleId: dto.responsibleId ?? null,
          blocksVehicle: dto.blocksVehicle, createdById: ctx.userId,
        },
      });
      await tx.claimEvent.create({ data: { organizationId: ctx.organizationId, claimId: claim.id, toStatus: 'OPEN', note: 'Sinistro registrado', userId: ctx.userId } });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: vehicle.id, type: 'CLAIM', title: `Sinistro ${number} — ${CLAIM_TYPE_LABEL[dto.type as ClaimType]}`,
        description: dto.description, refType: 'Claim', refId: claim.id, at: claim.occurredAt,
      });
      // Bloqueio pelo sinistro: o carro não entra em locação nova até alguém
      // com permissão de liberar decidir que pode voltar.
      if (dto.blocksVehicle) {
        await this.status.setOperational(tx, ctx, ctx.organizationId, vehicle.id, 'BLOCKED', `Sinistro ${number}`);
      }
      await this.audit.record(tx, ctx, { action: 'claim.created', entityType: 'Claim', entityId: claim.id, branchId: vehicle.branchId, after: dto });
      return claim;
    });
  }

  async update(ctx: OrgContext, id: string, dto: UpdateClaimDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await this.load(tx, ctx, id);
      if (before.status === 'CLOSED') throw new ConflictException('Sinistro encerrado não pode ser alterado.');
      const { note, ...fields } = dto;
      await tx.claim.update({ where: { id }, data: fields as Prisma.ClaimUncheckedUpdateInput });
      const diff = AuditService.diff(before as unknown as Record<string, unknown>, fields as Record<string, unknown>);
      if (Object.keys(diff.after).length) {
        await tx.claimEvent.create({
          data: { organizationId: ctx.organizationId, claimId: id, note: note ?? `Dados atualizados: ${Object.keys(diff.after).join(', ')}`, userId: ctx.userId },
        });
      }
      await this.audit.record(tx, ctx, { action: 'claim.updated', entityType: 'Claim', entityId: id, branchId: before.branchId, ...diff, reason: note });
      return this.load(tx, ctx, id);
    });
  }

  async changeStatus(ctx: OrgContext, id: string, dto: ClaimStatusDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const claim = await this.load(tx, ctx, id);
      const to = dto.status as ClaimStatus;
      if (!TRANSITIONS[claim.status].includes(to)) {
        throw new ConflictException(`Não é possível passar de "${CLAIM_STATUS_LABEL[claim.status]}" para "${CLAIM_STATUS_LABEL[to]}".`);
      }
      await tx.claim.update({ where: { id }, data: { status: to, closedAt: to === 'CLOSED' ? new Date() : undefined } });
      await tx.claimEvent.create({ data: { organizationId: ctx.organizationId, claimId: id, fromStatus: claim.status, toStatus: to, note: dto.note, userId: ctx.userId } });
      await this.audit.record(tx, ctx, { action: 'claim.status_changed', entityType: 'Claim', entityId: id, branchId: claim.branchId, before: { status: claim.status }, after: { status: to }, reason: dto.note });
      return this.load(tx, ctx, id);
    });
  }

  async addNote(ctx: OrgContext, id: string, dto: ClaimNoteDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.load(tx, ctx, id);
      return tx.claimEvent.create({ data: { organizationId: ctx.organizationId, claimId: id, note: dto.note, userId: ctx.userId } });
    });
  }

  /** Bloqueio posterior à abertura (ex.: dano descoberto depois). */
  async blockVehicle(ctx: OrgContext, id: string, dto: ClaimNoteDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const claim = await this.load(tx, ctx, id);
      await this.status.setOperational(tx, ctx, ctx.organizationId, claim.vehicleUnitId, 'BLOCKED', `Sinistro ${claim.number}: ${dto.note}`);
      await tx.claim.update({ where: { id }, data: { blocksVehicle: true } });
      await tx.claimEvent.create({ data: { organizationId: ctx.organizationId, claimId: id, note: `Veículo bloqueado: ${dto.note}`, userId: ctx.userId } });
      await this.audit.record(tx, ctx, { action: 'claim.vehicle_blocked', entityType: 'Claim', entityId: id, branchId: claim.branchId, reason: dto.note });
      return this.load(tx, ctx, id);
    });
  }

  /** Despesa do sinistro: conta a pagar ligada ao sinistro e ao veículo, sujeita a aprovação. */
  async addExpense(ctx: OrgContext, id: string, dto: ClaimExpenseDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const claim = await this.load(tx, ctx, id);
      if (dto.supplierId && !(await tx.supplier.findUnique({ where: { id: dto.supplierId } }))) throw new BadRequestException('Fornecedor inválido.');
      const payable = await tx.payable.create({
        data: {
          organizationId: ctx.organizationId, branchId: claim.branchId, supplierId: dto.supplierId ?? null,
          kind: dto.kind as Prisma.PayableCreateInput['kind'], description: `Sinistro ${claim.number}: ${dto.description}`,
          amount: centsToDecimalString(toCents(dto.amount)), dueDate: day(dto.dueDate)!, vehicleUnitId: claim.vehicleUnitId,
          claimId: id, documentNumber: dto.documentNumber ?? null, approval: 'PENDING_APPROVAL', createdById: ctx.userId,
        },
      });
      await tx.claimEvent.create({ data: { organizationId: ctx.organizationId, claimId: id, note: `Despesa lançada: ${dto.description} (R$ ${dto.amount.toFixed(2)})`, userId: ctx.userId } });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: claim.vehicleUnitId, type: 'EXPENSE', title: `Despesa do sinistro ${claim.number}`, description: dto.description,
        refType: 'Payable', refId: payable.id, data: { amount: dto.amount },
      });
      await this.audit.record(tx, ctx, { action: 'claim.expense_added', entityType: 'Claim', entityId: id, branchId: claim.branchId, after: { payableId: payable.id, ...dto } });
      return payable;
    });
  }

  /** Indenização da seguradora: conta a receber. */
  async addIndemnity(ctx: OrgContext, id: string, dto: ClaimIndemnityDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const claim = await this.load(tx, ctx, id);
      const receivable = await tx.receivable.create({
        data: {
          organizationId: ctx.organizationId, branchId: claim.branchId, vehicleUnitId: claim.vehicleUnitId, kind: 'OTHER',
          description: `Indenização ${claim.number}${claim.policy ? ` — ${claim.policy.insurer.name}` : ''}${dto.description ? `: ${dto.description}` : ''}`,
          amount: centsToDecimalString(toCents(dto.amount)), dueDate: day(dto.dueDate)!, createdById: ctx.userId,
        },
      });
      await tx.claim.update({ where: { id }, data: { indemnityAmount: centsToDecimalString(toCents(dto.amount)) } });
      await tx.claimEvent.create({ data: { organizationId: ctx.organizationId, claimId: id, note: `Indenização registrada: R$ ${dto.amount.toFixed(2)}`, userId: ctx.userId } });
      await this.timeline.record(tx, ctx, ctx.organizationId, {
        vehicleUnitId: claim.vehicleUnitId, type: 'REVENUE', title: `Indenização do sinistro ${claim.number}`,
        refType: 'Receivable', refId: receivable.id, data: { amount: dto.amount },
      });
      await this.audit.record(tx, ctx, { action: 'claim.indemnity_added', entityType: 'Claim', entityId: id, branchId: claim.branchId, after: { receivableId: receivable.id, ...dto } });
      return receivable;
    });
  }
}

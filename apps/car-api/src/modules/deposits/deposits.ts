import {
  BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, Injectable, Module, NotFoundException, Param,
  ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  centsToDecimalString, depositBalance, fromCents, toCents, type ApprovalStatus, type DepositEntryType, type DepositStatus,
} from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { assertApprovalLimit, branchWhere, OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { num } from '../../common/serialize.interceptor';
import { PageQueryDto, pageArgs, paginated } from '../../common/pagination';
import { FinanceModule } from '../finance/finance.module';
import { LedgerService } from '../finance/ledger.service';

const METHODS = ['PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER'] as const;

class ReceiptDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) amount!: number;
  @IsIn(METHODS) method!: (typeof METHODS)[number];
  @IsOptional() @IsDateString() at?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsString() @Matches(/^[\w:-]{8,100}$/) idempotencyKey!: string;
}

class DeductionDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) amount!: number;
  @IsString() @Length(3, 500) reason!: string;
  /** Título que a utilização compensa (avaria, multa, mensalidade em atraso). */
  @IsOptional() @IsUUID() receivableId?: string;
  @IsString() @Matches(/^[\w:-]{8,100}$/) idempotencyKey!: string;
}

class RefundDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) amount!: number;
  @IsIn(METHODS) method!: (typeof METHODS)[number];
  @IsString() @Length(3, 500) reason!: string;
  @IsString() @Matches(/^[\w:-]{8,100}$/) idempotencyKey!: string;
}

class DecisionDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class DepositQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['PENDING', 'HELD', 'PARTIALLY_USED', 'REFUND_PENDING', 'REFUNDED', 'CLOSED']) status?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsIn(['true']) pendingApproval?: string;
}

type Entry = { type: string; amount: unknown; status: string };
const balanceOf = (entries: Entry[]) =>
  depositBalance(entries.map((e) => ({ type: e.type as DepositEntryType, amount: num(e.amount as never), status: e.status as ApprovalStatus })));

/**
 * Caução: obrigação a devolver, não receita.
 *
 * O dinheiro recebido fica num razão próprio (DepositEntry). Ele só vira
 * receita quando uma utilização aprovada compensa um título — e isso é
 * um pagamento DEPOSIT_OFFSET naquele título, visível e auditado, nunca
 * uma reclassificação silenciosa. Utilização e devolução exigem aprovação
 * de quem tem `deposits.approve`, dentro da alçada.
 */
@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  /** Garante o registro de caução do contrato quando ele exige um. */
  async ensureDeposit(tx: Tx, contract: { id: string; organizationId: string; customerId: string; depositRequired: unknown }) {
    if (num(contract.depositRequired as never) <= 0) return null;
    const existing = await tx.securityDeposit.findUnique({ where: { contractId: contract.id } });
    if (existing) {
      if (toCents(num(existing.expectedAmount)) !== toCents(num(contract.depositRequired as never))) {
        await tx.securityDeposit.update({ where: { id: existing.id }, data: { expectedAmount: centsToDecimalString(toCents(num(contract.depositRequired as never))) } });
        await this.recompute(tx, existing.id);
      }
      return existing;
    }
    return tx.securityDeposit.create({
      data: {
        organizationId: contract.organizationId, contractId: contract.id, customerId: contract.customerId,
        expectedAmount: centsToDecimalString(toCents(num(contract.depositRequired as never))),
      },
    });
  }

  /** Valor recebido e disponível no caução de um contrato (para a entrega do veículo). */
  async contractBalance(tx: Tx, contractId: string) {
    const deposit = await tx.securityDeposit.findUnique({ where: { contractId }, include: { entries: true } });
    if (!deposit) return null;
    return { deposit, balance: balanceOf(deposit.entries) };
  }

  /** Situação derivada do saldo e do estado do contrato — nunca editada à mão. */
  async recompute(tx: Tx, depositId: string): Promise<DepositStatus> {
    const d = await tx.securityDeposit.findUniqueOrThrow({ where: { id: depositId }, include: { entries: true, contract: { select: { status: true } } } });
    const b = balanceOf(d.entries);
    const ended = ['CLOSED', 'TERMINATED', 'CANCELLED'].includes(d.contract.status);
    let status: DepositStatus;
    if (b.received === 0) status = ended ? 'CLOSED' : 'PENDING';
    else if (b.available > 0) status = ended ? 'REFUND_PENDING' : b.used > 0 ? 'PARTIALLY_USED' : 'HELD';
    else status = b.refunded > 0 ? 'REFUNDED' : 'CLOSED';
    if (status !== d.status) await tx.securityDeposit.update({ where: { id: depositId }, data: { status } });
    return status;
  }

  async list(ctx: OrgContext, q: DepositQueryDto) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.SecurityDepositWhereInput = {
      contract: branchWhere(ctx) as Prisma.RentalContractWhereInput,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.contractId ? { contractId: q.contractId } : {}),
      ...(q.pendingApproval ? { entries: { some: { status: 'PENDING_APPROVAL' } } } : {}),
      ...(q.q ? { OR: [
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
        { contract: { number: { contains: q.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.securityDeposit.findMany({
          where, skip, take, orderBy: { updatedAt: 'desc' },
          include: {
            entries: { select: { type: true, amount: true, status: true } },
            customer: { select: { id: true, name: true } },
            contract: { select: { id: true, number: true, status: true, branchId: true } },
          },
        }),
        tx.securityDeposit.count({ where }),
      ]);
      const items = rows.map(({ entries, ...d }) => ({
        ...d, balance: balanceOf(entries), pendingApprovals: entries.filter((e) => e.status === 'PENDING_APPROVAL').length,
      }));
      return paginated(items, total, page, pageSize);
    });
  }

  async get(ctx: OrgContext, id: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const d = await tx.securityDeposit.findFirst({
        where: { id, contract: branchWhere(ctx) as Prisma.RentalContractWhereInput },
        include: {
          entries: { orderBy: { at: 'asc' } },
          customer: { select: { id: true, name: true } },
          contract: { select: { id: true, number: true, status: true, branchId: true } },
        },
      });
      if (!d) throw new NotFoundException('Caução não encontrado.');
      return { ...d, balance: balanceOf(d.entries) };
    });
  }

  async receipt(ctx: OrgContext, id: string, dto: ReceiptDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const d = await this.lockDeposit(tx, ctx, id, dto.idempotencyKey);
      if ('existing' in d) return d.existing;
      if (['REFUNDED', 'CLOSED'].includes(d.deposit.status)) throw new ConflictException('Caução encerrado não recebe valores.');
      const entry = await tx.depositEntry.create({
        data: {
          organizationId: ctx.organizationId, depositId: id, type: 'RECEIPT', amount: centsToDecimalString(toCents(dto.amount)),
          method: dto.method, at: dto.at ? new Date(dto.at) : new Date(), reason: dto.reason ?? null, status: 'APPROVED',
          approvedById: ctx.userId, approvedAt: new Date(), idempotencyKey: dto.idempotencyKey, createdById: ctx.userId,
        },
      });
      await this.recompute(tx, id);
      await this.audit.record(tx, ctx, { action: 'deposit.received', entityType: 'SecurityDeposit', entityId: id, after: { entryId: entry.id, amount: dto.amount, method: dto.method } });
      return entry;
    });
  }

  async requestDeduction(ctx: OrgContext, id: string, dto: DeductionDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const d = await this.lockDeposit(tx, ctx, id, dto.idempotencyKey);
      if ('existing' in d) return d.existing;
      const b = balanceOf(d.deposit.entries);
      if (toCents(dto.amount) > toCents(b.available) - toCents(b.pendingDeductions)) {
        throw new BadRequestException(`Saldo do caução insuficiente (disponível: R$ ${fromCents(toCents(b.available) - toCents(b.pendingDeductions)).toFixed(2)}).`);
      }
      if (dto.receivableId) {
        const r = await tx.receivable.findUnique({ where: { id: dto.receivableId } });
        if (!r || (r.contractId !== d.deposit.contractId && r.customerId !== d.deposit.customerId)) {
          throw new BadRequestException('O título compensado precisa ser do mesmo contrato ou cliente.');
        }
        if (toCents(dto.amount) > toCents(num(r.amount)) - toCents(num(r.paidAmount))) throw new BadRequestException('O valor excede o saldo do título.');
      }
      const entry = await tx.depositEntry.create({
        data: {
          organizationId: ctx.organizationId, depositId: id, type: 'DEDUCTION', amount: centsToDecimalString(toCents(dto.amount)),
          reason: dto.reason, receivableId: dto.receivableId ?? null, status: 'PENDING_APPROVAL', idempotencyKey: dto.idempotencyKey, createdById: ctx.userId,
        },
      });
      await this.audit.record(tx, ctx, { action: 'deposit.deduction_requested', entityType: 'SecurityDeposit', entityId: id, reason: dto.reason, after: { entryId: entry.id, amount: dto.amount, receivableId: dto.receivableId ?? null } });
      return entry;
    });
  }

  async requestRefund(ctx: OrgContext, id: string, dto: RefundDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const d = await this.lockDeposit(tx, ctx, id, dto.idempotencyKey);
      if ('existing' in d) return d.existing;
      const b = balanceOf(d.deposit.entries);
      if (toCents(dto.amount) > toCents(b.available) - toCents(b.pendingDeductions)) throw new BadRequestException('Valor acima do saldo disponível do caução.');
      const entry = await tx.depositEntry.create({
        data: {
          organizationId: ctx.organizationId, depositId: id, type: 'REFUND', amount: centsToDecimalString(toCents(dto.amount)),
          method: dto.method, reason: dto.reason, status: 'PENDING_APPROVAL', idempotencyKey: dto.idempotencyKey, createdById: ctx.userId,
        },
      });
      await this.audit.record(tx, ctx, { action: 'deposit.refund_requested', entityType: 'SecurityDeposit', entityId: id, reason: dto.reason, after: { entryId: entry.id, amount: dto.amount } });
      return entry;
    });
  }

  /**
   * Aprovação de utilização ou devolução. O saldo é conferido de novo na
   * aprovação (outro pedido pode ter sido aprovado no meio); a compensação
   * do título acontece na mesma transação.
   */
  async decide(ctx: OrgContext, entryId: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    return this.prisma.tenant(ctx, async (tx) => {
      const entry = await tx.depositEntry.findUnique({ where: { id: entryId } });
      if (!entry) throw new NotFoundException('Movimento não encontrado.');
      const d = await this.lockDeposit(tx, ctx, entry.depositId);
      if ('existing' in d) throw new ConflictException();
      if (entry.status !== 'PENDING_APPROVAL') throw new ConflictException('Movimento já decidido.');
      if (decision === 'APPROVED') {
        assertApprovalLimit(ctx, num(entry.amount), entry.type === 'REFUND' ? 'esta devolução' : 'esta utilização');
        const others = d.deposit.entries.filter((e) => e.id !== entryId);
        const b = balanceOf(others);
        if (toCents(num(entry.amount)) > toCents(b.available)) throw new ConflictException('Saldo do caução insuficiente para aprovar.');
      }
      await tx.depositEntry.update({
        where: { id: entryId },
        data: { status: decision, approvedById: ctx.userId, approvedAt: new Date(), ...(note ? { reason: `${entry.reason ?? ''} · Decisão: ${note}`.slice(0, 1000) } : {}) },
      });
      if (decision === 'APPROVED' && entry.type === 'DEDUCTION' && entry.receivableId) {
        await this.ledger.applyPayment(tx, ctx, ctx.organizationId, {
          target: 'receivable', titleId: entry.receivableId, amount: num(entry.amount), method: 'DEPOSIT_OFFSET',
          idempotencyKey: `deposit-offset:${entryId}`, notes: `Compensação de caução: ${entry.reason ?? ''}`.slice(0, 500),
        });
      }
      const status = await this.recompute(tx, entry.depositId);
      await this.audit.record(tx, ctx, {
        action: `deposit.${entry.type.toLowerCase()}_${decision === 'APPROVED' ? 'approved' : 'rejected'}`, entityType: 'SecurityDeposit',
        entityId: entry.depositId, reason: note ?? entry.reason, after: { entryId, amount: entry.amount, decision, depositStatus: status },
      });
      return { id: entryId, status: decision, depositStatus: status };
    });
  }

  /** Trava o caução (pedidos simultâneos) e trata a chave de idempotência. */
  private async lockDeposit(tx: Tx, ctx: OrgContext, id: string, idempotencyKey?: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "security_deposits" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Caução não encontrado.');
    if (idempotencyKey) {
      const existing = await tx.depositEntry.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey } } });
      if (existing) return { existing };
    }
    const deposit = await tx.securityDeposit.findFirst({
      where: { id, contract: branchWhere(ctx) as Prisma.RentalContractWhereInput },
      include: { entries: true },
    });
    if (!deposit) throw new NotFoundException('Caução não encontrado.');
    return { deposit };
  }
}

@Controller('deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @RequirePermission('deposits.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() q: DepositQueryDto) {
    return this.deposits.list(ctx, q);
  }

  @RequirePermission('deposits.view')
  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.deposits.get(ctx, id);
  }

  @RequirePermission('deposits.manage')
  @Post(':id/receipts')
  receipt(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiptDto) {
    return this.deposits.receipt(ctx, id, dto);
  }

  @RequirePermission('deposits.manage')
  @Post(':id/deductions')
  deduction(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeductionDto) {
    return this.deposits.requestDeduction(ctx, id, dto);
  }

  @RequirePermission('deposits.manage')
  @Post(':id/refunds')
  refund(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto) {
    return this.deposits.requestRefund(ctx, id, dto);
  }

  @RequirePermission('deposits.approve')
  @Post('entries/:entryId/approve')
  @HttpCode(HttpStatus.OK)
  approve(@OrgCtx() ctx: OrgContext, @Param('entryId', ParseUUIDPipe) entryId: string, @Body() dto: DecisionDto) {
    return this.deposits.decide(ctx, entryId, 'APPROVED', dto.note);
  }

  @RequirePermission('deposits.approve')
  @Post('entries/:entryId/reject')
  @HttpCode(HttpStatus.OK)
  reject(@OrgCtx() ctx: OrgContext, @Param('entryId', ParseUUIDPipe) entryId: string, @Body() dto: DecisionDto) {
    return this.deposits.decide(ctx, entryId, 'REJECTED', dto.note);
  }
}

@Module({ imports: [FinanceModule], controllers: [DepositsController], providers: [DepositsService], exports: [DepositsService] })
export class DepositsModule {}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { centsToDecimalString, fromCents, titleStatus, toCents, type PaymentMethod } from '@nortycar/shared';
import type { Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { num } from '../../common/serialize.interceptor';
import type { RequestContext } from '../../common/context';

export interface ApplyPaymentInput {
  target: 'receivable' | 'payable';
  titleId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: Date;
  idempotencyKey: string;
  provider?: string | null;
  providerEventId?: string | null;
  providerChargeId?: string | null;
  bankReference?: string | null;
  notes?: string | null;
}

/**
 * Razão financeiro: o único lugar que grava um pagamento e mexe no saldo
 * de um título. Baixa manual, compensação de caução e webhook do provedor
 * passam todos por aqui, com as mesmas três garantias:
 *
 *  1. O título é travado (SELECT ... FOR UPDATE) antes de qualquer conta:
 *     duas baixas simultâneas do mesmo título acontecem uma depois da outra.
 *  2. A chave de idempotência é conferida depois da trava: a mesma
 *     requisição repetida (clique duplo, falha de rede, reentrega do
 *     webhook) devolve o pagamento já gravado, sem duplicar.
 *  3. Valor nunca passa do saldo em aberto.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly audit: AuditService) {}

  async applyPayment(tx: Tx, ctx: RequestContext | null, organizationId: string, input: ApplyPaymentInput) {
    const amountCents = toCents(input.amount);
    if (amountCents <= 0) throw new BadRequestException('O valor precisa ser maior que zero.');

    await this.lock(tx, input.target, input.titleId);

    const existing = await tx.payment.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      const sameTarget = input.target === 'receivable' ? existing.receivableId === input.titleId : existing.payableId === input.titleId;
      if (!sameTarget || toCents(num(existing.amount)) !== amountCents) {
        throw new ConflictException('Esta chave de operação já foi usada em outro pagamento.');
      }
      return { payment: existing, duplicate: true };
    }

    const title = input.target === 'receivable'
      ? await tx.receivable.findUniqueOrThrow({ where: { id: input.titleId } })
      : await tx.payable.findUniqueOrThrow({ where: { id: input.titleId } });
    if (title.status === 'CANCELLED') throw new ConflictException('Título cancelado não recebe pagamento.');
    if (input.target === 'payable' && (title as { approval: string }).approval !== 'APPROVED') {
      throw new ConflictException('Conta a pagar ainda não aprovada.');
    }
    const balance = toCents(num(title.amount)) - toCents(num(title.paidAmount));
    if (balance <= 0) throw new ConflictException('Título já quitado.');
    if (amountCents > balance) {
      throw new BadRequestException(`O valor excede o saldo em aberto (R$ ${fromCents(balance).toFixed(2).replace('.', ',')}).`);
    }

    const payment = await tx.payment.create({
      data: {
        organizationId,
        direction: input.target === 'receivable' ? 'IN' : 'OUT',
        receivableId: input.target === 'receivable' ? input.titleId : null,
        payableId: input.target === 'payable' ? input.titleId : null,
        method: input.method,
        amount: centsToDecimalString(amountCents),
        paidAt: input.paidAt ?? new Date(),
        status: 'CONFIRMED',
        provider: input.provider ?? null,
        providerEventId: input.providerEventId ?? null,
        providerChargeId: input.providerChargeId ?? null,
        idempotencyKey: input.idempotencyKey,
        bankReference: input.bankReference ?? null,
        notes: input.notes ?? null,
        registeredById: ctx?.userId ?? null,
      },
    });
    await this.refreshTitle(tx, input.target, input.titleId);
    await this.audit.record(tx, ctx, {
      action: `finance.${input.target}_paid`,
      entityType: input.target === 'receivable' ? 'Receivable' : 'Payable',
      entityId: input.titleId,
      branchId: title.branchId,
      organizationId,
      after: { paymentId: payment.id, amount: fromCents(amountCents), method: input.method, provider: input.provider ?? null },
    });
    return { payment, duplicate: false };
  }

  /** Estorno: o pagamento fica REVERSED (nunca é apagado) e o saldo volta a abrir. */
  async reverse(tx: Tx, ctx: RequestContext, paymentId: string, reason: string) {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.status !== 'CONFIRMED') throw new ConflictException('Só um pagamento confirmado pode ser estornado.');
    const target = payment.receivableId ? 'receivable' : 'payable';
    const titleId = (payment.receivableId ?? payment.payableId)!;
    await this.lock(tx, target, titleId);
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'REVERSED', notes: `${payment.notes ? `${payment.notes} · ` : ''}Estornado: ${reason}`.slice(0, 1000) },
    });
    await this.refreshTitle(tx, target, titleId);
    await this.audit.record(tx, ctx, {
      action: 'finance.payment_reversed', entityType: 'Payment', entityId: paymentId, reason,
      before: { status: 'CONFIRMED', amount: payment.amount, method: payment.method }, after: { status: 'REVERSED' },
    });
  }

  /** Recalcula pago e situação do título a partir dos pagamentos confirmados. */
  async refreshTitle(tx: Tx, target: 'receivable' | 'payable', titleId: string) {
    const where = target === 'receivable' ? { receivableId: titleId } : { payableId: titleId };
    const paid = await tx.payment.findMany({ where: { ...where, status: 'CONFIRMED' }, select: { amount: true } });
    const paidCents = paid.reduce((acc, p) => acc + toCents(num(p.amount)), 0);
    if (target === 'receivable') {
      const r = await tx.receivable.findUniqueOrThrow({ where: { id: titleId } });
      await tx.receivable.update({
        where: { id: titleId },
        data: { paidAmount: centsToDecimalString(paidCents), status: titleStatus(num(r.amount), fromCents(paidCents), r.status === 'CANCELLED') },
      });
    } else {
      const p = await tx.payable.findUniqueOrThrow({ where: { id: titleId } });
      await tx.payable.update({
        where: { id: titleId },
        data: { paidAmount: centsToDecimalString(paidCents), status: titleStatus(num(p.amount), fromCents(paidCents), p.status === 'CANCELLED') },
      });
    }
  }

  private async lock(tx: Tx, target: 'receivable' | 'payable', titleId: string) {
    const rows = target === 'receivable'
      ? await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "receivables" WHERE "id" = ${titleId}::uuid FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "payables" WHERE "id" = ${titleId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Título não encontrado.');
  }
}

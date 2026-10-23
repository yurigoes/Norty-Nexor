/* =========================================================
   Regras financeiras puras: parcelas, saldos, caução e
   encargos por atraso.
   ========================================================= */

import { addMonths, competenceOf, DAY_MS } from './time';
import { fromCents, percentOf, toCents } from './money';
import type { DepositEntryType, ApprovalStatus, TitleStatus } from '../domain';

export interface Installment {
  number: number;
  competence: string;
  dueDate: string;
  amount: number;
}

/**
 * Cronograma de mensalidades. Cada competência gera um título; a
 * unicidade (contrato, competência) no banco impede gerar duas vezes.
 */
export function monthlyInstallments(startAt: Date, termMonths: number, billingDay: number, amount: number): Installment[] {
  if (termMonths < 1) throw new Error('O prazo precisa ter ao menos um mês.');
  const day = Math.min(28, Math.max(1, billingDay));
  const result: Installment[] = [];
  for (let i = 0; i < termMonths; i += 1) {
    const ref = addMonths(new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), 1)), i);
    const due = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), day));
    // A primeira parcela nunca vence antes do início do contrato.
    if (i === 0 && due < new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()))) {
      due.setUTCMonth(due.getUTCMonth() + 1);
    }
    result.push({ number: i + 1, competence: competenceOf(ref), dueDate: due.toISOString().slice(0, 10), amount });
  }
  return result;
}

/** Situação de um título a partir do valor e do total pago. */
export function titleStatus(amount: number, paid: number, cancelled = false): TitleStatus {
  if (cancelled) return 'CANCELLED';
  const a = toCents(amount);
  const p = toCents(paid);
  if (p <= 0) return 'OPEN';
  if (p >= a) return 'PAID';
  return 'PARTIAL';
}

/**
 * Multa e juros de mora: multa fixa percentual mais juros simples
 * pró-rata dia sobre o saldo em aberto.
 */
export function lateCharges(balance: number, dueDate: string, at: Date, finePercent: number, monthlyInterestPercent: number): { fine: number; interest: number; days: number } {
  const due = new Date(`${dueDate}T23:59:59.999Z`);
  const days = Math.max(0, Math.floor((at.getTime() - due.getTime()) / DAY_MS) + (at > due ? 1 : 0));
  if (days === 0) return { fine: 0, interest: 0, days: 0 };
  const cents = toCents(balance);
  const fine = percentOf(cents, finePercent);
  const interest = Math.round((cents * monthlyInterestPercent * days) / (100 * 30));
  return { fine: fromCents(fine), interest: fromCents(interest), days };
}

export interface DepositEntryLike {
  type: DepositEntryType;
  amount: number;
  status: ApprovalStatus;
}

export interface DepositBalance {
  received: number;
  used: number;
  refunded: number;
  adjustments: number;
  available: number;
  pendingDeductions: number;
}

/**
 * Saldo do caução. Caução é obrigação a devolver, não receita: só vira
 * receita a parte utilizada por um desconto aprovado, e isso acontece
 * pela compensação de um título, nunca por reclassificação silenciosa.
 */
export function depositBalance(entries: DepositEntryLike[]): DepositBalance {
  let received = 0;
  let used = 0;
  let refunded = 0;
  let adjustments = 0;
  let pending = 0;
  for (const e of entries) {
    const cents = toCents(e.amount);
    if (e.status === 'REJECTED') continue;
    if (e.status === 'PENDING_APPROVAL') {
      if (e.type === 'DEDUCTION' || e.type === 'REFUND') pending += cents;
      continue;
    }
    if (e.type === 'RECEIPT') received += cents;
    else if (e.type === 'DEDUCTION') used += cents;
    else if (e.type === 'REFUND') refunded += cents;
    else adjustments += cents;
  }
  return {
    received: fromCents(received),
    used: fromCents(used),
    refunded: fromCents(refunded),
    adjustments: fromCents(adjustments),
    available: fromCents(received + adjustments - used - refunded),
    pendingDeductions: fromCents(pending),
  };
}

/* Financeiro do morador (boletos) e da administração (livro-caixa). */

import { byId, update, where } from '../data/repositories';
import type { ID, Invoice, LedgerEntry, Unit } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';

export function invoicesOfUnit(unitId: ID): Invoice[] {
  return where('invoices', (i) => i.unitId === unitId)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
}

export function nextInvoice(unitId: ID): Invoice | undefined {
  const open = invoicesOfUnit(unitId).filter((i) => i.status === 'aberto' || i.status === 'vencido');
  return open.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}

export function invoices(condominiumId: ID): Invoice[] {
  return where('invoices', (i) => i.condominiumId === condominiumId);
}

export function overdueInvoices(condominiumId: ID): Invoice[] {
  return invoices(condominiumId).filter((i) => i.status === 'vencido');
}

/** Pagamento simulado — Fase 3 conecta PIX/boleto reais. */
export function payInvoice(id: ID, actorName: string): Invoice | undefined {
  const invoice = byId('invoices', id);
  if (!invoice) return undefined;
  const next = update('invoices', id, {
    status: 'pago',
    paidAt: new Date().toISOString().slice(0, 10),
  });

  pushNotification({
    condominiumId: invoice.condominiumId,
    unitId: invoice.unitId,
    kind: 'boleto',
    title: 'Pagamento confirmado',
    body: `O boleto de ${invoice.reference} foi baixado com sucesso.`,
    link: '/app/financeiro',
    refId: invoice.id,
  });

  recordAudit({
    condominiumId: invoice.condominiumId,
    actorName,
    actorRole: 'morador',
    action: 'Registrou pagamento',
    target: `Boleto ${invoice.reference}`,
    detail: `Valor de R$ ${invoice.amount.toFixed(2)}`,
    module: 'Financeiro',
  });

  return next;
}

/* ---------------- Livro-caixa ---------------- */

export function ledger(condominiumId: ID): LedgerEntry[] {
  return where('ledger', (l) => l.condominiumId === condominiumId);
}

export interface FinancialSummary {
  revenue: number;
  expenses: number;
  balance: number;
  reserveFund: number;
  payable: number;
  receivable: number;
  delinquencyRate: number;
  delinquentUnits: number;
  delinquentAmount: number;
}

export function financialSummary(condominiumId: ID, units: Unit[], monthPrefix: string): FinancialSummary {
  const entries = ledger(condominiumId).filter((l) => l.date.startsWith(monthPrefix));
  const revenue = entries.filter((l) => l.kind === 'receita').reduce((s, l) => s + l.amount, 0);
  const expenses = entries.filter((l) => l.kind === 'despesa').reduce((s, l) => s + l.amount, 0);
  const payable = entries.filter((l) => l.kind === 'despesa' && l.status !== 'pago').reduce((s, l) => s + l.amount, 0);

  const overdue = overdueInvoices(condominiumId);
  const delinquentAmount = overdue.reduce((s, i) => s + i.amount, 0);
  const billable = units.filter((u) => u.status !== 'vaga');
  const delinquentUnits = new Set(overdue.map((i) => i.unitId)).size;

  const reserveFund = ledger(condominiumId)
    .filter((l) => l.category === 'Fundo de reserva')
    .reduce((s, l) => s + l.amount, 0);

  return {
    revenue,
    expenses,
    balance: revenue - expenses,
    reserveFund,
    payable,
    receivable: delinquentAmount,
    delinquencyRate: billable.length ? (delinquentUnits / billable.length) * 100 : 0,
    delinquentUnits,
    delinquentAmount,
  };
}

/** Série mensal de receitas x despesas dos últimos N meses. */
export function monthlySeries(condominiumId: ID, months: number, now = new Date()) {
  const entries = ledger(condominiumId);
  const result: { label: string; prefix: string; revenue: number; expenses: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthEntries = entries.filter((e) => e.date.startsWith(prefix));
    result.push({
      label: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getMonth()],
      prefix,
      revenue: monthEntries.filter((e) => e.kind === 'receita').reduce((s, e) => s + e.amount, 0),
      expenses: monthEntries.filter((e) => e.kind === 'despesa').reduce((s, e) => s + e.amount, 0),
    });
  }
  return result;
}

export function expensesByCategory(condominiumId: ID, monthPrefix: string) {
  const map = new Map<string, number>();
  ledger(condominiumId)
    .filter((l) => l.kind === 'despesa' && l.date.startsWith(monthPrefix))
    .forEach((l) => map.set(l.category, (map.get(l.category) ?? 0) + l.amount));
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export const INVOICE_STATUS_LABEL: Record<Invoice['status'], string> = {
  aberto: 'Em aberto',
  pago: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

export function invoiceTone(status: Invoice['status']) {
  switch (status) {
    case 'pago': return 'success' as const;
    case 'aberto': return 'info' as const;
    case 'vencido': return 'danger' as const;
    default: return 'neutral' as const;
  }
}

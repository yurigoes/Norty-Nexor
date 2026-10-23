/* =========================================================
   Motor de cálculo de locação.
   Roda na API para valer; o aplicativo usa a mesma função só
   para pré-visualizar. O preço final é sempre o que a API
   devolve — o navegador nunca decide o valor de uma reserva.
   ========================================================= */

import { DAY_MS } from './time';
import { fromCents, percentOf, sumCents, toCents } from './money';
import type { ExtraPricing } from '../domain';

export interface RateRules {
  dailyRate: number;
  weeklyRate?: number | null;
  monthlyRate?: number | null;
  /** Km incluídos por dia; nulo = quilometragem livre. */
  includedKmPerDay?: number | null;
  extraKmRate?: number | null;
  additionalDriverDaily: number;
  /** Tolerância na devolução antes de cobrar uma diária a mais. */
  lateGraceMinutes: number;
  depositAmount: number;
}

export interface QuoteExtra {
  name: string;
  pricing: ExtraPricing;
  price: number;
  quantity: number;
}

export interface QuoteInput {
  startAt: Date;
  endAt: Date;
  rate: RateRules;
  extras?: QuoteExtra[];
  additionalDrivers?: number;
  discountPercent?: number;
}

export interface QuoteLine {
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  billableDays: number;
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
  depositAmount: number;
  includedKm: number | null;
  extraKmRate: number | null;
}

export class PricingError extends Error {}

/** Diárias cobráveis: cada 24h iniciadas após a tolerância contam uma diária. */
export function billableDays(startAt: Date, endAt: Date, graceMinutes: number): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) throw new PricingError('A devolução precisa ser posterior à retirada.');
  const effective = Math.max(0, ms - graceMinutes * 60_000);
  return Math.max(1, Math.ceil(effective / DAY_MS));
}

export function computeQuote(input: QuoteInput): Quote {
  const { rate } = input;
  if (rate.dailyRate <= 0) throw new PricingError('Tarifa diária não configurada para esta categoria.');
  const days = billableDays(input.startAt, input.endAt, rate.lateGraceMinutes);
  const lines: QuoteLine[] = [];

  const daily = toCents(rate.dailyRate);
  const weekly = rate.weeklyRate ? toCents(rate.weeklyRate) : null;
  const monthly = rate.monthlyRate ? toCents(rate.monthlyRate) : null;

  let remaining = days;
  if (monthly && remaining >= 30) {
    const months = Math.floor(remaining / 30);
    lines.push({ label: 'Pacote mensal (30 dias)', quantity: months, unitPrice: fromCents(monthly), total: fromCents(months * monthly) });
    remaining -= months * 30;
  }
  if (weekly && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    lines.push({ label: 'Pacote semanal (7 dias)', quantity: weeks, unitPrice: fromCents(weekly), total: fromCents(weeks * weekly) });
    remaining -= weeks * 7;
  }
  if (remaining > 0) {
    // Nunca cobrar os dias avulsos acima do pacote que os cobriria.
    const avulso = remaining * daily;
    if (weekly && avulso > weekly) {
      lines.push({ label: 'Pacote semanal (7 dias)', quantity: 1, unitPrice: fromCents(weekly), total: fromCents(weekly) });
    } else {
      lines.push({ label: 'Diária', quantity: remaining, unitPrice: fromCents(daily), total: fromCents(avulso) });
    }
  }

  const drivers = input.additionalDrivers ?? 0;
  if (drivers > 0) {
    const unit = toCents(rate.additionalDriverDaily);
    lines.push({ label: 'Condutor adicional (por dia)', quantity: drivers * days, unitPrice: fromCents(unit), total: fromCents(unit * drivers * days) });
  }

  for (const extra of input.extras ?? []) {
    if (extra.quantity <= 0) continue;
    const unit = toCents(extra.price);
    const qty = extra.pricing === 'PER_DAY' ? extra.quantity * days : extra.quantity;
    lines.push({ label: extra.name, quantity: qty, unitPrice: fromCents(unit), total: fromCents(unit * qty) });
  }

  const subtotal = sumCents(lines.map((l) => toCents(l.total)));
  const discountPercent = Math.min(100, Math.max(0, input.discountPercent ?? 0));
  const discount = percentOf(subtotal, discountPercent);

  return {
    billableDays: days,
    lines,
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    total: fromCents(subtotal - discount),
    depositAmount: rate.depositAmount,
    includedKm: rate.includedKmPerDay ? rate.includedKmPerDay * days : null,
    extraKmRate: rate.extraKmRate ?? null,
  };
}

/** Diárias extras por atraso na devolução, respeitando a tolerância. */
export function lateDays(expectedEnd: Date, actualEnd: Date, graceMinutes: number): number {
  const late = actualEnd.getTime() - expectedEnd.getTime() - graceMinutes * 60_000;
  return late > 0 ? Math.ceil(late / DAY_MS) : 0;
}

/** Valor do km excedente. Quilometragem livre (includedKm nulo) não gera cobrança. */
export function extraKmCharge(drivenKm: number, includedKm: number | null, extraKmRate: number | null): { extraKm: number; amount: number } {
  if (includedKm === null || !extraKmRate || drivenKm <= includedKm) return { extraKm: 0, amount: 0 };
  const extraKm = drivenKm - includedKm;
  return { extraKm, amount: fromCents(extraKm * toCents(extraKmRate)) };
}

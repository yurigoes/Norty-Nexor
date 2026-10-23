/* =========================================================
   Rentabilidade por veículo.
   O cálculo nunca inventa valor ausente: cada dado que falta
   entra em `missing`, e o indicador que dependia dele volta
   nulo em vez de zero.
   ========================================================= */

import { fromCents, toCents } from './money';

export interface ProfitabilityInput {
  revenue: number;
  discounts: number;
  maintenanceCost: number;
  partsCost: number;
  tireCost: number;
  insuranceCost: number;
  taxCost: number;
  documentationCost: number;
  otherDirectCosts: number;
  fuelCost: number;
  acquisitionValue: number | null;
  saleValue: number | null;
  /** Depreciação anual em %, segundo a política da empresa; nulo = não configurada. */
  annualDepreciationPercent: number | null;
  daysInFleet: number;
  daysRented: number;
  daysUnavailable: number;
  kmDriven: number | null;
}

export interface ProfitabilityResult {
  revenue: number;
  costs: number;
  depreciation: number | null;
  operatingResult: number;
  resultAfterDepreciation: number | null;
  margin: number | null;
  occupancy: number | null;
  idleDays: number;
  revenuePerAvailableDay: number | null;
  costPerKm: number | null;
  roi: number | null;
  missing: string[];
}

export function computeProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const missing: string[] = [];
  const revenue = toCents(input.revenue) - toCents(input.discounts);
  const costs =
    toCents(input.maintenanceCost) + toCents(input.partsCost) + toCents(input.tireCost) +
    toCents(input.insuranceCost) + toCents(input.taxCost) + toCents(input.documentationCost) +
    toCents(input.otherDirectCosts) + toCents(input.fuelCost);

  let depreciation: number | null = null;
  if (input.acquisitionValue === null) missing.push('Valor de aquisição');
  if (input.annualDepreciationPercent === null) missing.push('Política de depreciação');
  if (input.acquisitionValue !== null && input.annualDepreciationPercent !== null) {
    const years = input.daysInFleet / 365;
    depreciation = Math.round(toCents(input.acquisitionValue) * (input.annualDepreciationPercent / 100) * years);
  }
  if (input.kmDriven === null) missing.push('Quilometragem inicial');
  if (input.daysInFleet <= 0) missing.push('Data de aquisição');

  const operating = revenue - costs;
  const afterDep = depreciation === null ? null : operating - depreciation;
  const availableDays = Math.max(0, input.daysInFleet - input.daysUnavailable);
  const saleGain = input.saleValue !== null && input.acquisitionValue !== null
    ? toCents(input.saleValue) - toCents(input.acquisitionValue)
    : null;

  return {
    revenue: fromCents(revenue),
    costs: fromCents(costs),
    depreciation: depreciation === null ? null : fromCents(depreciation),
    operatingResult: fromCents(operating),
    resultAfterDepreciation: afterDep === null ? null : fromCents(afterDep),
    margin: revenue > 0 ? Math.round((operating / revenue) * 10_000) / 100 : null,
    occupancy: input.daysInFleet > 0 ? Math.round((input.daysRented / input.daysInFleet) * 10_000) / 100 : null,
    idleDays: Math.max(0, input.daysInFleet - input.daysRented - input.daysUnavailable),
    revenuePerAvailableDay: availableDays > 0 ? fromCents(Math.round(revenue / availableDays)) : null,
    costPerKm: input.kmDriven && input.kmDriven > 0 ? Math.round((costs / 100 / input.kmDriven) * 100) / 100 : null,
    roi:
      input.acquisitionValue && input.acquisitionValue > 0
        ? Math.round((((operating + (saleGain ?? 0)) / toCents(input.acquisitionValue)) * 10_000)) / 100
        : null,
    missing,
  };
}

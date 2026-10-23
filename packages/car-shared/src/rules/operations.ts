/* =========================================================
   Regras de operação: custo médio, manutenção preventiva,
   consistência de abastecimento e pneus.
   ========================================================= */

import { DAY_MS } from './time';

/** Custo médio ponderado após uma entrada. */
export function weightedAverageCost(currentQty: number, currentAvg: number, inQty: number, inUnitCost: number): number {
  const totalQty = currentQty + inQty;
  if (totalQty <= 0) return inUnitCost;
  const value = Math.max(0, currentQty) * currentAvg + inQty * inUnitCost;
  return Math.round((value / totalQty) * 10_000) / 10_000;
}

export type DueState = 'OK' | 'DUE_SOON' | 'OVERDUE' | 'NO_BASELINE';

export interface MaintenanceDueInput {
  intervalKm?: number | null;
  intervalDays?: number | null;
  lastDoneKm?: number | null;
  lastDoneAt?: Date | null;
  currentKm: number;
  alertKmBefore?: number | null;
  alertDaysBefore?: number | null;
  now?: Date;
}

export interface MaintenanceDue {
  nextKm: number | null;
  nextDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  state: DueState;
}

/** O plano vence pelo que chegar primeiro: quilometragem ou tempo. */
export function maintenanceDue(input: MaintenanceDueInput): MaintenanceDue {
  const now = input.now ?? new Date();
  const nextKm = input.intervalKm && input.lastDoneKm !== null && input.lastDoneKm !== undefined
    ? input.lastDoneKm + input.intervalKm
    : null;
  const nextDate = input.intervalDays && input.lastDoneAt
    ? new Date(input.lastDoneAt.getTime() + input.intervalDays * DAY_MS)
    : null;
  const kmRemaining = nextKm === null ? null : nextKm - input.currentKm;
  const daysRemaining = nextDate === null ? null : Math.ceil((nextDate.getTime() - now.getTime()) / DAY_MS);

  if (kmRemaining === null && daysRemaining === null) {
    return { nextKm, nextDate, kmRemaining, daysRemaining, state: 'NO_BASELINE' };
  }
  const overdue = (kmRemaining !== null && kmRemaining <= 0) || (daysRemaining !== null && daysRemaining <= 0);
  const soon =
    (kmRemaining !== null && kmRemaining <= (input.alertKmBefore ?? 1000)) ||
    (daysRemaining !== null && daysRemaining <= (input.alertDaysBefore ?? 15));
  return { nextKm, nextDate, kmRemaining, daysRemaining, state: overdue ? 'OVERDUE' : soon ? 'DUE_SOON' : 'OK' };
}

export type RefuelFlag = 'KM_REGRESSION' | 'EXCEEDS_TANK' | 'TOTAL_MISMATCH' | 'ODD_CONSUMPTION';
export const REFUEL_FLAG_LABEL: Record<RefuelFlag, string> = {
  KM_REGRESSION: 'Quilometragem menor que a do registro anterior',
  EXCEEDS_TANK: 'Litros acima da capacidade do tanque',
  TOTAL_MISMATCH: 'Total diferente de litros × preço',
  ODD_CONSUMPTION: 'Consumo fora da faixa plausível',
};

export interface RefuelCheckInput {
  liters: number;
  pricePerLiter: number;
  total: number;
  odometerKm: number;
  previousOdometerKm?: number | null;
  tankCapacityLiters?: number | null;
}

export function checkRefuel(input: RefuelCheckInput): { flags: RefuelFlag[]; consumptionKmPerLiter: number | null } {
  const flags: RefuelFlag[] = [];
  const prev = input.previousOdometerKm ?? null;
  if (prev !== null && input.odometerKm < prev) flags.push('KM_REGRESSION');
  // 5% de folga: a capacidade nominal não conta o gargalo do bocal.
  if (input.tankCapacityLiters && input.liters > input.tankCapacityLiters * 1.05) flags.push('EXCEEDS_TANK');
  if (Math.abs(input.liters * input.pricePerLiter - input.total) > 0.05 + input.total * 0.01) flags.push('TOTAL_MISMATCH');
  let consumption: number | null = null;
  if (prev !== null && input.odometerKm > prev && input.liters > 0) {
    consumption = Math.round(((input.odometerKm - prev) / input.liters) * 100) / 100;
    if (consumption < 2 || consumption > 40) flags.push('ODD_CONSUMPTION');
  }
  return { flags, consumptionKmPerLiter: consumption };
}

/** Custo por km de um pneu ao longo da vida útil registrada. */
export function tireCostPerKm(cost: number, kmDriven: number): number | null {
  if (kmDriven <= 0) return null;
  return Math.round((cost / kmDriven) * 10_000) / 10_000;
}

// =========================================================
//  Fechamento agregado do dia
// ---------------------------------------------------------
//  Conferência independente do casamento item a item: se um
//  fecha e o outro não, há erro no motor ou buraco na captura
//  do XML. `autoMatchRate` é a métrica de saúde do produto —
//  ver docs/antifraude-conciliacao-etiquetas.md §3.3.
// =========================================================

import type { LabelRecord } from './types';

export interface DailyClosingResult {
  departmentId: string;
  businessDate: string;
  issued: number;
  matched: number;
  cancelled: number;
  unmatched: number;
  pending: number;
  issuedValueCents: number;
  unmatchedValueCents: number;
  /** Fração de etiquetas conciliadas SEM passar pela fila humana. Indicador de saúde do produto. */
  autoMatchRate: number;
  /** Fração de etiquetas pesadas sem operador — ver kpis.ts sobre por que não é, sozinho, um alarme. */
  unidentifiedRate: number;
}

export function computeDailyClosing(
  labels: readonly LabelRecord[],
  departmentId: string,
  businessDate: string,
  reviewedLabelIds: ReadonlySet<string>,
): DailyClosingResult {
  const ofDay = labels.filter((l) => l.departmentId === departmentId);

  const issued = ofDay.length;
  const matched = ofDay.filter((l) => l.state === 'conciliada').length;
  const cancelled = ofDay.filter((l) => l.state === 'cancelada').length;
  const unmatched = ofDay.filter((l) => l.state === 'nao_conciliada').length;
  const pending = ofDay.filter((l) => l.state === 'emitida' || l.state === 'divergente').length;

  const issuedValueCents = ofDay.reduce((sum, l) => sum + l.totalValueCents, 0);
  const unmatchedValueCents = ofDay
    .filter((l) => l.state === 'nao_conciliada')
    .reduce((sum, l) => sum + l.totalValueCents, 0);

  const autoMatched = ofDay.filter((l) => l.state === 'conciliada' && !reviewedLabelIds.has(l.id)).length;
  const autoMatchRate = matched === 0 ? 1 : autoMatched / matched;

  const unidentified = ofDay.filter((l) => l.operatorId === null).length;
  const unidentifiedRate = issued === 0 ? 0 : unidentified / issued;

  return {
    departmentId,
    businessDate,
    issued,
    matched,
    cancelled,
    unmatched,
    pending,
    issuedValueCents,
    unmatchedValueCents,
    autoMatchRate,
    unidentifiedRate,
  };
}

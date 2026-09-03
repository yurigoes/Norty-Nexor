// =========================================================
//  Posto de estorno — leitura do código e devolução exata
// ---------------------------------------------------------
//  "Voltou? ele lê o código de barras no leitor e o sistema
//  devolve aquele produto e peso exato. O que está pendente
//  de confirmação, o que já foi embora não faz sentido
//  cancelar." — é exatamente isto que este arquivo resolve.
//
//  A regra de ouro: o estado da ETIQUETA decide, não a
//  vontade de quem está no posto. Uma etiqueta 'conciliada'
//  já tem um item da NFC-e casado com ela — o produto saiu
//  pela porta, com a conta paga. Cancelar isso não desfaz a
//  venda, só criaria uma etiqueta fantasma na conciliação.
// =========================================================

import type { DepartmentSettings, LabelRecord } from './types';

export type ReturnLookupStatus =
  | 'elegivel'
  | 'codigo_desconhecido'
  | 'ja_vendida'
  | 'ja_cancelada';

export interface ReturnLookupResult {
  status: ReturnLookupStatus;
  label: LabelRecord | null;
  /** Só relevante quando elegível: fora da janela, o estorno é aceito mas marcado. */
  withinCancelWindow: boolean | null;
}

/**
 * Busca a etiqueta pelo código lido no posto (aceita o EAN-13 impresso ou o
 * serial do Code 128, quando existir) e decide se ela pode ser cancelada.
 *
 * `labels` já vem filtrado por `storeId` pelo chamador — este núcleo não
 * decide escopo de tenant, só a regra de negócio.
 */
export function lookupForCancel(
  code: string,
  labels: readonly LabelRecord[],
  now: Date,
  settings: DepartmentSettings,
): ReturnLookupResult {
  const label = labels.find((l) => l.barcode === code || (l.serial != null && l.serial === code)) ?? null;

  if (!label) {
    return { status: 'codigo_desconhecido', label: null, withinCancelWindow: null };
  }

  if (label.burned || label.state === 'cancelada') {
    return { status: 'ja_cancelada', label, withinCancelWindow: null };
  }

  if (label.state === 'conciliada') {
    return { status: 'ja_vendida', label, withinCancelWindow: null };
  }

  // emitida, nao_conciliada, divergente, reimpressa (mãe): ainda pode voltar.
  const minutesSinceIssue = (now.getTime() - label.issuedAt.getTime()) / 60_000;
  const withinCancelWindow = minutesSinceIssue <= settings.cancelWindowMinutes;

  return { status: 'elegivel', label, withinCancelWindow };
}

/**
 * Texto pronto para a tela de um posto sem operador dedicado — o
 * equipamento é só um leitor e um visor, então a mensagem precisa se
 * explicar sozinha, sem exigir treinamento.
 */
export function describeReturnLookup(result: ReturnLookupResult): string {
  switch (result.status) {
    case 'codigo_desconhecido':
      return 'Código não encontrado. Confira se a etiqueta é desta loja.';
    case 'ja_cancelada':
      return 'Esta etiqueta já foi cancelada antes. Nada a fazer.';
    case 'ja_vendida':
      return 'Este produto já passou no caixa e foi pago. Não é possível cancelar — procure o caixa para um estorno de venda.';
    case 'elegivel': {
      const l = result.label!;
      const kg = (l.weightGrams / 1000).toFixed(3).replace('.', ',');
      const aviso = result.withinCancelWindow ? '' : ' (fora do prazo normal de devolução — será registrado como tal)';
      return `Confirma a devolução de ${kg} kg (PLU ${l.plu})?${aviso}`;
    }
  }
}

/** true só quando o posto deve, de fato, seguir para a confirmação do cancelamento. */
export function canProceedWithCancellation(result: ReturnLookupResult): result is ReturnLookupResult & { label: LabelRecord } {
  return result.status === 'elegivel';
}

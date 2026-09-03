// =========================================================
//  Motor de casamento — Cenário B com atalho do Cenário A
// =========================================================

import type {
  DepartmentSettings,
  FiscalItemRecord,
  LabelRecord,
  MatchCandidateResult,
  MatchConfidence,
  MatchOutcome,
} from './types';

const MS_PER_SECOND = 1000;

/** Mesmo produto cadastrado nos dois lados; sem cadastro, cai para o PLU cru — a conta tem de fechar de qualquer jeito. */
export function sameProduct(label: LabelRecord, item: FiscalItemRecord): boolean {
  if (label.productId && item.productId) return label.productId === item.productId;
  return label.plu !== '' && label.plu === item.plu;
}

/**
 * custo = weightCostWeight·|Δgramas| + timeCostWeight·|Δsegundos|
 * null quando o item não compete: não é pesável, ou a venda antecede a pesagem
 * (fisicamente impossível — o produto não existia ainda).
 */
export function cost(label: LabelRecord, item: FiscalItemRecord, settings: DepartmentSettings): number | null {
  if (item.weightGrams == null) return null;

  const timeDeltaSeconds = (item.soldAt.getTime() - label.issuedAt.getTime()) / MS_PER_SECOND;
  if (timeDeltaSeconds < 0) return null;

  const weightDelta = Math.abs(item.weightGrams - label.weightGrams);
  return settings.weightCostWeight * weightDelta + settings.timeCostWeight * timeDeltaSeconds;
}

/** Candidatos da mesma SKU, dentro da janela, ordenados do mais provável ao menos provável. */
export function findCandidates(
  label: LabelRecord,
  items: readonly FiscalItemRecord[],
  settings: DepartmentSettings,
): MatchCandidateResult[] {
  const scored: { item: FiscalItemRecord; c: number }[] = [];

  for (const item of items) {
    if (!sameProduct(label, item)) continue;
    const c = cost(label, item, settings);
    if (c !== null) scored.push({ item, c });
  }

  scored.sort((a, b) => a.c - b.c);

  return scored.map(({ item, c }, index) => ({
    fiscalItem: item,
    cost: c,
    weightDeltaGrams: item.weightGrams != null ? Math.abs(item.weightGrams - label.weightGrams) : 0,
    timeDeltaSeconds: Math.round((item.soldAt.getTime() - label.issuedAt.getTime()) / MS_PER_SECOND),
    rank: index + 1,
    viaSerial: false,
  }));
}

/**
 * Confiança do melhor candidato. Só "alta" e "media" autoconciliam — "baixa"
 * sempre vai para a fila de revisão, mesmo dentro do custo máximo: peso
 * aproximado é exatamente o caso em que um clipe de vídeo vale mais que uma
 * fórmula. Ver docs/antifraude-conciliacao-etiquetas.md §3.3.
 */
export function classifyConfidence(
  candidates: readonly MatchCandidateResult[],
  settings: DepartmentSettings,
): MatchConfidence | null {
  const best = candidates[0];
  if (!best || best.cost > settings.autoMatchMaxCost) return null;

  const second = candidates[1];
  const exactWeight = best.weightDeltaGrams === 0;
  const uniqueAtThisWeight = !second || second.cost > settings.autoMatchMaxCost;

  if (exactWeight && uniqueAtThisWeight) return 'alta';
  if (exactWeight) return 'media'; // empatou no peso; o próprio custo já resolveu por tempo
  return 'baixa';
}

/**
 * Decide o destino de uma etiqueta: casamento automático, ou fila de revisão
 * (quando `autoMatch` volta nulo mas `candidates` não está vazio).
 *
 * O atalho do Cenário A (serial no código de barras — C18 Tipo 7 da Prix
 * 5 Plus) tem prioridade: se bater, nem entra na disputa por peso.
 */
export function matchLabel(
  label: LabelRecord,
  items: readonly FiscalItemRecord[],
  settings: DepartmentSettings,
): MatchOutcome {
  if (label.serial) {
    const hit = items.find((item) => item.serial != null && item.serial === label.serial);
    if (hit) {
      const viaSerial: MatchCandidateResult = {
        fiscalItem: hit,
        cost: 0,
        weightDeltaGrams: hit.weightGrams != null ? Math.abs(hit.weightGrams - label.weightGrams) : 0,
        timeDeltaSeconds: Math.round((hit.soldAt.getTime() - label.issuedAt.getTime()) / MS_PER_SECOND),
        rank: 1,
        viaSerial: true,
      };
      return {
        label,
        candidates: [viaSerial],
        autoMatch: { fiscalItem: hit, confidence: 'alta', cost: 0 },
      };
    }
    // Serial configurado mas não achou par: o PDV pode ter descartado o
    // código ao traduzir para o interno (ver homologação, §6). Cai para o
    // casamento por peso — não é erro, é o comportamento esperado quando o
    // Cenário A não está disponível para aquele PDV específico.
  }

  const candidates = findCandidates(label, items, settings);
  const confidence = classifyConfidence(candidates, settings);
  const autoMatches = confidence === 'alta' || confidence === 'media';

  return {
    label,
    candidates,
    autoMatch:
      autoMatches && candidates[0]
        ? { fiscalItem: candidates[0].fiscalItem, confidence: confidence as MatchConfidence, cost: candidates[0].cost }
        : null,
  };
}

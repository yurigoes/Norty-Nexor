// =========================================================
//  KPIs — sem identificação como caso frequente, não exceção
// ---------------------------------------------------------
//  A hipótese original do projeto era que pesar sem crachá
//  seria raro e sempre suspeito. O manual da Toledo derrubou
//  essa hipótese: pular a identificação custa um toque de
//  tecla, então a taxa de "sem identificação" de uma loja pode
//  legitimamente rodar em 30%, 50%, mais — dependendo de como
//  o gerente cobra a equipe, não de fraude.
//
//  Consequência prática: um limiar fixo ("mais de 10% sem
//  crachá = alerta") dispara o tempo todo e o cliente desliga
//  o alerta na primeira semana. O sinal que importa não é o
//  nível, é a MUDANÇA — uma balança que sempre operou
//  identificada e de repente para de identificar é sintoma de
//  configuração alterada; uma balança que sempre foi 40% sem
//  identificação está, para ela, operando normalmente.
// =========================================================

import type { LabelRecord } from './types';

export interface UnidentifiedRateSample {
  scaleId: string;
  total: number;
  unidentified: number;
}

export function computeUnidentifiedRate(labels: readonly LabelRecord[], scaleId: string): UnidentifiedRateSample {
  const ofScale = labels.filter((l) => l.scaleId === scaleId);
  const unidentified = ofScale.filter((l) => l.operatorId === null).length;
  return { scaleId, total: ofScale.length, unidentified };
}

export interface ScaleIdentificationBaseline {
  scaleId: string;
  /** A balança está configurada para pedir operador (C14 ligado)? Estado observado, não desejado. */
  requiresOperator: boolean;
  /** Média móvel de longo prazo (sugestão: 28 dias) — o "normal" desta balança. */
  historicalUnidentifiedRate: number;
  /** Janela curta (turno ou dia) sendo avaliada agora. */
  recentUnidentifiedRate: number;
}

/**
 * `configuracao_alterada`: só dispara quando havia identificação consistente
 * (baseline baixo) e ela despenca de repente — não quando a loja sempre
 * operou com uma fração alta de pesagens sem crachá.
 */
export function detectConfigurationChangeAlert(baseline: ScaleIdentificationBaseline): boolean {
  const JA_ERA_COMUM = 0.15;
  const SALTO_MINIMO = 0.3;

  if (!baseline.requiresOperator) return false;
  if (baseline.historicalUnidentifiedRate > JA_ERA_COMUM) return false;

  return baseline.recentUnidentifiedRate - baseline.historicalUnidentifiedRate >= SALTO_MINIMO;
}

export interface OperatorReturnBaseline {
  operatorId: string;
  totalLabels: number;
  cancelledLabels: number;
  departmentAverageCancelRate: number;
}

/**
 * Taxa de estorno do operador comparada à média do setor. Como o posto de
 * estorno não pede crachá (§6.2 do estudo — atrito no cancelamento destrói
 * o dado), quem responde pelo estorno é sempre quem PESOU, nunca quem
 * cancelou. É por isso que este KPI existe: é o controle que sobra quando
 * o estorno em si é anônimo por desenho.
 */
export function operatorCancelRateSignal(b: OperatorReturnBaseline): { rate: number; aboveBaseline: boolean } {
  const rate = b.totalLabels === 0 ? 0 : b.cancelledLabels / b.totalLabels;
  // 1,5x a média do setor é o limiar prático sugerido — não estatístico,
  // ajustável por cliente conforme a calibração dos primeiros 30 dias.
  return { rate, aboveBaseline: rate > b.departmentAverageCancelRate * 1.5 && b.totalLabels >= 10 };
}

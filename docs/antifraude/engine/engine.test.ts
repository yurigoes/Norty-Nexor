// =========================================================
//  Prova de comportamento — sem framework de teste, roda com:
//    ts-node docs/antifraude/engine/engine.test.ts
// =========================================================

import assert from 'node:assert/strict';
import {
  computeDailyClosing,
  computeUnidentifiedRate,
  detectConfigurationChangeAlert,
  lookupForCancel,
  matchLabel,
  operatorCancelRateSignal,
} from './index';
import type { DepartmentSettings, FiscalItemRecord, LabelRecord } from './types';

// ---------------- fixtures ----------------

const settings: DepartmentSettings = {
  matchWindowMinutes: 720,
  cancelWindowMinutes: 60,
  weightToleranceGrams: 0,
  weightCostWeight: 1.0,
  timeCostWeight: 0.002,
  autoMatchMaxCost: 5.0,
};

const D = (hhmm: string): Date => new Date(`2026-09-03T${hhmm}:00-03:00`);

let seq = 0;
function label(overrides: Partial<LabelRecord>): LabelRecord {
  seq += 1;
  return {
    id: `label-${seq}`,
    storeId: 'loja-1',
    departmentId: 'acougue',
    scaleId: 'balanca-1',
    operatorId: null, // caso frequente nesta balança — ver types.ts
    authMethod: 'nenhum',
    productId: 'picanha',
    plu: '00017',
    weightGrams: 842,
    totalValueCents: 9187,
    barcode: `789${seq}`,
    serial: null,
    issuedAt: D('14:00'),
    matchWindowUntil: D('23:59'),
    state: 'emitida',
    burned: false,
    ...overrides,
  };
}

function fiscalItem(overrides: Partial<FiscalItemRecord>): FiscalItemRecord {
  seq += 1;
  return {
    id: `item-${seq}`,
    storeId: 'loja-1',
    documentId: 'nfce-1',
    productId: 'picanha',
    plu: '00017',
    weightGrams: 842,
    totalValueCents: 9187,
    serial: null,
    soldAt: D('14:40'),
    ...overrides,
  };
}

// ---------------- runner minimalista ----------------

const tests: { name: string; fn: () => void }[] = [];
function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

// ============================================================
// 1. Atalho do Cenário A: serial bate, nem entra na disputa por peso
// ============================================================
test('serial casa direto, confiança alta, custo zero', () => {
  const l = label({ serial: 'SEQ00042', weightGrams: 999 }); // peso propositalmente longe
  const item = fiscalItem({ serial: 'SEQ00042', weightGrams: 100, soldAt: D('20:00') });
  const outcome = matchLabel(l, [item], settings);

  assert.equal(outcome.autoMatch?.confidence, 'alta');
  assert.equal(outcome.autoMatch?.cost, 0);
  assert.equal(outcome.candidates[0]?.viaSerial, true);
});

// ============================================================
// 2. Peso exato e único no dia -> confiança alta, autoconcilia
// ============================================================
test('peso exato e único -> alta, autoconcilia', () => {
  const l = label({});
  const item = fiscalItem({ weightGrams: 842, soldAt: D('14:40') }); // 40 min depois
  const outcome = matchLabel(l, [item], settings);

  assert.equal(outcome.autoMatch?.confidence, 'alta');
  assert.equal(outcome.autoMatch?.fiscalItem.id, item.id);
});

// ============================================================
// 3. Peso exato mas repetido (porcionado) -> média, desempate por tempo
// ============================================================
test('peso repetido -> média, desempate pelo item mais próximo no tempo', () => {
  const l = label({ weightGrams: 500, plu: '00099', productId: 'bandeja-frango', issuedAt: D('14:00') });
  const perto = fiscalItem({
    productId: 'bandeja-frango',
    plu: '00099',
    weightGrams: 500,
    soldAt: D('14:05'), // 5 min -> custo 0,6
  });
  // Mesmo peso, um pouco mais tarde, mas AINDA dentro do custo máximo (39 min -> custo 4,68):
  // é o caso real de duas bandejas idênticas vendidas na mesma tarde, não um candidato
  // remoto demais para competir.
  const tambemPerto = fiscalItem({
    productId: 'bandeja-frango',
    plu: '00099',
    weightGrams: 500,
    soldAt: D('14:39'),
  });

  const outcome = matchLabel(l, [tambemPerto, perto], settings);

  assert.equal(outcome.autoMatch?.confidence, 'media');
  assert.equal(outcome.autoMatch?.fiscalItem.id, perto.id, 'deve escolher o mais próximo no tempo');
});

// ============================================================
// 4. Peso aproximado -> baixa, vai para fila (autoMatch nulo)
// ============================================================
test('peso aproximado -> baixa, nunca autoconcilia', () => {
  const l = label({ weightGrams: 842 });
  const item = fiscalItem({ weightGrams: 844, soldAt: D('14:10') }); // PDV arredondou 2g
  const outcome = matchLabel(l, [item], settings);

  assert.equal(outcome.autoMatch, null, 'baixa confiança nunca autoconcilia, mesmo dentro do custo máximo');
  assert.equal(outcome.candidates.length, 1, 'mas o candidato aparece para a fila de revisão');
});

// ============================================================
// 5. Nenhum candidato -> sem autoMatch, sem candidatos
// ============================================================
test('sem candidato na SKU -> autoMatch nulo, fila vazia', () => {
  const l = label({});
  const item = fiscalItem({ productId: 'linguica', plu: '00005', weightGrams: 842 });
  const outcome = matchLabel(l, [item], settings);

  assert.equal(outcome.autoMatch, null);
  assert.equal(outcome.candidates.length, 0);
});

// ============================================================
// 6. operatorId não participa do casamento — testa com e sem operador
// ============================================================
test('identificação do operador é irrelevante para o casamento', () => {
  const item = fiscalItem({ weightGrams: 842, soldAt: D('14:15') });

  const semOperador = matchLabel(label({ operatorId: null }), [item], settings);
  const comOperador = matchLabel(label({ operatorId: 'op-joao' }), [item], settings);

  assert.equal(semOperador.autoMatch?.confidence, comOperador.autoMatch?.confidence);
  assert.equal(semOperador.autoMatch?.cost, comOperador.autoMatch?.cost);
});

// ============================================================
// 7. Venda não pode anteceder a pesagem
// ============================================================
test('item vendido antes da pesagem nunca é candidato', () => {
  const l = label({ issuedAt: D('14:00') });
  const item = fiscalItem({ weightGrams: 842, soldAt: D('13:59') });
  const outcome = matchLabel(l, [item], settings);

  assert.equal(outcome.candidates.length, 0);
});

// ============================================================
// 8. Posto de estorno — o núcleo do que foi pedido
// ============================================================
test('código desconhecido', () => {
  const r = lookupForCancel('000-nao-existe', [label({})], D('15:00'), settings);
  assert.equal(r.status, 'codigo_desconhecido');
});

test('etiqueta pendente (ainda não passou no caixa) -> elegível, devolve peso e produto exatos', () => {
  const l = label({ barcode: '7891234', weightGrams: 842, plu: '00017', issuedAt: D('14:00') });
  const r = lookupForCancel('7891234', [l], D('14:20'), settings);

  assert.equal(r.status, 'elegivel');
  assert.equal(r.label?.weightGrams, 842);
  assert.equal(r.label?.plu, '00017');
  assert.equal(r.withinCancelWindow, true);
});

test('etiqueta fora da janela de estorno -> elegível mas marcada', () => {
  const l = label({ barcode: '7891235', issuedAt: D('14:00') });
  const r = lookupForCancel('7891235', [l], D('15:30'), settings); // 90 min depois, janela é 60
  assert.equal(r.status, 'elegivel');
  assert.equal(r.withinCancelWindow, false);
});

test('etiqueta já vendida (conciliada) -> recusa, não cancela o que já foi embora', () => {
  const l = label({ barcode: '7891236', state: 'conciliada' });
  const r = lookupForCancel('7891236', [l], D('16:00'), settings);
  assert.equal(r.status, 'ja_vendida');
});

test('etiqueta já cancelada antes -> recusa duplicidade', () => {
  const l = label({ barcode: '7891237', state: 'cancelada', burned: true });
  const r = lookupForCancel('7891237', [l], D('16:00'), settings);
  assert.equal(r.status, 'ja_cancelada');
});

// ============================================================
// 9. Alerta de configuração alterada não dispara para balança que
//    sempre operou com fração alta de pesagens sem identificação
// ============================================================
test('balança historicamente identificada, taxa dispara -> alerta', () => {
  const disparou = detectConfigurationChangeAlert({
    scaleId: 'balanca-1',
    requiresOperator: true,
    historicalUnidentifiedRate: 0.05,
    recentUnidentifiedRate: 0.6,
  });
  assert.equal(disparou, true);
});

test('balança que sempre operou com muita pesagem sem crachá -> sem alerta', () => {
  const disparou = detectConfigurationChangeAlert({
    scaleId: 'balanca-2',
    requiresOperator: true,
    historicalUnidentifiedRate: 0.45,
    recentUnidentifiedRate: 0.55,
  });
  assert.equal(disparou, false, 'já era o normal desta balança, não é mudança');
});

// ============================================================
// 10. Fechamento agregado computa a taxa de não identificação
// ============================================================
test('fechamento do dia soma emitidas/conciliadas/canceladas e a taxa sem identificação', () => {
  const labels = [
    label({ departmentId: 'acougue', state: 'conciliada', operatorId: null, totalValueCents: 1000 }),
    label({ departmentId: 'acougue', state: 'conciliada', operatorId: 'op-1', totalValueCents: 1000 }),
    label({ departmentId: 'acougue', state: 'nao_conciliada', operatorId: null, totalValueCents: 500 }),
    label({ departmentId: 'acougue', state: 'cancelada', operatorId: null, totalValueCents: 800 }),
  ];
  const fechamento = computeDailyClosing(labels, 'acougue', '2026-09-03', new Set());

  assert.equal(fechamento.issued, 4);
  assert.equal(fechamento.matched, 2);
  assert.equal(fechamento.cancelled, 1);
  assert.equal(fechamento.unmatched, 1);
  assert.equal(fechamento.unidentifiedRate, 3 / 4);
  assert.equal(fechamento.unmatchedValueCents, 500);
});

// ============================================================
// 11. Taxa de estorno por operador (quem pesou, não quem cancelou)
// ============================================================
test('operador com estorno muito acima da média do setor acende sinal', () => {
  const sinal = operatorCancelRateSignal({
    operatorId: 'op-1',
    totalLabels: 40,
    cancelledLabels: 12, // 30%
    departmentAverageCancelRate: 0.08,
  });
  assert.equal(sinal.aboveBaseline, true);
});

test('volume baixo não dispara sinal mesmo com taxa alta', () => {
  const sinal = operatorCancelRateSignal({
    operatorId: 'op-novo',
    totalLabels: 3,
    cancelledLabels: 2,
    departmentAverageCancelRate: 0.08,
  });
  assert.equal(sinal.aboveBaseline, false, 'amostra pequena demais para significar algo');
});

// ============================================================
// 12. computeUnidentifiedRate — a matéria-prima do detector de mudança
// ============================================================
test('computeUnidentifiedRate soma só a balança pedida', () => {
  const labels = [
    label({ scaleId: 'b1', operatorId: null }),
    label({ scaleId: 'b1', operatorId: 'op-1' }),
    label({ scaleId: 'b2', operatorId: null }),
  ];
  const sample = computeUnidentifiedRate(labels, 'b1');
  assert.equal(sample.total, 2);
  assert.equal(sample.unidentified, 1);
});

// ---------------- execução ----------------

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`OK   ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${t.name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passaram`);
if (failed > 0) process.exit(1);

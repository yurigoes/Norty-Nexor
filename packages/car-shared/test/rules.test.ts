/**
 * Testes das regras puras. Rodam sem banco: `npm test -w @nortycar/shared`.
 * Os CPFs, CNPJs e RENAVAMs usados são números gerados para teste,
 * com dígito verificador válido, sem relação com pessoas ou veículos reais.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billableDays, computeQuote, lateDays, extraKmCharge,
  toCents, fromCents, centsToDecimalString,
  isValidCpf, isValidCnpj, isValidPlate, isValidRenavam, isValidVin, maskDocument, normalizePlate,
  overlaps, monthlyInstallments, depositBalance, titleStatus, lateCharges,
  weightedAverageCost, maintenanceDue, checkRefuel, computeProfitability,
  effectivePermissions, ROLE_TEMPLATES, ALL_PERMISSIONS, SUPPORT_GRANTABLE,
} from '../src/index';

const d = (s: string) => new Date(s);

test('dinheiro em centavos não sofre com ponto flutuante', () => {
  assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3));
  assert.equal(toCents('1234.56'), 123456);
  assert.equal(toCents('10.005'), 1001);
  assert.equal(centsToDecimalString(-1050), '-10.50');
  assert.equal(fromCents(123456), 1234.56);
});

test('documentos: CPF, CNPJ, placa, RENAVAM e chassi', () => {
  assert.ok(isValidCpf('529.982.247-25'));
  assert.ok(!isValidCpf('111.111.111-11'));
  assert.ok(!isValidCpf('529.982.247-24'));
  assert.ok(isValidCnpj('11.222.333/0001-81'));
  assert.ok(!isValidCnpj('11.222.333/0001-80'));
  assert.ok(isValidPlate('ABC-1234'));
  assert.ok(isValidPlate('abc1d23'));
  assert.ok(!isValidPlate('AB12345'));
  assert.equal(normalizePlate('abc-1d23'), 'ABC1D23');
  assert.ok(isValidRenavam('12345678900'));
  assert.ok(!isValidRenavam('12345678901'));
  assert.ok(isValidVin('9BWZZZ377VT004251'));
  assert.ok(!isValidVin('9BWZZZ377VT00425I'));
  assert.equal(maskDocument('52998224725'), '***.982.247-**');
});

test('intervalos são semiabertos: devolver e retirar no mesmo horário não conflita', () => {
  const a = { start: d('2026-01-01T10:00:00Z'), end: d('2026-01-03T10:00:00Z') };
  assert.ok(!overlaps(a, { start: d('2026-01-03T10:00:00Z'), end: d('2026-01-04T10:00:00Z') }));
  assert.ok(overlaps(a, { start: d('2026-01-02T10:00:00Z'), end: d('2026-01-04T10:00:00Z') }));
});

test('diárias respeitam a tolerância', () => {
  assert.equal(billableDays(d('2026-01-01T10:00:00Z'), d('2026-01-02T10:59:00Z'), 60), 1);
  assert.equal(billableDays(d('2026-01-01T10:00:00Z'), d('2026-01-02T11:01:00Z'), 60), 2);
  assert.throws(() => billableDays(d('2026-01-02T10:00:00Z'), d('2026-01-01T10:00:00Z'), 0));
});

test('cotação aplica pacote semanal, extras, condutor adicional e desconto', () => {
  const quote = computeQuote({
    startAt: d('2026-01-01T10:00:00Z'),
    endAt: d('2026-01-10T10:00:00Z'),
    rate: { dailyRate: 100, weeklyRate: 600, additionalDriverDaily: 10, lateGraceMinutes: 60, depositAmount: 1000, includedKmPerDay: 100, extraKmRate: 0.8 },
    extras: [{ name: 'Cadeirinha', pricing: 'PER_DAY', price: 15, quantity: 1 }, { name: 'Lavagem', pricing: 'FIXED', price: 50, quantity: 1 }],
    additionalDrivers: 1,
    discountPercent: 10,
  });
  assert.equal(quote.billableDays, 9);
  // 1 semana (600) + 2 diárias (200) + condutor 9×10 + cadeirinha 9×15 + lavagem 50
  assert.equal(quote.subtotal, 600 + 200 + 90 + 135 + 50);
  assert.equal(quote.discount, 107.5);
  assert.equal(quote.total, 967.5);
  assert.equal(quote.includedKm, 900);
});

test('dias avulsos nunca custam mais que o pacote semanal', () => {
  const quote = computeQuote({
    startAt: d('2026-01-01T10:00:00Z'), endAt: d('2026-01-07T10:00:00Z'),
    rate: { dailyRate: 120, weeklyRate: 600, additionalDriverDaily: 0, lateGraceMinutes: 0, depositAmount: 0 },
  });
  assert.equal(quote.total, 600);
});

test('atraso e km excedente', () => {
  assert.equal(lateDays(d('2026-01-05T10:00:00Z'), d('2026-01-05T10:30:00Z'), 60), 0);
  assert.equal(lateDays(d('2026-01-05T10:00:00Z'), d('2026-01-05T12:00:00Z'), 60), 1);
  assert.deepEqual(extraKmCharge(1200, 1000, 0.75), { extraKm: 200, amount: 150 });
  assert.deepEqual(extraKmCharge(5000, null, 0.75), { extraKm: 0, amount: 0 });
});

test('mensalidades: uma por competência, primeira nunca antes do início', () => {
  const list = monthlyInstallments(d('2026-01-20T12:00:00Z'), 12, 10, 2500);
  assert.equal(list.length, 12);
  assert.equal(list[0]!.dueDate, '2026-02-10');
  assert.equal(new Set(list.map((i) => i.competence)).size, 12);
});

test('caução: recebimento não vira receita; só descontos aprovados reduzem o saldo', () => {
  const balance = depositBalance([
    { type: 'RECEIPT', amount: 1500, status: 'APPROVED' },
    { type: 'DEDUCTION', amount: 300, status: 'APPROVED' },
    { type: 'DEDUCTION', amount: 200, status: 'PENDING_APPROVAL' },
    { type: 'DEDUCTION', amount: 999, status: 'REJECTED' },
  ]);
  assert.equal(balance.available, 1200);
  assert.equal(balance.pendingDeductions, 200);
  assert.equal(balance.used, 300);
});

test('títulos e encargos', () => {
  assert.equal(titleStatus(100, 0), 'OPEN');
  assert.equal(titleStatus(100, 40), 'PARTIAL');
  assert.equal(titleStatus(100, 100), 'PAID');
  const charges = lateCharges(1000, '2026-01-10', d('2026-01-20T12:00:00Z'), 2, 1);
  assert.equal(charges.fine, 20);
  assert.equal(charges.days, 10);
  assert.equal(charges.interest, 3.33);
});

test('estoque: custo médio ponderado', () => {
  assert.equal(weightedAverageCost(10, 20, 10, 30), 25);
  assert.equal(weightedAverageCost(0, 0, 5, 12.5), 12.5);
});

test('manutenção vence pelo que chegar primeiro', () => {
  const now = d('2026-06-01T00:00:00Z');
  const due = maintenanceDue({ intervalKm: 10000, intervalDays: 180, lastDoneKm: 20000, lastDoneAt: d('2026-01-01T00:00:00Z'), currentKm: 29500, now });
  assert.equal(due.nextKm, 30000);
  assert.equal(due.kmRemaining, 500);
  assert.equal(due.state, 'DUE_SOON');
  assert.equal(maintenanceDue({ intervalKm: 10000, lastDoneKm: 0, currentKm: 10001, now }).state, 'OVERDUE');
  assert.equal(maintenanceDue({ intervalKm: 10000, currentKm: 5000, now }).state, 'NO_BASELINE');
});

test('abastecimento inconsistente é sinalizado', () => {
  const r = checkRefuel({ liters: 60, pricePerLiter: 6, total: 360, odometerKm: 9000, previousOdometerKm: 9500, tankCapacityLiters: 44 });
  assert.ok(r.flags.includes('KM_REGRESSION'));
  assert.ok(r.flags.includes('EXCEEDS_TANK'));
  const ok = checkRefuel({ liters: 40, pricePerLiter: 6, total: 240, odometerKm: 10500, previousOdometerKm: 10000, tankCapacityLiters: 44 });
  assert.deepEqual(ok.flags, []);
  assert.equal(ok.consumptionKmPerLiter, 12.5);
});

test('rentabilidade não inventa dados ausentes', () => {
  const r = computeProfitability({
    revenue: 10000, discounts: 0, maintenanceCost: 1000, partsCost: 500, tireCost: 0, insuranceCost: 0, taxCost: 0,
    documentationCost: 0, otherDirectCosts: 0, fuelCost: 0, acquisitionValue: null, saleValue: null,
    annualDepreciationPercent: null, daysInFleet: 100, daysRented: 60, daysUnavailable: 10, kmDriven: null,
  });
  assert.equal(r.operatingResult, 8500);
  assert.equal(r.depreciation, null);
  assert.equal(r.roi, null);
  assert.equal(r.occupancy, 60);
  assert.ok(r.missing.includes('Valor de aquisição'));
});

test('permissões: módulo desabilitado remove a permissão; suporte só lê', () => {
  const perms = effectivePermissions(ROLE_TEMPLATES.owner.permissions, ['fleet']);
  assert.ok(perms.includes('fleet.create'));
  assert.ok(!perms.includes('inventory.move'));
  assert.ok(perms.includes('users.manage'));
  assert.equal(ROLE_TEMPLATES.owner.permissions.length, ALL_PERMISSIONS.length);
  assert.ok(SUPPORT_GRANTABLE.every((p) => p.endsWith('.view')));
  assert.ok(!ROLE_TEMPLATES.viewer.permissions.includes('finance.view'));
});

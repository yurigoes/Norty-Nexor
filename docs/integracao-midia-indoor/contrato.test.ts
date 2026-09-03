// =========================================================
//  Prova de comportamento do contrato — roda com:
//    ts-node docs/integracao-midia-indoor/contrato.test.ts
// =========================================================

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  itensSegurosParaExibir,
  validateCatalogoVitrine,
  type CatalogoVitrine,
} from './contrato-vitrine-precos';

const tests: { name: string; fn: () => void }[] = [];
function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

// ============================================================
// 1. O exemplo real do repositório precisa ser válido — senão o
//    exemplo mente sobre o próprio contrato.
// ============================================================
test('exemplo-payload.json é válido segundo o contrato', () => {
  const raw = readFileSync(join(__dirname, 'exemplo-payload.json'), 'utf8');
  const payload = JSON.parse(raw);
  const result = validateCatalogoVitrine(payload);

  assert.equal(result.valid, true, `esperava válido, erros: ${result.errors.join('; ')}`);
});

// ============================================================
// 2. Preço zerado ou negativo nunca passa — é a regra do §7 do
//    documento aplicada em código.
// ============================================================
test('preço zerado é rejeitado', () => {
  const result = validateCatalogoVitrine({
    lojaId: 'loja-1',
    geradoEm: '2026-09-03T18:00:00-03:00',
    itens: [
      {
        lojaId: 'loja-1',
        sku: '001',
        nome: 'Picanha',
        categoria: 'acougue',
        precoPorKgCentavos: 0,
        unidade: 'kg',
        atualizadoEm: '2026-09-03T18:00:00-03:00',
        origem: 'toledo_mgv7',
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('positivo')));
});

test('preço em float (não inteiro) é rejeitado', () => {
  const result = validateCatalogoVitrine({
    lojaId: 'loja-1',
    geradoEm: '2026-09-03T18:00:00-03:00',
    itens: [
      {
        lojaId: 'loja-1',
        sku: '001',
        nome: 'Picanha',
        categoria: 'acougue',
        precoPorKgCentavos: 59.9, // errado: devia ser 5990 centavos
        unidade: 'kg',
        atualizadoEm: '2026-09-03T18:00:00-03:00',
        origem: 'toledo_mgv7',
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('precoPorKgCentavos')));
});

test('categoria fora da lista é rejeitada', () => {
  const result = validateCatalogoVitrine({
    lojaId: 'loja-1',
    geradoEm: '2026-09-03T18:00:00-03:00',
    itens: [
      {
        lojaId: 'loja-1',
        sku: '001',
        nome: 'Picanha',
        categoria: 'bebidas', // não é do açougue nem de nenhuma categoria válida
        precoPorKgCentavos: 100,
        unidade: 'kg',
        atualizadoEm: '2026-09-03T18:00:00-03:00',
        origem: 'toledo_mgv7',
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('categoria')));
});

test('data inválida em atualizadoEm é rejeitada', () => {
  const result = validateCatalogoVitrine({
    lojaId: 'loja-1',
    geradoEm: '2026-09-03T18:00:00-03:00',
    itens: [
      {
        lojaId: 'loja-1',
        sku: '001',
        nome: 'Picanha',
        categoria: 'acougue',
        precoPorKgCentavos: 100,
        unidade: 'kg',
        atualizadoEm: 'ontem', // não é ISO 8601
        origem: 'toledo_mgv7',
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('atualizadoEm')));
});

// ============================================================
// 3. itensSegurosParaExibir — a regra do §7 posta em prática
// ============================================================
const catalogo: CatalogoVitrine = {
  lojaId: 'loja-1',
  geradoEm: '2026-09-03T18:05:00-03:00',
  itens: [
    {
      lojaId: 'loja-1',
      sku: '001',
      nome: 'Picanha',
      categoria: 'acougue',
      precoPorKgCentavos: 5990,
      unidade: 'kg',
      atualizadoEm: '2026-09-03T17:55:00-03:00', // 10 min atrás
      origem: 'toledo_mgv7',
    },
    {
      lojaId: 'loja-1',
      sku: '002',
      nome: 'Alcatra em promoção',
      categoria: 'acougue',
      precoPorKgCentavos: 4390,
      unidade: 'kg',
      validoAte: '2026-09-01T00:00:00-03:00', // promoção já venceu
      atualizadoEm: '2026-09-03T17:55:00-03:00',
      origem: 'toledo_mgv7',
    },
    {
      lojaId: 'loja-1',
      sku: '003',
      nome: 'Bandeja de Frango',
      categoria: 'acougue',
      precoPorKgCentavos: 1290,
      unidade: 'kg',
      atualizadoEm: '2026-09-01T09:00:00-03:00', // mais de 24h atrás
      origem: 'toledo_mgv7',
    },
  ],
};

test('item com promoção vencida some do rodízio', () => {
  const agora = new Date('2026-09-03T18:05:00-03:00');
  const seguros = itensSegurosParaExibir(catalogo, agora);
  assert.equal(seguros.some((i) => i.sku === '002'), false);
});

test('item desatualizado há mais de 24h some do rodízio', () => {
  const agora = new Date('2026-09-03T18:05:00-03:00');
  const seguros = itensSegurosParaExibir(catalogo, agora);
  assert.equal(seguros.some((i) => i.sku === '003'), false);
});

test('item recente e sem promoção vencida permanece', () => {
  const agora = new Date('2026-09-03T18:05:00-03:00');
  const seguros = itensSegurosParaExibir(catalogo, agora);
  assert.equal(seguros.some((i) => i.sku === '001'), true);
});

test('limite de idade é configurável', () => {
  const agora = new Date('2026-09-03T18:05:00-03:00');
  // Com limite de 72h, a Bandeja de Frango (~2 dias e 9h) volta a aparecer.
  const seguros = itensSegurosParaExibir(catalogo, agora, 72);
  assert.equal(seguros.some((i) => i.sku === '003'), true);
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

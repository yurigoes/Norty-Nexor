import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { custoMensal, diasParaVencer, precisaAvisar } from './domain';

/**
 * Contrato: custo comparável e aviso de vencimento.
 *
 * O que se prova aqui: um contrato anual e um mensal só se somam depois
 * de virarem custo mensal equivalente; pagamento único não vira zero; e
 * o aviso continua valendo para quem renova sozinho — ali ele é a
 * última chance de **não** renovar.
 */

describe('custoMensal', () => {
  it('divide a cobrança pelo período que ela cobre', () => {
    assert.equal(custoMensal({ billingPeriod: 'MENSAL', value: 300 }), 300);
    assert.equal(custoMensal({ billingPeriod: 'TRIMESTRAL', value: 300 }), 100);
    assert.equal(custoMensal({ billingPeriod: 'ANUAL', value: 1200 }), 100);
  });

  it('pagamento único não tem custo mensal, e não é zero', () => {
    // Zero faria a soma da carteira parecer menor do que é.
    assert.equal(custoMensal({ billingPeriod: 'UNICO', value: 5000 }), null);
  });
});

describe('diasParaVencer', () => {
  const agora = new Date('2026-03-10T12:00:00.000Z');

  it('conta os dias que faltam', () => {
    assert.equal(diasParaVencer('2026-03-20T12:00:00.000Z', agora), 10);
  });

  it('devolve negativo para o que já venceu', () => {
    assert.equal(diasParaVencer('2026-03-05T12:00:00.000Z', agora), -5);
  });

  it('prazo indeterminado é null, não um número grande', () => {
    assert.equal(diasParaVencer(null, agora), null);
  });
});

describe('precisaAvisar', () => {
  const agora = new Date('2026-03-10T12:00:00.000Z');

  it('avisa dentro da janela', () => {
    assert.equal(
      precisaAvisar({ endsAt: '2026-03-25T12:00:00.000Z', noticeDays: 30, isActive: true }, agora),
      true,
    );
  });

  it('não avisa fora dela', () => {
    assert.equal(
      precisaAvisar({ endsAt: '2026-08-25T12:00:00.000Z', noticeDays: 30, isActive: true }, agora),
      false,
    );
  });

  it('o que já venceu continua pedindo aviso', () => {
    assert.equal(
      precisaAvisar({ endsAt: '2026-01-01T12:00:00.000Z', noticeDays: 30, isActive: true }, agora),
      true,
    );
  });

  it('prazo indeterminado nunca avisa', () => {
    assert.equal(precisaAvisar({ endsAt: null, noticeDays: 30, isActive: true }, agora), false);
  });

  it('contrato desligado não avisa', () => {
    assert.equal(
      precisaAvisar({ endsAt: '2026-03-11T12:00:00.000Z', noticeDays: 30, isActive: false }, agora),
      false,
    );
  });
});

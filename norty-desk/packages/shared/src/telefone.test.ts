import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { telefoneBrasileiro } from './domain';

/**
 * O `+55` é trabalho do sistema.
 *
 * O que se prova aqui é que a pessoa pode digitar do jeito que digita —
 * com parêntese, com traço, com espaço, com o zero de tronco — e o que
 * fica gravado é sempre o mesmo E.164. Errar isto não quebra nada na
 * hora: produz contato duplicado e resposta de WhatsApp que não chega,
 * semanas depois, sem ninguém ligar uma coisa à outra.
 */

describe('telefone brasileiro em E.164', () => {
  it('aceita o celular do jeito que se escreve', () => {
    for (const escrito of [
      '(11) 99999-9999',
      '11 99999-9999',
      '11999999999',
      '11 9 9999 9999',
      ' (11)99999.9999 ',
    ]) {
      assert.equal(telefoneBrasileiro(escrito), '+5511999999999', `falhou em "${escrito}"`);
    }
  });

  it('aceita o fixo de oito dígitos', () => {
    assert.equal(telefoneBrasileiro('(11) 3333-4444'), '+551133334444');
  });

  it('tira o zero de tronco, que é de ligação e não do número', () => {
    assert.equal(telefoneBrasileiro('011 99999-9999'), '+5511999999999');
    assert.equal(telefoneBrasileiro('0 11 3333 4444'), '+551133334444');
  });

  it('não duplica o país de quem já digitou o 55', () => {
    assert.equal(telefoneBrasileiro('5511999999999'), '+5511999999999');
    assert.equal(telefoneBrasileiro('+55 11 99999-9999'), '+5511999999999');
    assert.equal(telefoneBrasileiro('+5511999999999'), '+5511999999999');
    assert.equal(telefoneBrasileiro('551133334444'), '+551133334444');
  });

  /**
   * O caso que a leitura ingênua erra.
   *
   * O DDD 55 existe — é Santa Maria, no Rio Grande do Sul. Quem só
   * procura "começa com 55" para decidir se é código de país engole o
   * DDD e grava um número mutilado. É por isso que a decisão é pelo
   * comprimento, não pelo prefixo.
   */
  it('não confunde o DDD 55 com o código do país', () => {
    assert.equal(telefoneBrasileiro('55 99999-9999'), '+5555999999999');
    assert.equal(telefoneBrasileiro('(55) 3333-4444'), '+555533334444');
    // E o mesmo número escrito com o país na frente dá no mesmo.
    assert.equal(telefoneBrasileiro('+55 55 99999-9999'), '+5555999999999');
  });

  it('devolve o estrangeiro como veio, sem forçar o Brasil nele', () => {
    assert.equal(telefoneBrasileiro('+351 912 345 678'), '+351912345678');
    assert.equal(telefoneBrasileiro('+1 415 555 2671'), '+14155552671');
  });

  it('recusa o que não dá número: sem DDD, curto demais, vazio', () => {
    assert.equal(telefoneBrasileiro('99999-9999'), null, 'nove dígitos sem DDD');
    assert.equal(telefoneBrasileiro('3333-4444'), null, 'oito dígitos sem DDD');
    assert.equal(telefoneBrasileiro('123'), null);
    assert.equal(telefoneBrasileiro(''), null);
    assert.equal(telefoneBrasileiro('   '), null);
    assert.equal(telefoneBrasileiro(null), null);
    assert.equal(telefoneBrasileiro(undefined), null);
    assert.equal(telefoneBrasileiro('abc'), null);
  });

  it('é idempotente: normalizar o já normalizado não muda nada', () => {
    for (const bruto of ['(11) 99999-9999', '011 3333 4444', '+351912345678', '55 99999-9999']) {
      const uma = telefoneBrasileiro(bruto);
      assert.equal(telefoneBrasileiro(uma), uma, `não é idempotente para "${bruto}"`);
    }
  });
});

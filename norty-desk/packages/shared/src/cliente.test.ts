import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DIGITOS_DO_PIN, loginDoCliente, loginLivre, pinFraco } from './domain';

/**
 * Login do cliente e PIN do portal.
 *
 * O que se prova aqui: o login sai do jeito que a pessoa se apresenta —
 * primeiro nome e último sobrenome, sem acento e sem partícula; dois
 * homônimos não colidem; e o PIN de seis dígitos recusa o que anula os
 * seis dígitos.
 */

describe('loginDoCliente', () => {
  it('usa primeiro nome e último sobrenome', () => {
    assert.equal(
      loginDoCliente('Yuri Souza Goes', 'empresadojoao.com.br'),
      'yuri.goes@empresadojoao.com.br',
    );
  });

  it('tira acento e cedilha', () => {
    assert.equal(loginDoCliente('José Gonçalves', 'x.com'), 'jose.goncalves@x.com');
    assert.equal(loginDoCliente('Ana Münster', 'x.com'), 'ana.munster@x.com');
  });

  it('não confunde partícula com sobrenome', () => {
    // O sobrenome é Goes, não "de".
    assert.equal(loginDoCliente('Yuri Souza de Goes', 'x.com'), 'yuri.goes@x.com');
    assert.equal(loginDoCliente('Maria dos Santos', 'x.com'), 'maria.santos@x.com');
  });

  it('com um nome só, não duplica', () => {
    assert.equal(loginDoCliente('Madonna', 'x.com'), 'madonna@x.com');
  });

  it('aceita o domínio com ou sem arroba', () => {
    assert.equal(loginDoCliente('Ana Lima', '@x.com'), 'ana.lima@x.com');
  });

  it('devolve nulo quando não sobra nome, em vez de um arroba solto', () => {
    assert.equal(loginDoCliente('   ', 'x.com'), null);
    assert.equal(loginDoCliente('de da dos', 'x.com'), null);
    assert.equal(loginDoCliente('!!!', 'x.com'), null);
    assert.equal(loginDoCliente('Ana Lima', ''), null);
  });
});

describe('loginLivre', () => {
  it('devolve o desejado quando ninguém o ocupa', () => {
    assert.equal(loginLivre('yuri.goes@x.com', []), 'yuri.goes@x.com');
  });

  it('numera a partir do segundo homônimo', () => {
    const ocupados = ['yuri.goes@x.com'];
    assert.equal(loginLivre('yuri.goes@x.com', ocupados), 'yuri.goes2@x.com');

    ocupados.push('yuri.goes2@x.com');
    assert.equal(loginLivre('yuri.goes@x.com', ocupados), 'yuri.goes3@x.com');
  });

  it('não se engana com caixa diferente', () => {
    assert.equal(loginLivre('yuri.goes@x.com', ['YURI.GOES@X.COM']), 'yuri.goes2@x.com');
  });
});

describe('pinFraco', () => {
  it('aceita seis dígitos sem padrão', () => {
    assert.equal(pinFraco('374912'), null);
    assert.equal(DIGITOS_DO_PIN, 6);
  });

  it('recusa o que não tem seis dígitos', () => {
    assert.ok(pinFraco('1234'));
    assert.ok(pinFraco('1234567'));
    assert.ok(pinFraco('12a456'));
    assert.ok(pinFraco(''));
  });

  it('recusa dígito repetido e sequência', () => {
    assert.ok(pinFraco('111111'));
    assert.ok(pinFraco('123456'));
    assert.ok(pinFraco('654321'));
  });

  it('não recusa o que só parece sequência', () => {
    assert.equal(pinFraco('123457'), null);
    assert.equal(pinFraco('112233'), null);
  });
});

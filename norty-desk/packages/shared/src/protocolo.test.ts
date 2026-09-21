import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALFABETO_DO_PROTOCOLO,
  JANELA_DE_FALHAS_SEGUNDOS,
  bloqueioProgressivo,
  formatarProtocolo,
  normalizarProtocolo,
} from './domain';

describe('alfabeto do protocolo', () => {
  it('não tem nenhum caractere que se confunde com outro', () => {
    // O código é ditado ao telefone e copiado do papel. Se este teste
    // falhar, alguém voltou a pôr `O`, `0`, `1`, `I`, `S`, `5`, `B` ou
    // `8` no alfabeto — e aí a confusão volta.
    for (const c of 'AEIOU01585SBLV') {
      assert.ok(!ALFABETO_DO_PROTOCOLO.includes(c), `${c} devia estar fora do alfabeto`);
    }
  });

  it('não repete caractere', () => {
    assert.equal(new Set(ALFABETO_DO_PROTOCOLO).size, ALFABETO_DO_PROTOCOLO.length);
  });

  it('é grande o bastante para tornar a enumeração inviável', () => {
    // 23^8 ≈ 7,8·10^10. Com a escada de bloqueio por IP, varrer isso
    // levaria mais tempo do que a empresa existe.
    assert.ok(Math.pow(ALFABETO_DO_PROTOCOLO.length, 8) > 1e10);
  });
});

describe('normalizarProtocolo', () => {
  it('aceita com traço, sem traço, em minúsculas e com espaço', () => {
    for (const entrada of ['4K7PWZ9N', '4K7P-WZ9N', '4k7p-wz9n', ' 4K7P WZ9N ']) {
      assert.equal(normalizarProtocolo(entrada), '4K7PWZ9N', entrada);
    }
  });

  it('recusa comprimento errado', () => {
    assert.equal(normalizarProtocolo('4K7PWZ9'), null);
    assert.equal(normalizarProtocolo('4K7PWZ9NN'), null);
    assert.equal(normalizarProtocolo(''), null);
  });

  it('recusa caractere fora do alfabeto em vez de adivinhar a troca', () => {
    // Quem digitou `O` ou `0` não errou a fonte: o alfabeto não tem
    // nenhum dos dois. Adivinhar por ele seria inventar um código.
    assert.equal(normalizarProtocolo('4K7PWZ9O'), null);
    assert.equal(normalizarProtocolo('4K7PWZ90'), null);
    assert.equal(normalizarProtocolo('AEIOUAEI'), null);
  });
});

describe('formatarProtocolo', () => {
  it('parte em dois grupos de quatro', () => {
    assert.equal(formatarProtocolo('4K7PWZ9N'), '4K7P-WZ9N');
  });

  it('deixa passar o que não tem o tamanho, sem inventar traço', () => {
    assert.equal(formatarProtocolo('4K7P'), '4K7P');
  });
});

describe('bloqueioProgressivo', () => {
  it('as três primeiras falhas não barram', () => {
    // Digitar errado é o caso comum; transformar isso em bloqueio
    // produz ligação para o suporte, não segurança.
    for (const falhas of [0, 1, 2, 3]) {
      assert.equal(bloqueioProgressivo(falhas), 0, `${falhas} falhas`);
    }
  });

  it('cresce a partir da quarta e nunca diminui', () => {
    let anterior = 0;
    for (let falhas = 4; falhas <= 20; falhas += 1) {
      const atual = bloqueioProgressivo(falhas);
      assert.ok(atual > 0, `${falhas} falhas deveria barrar`);
      assert.ok(atual >= anterior, `${falhas} falhas barrou menos que ${falhas - 1}`);
      anterior = atual;
    }
  });

  it('mil tentativas custam mais de um dia', () => {
    // É a conta que justifica aceitar um PIN de seis dígitos: sem a
    // escada, um milhão de combinações cai em minutos.
    let segundos = 0;
    for (let i = 1; i <= 1000; i += 1) segundos += bloqueioProgressivo(i);
    assert.ok(segundos > 24 * 3600, `mil tentativas custariam só ${segundos}s`);
  });

  it('a janela de falhas é curta o bastante para não punir quem erra raramente', () => {
    assert.ok(JANELA_DE_FALHAS_SEGUNDOS <= 60 * 60);
  });
});

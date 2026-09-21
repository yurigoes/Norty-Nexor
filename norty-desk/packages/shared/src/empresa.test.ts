import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  documentoInvalido,
  nomeDeEmpresaNormalizado,
  pareceDocumento,
  soDigitos,
} from './domain';

describe('nomeDeEmpresaNormalizado', () => {
  it('tira acento, caixa e espaço sobrando', () => {
    assert.equal(
      nomeDeEmpresaNormalizado('  Empresa  do   JOÃO  Comércio '),
      'empresa do joao comercio',
    );
  });

  it('tira a forma societária do fim', () => {
    for (const [entrada, esperado] of [
      ['Alpha Sistemas LTDA', 'alpha sistemas'],
      ['Alpha Sistemas Ltda.', 'alpha sistemas'],
      ['Alpha Sistemas ME', 'alpha sistemas'],
      ['Alpha Sistemas EIRELI', 'alpha sistemas'],
      ['Alpha Sistemas S/A', 'alpha sistemas'],
      ['Alpha Sistemas, LTDA', 'alpha sistemas'],
    ] as const) {
      assert.equal(nomeDeEmpresaNormalizado(entrada), esperado, entrada);
    }
  });

  it('tira duas formas empilhadas', () => {
    // "LTDA ME" é comum no cadastro, e uma passada só deixaria a
    // primeira pontuando na busca.
    assert.equal(nomeDeEmpresaNormalizado('Alpha Sistemas LTDA ME'), 'alpha sistemas');
  });

  it('não tira a forma do começo nem do meio: ali é nome', () => {
    assert.equal(nomeDeEmpresaNormalizado('ME Informática'), 'me informatica');
    assert.equal(nomeDeEmpresaNormalizado('SA Comércio de Peças'), 'sa comercio de pecas');
  });

  it('nome que é só a forma societária não vira vazio', () => {
    // Buscar por "ltda" é ruim; buscar por nada é pior.
    assert.equal(nomeDeEmpresaNormalizado('LTDA'), 'ltda');
  });

  it('é idempotente: normalizar duas vezes dá o mesmo', () => {
    for (const nome of ['Empresa do João LTDA', 'ME Informática', 'Alpha S/A']) {
      const uma = nomeDeEmpresaNormalizado(nome);
      assert.equal(nomeDeEmpresaNormalizado(uma), uma, nome);
    }
  });
});

describe('pareceDocumento', () => {
  it('reconhece CNPJ com e sem pontuação', () => {
    // É o pedido: com ou sem pontuação, tem de procurar certo.
    assert.equal(pareceDocumento('12.345.678/0001-90'), true);
    assert.equal(pareceDocumento('12345678000190'), true);
    assert.equal(pareceDocumento(' 12 345 678 0001 90 '), true);
  });

  it('reconhece CPF com e sem pontuação', () => {
    assert.equal(pareceDocumento('529.982.247-25'), true);
    assert.equal(pareceDocumento('52998224725'), true);
  });

  it('nome com número continua sendo nome', () => {
    assert.equal(pareceDocumento('Loja 24 Horas'), false);
    assert.equal(pareceDocumento('Alpha 2000 Comércio'), false);
  });

  it('contagem errada de dígitos não é documento', () => {
    assert.equal(pareceDocumento('1234567'), false);
    assert.equal(pareceDocumento('123456789012345'), false);
  });
});

describe('soDigitos', () => {
  it('a pontuação some, e o mesmo número sai dos dois jeitos', () => {
    assert.equal(soDigitos('12.345.678/0001-90'), '12345678000190');
    assert.equal(soDigitos('12345678000190'), '12345678000190');
    assert.equal(soDigitos('12.345.678/0001-90'), soDigitos('12345678000190'));
  });
});

describe('documentoInvalido', () => {
  it('aceita CNPJ e CPF com dígito verificador certo', () => {
    assert.equal(documentoInvalido('11.222.333/0001-81'), null);
    assert.equal(documentoInvalido('11222333000181'), null);
    assert.equal(documentoInvalido('529.982.247-25'), null);
  });

  it('recusa dígito verificador errado, que é o erro de digitação', () => {
    assert.match(documentoInvalido('11.222.333/0001-82') ?? '', /dígito/);
    assert.match(documentoInvalido('529.982.247-26') ?? '', /dígito/);
  });

  it('recusa a sequência repetida, que passa no módulo 11 por acaso', () => {
    assert.ok(documentoInvalido('11111111111111'));
    assert.ok(documentoInvalido('11111111111'));
  });

  it('recusa tamanho que não é de documento', () => {
    assert.match(documentoInvalido('123') ?? '', /14 dígitos/);
  });
});

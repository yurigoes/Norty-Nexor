import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { contemExpressao, expressoesEncontradas, normalizar, tokenizar } from '../src/texto.ts';

describe('normalizar', () => {
  test('remove acentos e baixa a caixa', () => {
    assert.equal(normalizar('AQUISIÇÃO DE MATERIAL'), 'aquisicao de material');
  });

  test('trata hífen e barra como separador de palavra', () => {
    assert.equal(normalizar('micro-ondas e material/insumo'), 'micro ondas e material insumo');
  });

  test('colapsa espaços e pontuação repetida', () => {
    assert.equal(normalizar('  CAFÉ,,,  AÇÚCAR...  '), 'cafe acucar');
  });

  test('sobrevive a texto vazio', () => {
    assert.equal(normalizar('   '), '');
    assert.deepEqual(tokenizar('   '), []);
  });
});

describe('contemExpressao', () => {
  test('casa palavra inteira independente de acento', () => {
    const tokens = tokenizar('AQUISICAO DE MATERIAL DE INFORMATICA PARA A SECRETARIA');
    assert.ok(contemExpressao(tokens, 'informática'));
  });

  test('casa expressão de várias palavras em sequência', () => {
    const tokens = tokenizar('Contratação de material de escritório diverso');
    assert.ok(contemExpressao(tokens, 'material de escritório'));
  });

  test('não casa palavras da expressão fora de ordem', () => {
    const tokens = tokenizar('escritório com material diverso');
    assert.equal(contemExpressao(tokens, 'material de escritório'), false);
  });

  /**
   * O caso que motivou o casamento por token. "TI" como substring
   * aparece em dezenas de palavras comuns do texto administrativo,
   * e cada falso positivo custa confiança na lista inteira.
   */
  test('sigla curta não casa dentro de outra palavra', () => {
    const tokens = tokenizar('Aquisição de gratificação para o partido no sentido oposto');
    assert.equal(contemExpressao(tokens, 'TI'), false);
  });

  test('sigla curta casa quando está isolada', () => {
    const tokens = tokenizar('Contratação de serviços de TI para a prefeitura');
    assert.ok(contemExpressao(tokens, 'TI'));
  });

  test('expressão maior que o texto não casa', () => {
    assert.equal(contemExpressao(tokenizar('café'), 'material de escritório'), false);
  });

  test('expressão vazia nunca casa', () => {
    assert.equal(contemExpressao(tokenizar('qualquer coisa'), '   '), false);
  });
});

describe('expressoesEncontradas', () => {
  test('devolve só as que bateram, sem repetir', () => {
    const achadas = expressoesEncontradas('Aquisição de notebook e monitor para a escola', [
      'notebook',
      'monitor',
      'impressora',
      'notebook',
    ]);
    assert.deepEqual(achadas, ['notebook', 'monitor']);
  });

  test('lista vazia devolve vazio', () => {
    assert.deepEqual(expressoesEncontradas('qualquer objeto', []), []);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { descreverPrazo, horasAte, paraFormatoPncp, somarDias, urgencia } from '../src/prazos.ts';

const AGORA = new Date('2026-08-27T12:00:00.000Z');

describe('horasAte', () => {
  test('conta horas até o encerramento', () => {
    assert.equal(horasAte('2026-08-28T12:00:00.000Z', AGORA), 24);
  });

  test('devolve negativo para prazo vencido', () => {
    assert.ok((horasAte('2026-08-26T12:00:00.000Z', AGORA) ?? 0) < 0);
  });

  test('data ausente é null, não zero', () => {
    assert.equal(horasAte(null, AGORA), null);
  });

  test('data ilegível é null em vez de NaN', () => {
    assert.equal(horasAte('data invalida', AGORA), null);
  });
});

describe('urgencia', () => {
  test('prazo vencido é encerrado', () => {
    assert.equal(urgencia(-1, 3), 'encerrado');
  });

  test('acima do tempo de preparo é confortável', () => {
    assert.equal(urgencia(100, 3), 'confortavel');
  });

  test('abaixo do tempo de preparo é apertado', () => {
    assert.equal(urgencia(60, 3), 'apertado');
  });

  test('abaixo da metade do tempo de preparo é crítico', () => {
    assert.equal(urgencia(20, 3), 'critico');
  });

  /** O limiar acompanha o perfil: quem precisa de mais dias entra em crítico antes. */
  test('o limiar depende do tempo de preparo declarado', () => {
    assert.equal(urgencia(60, 2), 'confortavel');
    assert.equal(urgencia(60, 7), 'critico');
  });

  test('prazo não publicado é tratado como apertado', () => {
    assert.equal(urgencia(null, 3), 'apertado');
  });
});

describe('descreverPrazo', () => {
  test('menos de um dia aparece em horas', () => {
    assert.equal(descreverPrazo(10), '10 h restantes');
  });

  test('singular e plural de dias', () => {
    assert.equal(descreverPrazo(30), '1 dia restante');
    assert.equal(descreverPrazo(72), '3 dias restantes');
  });

  test('sem data publicada tem texto próprio', () => {
    assert.equal(descreverPrazo(null), 'prazo não publicado');
  });
});

describe('formato de data do PNCP', () => {
  test('gera AAAAMMDD com zero à esquerda', () => {
    assert.equal(paraFormatoPncp(new Date(2026, 0, 5)), '20260105');
  });

  test('somarDias atravessa a virada de mês', () => {
    assert.equal(paraFormatoPncp(somarDias(new Date(2026, 0, 30), 5)), '20260204');
  });

  test('somarDias não muta a data original', () => {
    const original = new Date(2026, 0, 30);
    somarDias(original, 5);
    assert.equal(original.getDate(), 30);
  });
});

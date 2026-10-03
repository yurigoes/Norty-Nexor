import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  desenharPainel,
  numeroDaPorta,
  portasDoPainel,
  type GradeDoPainel,
  type ZonaDoPainel,
} from './painel';

/**
 * O estêncil do painel.
 *
 * Dois erros aqui mandam o técnico ao lugar errado com a mesma confiança
 * com que o desenho certo o manda ao certo: numerar por linha o painel
 * que numera por coluna, e ler o nome da porta pelo número errado dele.
 * É o que estes testes cercam.
 */

const SWITCH_24: GradeDoPainel = {
  columns: 12,
  rows: 2,
  numbering: 'COLUNA',
  startAt: 1,
  slots: null,
};

/** O número de cada posição, na ordem em que a numeração as visita. */
const numeros = (grade: GradeDoPainel, zonas: ZonaDoPainel[] = []) =>
  desenharPainel(grade, zonas).map((c) => c.numero);

describe('a grade do painel', () => {
  it('por coluna: ímpares em cima, pares embaixo — é o switch de duas fileiras', () => {
    const celulas = desenharPainel(SWITCH_24, []);

    assert.equal(celulas.length, 24);
    assert.deepEqual(celulas[0], {
      column: 1,
      row: 1,
      kind: 'PORTA',
      numero: 1,
      label: null,
      daZona: false,
    });
    assert.deepEqual(celulas[1], {
      column: 1,
      row: 2,
      kind: 'PORTA',
      numero: 2,
      label: null,
      daZona: false,
    });

    // A 13 é a sétima de cima, e não a primeira de baixo.
    const treze = celulas.find((c) => c.numero === 13);
    assert.deepEqual(treze && { column: treze.column, row: treze.row }, { column: 7, row: 1 });

    const cima = celulas.filter((c) => c.row === 1).map((c) => c.numero);
    assert.ok(cima.every((n) => n! % 2 === 1));
  });

  it('por linha: a fileira de cima inteira, e aí a 13 é a primeira de baixo', () => {
    const celulas = desenharPainel({ ...SWITCH_24, numbering: 'LINHA' }, []);

    assert.deepEqual(
      celulas.filter((c) => c.row === 1).map((c) => c.numero),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );

    const treze = celulas.find((c) => c.numero === 13);
    assert.deepEqual(treze && { column: treze.column, row: treze.row }, { column: 1, row: 2 });
  });

  it('começa onde o equipamento começa: `eth0` quer painel de 0', () => {
    assert.deepEqual(numeros({ columns: 4, rows: 1, numbering: 'LINHA', startAt: 0, slots: null }), [
      0, 1, 2, 3,
    ]);
  });

  it('a grade maior que o painel deixa posição vazia, e não inventa porta', () => {
    const dez = { columns: 12, rows: 1, numbering: 'LINHA' as const, startAt: 1, slots: 10 };
    const celulas = desenharPainel(dez, []);

    assert.deepEqual(
      celulas.map((c) => c.numero),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null, null],
    );
    assert.deepEqual(
      celulas.slice(10).map((c) => c.kind),
      ['VAZIO', 'VAZIO'],
    );
    assert.equal(portasDoPainel(dez, []), 10);
  });
});

describe('a zona, que é a exceção', () => {
  const CONSOLE: ZonaDoPainel = {
    column: 12,
    row: 2,
    kind: 'CONSOLE',
    label: 'Console',
    portNumber: null,
  };

  it('manda sobre a célula da grade', () => {
    const celulas = desenharPainel(SWITCH_24, [CONSOLE]);
    const canto = celulas.find((c) => c.column === 12 && c.row === 2);

    assert.deepEqual(canto, {
      column: 12,
      row: 2,
      kind: 'CONSOLE',
      numero: null,
      label: 'Console',
      daZona: true,
    });
  });

  /**
   * O ponto que mais importa, e o que mais custa quando sai errado: a
   * zona **não** consome número. Se consumisse, a porta de console no
   * meio do painel empurraria a numeração inteira e o desenho passaria a
   * discordar do que está escrito no equipamento.
   */
  it('não consome número da grade: a contagem segue de 11 para 12, sem buraco', () => {
    // No meio do painel, de propósito: a zona no canto não provaria nada,
    // porque depois dela não há número nenhum para sair do lugar.
    const console6: ZonaDoPainel = { ...CONSOLE, column: 6, row: 2 };
    const celulas = desenharPainel(SWITCH_24, [console6]);
    const comNumero = celulas.filter((c) => c.numero !== null).map((c) => c.numero);

    // Vinte e três portas, numeradas seguidas: o equipamento com uma
    // posição de console também não tem furo na numeração dele.
    assert.equal(comNumero.length, 23);
    assert.deepEqual(
      comNumero,
      Array.from({ length: 23 }, (_, i) => i + 1),
    );

    // E a 12 passou a ser a sétima de cima, que é onde ela fica de verdade.
    const doze = celulas.find((c) => c.numero === 12);
    assert.deepEqual(doze && { column: doze.column, row: doze.row }, { column: 7, row: 1 });

    assert.equal(portasDoPainel(SWITCH_24, [console6]), 23);
  });

  it('a zona que é porta carrega o número que lhe deram', () => {
    const sfp: ZonaDoPainel = {
      column: 1,
      row: 1,
      kind: 'PORTA',
      label: 'SFP+ 1',
      portNumber: 49,
    };

    const celulas = desenharPainel({ ...SWITCH_24, columns: 2 }, [sfp]);

    assert.deepEqual(
      celulas.map((c) => c.numero),
      [49, 1, 2, 3],
    );
    assert.equal(celulas[0]?.label, 'SFP+ 1');
  });
});

describe('o número físico da porta, pelo nome que o equipamento dá', () => {
  it('é o que vem depois da última barra', () => {
    assert.equal(numeroDaPorta('GigabitEthernet1/0/24'), 24);
    assert.equal(numeroDaPorta('Gi1/0/7'), 7);
    assert.equal(numeroDaPorta('1/1/c2/3'), 3);
  });

  it('subinterface não é porta: `Gi0/1.100` é a porta 1', () => {
    assert.equal(numeroDaPorta('Gi0/1.100'), 1);
    assert.equal(numeroDaPorta('1.4094'), 1);
  });

  it('mas um ponto que não é subinterface fica de fora da regra', () => {
    assert.equal(numeroDaPorta('2.5GbE port 3'), 3);
  });

  it('aceita o nome do sistema e o nome de gente', () => {
    assert.equal(numeroDaPorta('eth0'), 0);
    assert.equal(numeroDaPorta('Porta 7'), 7);
    assert.equal(numeroDaPorta('Te1'), 1);
    assert.equal(numeroDaPorta('  12  '), 12);
  });

  it('nome sem número é nulo, e não a porta 0', () => {
    assert.equal(numeroDaPorta('Ethernet'), null);
    assert.equal(numeroDaPorta('Wi-Fi'), null);
    assert.equal(numeroDaPorta(''), null);
    assert.equal(numeroDaPorta('   '), null);
  });

  it('número que não cabe em inteiro seguro é nulo', () => {
    assert.equal(numeroDaPorta('eth99999999999999999999'), null);
  });
});

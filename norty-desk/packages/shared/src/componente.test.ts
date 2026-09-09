import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ATRIBUTOS_DO_COMPONENTE,
  COMPONENT_KINDS,
  descreverComponente,
  emCapacidade,
  resumoDoHardware,
  validarAtributos,
  validarSchema,
} from './domain';

/**
 * Componente do ativo.
 *
 * O que se prova aqui: a ficha de cada tipo é um formulário bem
 * formado — se não fosse, o defeito só apareceria quando alguém
 * cadastrasse aquele tipo; a soma da máquina é a pergunta que o GLPI
 * não responde sem exportar; e a frase que descreve o componente sai
 * igual na tela e no relatório porque sai da mesma função.
 */

describe('a ficha de cada tipo', () => {
  it('é um formulário bem formado, para todos os dezessete tipos', () => {
    for (const kind of COMPONENT_KINDS) {
      const erros = validarSchema({ fields: [...ATRIBUTOS_DO_COMPONENTE[kind]] });
      assert.deepEqual(erros, [], `ficha de ${kind}: ${JSON.stringify(erros)}`);
    }
  });

  it('recusa campo que não está na ficha do tipo', () => {
    const erros = validarAtributos('MEMORIA', { capacidade: 8192, cor: 'verde' });
    assert.equal(erros.length, 1);
    assert.equal(erros[0].key, 'cor');
  });

  it('cobra o obrigatório e o tipo do valor', () => {
    assert.deepEqual(validarAtributos('MEMORIA', {}), [
      { key: 'capacidade', mensagem: '"Capacidade" é obrigatório.' },
    ]);

    const erros = validarAtributos('MEMORIA', { capacidade: '8192' });
    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /espera um número/);
  });

  it('recusa opção fora da lista', () => {
    const erros = validarAtributos('DISCO', { capacidade: 512, tecnologia: 'disquete' });
    assert.equal(erros.length, 1);
    assert.match(erros[0].mensagem, /não é uma opção/);
  });

  it('não guarda PIN nem PUK do chip — inventário não é cofre', () => {
    const chaves = ATRIBUTOS_DO_COMPONENTE.SIMCARD.map((c) => c.key);
    assert.ok(!chaves.includes('pin'));
    assert.ok(!chaves.includes('puk'));
  });
});

describe('emCapacidade', () => {
  it('sobe de MB para GB e TB, com vírgula decimal', () => {
    assert.equal(emCapacidade(512), '512 MB');
    assert.equal(emCapacidade(1024), '1 GB');
    assert.equal(emCapacidade(8192), '8 GB');
    assert.equal(emCapacidade(1024 * 1024), '1 TB');
    assert.equal(emCapacidade(1536 * 1024), '1,5 TB');
  });
});

describe('descreverComponente', () => {
  it('escreve a memória como se lê', () => {
    assert.equal(
      descreverComponente({
        kind: 'MEMORIA',
        name: 'Kingston',
        attributes: { capacidade: 16384, tecnologia: 'DDR4', frequencia: 2666 },
      }),
      '16 GB DDR4 · 2666 MHz',
    );
  });

  it('trata a capacidade do disco em GB, não em MB', () => {
    assert.equal(
      descreverComponente({
        kind: 'DISCO',
        name: 'Samsung 980',
        attributes: { capacidade: 512, tecnologia: 'NVMe', interface: 'NVMe' },
      }),
      // A interface não se repete quando é igual à tecnologia.
      '512 GB NVMe',
    );
  });

  it('converte a frequência do processador para GHz quando passa de mil', () => {
    assert.equal(
      descreverComponente({
        kind: 'PROCESSADOR',
        name: 'i5-10500',
        attributes: { nucleos: 6, frequencia: 3100 },
      }),
      '6 núcleos · 3,1 GHz',
    );
  });

  it('sem frase própria, a ficha vira a frase — só o que está preenchido', () => {
    assert.equal(
      descreverComponente({
        kind: 'PLACA_DE_REDE',
        name: 'Intel I219',
        attributes: { velocidade: 1000, sem_fio: false },
      }),
      '1000 Mbps',
    );
  });

  it('sem nenhum atributo, cai no nome — nunca numa linha vazia', () => {
    assert.equal(
      descreverComponente({ kind: 'OUTRO', name: 'Leitor biométrico', attributes: {} }),
      'Leitor biométrico',
    );
  });
});

describe('resumoDoHardware', () => {
  it('soma os pentes e os discos da máquina', () => {
    const resumo = resumoDoHardware([
      { kind: 'MEMORIA', name: 'A', attributes: { capacidade: 8192 } },
      { kind: 'MEMORIA', name: 'B', attributes: { capacidade: 8192 } },
      { kind: 'DISCO', name: 'C', attributes: { capacidade: 512 } },
      { kind: 'DISCO', name: 'D', attributes: { capacidade: 1024 } },
      { kind: 'PROCESSADOR', name: 'E', attributes: { nucleos: 6 } },
    ]);

    assert.equal(emCapacidade(resumo.memoriaMB), '16 GB');
    assert.equal(emCapacidade(resumo.armazenamentoMB), '1,5 TB');
    assert.equal(resumo.nucleos, 6);
    assert.equal(resumo.total, 5);
  });

  it('ignora o que não tem número, sem virar NaN', () => {
    const resumo = resumoDoHardware([
      { kind: 'MEMORIA', name: 'A', attributes: {} },
      { kind: 'FONTE', name: 'B', attributes: { potencia: 500 } },
    ]);

    assert.equal(resumo.memoriaMB, 0);
    assert.equal(resumo.armazenamentoMB, 0);
    assert.equal(resumo.total, 2);
  });
});

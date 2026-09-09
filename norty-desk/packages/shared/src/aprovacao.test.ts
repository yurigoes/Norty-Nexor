import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { desfechoDaAprovacao, estadoDaEtapa, faltamParaOQuorum } from './aprovacao';

describe('estado de uma etapa', () => {
  it('um validador, quórum de um: a decisão dele é a da etapa', () => {
    assert.equal(estadoDaEtapa(['AGUARDANDO'], 1), 'AGUARDANDO');
    assert.equal(estadoDaEtapa(['APROVADO'], 1), 'APROVADA');
    assert.equal(estadoDaEtapa(['RECUSADO'], 1), 'RECUSADA');
  });

  it('quórum atingido encerra, mesmo com gente sem responder', () => {
    assert.equal(
      estadoDaEtapa(['APROVADO', 'APROVADO', 'AGUARDANDO'], 2),
      'APROVADA',
      'com dois "sim" exigidos e dois dados, não se espera o terceiro',
    );
  });

  it('uma recusa não derruba a etapa se o quórum ainda cabe', () => {
    // Três de cinco. Uma recusa deixa quatro respostas possíveis: cabe.
    assert.equal(
      estadoDaEtapa(['RECUSADO', 'AGUARDANDO', 'AGUARDANDO', 'AGUARDANDO', 'AGUARDANDO'], 3),
      'AGUARDANDO',
      '"três de cinco" quer dizer que duas recusas ainda passam',
    );
  });

  it('recusa que torna o quórum impossível encerra a etapa na hora', () => {
    // Três de cinco: com três recusas, os três "sim" não virão mais.
    assert.equal(
      estadoDaEtapa(['RECUSADO', 'RECUSADO', 'RECUSADO', 'AGUARDANDO', 'AGUARDANDO'], 3),
      'RECUSADA',
      'esperar as duas respostas que faltam seria deixar o chamado parado para sempre',
    );
  });

  it('quórum maior que o número de validadores não trava a etapa', () => {
    // Configuração errada: quatro exigidos, dois validadores. Sem o
    // limite, nenhuma aprovação passaria nunca.
    assert.equal(estadoDaEtapa(['APROVADO', 'APROVADO'], 4), 'APROVADA');
  });

  it('quórum zero ou negativo vale um', () => {
    assert.equal(estadoDaEtapa(['APROVADO'], 0), 'APROVADA');
    assert.equal(estadoDaEtapa(['AGUARDANDO'], -3), 'AGUARDANDO');
  });

  it('quantos "sim" ainda faltam', () => {
    assert.equal(faltamParaOQuorum(['AGUARDANDO', 'AGUARDANDO', 'AGUARDANDO'], 2), 2);
    assert.equal(faltamParaOQuorum(['APROVADO', 'AGUARDANDO', 'AGUARDANDO'], 2), 1);
    assert.equal(faltamParaOQuorum(['APROVADO', 'APROVADO', 'AGUARDANDO'], 2), 0);
  });
});

describe('desfecho do conjunto de etapas', () => {
  it('a segunda etapa só conta depois da primeira passar', () => {
    const r = desfechoDaAprovacao([
      { step: 1, quorum: 1, decisoes: ['AGUARDANDO'] },
      { step: 2, quorum: 1, decisoes: ['APROVADO'] },
    ]);

    assert.equal(r.estado, 'AGUARDANDO');
    assert.equal(r.etapaAtual, 1, 'o diretor ter aprovado antes não adianta o gerente');
  });

  it('todas aprovadas aprova o conjunto', () => {
    const r = desfechoDaAprovacao([
      { step: 1, quorum: 1, decisoes: ['APROVADO'] },
      { step: 2, quorum: 2, decisoes: ['APROVADO', 'APROVADO', 'AGUARDANDO'] },
    ]);

    assert.equal(r.estado, 'APROVADA');
    assert.equal(r.etapaAtual, null);
  });

  it('recusa em qualquer etapa encerra o conjunto', () => {
    const r = desfechoDaAprovacao([
      { step: 1, quorum: 1, decisoes: ['APROVADO'] },
      { step: 2, quorum: 1, decisoes: ['RECUSADO'] },
      { step: 3, quorum: 1, decisoes: ['AGUARDANDO'] },
    ]);

    assert.equal(r.estado, 'RECUSADA');
    assert.equal(r.etapaAtual, 2);
  });

  it('a ordem das etapas não depende da ordem da lista', () => {
    const r = desfechoDaAprovacao([
      { step: 2, quorum: 1, decisoes: ['APROVADO'] },
      { step: 1, quorum: 1, decisoes: ['RECUSADO'] },
    ]);

    assert.equal(r.etapaAtual, 1, 'a etapa 1 é a que decide, mesmo vindo depois na lista');
  });

  it('sem etapa nenhuma não há aprovação a declarar', () => {
    assert.deepEqual(desfechoDaAprovacao([]), { estado: 'AGUARDANDO', etapaAtual: null });
  });
});

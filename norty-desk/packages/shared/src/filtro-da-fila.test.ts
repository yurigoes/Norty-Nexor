import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  camposUsados,
  descreverFiltro,
  filtroParaParametros,
  parametrosParaFiltro,
  type FiltroSalvavel,
} from './domain';

/**
 * O filtro da fila e a busca salva.
 *
 * O que se prova aqui é a ida e a volta: o filtro vira URL, a URL vira
 * filtro, e os dois têm de fechar. É o par que a busca salva depende —
 * ela grava o que a fila lê, e se as duas formas divergirem a busca
 * salva abre uma fila diferente da que a pessoa salvou.
 */

describe('o filtro na URL', () => {
  it('volta igual ao que foi', () => {
    const filtro: FiltroSalvavel = {
      status: ['NOVO', 'ATRIBUIDO'],
      type: 'INCIDENTE',
      priority: [4, 5],
      channel: ['EMAIL', 'WHATSAPP'],
      categoryId: '11111111-1111-1111-1111-111111111111',
      assignedTeamId: '22222222-2222-2222-2222-222222222222',
      assignedUserId: 'me',
      requesterId: '33333333-3333-3333-3333-333333333333',
      semAtribuicao: true,
      slaBreached: true,
      slaDueBefore: '2026-10-01T00:00:00.000Z',
      q: 'impressora',
    };

    assert.deepEqual(parametrosParaFiltro(filtroParaParametros(filtro)), filtro);
  });

  it('lê a prioridade como número, não como texto', () => {
    // A URL só tem texto. Sem esta conversão o filtro chegaria à API com
    // `["4"]` onde ela espera `[4]`, e o `@IsInt({ each: true })` recusaria
    // a busca salva que a própria tela acabou de gravar.
    const filtro = parametrosParaFiltro(new URLSearchParams('priority=4,5'));

    assert.deepEqual(filtro.priority, [4, 5]);
  });

  it('não escreve o que não é filtro', () => {
    // URL com `slaBreached=false` diz a mesma coisa que URL sem o campo,
    // com mais ruído — e as duas têm de dar a mesma chave de cache.
    const parametros = filtroParaParametros({
      semAtribuicao: false,
      slaBreached: false,
      status: [],
      q: '',
    });

    assert.equal(parametros.toString(), '');
  });

  it('ignora o cursor, que é onde "salvar esta busca" erraria', () => {
    // A pessoa salva a busca estando na terceira página. Guardar o
    // cursor faria a busca salva abrir numa página que na semana seguinte
    // não existe mais.
    const filtro = parametrosParaFiltro(
      new URLSearchParams('status=NOVO&cursor=abc123&limit=50&coisa=qualquer'),
    );

    assert.deepEqual(filtro, { status: ['NOVO'] });
    assert.ok(!('cursor' in filtro));
    assert.ok(!('limit' in filtro));
  });

  it('conta quantos campos o filtro usa', () => {
    assert.equal(camposUsados({}), 0);
    assert.equal(camposUsados({ semAtribuicao: false }), 0);
    assert.equal(camposUsados({ status: ['NOVO'], q: 'x' }), 2);
  });
});

describe('o filtro dito em português', () => {
  it('diz que não há filtro quando não há', () => {
    assert.equal(descreverFiltro({}), 'A fila inteira, sem filtro');
  });

  it('usa o rótulo do status, não o nome da constante', () => {
    const frase = descreverFiltro({ status: ['EM_APROVACAO'] });

    assert.equal(frase, 'Em aprovação');
    assert.ok(!frase.includes('EM_APROVACAO'));
  });

  it('separa alternativas com "ou" e campos com ponto', () => {
    const frase = descreverFiltro({ status: ['NOVO', 'PENDENTE'], priority: [5] });

    assert.equal(frase, 'Novo ou Pendente · prioridade Muito alta');
  });

  it('escreve "atribuídos a mim" em vez do id de ninguém', () => {
    // `me` é o que torna a busca portátil: a mesma busca salva serve a
    // quem a copiou, apontando para quem a está usando.
    assert.equal(descreverFiltro({ assignedUserId: 'me' }), 'atribuídos a mim');
  });

  it('resolve o nome do que só o banco sabe', () => {
    const frase = descreverFiltro(
      {
        categoryId: 'cat-1',
        assignedTeamId: 'time-1',
        requesterId: 'pessoa-1',
      },
      (campo, id) => {
        const nomes: Record<string, string> = {
          'categoria:cat-1': 'Rede',
          'time:time-1': 'Campo',
          'pessoa:pessoa-1': 'Marina',
        };
        return nomes[`${campo}:${id}`];
      },
    );

    assert.equal(frase, 'categoria Rede · time Campo · abertos por Marina');
  });

  it('não mostra id quando não sabe o nome', () => {
    // Id numa frase não é frase. Sem nome, o filtro diz que há um
    // escolhido — e a tela que sabe o nome o mostra.
    const frase = descreverFiltro({ categoryId: '11111111-1111-1111-1111-111111111111' });

    assert.equal(frase, 'categoria escolhida');
    assert.ok(!frase.includes('1111'));
  });

  it('corta a hora do vencimento, que o painel não escolheu', () => {
    const frase = descreverFiltro({ slaDueBefore: '2026-10-01T13:45:00.000Z' });

    assert.equal(frase, 'vencendo antes de 2026-10-01');
  });

  it('descreve todos os campos, para nenhum entrar sem frase', () => {
    // A garantia que importa no tempo: acrescentar campo ao filtro e
    // esquecer a frase faria o painel mostrar um filtro ativo que a aba
    // da busca salva não menciona.
    const cheio: FiltroSalvavel = {
      status: ['NOVO'],
      type: 'REQUISICAO',
      priority: [3],
      channel: ['WEB'],
      categoryId: 'c',
      assignedTeamId: 't',
      assignedUserId: 'u',
      requesterId: 'r',
      semAtribuicao: true,
      slaBreached: true,
      slaDueBefore: '2026-10-01',
      q: 'termo',
    };

    const frase = descreverFiltro(cheio);

    assert.equal(frase.split(' · ').length, 12, frase);
  });
});

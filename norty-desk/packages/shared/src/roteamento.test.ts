import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { destinoDoChamado } from './domain';

/**
 * Para quem vai o chamado.
 *
 * O que se prova aqui é a ordem em que duas configurações discordam.
 * Errar isso não quebra nada visivelmente — o chamado simplesmente cai
 * na fila errada, e quem configurou jura que configurou certo.
 */

const nada = { assigneeId: null, teamId: null };
const time = (id: string) => ({ assigneeId: null, teamId: id });
const pessoa = (id: string) => ({ assigneeId: id, teamId: null });

describe('destino do chamado', () => {
  it('sem nenhuma configuração, o chamado nasce sem dono', () => {
    assert.deepEqual(destinoDoChamado(null, null), nada);
    assert.deepEqual(destinoDoChamado(nada, nada), nada);
  });

  it('só a categoria configurada: vale a categoria', () => {
    assert.deepEqual(destinoDoChamado(null, time('infra')), time('infra'));
    assert.deepEqual(destinoDoChamado(nada, pessoa('ana')), pessoa('ana'));
  });

  it('só o modelo configurado: vale o modelo', () => {
    assert.deepEqual(destinoDoChamado(time('suporte'), null), time('suporte'));
  });

  it('a pessoa vence o time dentro da mesma fonte', () => {
    assert.deepEqual(
      destinoDoChamado(null, { assigneeId: 'ana', teamId: 'infra' }),
      pessoa('ana'),
    );
  });

  it('o modelo escolhido vence a categoria', () => {
    assert.deepEqual(destinoDoChamado(time('suporte'), time('infra')), time('suporte'));
  });

  /**
   * O caso que separa "vence inteira" de "vence campo a campo".
   *
   * Campo a campo, a pessoa da categoria sobreviveria e o chamado iria
   * para a Ana em vez do Suporte — ignorando a decisão de quem montou
   * o modelo justamente para mandar este tipo de chamado a outro lugar.
   */
  it('o time do modelo vence a pessoa da categoria', () => {
    assert.deepEqual(destinoDoChamado(time('suporte'), pessoa('ana')), time('suporte'));
  });

  it('modelo sem destino não anula a categoria', () => {
    assert.deepEqual(destinoDoChamado(nada, time('infra')), time('infra'));
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DURACAO_MAXIMA_MINUTOS,
  DURACAO_MINIMA_MINUTOS,
  agendamentoInvalido,
  fimDoAtendimento,
  vencimentoComAtendimento,
} from './domain';

const AGORA = new Date('2026-03-10T12:00:00.000Z');
const MINUTO = 60_000;
const daqui = (ms: number) => new Date(AGORA.getTime() + ms);

describe('agendamentoInvalido', () => {
  it('aceita a visita de amanhã, de uma hora', () => {
    assert.equal(agendamentoInvalido(daqui(24 * 60 * MINUTO), 60, AGORA), null);
  });

  it('recusa data no passado', () => {
    assert.match(agendamentoInvalido(daqui(-MINUTO), 60, AGORA) ?? '', /para a frente/);
  });

  it('recusa o próprio instante: marcar é para a frente', () => {
    assert.ok(agendamentoInvalido(AGORA, 60, AGORA));
  });

  it('recusa data inválida em vez de deixar NaN correr solto', () => {
    assert.match(agendamentoInvalido(new Date('não é data'), 60, AGORA) ?? '', /inválida/);
  });

  it('recusa horizonte maior que um ano', () => {
    assert.ok(agendamentoInvalido(daqui(400 * 24 * 60 * MINUTO), 60, AGORA));
    assert.equal(agendamentoInvalido(daqui(300 * 24 * 60 * MINUTO), 60, AGORA), null);
  });

  it('exige duração inteira dentro dos limites', () => {
    const amanha = daqui(24 * 60 * MINUTO);
    assert.ok(agendamentoInvalido(amanha, DURACAO_MINIMA_MINUTOS - 1, AGORA));
    assert.ok(agendamentoInvalido(amanha, DURACAO_MAXIMA_MINUTOS + 1, AGORA));
    assert.ok(agendamentoInvalido(amanha, 30.5, AGORA));
    assert.equal(agendamentoInvalido(amanha, DURACAO_MINIMA_MINUTOS, AGORA), null);
    assert.equal(agendamentoInvalido(amanha, DURACAO_MAXIMA_MINUTOS, AGORA), null);
  });
});

describe('vencimentoComAtendimento', () => {
  it('não estica quando a visita cabe no prazo', () => {
    const vence = daqui(10 * 24 * 60 * MINUTO);
    assert.equal(vencimentoComAtendimento(vence, daqui(24 * 60 * MINUTO), 60), null);
  });

  it('estica até o fim da visita quando ela passa do prazo', () => {
    const vence = daqui(60 * MINUTO);
    const quando = daqui(24 * 60 * MINUTO);
    const novo = vencimentoComAtendimento(vence, quando, 90);
    assert.equal(novo?.toISOString(), fimDoAtendimento(quando, 90).toISOString());
  });

  it('a visita que termina exatamente no prazo não estica', () => {
    const quando = daqui(24 * 60 * MINUTO);
    const vence = fimDoAtendimento(quando, 60);
    assert.equal(vencimentoComAtendimento(vence, quando, 60), null);
  });

  it('a visita que começa antes do prazo mas termina depois estica', () => {
    const quando = daqui(24 * 60 * MINUTO);
    const vence = daqui(24 * 60 * MINUTO + 30 * MINUTO);
    const novo = vencimentoComAtendimento(vence, quando, 60);
    assert.equal(novo?.toISOString(), fimDoAtendimento(quando, 60).toISOString());
  });
});

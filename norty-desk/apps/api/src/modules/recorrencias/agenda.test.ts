import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Recorrencia } from '@norty-desk/shared';

import { proximaOcorrencia } from './agenda';

/**
 * A próxima ocorrência.
 *
 * O que se prova aqui e em nenhum outro lugar: a agenda descreve o
 * calendário e não o intervalo — e por isso não derrapa no horário de
 * verão nem escorrega do dia 31 para o dia 1º, que são exatamente as
 * duas coisas que a periodicidade em segundos do GLPI faz.
 */

const SP = 'America/Sao_Paulo';

/** O instante local em São Paulo, escrito como se lê no relógio de lá. */
function emSP(texto: string): Date {
  return new Date(`${texto}-03:00`);
}

describe('recorrência diária', () => {
  const todo_dia: Recorrencia = { tipo: 'DIARIA', hora: 8, minuto: 30 };

  it('cai no mesmo dia quando a hora ainda não passou', () => {
    const proxima = proximaOcorrencia(todo_dia, SP, emSP('2026-03-10T06:00:00'));
    assert.equal(proxima?.toISOString(), emSP('2026-03-10T08:30:00').toISOString());
  });

  it('pula para o dia seguinte quando a hora já passou', () => {
    const proxima = proximaOcorrencia(todo_dia, SP, emSP('2026-03-10T08:30:00'));
    assert.equal(proxima?.toISOString(), emSP('2026-03-11T08:30:00').toISOString());
  });
});

describe('recorrência semanal', () => {
  // 2026-03-10 é uma terça-feira.
  const seg_e_qui: Recorrencia = {
    tipo: 'SEMANAL',
    diasDaSemana: [1, 4],
    hora: 9,
    minuto: 0,
  };

  it('acha a próxima quinta, e depois a segunda seguinte', () => {
    const quinta = proximaOcorrencia(seg_e_qui, SP, emSP('2026-03-10T10:00:00'));
    assert.equal(quinta?.toISOString(), emSP('2026-03-12T09:00:00').toISOString());

    const segunda = proximaOcorrencia(seg_e_qui, SP, quinta!);
    assert.equal(segunda?.toISOString(), emSP('2026-03-16T09:00:00').toISOString());
  });

  it('sem nenhum dia marcado, nunca dispara', () => {
    const nunca: Recorrencia = { tipo: 'SEMANAL', diasDaSemana: [], hora: 9, minuto: 0 };
    assert.equal(proximaOcorrencia(nunca, SP, emSP('2026-03-10T10:00:00')), null);
  });
});

describe('recorrência mensal', () => {
  const todo_dia_31: Recorrencia = { tipo: 'MENSAL', diaDoMes: 31, hora: 7, minuto: 0 };

  it('em fevereiro cai no último dia, em vez de sumir', () => {
    const fevereiro = proximaOcorrencia(todo_dia_31, SP, emSP('2026-02-01T00:00:00'));
    // 2026 não é bissexto: fevereiro termina no dia 28.
    assert.equal(fevereiro?.toISOString(), emSP('2026-02-28T07:00:00').toISOString());
  });

  it('em ano bissexto usa o dia 29', () => {
    const fevereiro = proximaOcorrencia(todo_dia_31, SP, emSP('2028-02-01T00:00:00'));
    assert.equal(fevereiro?.toISOString(), emSP('2028-02-29T07:00:00').toISOString());
  });

  it('não escorrega: março volta a ser o dia 31', () => {
    const marco = proximaOcorrencia(todo_dia_31, SP, emSP('2026-02-28T07:00:00'));
    assert.equal(marco?.toISOString(), emSP('2026-03-31T07:00:00').toISOString());
  });

  it('doze meses seguidos caem sempre no dia 1º, sem derrapar', () => {
    let cursor = emSP('2026-01-01T00:00:00');
    const dia_um: Recorrencia = { tipo: 'MENSAL', diaDoMes: 1, hora: 6, minuto: 0 };

    for (let i = 0; i < 12; i += 1) {
      const proxima = proximaOcorrencia(dia_um, SP, cursor);
      assert.ok(proxima, `ocorrência ${i} não encontrada`);
      const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: SP,
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
      }).formatToParts(proxima);
      assert.equal(partes.find((p) => p.type === 'day')?.value, '01');
      assert.equal(partes.find((p) => p.type === 'hour')?.value, '06');
      cursor = proxima;
    }
  });
});

describe('recorrência anual', () => {
  it('acha o mesmo dia do ano seguinte', () => {
    const inventario: Recorrencia = {
      tipo: 'ANUAL',
      mes: 12,
      diaDoMes: 20,
      hora: 10,
      minuto: 0,
    };

    const este = proximaOcorrencia(inventario, SP, emSP('2026-06-01T00:00:00'));
    assert.equal(este?.toISOString(), emSP('2026-12-20T10:00:00').toISOString());

    const proximo = proximaOcorrencia(inventario, SP, este!);
    assert.equal(
      new Intl.DateTimeFormat('pt-BR', { timeZone: SP, year: 'numeric' }).format(proximo!),
      '2027',
    );
  });
});

describe('vigência', () => {
  it('devolve null quando a próxima passaria do fim', () => {
    const diaria: Recorrencia = { tipo: 'DIARIA', hora: 8, minuto: 0 };
    const proxima = proximaOcorrencia(
      diaria,
      SP,
      emSP('2026-03-10T10:00:00'),
      emSP('2026-03-11T00:00:00'),
    );
    assert.equal(proxima, null);
  });
});

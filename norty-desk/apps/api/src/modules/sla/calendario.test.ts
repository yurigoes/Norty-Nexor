import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calcularVencimento, segundosDeExpediente, type Calendario } from './calendario';

/** Segunda a sexta, 9h às 18h, horário de São Paulo. */
const comercial: Calendario = {
  timezone: 'America/Sao_Paulo',
  segments: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 9 * 60,
    endMinute: 18 * 60,
  })),
  holidays: [],
};

/** UTC-3: 09:00 em São Paulo é 12:00Z. */
const em = (iso: string) => new Date(iso);

test('prazo que cabe no mesmo dia vence no mesmo dia', () => {
  // Quarta, 10/09/2026, 10:00 local (13:00Z) + 4h = 14:00 local (17:00Z)
  const venc = calcularVencimento(em('2026-09-09T13:00:00Z'), 4 * 3600, comercial);
  assert.equal(venc.toISOString(), '2026-09-09T17:00:00.000Z');
});

test('prazo transborda para o dia seguinte pulando a noite', () => {
  // Quarta 17:00 local (20:00Z) + 4h: sobra 1h no dia, 3h caem na quinta
  // a partir das 9h local (12:00Z) => 12:00 local = 15:00Z
  const venc = calcularVencimento(em('2026-09-09T20:00:00Z'), 4 * 3600, comercial);
  assert.equal(venc.toISOString(), '2026-09-10T15:00:00.000Z');
});

test('prazo aberto na sexta à tarde atravessa o fim de semana', () => {
  // Sexta 11/09/2026 17:00 local (20:00Z) + 4h => segunda 12:00 local (15:00Z)
  const venc = calcularVencimento(em('2026-09-11T20:00:00Z'), 4 * 3600, comercial);
  assert.equal(venc.toISOString(), '2026-09-14T15:00:00.000Z');
});

test('prazo iniciado fora do expediente começa a contar na abertura seguinte', () => {
  // Sábado 12/09 às 10:00 local + 1h => segunda 10:00 local (13:00Z)
  const venc = calcularVencimento(em('2026-09-12T13:00:00Z'), 3600, comercial);
  assert.equal(venc.toISOString(), '2026-09-14T13:00:00.000Z');
});

test('feriado não conta como expediente', () => {
  const comFeriado: Calendario = {
    ...comercial,
    // Independência: 7 de setembro, recorrente. Em 2026 cai numa segunda.
    holidays: [{ date: new Date(Date.UTC(2020, 8, 7)), isRecurring: true }],
  };
  // Sexta 04/09/2026 17:00 local + 4h: 1h na sexta, segunda 07/09 é
  // feriado, então 3h na terça 08/09 a partir das 9h => 12:00 local.
  const venc = calcularVencimento(em('2026-09-04T20:00:00Z'), 4 * 3600, comFeriado);
  assert.equal(venc.toISOString(), '2026-09-08T15:00:00.000Z');
});

test('calendário sem faixas é 24x7', () => {
  const plantao: Calendario = { timezone: 'America/Sao_Paulo', segments: [], holidays: [] };
  const venc = calcularVencimento(em('2026-09-12T13:00:00Z'), 4 * 3600, plantao);
  assert.equal(venc.toISOString(), '2026-09-12T17:00:00.000Z');
  assert.equal(calcularVencimento(em('2026-09-12T13:00:00Z'), 4 * 3600, null).toISOString(),
    '2026-09-12T17:00:00.000Z');
});

test('fim de semana inteiro em pendência desconta zero', () => {
  // Sexta 18:00 local (21:00Z) até segunda 09:00 local (12:00Z)
  const parado = segundosDeExpediente(
    em('2026-09-11T21:00:00Z'), em('2026-09-14T12:00:00Z'), comercial,
  );
  assert.equal(parado, 0);
});

test('pendência dentro do expediente conta o tempo real', () => {
  // Quarta 10:00 local até 15:00 local = 5h
  const parado = segundosDeExpediente(
    em('2026-09-09T13:00:00Z'), em('2026-09-09T18:00:00Z'), comercial,
  );
  assert.equal(parado, 5 * 3600);
});

test('pendência que atravessa a noite conta só o expediente', () => {
  // Quarta 17:00 local até quinta 10:00 local = 1h + 1h = 2h
  const parado = segundosDeExpediente(
    em('2026-09-09T20:00:00Z'), em('2026-09-10T13:00:00Z'), comercial,
  );
  assert.equal(parado, 2 * 3600);
});

test('um dia útil inteiro vale nove horas', () => {
  const parado = segundosDeExpediente(
    em('2026-09-09T00:00:00Z'), em('2026-09-10T00:00:00Z'), comercial,
  );
  assert.equal(parado, 9 * 3600);
});

test('calcular e descontar são consistentes entre si', () => {
  const inicio = em('2026-09-09T20:00:00Z');
  const venc = calcularVencimento(inicio, 4 * 3600, comercial);
  assert.equal(segundosDeExpediente(inicio, venc, comercial), 4 * 3600);
});

test('prazo impossível falha alto em vez de laçar para sempre', () => {
  const vazio: Calendario = {
    timezone: 'America/Sao_Paulo',
    // Faixa degenerada: existe, mas não tem duração.
    segments: [{ weekday: 1, startMinute: 600, endMinute: 600 }],
    holidays: [],
  };
  assert.throws(() => calcularVencimento(em('2026-09-09T13:00:00Z'), 3600, vazio), /agenda/);
});

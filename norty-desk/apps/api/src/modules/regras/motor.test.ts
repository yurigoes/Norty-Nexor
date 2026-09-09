import assert from 'node:assert/strict';
import { test } from 'node:test';

import { avaliarRegras, regraCasa, type RegraCompilada } from './motor';

const contexto = {
  assunto: 'Impressora do 3º andar não imprime',
  corpo: 'Luz laranja piscando desde ontem.',
  remetente: 'marina@cliente.com.br',
  canal: 'EMAIL' as const,
};

const regra = (
  nome: string,
  posicao: number,
  definicao: RegraCompilada['definicao'],
  pararAoCasar = false,
): RegraCompilada => ({ id: nome, nome, posicao, pararAoCasar, definicao });

test('casa por conteúdo, ignorando acento e caixa', () => {
  assert.ok(
    regraCasa(contexto, {
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'IMPRESSORA' }],
      actions: [],
    }),
  );

  assert.ok(
    regraCasa(
      { ...contexto, assunto: 'Impressora do 3o andar' },
      {
        match: 'E',
        criteria: [{ campo: 'assunto', operador: 'contem', valor: '3º' }],
        actions: [],
      },
    ) === false,
    'ordinal com e sem símbolo são textos diferentes; só o acento é ignorado',
  );
});

test('E exige todos os critérios; OU basta um', () => {
  const criterios = [
    { campo: 'assunto' as const, operador: 'contem' as const, valor: 'impressora' },
    { campo: 'corpo' as const, operador: 'contem' as const, valor: 'não existe aqui' },
  ];

  assert.equal(regraCasa(contexto, { match: 'E', criteria: criterios, actions: [] }), false);
  assert.equal(regraCasa(contexto, { match: 'OU', criteria: criterios, actions: [] }), true);
});

test('regra sem critério não casa com nada', () => {
  // Casaria com tudo, o que é sempre engano de quem escreveu — e
  // classificaria a fila inteira errado.
  assert.equal(regraCasa(contexto, { match: 'E', criteria: [], actions: [] }), false);
});

test('regex inválida não casa em vez de explodir', () => {
  assert.equal(
    regraCasa(contexto, {
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'regex', valor: '([a-z' }],
      actions: [],
    }),
    false,
  );
});

test('regex é sempre insensível a caixa', () => {
  assert.ok(
    regraCasa(contexto, {
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'regex', valor: 'IMPRESSORA' }],
      actions: [],
    }),
  );
});

test('a regra posterior sobrescreve a anterior no mesmo campo', () => {
  const decisao = avaliarRegras(contexto, [
    regra('geral', 1, {
      match: 'E',
      criteria: [{ campo: 'canal', operador: 'igual', valor: 'EMAIL' }],
      actions: [
        { tipo: 'ATRIBUIR_TIME', teamId: 'time-geral' },
        { tipo: 'DEFINIR_URGENCIA', urgency: 2 },
      ],
    }),
    regra('impressora', 2, {
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'impressora' }],
      actions: [{ tipo: 'ATRIBUIR_TIME', teamId: 'time-hardware' }],
    }),
  ]);

  assert.equal(decisao.timeId, 'time-hardware', 'a mais específica vem depois e ganha');
  assert.equal(decisao.urgencia, 2, 'o que a segunda não toca, a primeira mantém');
  assert.deepEqual(decisao.regrasAplicadas, ['geral', 'impressora']);
});

test('pararAoCasar interrompe a avaliação', () => {
  const decisao = avaliarRegras(contexto, [
    regra(
      'para aqui',
      1,
      {
        match: 'E',
        criteria: [{ campo: 'assunto', operador: 'contem', valor: 'impressora' }],
        actions: [{ tipo: 'ATRIBUIR_TIME', teamId: 'time-a' }],
      },
      true,
    ),
    regra('nunca chega', 2, {
      match: 'E',
      criteria: [{ campo: 'canal', operador: 'igual', valor: 'EMAIL' }],
      actions: [{ tipo: 'ATRIBUIR_TIME', teamId: 'time-b' }],
    }),
  ]);

  assert.equal(decisao.timeId, 'time-a');
  assert.deepEqual(decisao.regrasAplicadas, ['para aqui']);
});

test('descartar interrompe sempre, mesmo sem pararAoCasar', () => {
  const decisao = avaliarRegras(contexto, [
    regra('spam', 1, {
      match: 'E',
      criteria: [{ campo: 'remetente', operador: 'contem', valor: 'cliente.com.br' }],
      actions: [{ tipo: 'DESCARTAR', motivo: 'Remetente na lista de bloqueio.' }],
    }),
    regra('classificaria', 2, {
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'impressora' }],
      actions: [{ tipo: 'ATRIBUIR_TIME', teamId: 'time-b' }],
    }),
  ]);

  assert.equal(decisao.descartar, 'Remetente na lista de bloqueio.');
  assert.equal(decisao.timeId, undefined, 'não se classifica o que não vira chamado');
});

test('sem regra que case, a decisão é vazia', () => {
  const decisao = avaliarRegras(contexto, [
    regra('outra coisa', 1, {
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'servidor' }],
      actions: [{ tipo: 'ATRIBUIR_TIME', teamId: 'x' }],
    }),
  ]);

  assert.deepEqual(decisao, { regrasAplicadas: [] });
});

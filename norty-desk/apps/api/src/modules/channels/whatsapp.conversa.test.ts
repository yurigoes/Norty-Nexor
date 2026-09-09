import assert from 'node:assert/strict';
import { test } from 'node:test';

import { interpretarComando, montarStatus, numeroEscolhido } from './whatsapp.conversa';

test('reconhece os comandos com e sem acento', () => {
  assert.deepEqual(interpretarComando('menu'), { tipo: 'MENU' });
  assert.deepEqual(interpretarComando('AJUDA'), { tipo: 'MENU' });
  assert.deepEqual(interpretarComando('  Novo  '), { tipo: 'NOVO' });
  assert.deepEqual(interpretarComando('atendente'), { tipo: 'ATENDENTE' });
  assert.deepEqual(interpretarComando('falar com alguém'), { tipo: 'ATENDENTE' });
  assert.deepEqual(interpretarComando('status'), { tipo: 'STATUS', numero: undefined });
  assert.deepEqual(interpretarComando('status 1042'), { tipo: 'STATUS', numero: 1042 });
  assert.deepEqual(interpretarComando('status #1042'), { tipo: 'STATUS', numero: 1042 });
  assert.deepEqual(interpretarComando('fechar 7'), { tipo: 'FECHAR', numero: 7 });
  assert.deepEqual(interpretarComando('encerrar #7'), { tipo: 'FECHAR', numero: 7 });
});

test('não confunde conteúdo de chamado com comando', () => {
  // Estas são mensagens de verdade, e nenhuma pode virar comando.
  assert.equal(interpretarComando('a impressora parou de novo'), null);
  assert.equal(interpretarComando('preciso de um status do meu pedido de compra'), null);
  assert.equal(interpretarComando('quero fechar a conta do fulano'), null);
  assert.equal(interpretarComando(''), null);
  assert.equal(
    interpretarComando('menu do restaurante não abre no sistema, dá erro 500'),
    null,
    'texto longo começando com "menu" é conteúdo, não comando',
  );
});

test('número sozinho é escolha de chamado, não comando', () => {
  assert.equal(interpretarComando('#1042'), null);
  assert.equal(numeroEscolhido('#1042'), 1042);
  assert.equal(numeroEscolhido('1042'), 1042);
  assert.equal(numeroEscolhido('quero o 1042'), null);
});

test('o status fala a língua do solicitante, não a do ITIL', () => {
  const chamados = [
    { number: 1042, subject: 'Impressora', status: 'PENDENTE', commitments: [] },
    {
      number: 1051,
      subject: 'Acesso',
      status: 'ATRIBUIDO',
      commitments: [{ dueAt: new Date(Date.now() + 2 * 3600_000) }],
    },
  ];

  const lista = montarStatus(chamados);
  assert.ok(lista.includes('aguardando você'), 'PENDENTE precisa virar linguagem de gente');
  assert.ok(!lista.includes('PENDENTE'));
  assert.ok(lista.includes('#1042') && lista.includes('#1051'));

  const um = montarStatus(chamados, 1051);
  assert.ok(um.includes('em atendimento'));
  assert.ok(um.includes('hora(s)'), `deveria dizer o prazo: ${um}`);

  const inexistente = montarStatus(chamados, 999);
  assert.ok(inexistente.includes('Não encontrei'));

  assert.ok(montarStatus([]).includes('não tem chamados abertos'));
});

test('avisa quando o prazo já passou, sem inventar tempo negativo', () => {
  const texto = montarStatus([
    {
      number: 1,
      subject: 'x',
      status: 'ATRIBUIDO',
      commitments: [{ dueAt: new Date(Date.now() - 3600_000) }],
    },
  ]);

  assert.ok(texto.includes('já passou'));
  assert.ok(!texto.includes('-'), `não deveria mostrar tempo negativo: ${texto}`);
});

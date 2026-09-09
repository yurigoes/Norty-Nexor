import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PRIORITY_MATRIX,
  canTransition,
  computePriority,
  emailSubject,
  normalizePhone,
  parseTicketNumberFromSubject,
} from './domain';
import { ROLE_PERMISSIONS, can, ticketReadScope } from './permissions';

test('prioridade sai da matriz urgência x impacto', () => {
  assert.equal(computePriority(5, 5), 5);
  assert.equal(computePriority(1, 1), 1);
  assert.equal(computePriority(4, 2), 3);
  assert.equal(computePriority(2, 4), 3);
});

test('prioridade cai na média arredondada quando a célula não existe', () => {
  const matrizVazia = {} as typeof DEFAULT_PRIORITY_MATRIX;
  // Mesmo fallback de CommonITILObject::computePriority() do GLPI.
  assert.equal(computePriority(4, 5, matrizVazia), 5);
  assert.equal(computePriority(1, 2, matrizVazia), 2);
});

test('a matriz padrão nunca salta dois níveis a partir da diagonal', () => {
  for (const u of [1, 2, 3, 4, 5] as const) {
    for (const i of [1, 2, 3, 4, 5] as const) {
      const p = computePriority(u, i);
      assert.ok(p >= 1 && p <= 5, `prioridade fora da escala em ${u}x${i}`);
      assert.ok(
        Math.abs(p - Math.round((u + i) / 2)) <= 1,
        `salto grande demais em ${u}x${i}: ${p}`,
      );
    }
  }
});

test('chamado fechado só volta pela reabertura', () => {
  assert.equal(canTransition('FECHADO', 'ATRIBUIDO'), true);
  assert.equal(canTransition('FECHADO', 'PENDENTE'), false);
  assert.equal(canTransition('FECHADO', 'SOLUCIONADO'), false);
});

test('threading de e-mail reconhece o número no assunto', () => {
  assert.equal(parseTicketNumberFromSubject('Re: [Norty Desk #1042] Impressora'), 1042);
  assert.equal(parseTicketNumberFromSubject('Fwd: [#7] teste'), 7);
  assert.equal(parseTicketNumberFromSubject('sem marcador'), null);
});

test('o assunto de saída sustenta o threading da resposta', () => {
  const assunto = emailSubject(1042, 'Impressora do 3º andar');
  assert.equal(parseTicketNumberFromSubject(assunto), 1042);
});

test('telefone do WhatsApp vira E.164', () => {
  assert.equal(normalizePhone('5511999999999@s.whatsapp.net'), '+5511999999999');
  assert.equal(normalizePhone('+55 (11) 99999-9999'), '+5511999999999');
  assert.equal(normalizePhone(''), '');
});

test('solicitante nunca lê chamado alheio', () => {
  assert.equal(ticketReadScope('SOLICITANTE'), 'PROPRIOS');
  assert.equal(ticketReadScope('AGENTE'), 'TIME');
  assert.equal(ticketReadScope('SUPERVISOR'), 'TODOS');
  assert.equal(ticketReadScope('GESTOR'), 'TODOS');
});

test('gestor lê indicadores mas não atende', () => {
  assert.equal(can('GESTOR', 'painel:organizacao'), true);
  assert.equal(can('GESTOR', 'chamado:responder'), false);
  assert.equal(can('GESTOR', 'chamado:atribuir'), false);
});

test('solicitante não enxerga nota interna nem configuração', () => {
  assert.equal(can('SOLICITANTE', 'chamado:nota-interna'), false);
  assert.equal(can('SOLICITANTE', 'artigo:ler:interno'), false);
  assert.equal(can('SOLICITANTE', 'config:sla'), false);
});

test('administrador tem todas as permissões', () => {
  assert.ok(ROLE_PERMISSIONS.ADMINISTRADOR.length >= ROLE_PERMISSIONS.SUPERVISOR.length);
  assert.equal(can('ADMINISTRADOR', 'config:canais'), true);
  assert.equal(can('ADMINISTRADOR', 'auditoria:ler'), true);
});

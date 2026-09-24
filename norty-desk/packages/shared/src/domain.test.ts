import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PRIORITY_MATRIX,
  TERM_KINDS,
  TEXTO_PADRAO_DO_TERMO,
  canTransition,
  computePriority,
  emailSubject,
  marcadoresInvalidos,
  marcadoresInvalidosDoTermo,
  normalizePhone,
  parseTicketNumberFromSubject,
  preencherTermo,
  serieUtil,
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

test('quem lê todos os chamados também lê os do time e os próprios', () => {
  // A rota de leitura exige o escopo mais estreito. Sem a implicação, um
  // gestor com `ler:todos` levava 403 em `GET /tickets/:id` — defeito
  // real, pego pela suíte de ponta a ponta.
  for (const role of ['SUPERVISOR', 'GESTOR', 'ADMINISTRADOR'] as const) {
    assert.equal(can(role, 'chamado:ler:todos'), true, role);
    assert.equal(can(role, 'chamado:ler:time'), true, role);
    assert.equal(can(role, 'chamado:ler:proprios'), true, role);
  }
});

test('a implicação não alarga escopo de escrita', () => {
  // Ler tudo não é escrever em tudo: o gestor continua sem responder.
  assert.equal(can('GESTOR', 'chamado:responder'), false);
  assert.equal(can('GESTOR', 'chamado:atribuir'), false);
  // E o agente, que atribui só a si, não ganha a atribuição ampla.
  assert.equal(can('AGENTE', 'chamado:atribuir:a-mim'), true);
  assert.equal(can('AGENTE', 'chamado:atribuir'), false);
});

test('o escopo de leitura continua sendo o mais amplo do perfil', () => {
  assert.equal(ticketReadScope('SOLICITANTE'), 'PROPRIOS');
  assert.equal(ticketReadScope('AGENTE'), 'TIME');
  assert.equal(ticketReadScope('GESTOR'), 'TODOS');
});

// ---------------------------------------------------------------------
// Termos
// ---------------------------------------------------------------------

test('o termo troca o marcador conhecido e deixa o desconhecido à vista', () => {
  const texto = 'Eu, {{pessoa.nome}}, recebi o {{equipamento.nome}} de {{fulano.ciclano}}.';

  assert.equal(
    preencherTermo(texto, { 'pessoa.nome': 'Ana', 'equipamento.nome': 'Notebook' }),
    'Eu, Ana, recebi o Notebook de {{fulano.ciclano}}.',
  );
});

test('marcador conhecido sem valor no contexto também fica à vista', () => {
  // Some-lo faria a frase perder um pedaço sem ninguém reparar — que é
  // exatamente o defeito que o termo não pode ter.
  assert.equal(
    preencherTermo('Patrimônio: {{equipamento.patrimonio}}', {}),
    'Patrimônio: {{equipamento.patrimonio}}',
  );
});

test('o texto padrão dos dois termos não tem marcador inventado', () => {
  for (const kind of TERM_KINDS) {
    assert.deepEqual(
      marcadoresInvalidosDoTermo(TEXTO_PADRAO_DO_TERMO[kind]),
      [],
      `o texto padrão de ${kind} usa marcador que não existe`,
    );
  }
});

test('o modelo de resposta e o termo não compartilham vocabulário', () => {
  // Os dois usam o mesmo motor. Se um passasse a aceitar os campos do
  // outro, a tela de configuração deixaria salvar `{{chamado.numero}}`
  // num termo — que renderizaria vazio no papel assinado.
  assert.deepEqual(marcadoresInvalidosDoTermo('{{chamado.numero}}'), ['chamado.numero']);
  assert.deepEqual(marcadoresInvalidos('{{pessoa.nome}}'), ['pessoa.nome']);
});

// ---------------------------------------------------------------------
// Inventário automático
// ---------------------------------------------------------------------

test('série de fábrica não identifica máquina nenhuma', () => {
  // O SMBIOS exige o campo, e montadora de máquina branca preenche com
  // texto de catálogo. Aceitá-lo faz a segunda máquina bater no índice
  // único — ou casar com a primeira, que é pior.
  for (const mentira of [
    'To Be Filled By O.E.M.',
    'to be filled by o.e.m.',
    'Default string',
    'System Serial Number',
    'None',
    'Not Specified',
    'N/A',
    '00000000',
    '   ',
    '',
  ]) {
    assert.equal(serieUtil(mentira), null, `"${mentira}" deveria ser descartada`);
  }
});

test('série de verdade passa, e chega limpa', () => {
  assert.equal(serieUtil('BR9XK32'), 'BR9XK32');
  assert.equal(serieUtil('  5CD123ABCD  '), '5CD123ABCD');
  assert.equal(serieUtil('S/N  ABC   123'), 'S/N ABC 123');
});

test('série curta demais não identifica', () => {
  assert.equal(serieUtil('0'), null);
  assert.equal(serieUtil('AB'), null);
  assert.equal(serieUtil('ABC'), 'ABC');
});

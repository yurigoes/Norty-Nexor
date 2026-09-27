import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type {
  ProblemDetails,
  RegraDeEntradaView,
  SimulacaoDeEntradaView,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi, protocoloDeTeste } from './apoio';
import type { ProcessamentoService } from '../src/modules/channels/processamento.service';

let api: Api;
let f: Fixtura;
let chave: string;
let processamento: ProcessamentoService;

before(async () => {
  await limparBanco();
  f = await semear();
  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });
  api = await subirApi();

  const { ProcessamentoService } = await import('../src/modules/channels/processamento.service');
  processamento = api.app.get(ProcessamentoService);

  const admin = new Cliente(api.url);
  await admin.entrar('supervisor@teste.dev');
  const criada = await admin.post<{ chave: string }>('/api-keys', {
    name: 'Monitoramento',
    scopes: ['chamado:criar', 'chamado:ler:proprios', 'chamado:responder'],
  });
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
  chave = criada.corpo.chave;
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function comChave<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  cabecalhos: Record<string, string> = {},
  token = chave,
) {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...cabecalhos,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: (texto ? JSON.parse(texto) : null) as T };
}

// ---------------------------------------------------------------------

describe('chave de aplicação', () => {
  it('o valor cru aparece uma vez e o que fica no banco é hash', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    const lista = await admin.get<{ id: string; name: string }[]>('/api-keys');
    assert.ok(lista.corpo.some((c) => c.name === 'Monitoramento'));
    assert.ok(!JSON.stringify(lista.corpo).includes(chave), 'a chave crua vazou na listagem');

    const guardada = await prisma.apiKey.findFirstOrThrow({ where: { name: 'Monitoramento' } });
    assert.notEqual(guardada.keyHash, chave);
    assert.match(guardada.keyHash, /^[0-9a-f]{64}$/);
  });

  it('recusa escopo de administração numa chave de integração', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    const r = await admin.post('/api-keys', {
      name: 'Chave poderosa demais',
      scopes: ['chamado:criar', 'config:sla'],
    });

    assert.equal(r.status, 400);
  });

  it('chave inválida ou revogada não entra', async () => {
    const invalida = await comChave('POST', '/intake/tickets', { subject: 'x', description: 'y' }, {}, 'nd_naoexiste');
    assert.equal(invalida.status, 401);

    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');
    const criada = await admin.post<{ id: string; chave: string }>('/api-keys', {
      name: 'Para revogar',
      scopes: ['chamado:criar'],
    });

    assert.equal((await admin.chamar('DELETE', `/api-keys/${criada.corpo.id}`)).status, 204);

    const revogada = await comChave(
      'POST',
      '/intake/tickets',
      { subject: 'x', description: 'y' },
      {},
      criada.corpo.chave,
    );
    assert.equal(revogada.status, 401);
  });

  it('a chave só faz o que o escopo permite', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');
    const somenteLeitura = await admin.post<{ chave: string }>('/api-keys', {
      name: 'Só leitura',
      scopes: ['chamado:ler:proprios'],
    });

    const r = await comChave(
      'POST',
      '/intake/tickets',
      { subject: 'não deveria abrir', description: 'x' },
      {},
      somenteLeitura.corpo.chave,
    );

    assert.equal(r.status, 403);
  });
});

describe('intake público', () => {
  it('abre chamado e cria a árvore de categoria pelo caminho', async () => {
    const r = await comChave<{ id: string; number: number; repetido: boolean }>(
      'POST',
      '/intake/tickets',
      {
        subject: 'Lote noturno abortou no passo 3',
        description: 'Job 2026-09-08 falhou.',
        urgency: 5,
        impact: 4,
        categoryPath: 'Sistemas > Integração',
        requester: { email: 'monitoramento@norty.com.br', name: 'Monitoramento' },
      },
    );

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.repetido, false);

    const chamado = await prisma.ticket.findUniqueOrThrow({
      where: { id: r.corpo.id },
      include: { category: { include: { parent: true } } },
    });

    assert.equal(chamado.originChannel, 'API');
    assert.equal(chamado.urgency, 5);
    // 5 × 4 na matriz padrão dá 5.
    assert.equal(chamado.priority, 5);
    assert.equal(chamado.category?.name, 'Integração');
    assert.equal(chamado.category?.parent?.name, 'Sistemas');
  });

  it('a mesma referência não abre um segundo chamado', async () => {
    const corpo = {
      subject: 'Disco cheio em prd-01',
      description: '95% de uso.',
      externalRef: 'disco-cheio-prd-01',
    };

    const primeira = await comChave<{ number: number; repetido: boolean }>(
      'POST',
      '/intake/tickets',
      corpo,
    );
    const segunda = await comChave<{ number: number; repetido: boolean }>(
      'POST',
      '/intake/tickets',
      corpo,
    );

    assert.equal(primeira.corpo.repetido, false);
    assert.equal(segunda.corpo.repetido, true, 'repetir não é erro: devolve o que já existe');
    assert.equal(segunda.corpo.number, primeira.corpo.number);

    assert.equal(
      await prisma.ticket.count({ where: { externalRef: 'disco-cheio-prd-01' } }),
      1,
      'um monitoramento em laço não pode abrir mil chamados',
    );
  });

  it('o cabeçalho Idempotency-Key vale como referência', async () => {
    const corpo = { subject: 'Certificado vence em 7 dias', description: 'x' };
    const cabecalho = { 'Idempotency-Key': 'cert-expira-2026-09' };

    const a = await comChave<{ number: number }>('POST', '/intake/tickets', corpo, cabecalho);
    const b = await comChave<{ number: number; repetido: boolean }>(
      'POST',
      '/intake/tickets',
      corpo,
      cabecalho,
    );

    assert.equal(b.corpo.repetido, true);
    assert.equal(b.corpo.number, a.corpo.number);
  });

  it('duas chamadas simultâneas com a mesma referência dão um chamado só', async () => {
    const corpo = {
      subject: 'Corrida de idempotência',
      description: 'x',
      externalRef: 'corrida-1',
    };

    const [a, b] = await Promise.all([
      comChave<{ number: number }>('POST', '/intake/tickets', corpo),
      comChave<{ number: number }>('POST', '/intake/tickets', corpo),
    ]);

    assert.equal(a.corpo.number, b.corpo.number, 'as duas deveriam ver o mesmo chamado');
    assert.equal(await prisma.ticket.count({ where: { externalRef: 'corrida-1' } }), 1);
  });

  it('consulta por número e por referência', async () => {
    const aberto = await comChave<{ number: number }>('POST', '/intake/tickets', {
      subject: 'Consulta',
      description: 'x',
      externalRef: 'ref-consulta',
    });

    const porNumero = await comChave<{ number: number }>(
      'GET',
      `/intake/tickets/${aberto.corpo.number}`,
    );
    const porReferencia = await comChave<{ number: number }>(
      'GET',
      '/intake/tickets/ref-consulta',
    );

    assert.equal(porNumero.status, 200);
    assert.equal(porReferencia.corpo.number, aberto.corpo.number);
    assert.equal((await comChave('GET', '/intake/tickets/999999')).status, 404);
  });

  it('responde no chamado e o agente vê a resposta', async () => {
    const aberto = await comChave<{ id: string; number: number }>('POST', '/intake/tickets', {
      subject: 'Com resposta da integração',
      description: 'primeira',
      externalRef: 'ref-resposta',
    });

    const r = await comChave('POST', `/intake/tickets/${aberto.corpo.number}/responder`, {
      body: 'O job rodou de novo e falhou igual.',
    });
    assert.equal(r.status, 201);

    const eventos = await prisma.ticketEvent.findMany({ where: { ticketId: aberto.corpo.id } });
    assert.ok(eventos.some((e) => e.body === 'O job rodou de novo e falhou igual.'));
    assert.ok(eventos.some((e) => e.channel === 'API'));
  });

  it('não atravessa a fronteira da organização', async () => {
    const alheio = await prisma.ticket.create({
      data: {
        protocol: protocoloDeTeste(),
        organizationId: f.outra.id,
        number: 555,
        subject: 'Chamado de outra organização',
        description: 'x',
      },
    });

    assert.equal((await comChave('GET', '/intake/tickets/555')).status, 404);
    await prisma.ticket.delete({ where: { id: alheio.id } });
  });
});

describe('regras de entrada', () => {
  it('classificam o que entra por e-mail e registram o porquê', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    const regra = await admin.post<{ id: string }>('/intake-rules', {
      name: 'Impressora vai para o hardware',
      criteria: {
        match: 'E',
        criteria: [{ campo: 'assunto', operador: 'contem', valor: 'impressora' }],
      },
      actions: [
        { tipo: 'ATRIBUIR_TIME', teamId: f.outroTime.id },
        { tipo: 'DEFINIR_URGENCIA', urgency: 4 },
      ],
    });
    assert.equal(regra.status, 201, JSON.stringify(regra.corpo));

    await fetch(`${api.url}/channels/email/inbound/${f.contaEmail.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: '<regra1@cliente.com.br>',
        from: { email: 'regra@cliente.com.br' },
        to: [{ email: 'suporte@teste.dev' }],
        subject: 'Impressora travando papel',
        text: 'Trava a cada cinco páginas.',
      }),
    });

    await processamento.processarPendentes();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Impressora travando papel' },
      include: { actors: true, events: true },
    });

    assert.equal(chamado.urgency, 4, 'a regra deveria ter elevado a urgência');
    assert.ok(
      chamado.actors.some((a) => a.role === 'ATRIBUIDO' && a.teamId === f.outroTime.id),
      'a regra deveria ter mandado para o time dela, não para o padrão do canal',
    );

    // Sem o registro, ninguém explica por que o chamado caiu naquela fila.
    const nota = chamado.events.find((e) => e.body?.includes('regras de entrada'));
    assert.ok(nota, 'a classificação deveria estar registrada na conversa');
    assert.ok(nota.body?.includes('Impressora vai para o hardware'));
    assert.equal(nota.visibility, 'INTERNA');

    await admin.chamar('DELETE', `/intake-rules/${regra.corpo.id}`);
  });

  it('descartam spam antes de o chamado existir', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    const regra = await admin.post<{ id: string }>('/intake-rules', {
      name: 'Bloqueio de remetente',
      criteria: {
        match: 'E',
        criteria: [{ campo: 'remetente', operador: 'contem', valor: 'spam.exemplo' }],
      },
      actions: [{ tipo: 'DESCARTAR', motivo: 'Remetente bloqueado.' }],
    });

    const antes = await prisma.ticket.count();

    await fetch(`${api.url}/channels/email/inbound/${f.contaEmail.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: '<spam1@spam.exemplo>',
        from: { email: 'promo@spam.exemplo' },
        to: [{ email: 'suporte@teste.dev' }],
        subject: 'Oferta imperdível',
        text: 'Clique aqui',
      }),
    });

    await processamento.processarPendentes();

    assert.equal(await prisma.ticket.count(), antes, 'spam não pode virar chamado');

    // Mas a mensagem fica visível no diagnóstico, com o motivo — a
    // tela que o GLPI não tem.
    const descartada = await prisma.inboundMessage.findFirstOrThrow({
      where: { externalId: '<spam1@spam.exemplo>' },
    });
    assert.ok(descartada.discardedReason?.includes('Remetente bloqueado'));

    await admin.chamar('DELETE', `/intake-rules/${regra.corpo.id}`);
  });

  it('recusam regra sem critério ou sem ação', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    const semCriterio = await admin.post('/intake-rules', {
      name: 'Casaria com tudo',
      criteria: { match: 'E', criteria: [] },
      actions: [{ tipo: 'DEFINIR_URGENCIA', urgency: 5 }],
    });
    assert.equal(semCriterio.status, 400);

    const semAcao = await admin.post('/intake-rules', {
      name: 'Não faria nada',
      criteria: { match: 'E', criteria: [{ campo: 'assunto', operador: 'contem', valor: 'x' }] },
      actions: [],
    });
    assert.equal(semAcao.status, 400);
  });

  it('regra que aponta para time desativado é ignorada, não quebra a abertura', async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    const timeMorto = await prisma.team.create({
      data: { organizationId: f.organizacao.id, name: 'Time extinto', isActive: false },
    });

    const regra = await admin.post<{ id: string }>('/intake-rules', {
      name: 'Aponta para time morto',
      criteria: {
        match: 'E',
        criteria: [{ campo: 'assunto', operador: 'contem', valor: 'orfao' }],
      },
      actions: [{ tipo: 'ATRIBUIR_TIME', teamId: timeMorto.id }],
    });

    const r = await comChave<{ id: string }>('POST', '/intake/tickets', {
      subject: 'Chamado orfao',
      description: 'x',
    });

    assert.equal(r.status, 201, 'a abertura não pode quebrar por causa da regra');

    const chamado = await prisma.ticket.findUniqueOrThrow({
      where: { id: r.corpo.id },
      include: { actors: true },
    });
    assert.ok(!chamado.actors.some((a) => a.teamId === timeMorto.id));

    await admin.chamar('DELETE', `/intake-rules/${regra.corpo.id}`);
  });
});

describe('robustez das regras', () => {
  it('regra corrompida não faz a mensagem do cliente sumir', async () => {
    // Grava direto no banco uma regra com `criteria` em formato que a
    // tela nunca produziria — é o cenário de dado antigo ou de escrita
    // por script.
    const corrompida = await prisma.intakeRule.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Corrompida',
        position: 1,
        criteria: 'isto não é critério nenhum' as never,
        actions: { nem: 'isto' } as never,
      },
    });

    await fetch(`${api.url}/channels/email/inbound/${f.contaEmail.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: '<apesar-da-regra@cliente.com.br>',
        from: { email: 'vitima@cliente.com.br' },
        to: [{ email: 'suporte@teste.dev' }],
        subject: 'Meu chamado não pode sumir',
        text: 'Preciso de ajuda.',
      }),
    });

    await processamento.processarPendentes();

    const chamado = await prisma.ticket.findFirst({
      where: { subject: 'Meu chamado não pode sumir' },
    });
    assert.ok(chamado, 'o chamado tinha de abrir mesmo com a regra quebrada');

    const recebida = await prisma.inboundMessage.findFirstOrThrow({
      where: { externalId: '<apesar-da-regra@cliente.com.br>' },
    });
    assert.equal(recebida.discardedReason, null, 'não podia ter virado descarte');
    assert.ok(recebida.processedAt);

    await prisma.intakeRule.delete({ where: { id: corrompida.id } });
  });
});

// ---------------------------------------------------------------------
// Chave por empresa, e a pessoa do sistema de origem
// ---------------------------------------------------------------------

describe('integrador por empresa', () => {
  let empresa: { id: string };
  let outraEmpresa: { id: string };
  let chaveDaEmpresa: string;

  before(async () => {
    const admin = new Cliente(api.url);
    await admin.entrar('supervisor@teste.dev');

    empresa = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Alfa Comércio LTDA',
        emailDomain: 'alfa.com.br',
      },
      select: { id: true },
    });
    outraEmpresa = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Beta Serviços LTDA',
        emailDomain: 'beta.com.br',
      },
      select: { id: true },
    });

    const criada = await admin.post<{ chave: string }>('/api-keys', {
      name: 'ERP da Alfa',
      clientId: empresa.id,
      scopes: ['chamado:criar'],
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
    chaveDaEmpresa = criada.corpo.chave;
  });

  it('o chamado nasce da empresa da chave, e no nome da pessoa informada', async () => {
    const r = await comChave<{ id: string }>(
      'POST',
      '/intake/tickets',
      {
        subject: 'Nota fiscal não emite',
        description: 'O ERP trava ao gerar a nota.',
        requester: { name: 'Ana Souza', email: 'ana@erp-da-alfa.com' },
      },
      {},
      chaveDaEmpresa,
    );
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const chamado = await prisma.ticket.findUniqueOrThrow({
      where: { id: r.corpo.id },
      include: { actors: { include: { user: true, contact: true } } },
    });

    assert.equal(chamado.clientId, empresa.id, 'o chamado é da empresa da chave');

    const requerente = chamado.actors.find((a) => a.role === 'REQUERENTE');
    assert.ok(requerente?.userId, 'o requerente é pessoa de verdade, não contato');
    assert.equal(requerente.user?.name, 'Ana Souza');
  });

  /**
   * O login é o da carteira, e é isso que faz a pessoa cadastrada pelo
   * integrador e a incluída à mão serem o **mesmo** registro.
   */
  it('a pessoa nasce com o login da carteira, e sem PIN utilizável', async () => {
    const pessoa = await prisma.user.findFirstOrThrow({
      where: { name: 'Ana Souza' },
      include: { memberships: true },
    });

    assert.equal(pessoa.email, 'ana.souza@alfa.com.br', 'o login sai do nome mais o domínio');
    assert.equal(pessoa.passwordHash, null, 'nasce sem PIN: sem hash, não entra');
    assert.equal(pessoa.mustChangePassword, true);
    assert.equal(pessoa.memberships[0]?.clientId, empresa.id);
    assert.equal(pessoa.memberships[0]?.role, 'CLIENTE');
  });

  it('o segundo chamado da mesma pessoa não cria uma segunda conta', async () => {
    const antes = await prisma.user.count({ where: { name: 'Ana Souza' } });

    const r = await comChave<{ id: string }>(
      'POST',
      '/intake/tickets',
      {
        subject: 'Boleto não imprime',
        description: 'Segunda chamada da mesma pessoa.',
        requester: { name: 'Ana Souza', email: 'ana@erp-da-alfa.com' },
      },
      {},
      chaveDaEmpresa,
    );
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal(await prisma.user.count({ where: { name: 'Ana Souza' } }), antes);
  });

  /**
   * A cerca que justifica a chave ser por empresa: o corpo da
   * requisição não diz de que empresa o chamado é. Quem tem o token diz
   * por si — um token vazado abre chamado na empresa dele, e em nenhuma
   * outra.
   */
  it('a chave de uma empresa não abre chamado em nome de outra', async () => {
    const r = await comChave<{ id: string }>(
      'POST',
      '/intake/tickets',
      {
        subject: 'Tentando abrir na empresa errada',
        description: 'O corpo manda outra empresa; a chave manda na Alfa.',
        clientId: outraEmpresa.id,
        requester: { name: 'Bruno Lima' },
      },
      {},
      chaveDaEmpresa,
    );

    // `forbidNonWhitelisted`: `clientId` nem é campo aceito no corpo.
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('a chave da casa segue como era: contato, sem empresa', async () => {
    const r = await comChave<{ id: string }>('POST', '/intake/tickets', {
      subject: 'Disco cheio no servidor',
      description: 'Alerta do monitoramento, sem empresa.',
      requester: { name: 'Monitoramento', email: 'alerta@monitor.local' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const chamado = await prisma.ticket.findUniqueOrThrow({
      where: { id: r.corpo.id },
      include: { actors: true },
    });

    assert.equal(chamado.clientId, null, 'chave sem empresa não amarra o chamado a nenhuma');
    const requerente = chamado.actors.find((a) => a.role === 'REQUERENTE');
    assert.ok(requerente?.contactId, 'segue como contato, como era antes');
    assert.equal(requerente.userId, null);
  });
});

/**
 * O que a tela de regras precisa da API.
 *
 * A regra é um par (critérios, ações) guardado em `Json`, e o DTO a
 * deixa passar com `@Allow()` porque a forma não cabe num decorador.
 * Isso quer dizer que **o servidor é a única proteção**: a tela oferece
 * só o que é válido, mas a tela não é a proteção (CLAUDE.md, regra 2).
 *
 * O sintoma de uma regra malformada é cruel: o motor engole o critério
 * desconhecido de propósito — regra quebrada não pode derrubar a
 * abertura do chamado —, então ela simplesmente nunca casa, em
 * silêncio. A hora de dizer é na hora de salvar.
 */
describe('a regra que a tela escreve', () => {
  let curador: Cliente;

  before(async () => {
    curador = new Cliente(api.url);
    assert.equal((await curador.entrar('supervisor@teste.dev')).status, 200);
  });

  // Os testes de recusa não deviam criar nada, e é justamente por isso
  // que a limpeza importa: se a validação cair, as regras malformadas
  // ficam ativas e quebram a classificação das suítes seguintes — que
  // foi o que aconteceu ao conferir esta validação por mutação.
  after(async () => {
    await prisma.intakeRule.deleteMany({
      where: { organizationId: f.organizacao.id, name: { startsWith: 'Regra ' } },
    });
  });

  async function criar(corpo: Record<string, unknown>) {
    return curador.post<ProblemDetails & { id?: string }>('/intake-rules', {
      name: `Regra ${Math.random().toString(36).slice(2, 8)}`,
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'x' }],
      actions: [{ tipo: 'DEFINIR_URGENCIA', urgency: 4 }],
      ...corpo,
    });
  }

  it('aceita a lista de critérios com o conectivo ao lado, e devolve normalizado', async () => {
    const r = await criar({
      match: 'OU',
      criteria: [
        { campo: 'assunto', operador: 'contem', valor: 'nota fiscal' },
        { campo: 'canal', operador: 'igual', valor: 'EMAIL' },
      ],
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const lista = await curador.get<RegraDeEntradaView[]>('/intake-rules');
    const salva = lista.corpo.find((x) => x.id === r.corpo.id)!;

    // A tela nunca vê a forma antiga: a normalização acontece na
    // escrita e na leitura, e a coluna volta a ter uma forma só.
    assert.equal(salva.match, 'OU');
    assert.equal(salva.criteria.length, 2);
    assert.equal(salva.criteria[0]?.campo, 'assunto');
    assert.equal(salva.isActive, true);

    await curador.del(`/intake-rules/${r.corpo.id}`);
  });

  it('trocar só o conectivo é edição de critério, e vale', async () => {
    const r = await criar({});
    assert.equal(r.status, 201);

    const editada = await curador.patch<RegraDeEntradaView>(`/intake-rules/${r.corpo.id}`, {
      match: 'OU',
    });
    assert.equal(editada.status, 200, JSON.stringify(editada.corpo));
    assert.equal(editada.corpo.match, 'OU', 'E e OU casam coisas diferentes');
    assert.equal(editada.corpo.criteria.length, 1, 'os critérios sumiram na troca do conectivo');

    await curador.del(`/intake-rules/${r.corpo.id}`);
  });

  it('recusa o critério malformado, dizendo qual e por quê', async () => {
    const campo = await criar({ criteria: [{ campo: 'remetentte', operador: 'contem', valor: 'x' }] });
    assert.equal(campo.status, 400);
    assert.match(campo.corpo.detail ?? '', /Critério 1.*não é um campo/s);

    const operador = await criar({
      criteria: [{ campo: 'assunto', operador: 'parece', valor: 'x' }],
    });
    assert.equal(operador.status, 400);
    assert.match(operador.corpo.detail ?? '', /não é um operador/);

    const semValor = await criar({ criteria: [{ campo: 'assunto', operador: 'contem', valor: '' }] });
    assert.equal(semValor.status, 400);

    // "Canal contém EMA" não quer dizer nada.
    const canalContem = await criar({
      criteria: [{ campo: 'canal', operador: 'contem', valor: 'EMAIL' }],
    });
    assert.equal(canalContem.status, 400);
    assert.match(canalContem.corpo.detail ?? '', /só aceita "igual"/);

    const canalInventado = await criar({
      criteria: [{ campo: 'canal', operador: 'igual', valor: 'POMBO_CORREIO' }],
    });
    assert.equal(canalInventado.status, 400);
  });

  it('recusa a expressão que não compila — o sintoma dela é não casar nunca', async () => {
    const r = await criar({
      criteria: [{ campo: 'assunto', operador: 'regex', valor: '[a-z' }],
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.detail ?? '', /Expressão inválida/);
  });

  it('recusa a ação sem destino, e o descarte sem motivo', async () => {
    assert.equal((await criar({ actions: [{ tipo: 'ATRIBUIR_TIME' }] })).status, 400);
    assert.equal(
      (await criar({ actions: [{ tipo: 'ATRIBUIR_TIME', teamId: 'o-time-legal' }] })).status,
      400,
    );
    assert.equal((await criar({ actions: [{ tipo: 'DEFINIR_URGENCIA', urgency: 9 }] })).status, 400);
    assert.equal((await criar({ actions: [{ tipo: 'EXPLODIR' }] })).status, 400);

    const descarte = await criar({ actions: [{ tipo: 'DESCARTAR', motivo: '  ' }] });
    assert.equal(descarte.status, 400);
    // O motivo é a única explicação que sobra de um e-mail que não
    // virou chamado.
    assert.match(descarte.corpo.detail ?? '', /motivo/);
  });
});

/**
 * A simulação.
 *
 * O jeito de descobrir por que a fila saiu errada não pode ser mandar
 * um e-mail de verdade e ver onde ele cai. Roda o mesmo motor sobre as
 * mesmas regras ativas, e devolve os nomes resolvidos — o UUID não
 * responde "para onde foi meu chamado".
 */
describe('simular a entrada', () => {
  let curador: Cliente;

  before(async () => {
    curador = new Cliente(api.url);
    assert.equal((await curador.entrar('supervisor@teste.dev')).status, 200);
  });

  it('diz qual regra casou e para onde o chamado iria', async () => {
    const regra = await curador.post<{ id: string }>('/intake-rules', {
      name: 'Simulação: impressora vai para o outro time',
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'impressora' }],
      actions: [
        { tipo: 'ATRIBUIR_TIME', teamId: f.outroTime.id },
        { tipo: 'DEFINIR_URGENCIA', urgency: 4 },
      ],
    });
    assert.equal(regra.status, 201, JSON.stringify(regra.corpo));

    const casou = await curador.post<SimulacaoDeEntradaView>('/intake-rules/simular', {
      assunto: 'A impressora do 3º andar parou',
      corpo: 'Luz laranja piscando.',
      remetente: 'marina@cliente.com.br',
      canal: 'EMAIL',
    });

    assert.equal(casou.status, 200, JSON.stringify(casou.corpo));
    assert.ok(casou.corpo.regrasAplicadas.includes('Simulação: impressora vai para o outro time'));
    // O nome, não o id: o UUID não responde "para onde foi meu chamado".
    assert.equal(casou.corpo.time?.name, f.outroTime.name);
    assert.equal(casou.corpo.urgencia, 4);

    const naoCasou = await curador.post<SimulacaoDeEntradaView>('/intake-rules/simular', {
      assunto: 'Preciso de acesso ao sistema',
      corpo: 'x',
      remetente: 'marina@cliente.com.br',
      canal: 'EMAIL',
    });

    assert.equal(naoCasou.status, 200);
    assert.ok(
      !naoCasou.corpo.regrasAplicadas.includes('Simulação: impressora vai para o outro time'),
    );

    await curador.del(`/intake-rules/${regra.corpo.id}`);
  });

  it('a regra desativada não entra na simulação, como não entra na fila', async () => {
    const regra = await curador.post<{ id: string }>('/intake-rules', {
      name: 'Simulação: regra dormindo',
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'xilofone' }],
      actions: [{ tipo: 'DEFINIR_URGENCIA', urgency: 5 }],
      isActive: false,
    });
    assert.equal(regra.status, 201, JSON.stringify(regra.corpo));

    const r = await curador.post<SimulacaoDeEntradaView>('/intake-rules/simular', {
      assunto: 'Comprei um xilofone',
      corpo: 'x',
      remetente: 'a@b.com.br',
      canal: 'EMAIL',
    });

    assert.equal(r.status, 200);
    assert.ok(
      !r.corpo.regrasAplicadas.includes('Simulação: regra dormindo'),
      'simular tem de mostrar o que acontece de verdade, não o que aconteceria se estivesse ativa',
    );

    await curador.del(`/intake-rules/${regra.corpo.id}`);
  });

  it('o descarte aparece com o motivo, que é o que sobra para explicar', async () => {
    const regra = await curador.post<{ id: string }>('/intake-rules', {
      name: 'Simulação: boletim não é chamado',
      match: 'E',
      criteria: [{ campo: 'assunto', operador: 'contem', valor: 'boletim semanal' }],
      actions: [{ tipo: 'DESCARTAR', motivo: 'Boletim informativo, não é pedido de suporte.' }],
    });
    assert.equal(regra.status, 201);

    const r = await curador.post<SimulacaoDeEntradaView>('/intake-rules/simular', {
      assunto: 'Boletim semanal de novidades',
      corpo: 'x',
      remetente: 'news@fornecedor.com.br',
      canal: 'EMAIL',
    });

    assert.equal(r.corpo.descartar, 'Boletim informativo, não é pedido de suporte.');

    await curador.del(`/intake-rules/${regra.corpo.id}`);
  });

  it('quem não configura regra não simula', async () => {
    const agente = new Cliente(api.url);
    assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

    const r = await agente.post('/intake-rules/simular', {
      assunto: 'x',
      corpo: 'x',
      remetente: 'a@b.com.br',
      canal: 'EMAIL',
    });

    // A simulação lê a configuração inteira da organização: quem não
    // pode ver as regras não pode vê-las pelo resultado delas.
    assert.equal(r.status, 403);
  });
});

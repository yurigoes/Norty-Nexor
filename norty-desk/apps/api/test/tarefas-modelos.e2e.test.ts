import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ModeloView, ProblemDetails, TicketDetail, TicketTaskView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Tarefas do chamado e modelos de texto.
 *
 * O que se prova aqui e em nenhum outro lugar: a tarefa é um evento da
 * linha do tempo — não uma tabela à parte —, `Ticket.spentSeconds` é a
 * soma recalculada e não um contador que diverge, apontar tempo é
 * acrescentar, e um modelo com marcador inventado é recusado ao salvar,
 * não na resposta ao cliente.
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();

  const admin = await prisma.user.create({
    data: {
      email: 'admin@teste.dev',
      name: 'Administradora',
      passwordHash: (
        await prisma.user.findUniqueOrThrow({
          where: { id: f.supervisor.id },
          select: { passwordHash: true },
        })
      ).passwordHash,
      mustChangePassword: false,
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: f.organizacao.id, role: 'ADMINISTRADOR' },
  });

  api = await subirApi();
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  assert.equal((await c.entrar(email)).status, 200);
  return c;
}

async function abrir(cliente: Cliente, assunto = 'Impressora travada'): Promise<TicketDetail> {
  const r = await cliente.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: 'A fila para depois do segundo trabalho.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('tarefas do chamado', () => {
  it('nasce na linha do tempo, interna, e soma no tempo gasto', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const r = await agente.post<TicketTaskView[]>(`/tickets/${chamado.id}/tarefas`, {
      body: 'Conferir o log do spooler no servidor.',
      spentSeconds: 1800,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.length, 1);
    assert.equal(r.corpo[0].done, false);
    assert.equal(r.corpo[0].spentSeconds, 1800);
    assert.equal(r.corpo[0].author?.id, f.agente.id);

    // A tarefa é um evento do tipo TAREFA, e é interna: quem pediu não
    // precisa ver "conferir o log do servidor".
    const eventos = await agente.get<{ type: string; visibility: string }[]>(
      `/tickets/${chamado.id}/eventos`,
    );
    const tarefas = eventos.corpo.filter((e) => e.type === 'TAREFA');
    assert.equal(tarefas.length, 1);
    assert.equal(tarefas[0].visibility, 'INTERNA');

    const detalhe = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(detalhe.corpo.spentSeconds, 1800);
  });

  it('apontar tempo acrescenta, não substitui', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const criada = await agente.post<TicketTaskView[]>(`/tickets/${chamado.id}/tarefas`, {
      body: 'Trocar o cabo de rede.',
      spentSeconds: 600,
    });

    const depois = await agente.patch<TicketTaskView[]>(
      `/tickets/${chamado.id}/tarefas/${criada.corpo[0].id}`,
      { addSpentSeconds: 900, done: true },
    );

    assert.equal(depois.status, 200, JSON.stringify(depois.corpo));
    assert.equal(depois.corpo[0].spentSeconds, 1500);
    assert.equal(depois.corpo[0].done, true);

    const detalhe = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(detalhe.corpo.spentSeconds, 1500);
  });

  it('o tempo do chamado é a soma, e cai quando a tarefa é apagada', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const uma = await agente.post<TicketTaskView[]>(`/tickets/${chamado.id}/tarefas`, {
      body: 'Primeira',
      spentSeconds: 1200,
    });
    await agente.post(`/tickets/${chamado.id}/tarefas`, { body: 'Segunda', spentSeconds: 300 });

    let detalhe = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(detalhe.corpo.spentSeconds, 1500);

    // Contador incrementado divergiria aqui, e ninguém descobriria: o
    // número continuaria parecendo plausível.
    const restantes = await agente.del<TicketTaskView[]>(
      `/tickets/${chamado.id}/tarefas/${uma.corpo[0].id}`,
    );
    assert.equal(restantes.status, 200);
    assert.equal(restantes.corpo.length, 1);

    detalhe = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(detalhe.corpo.spentSeconds, 300);
  });

  it('o responsável vem com nome, não com o id cru do payload', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const r = await agente.post<TicketTaskView[]>(`/tickets/${chamado.id}/tarefas`, {
      body: 'Pedir orçamento.',
      assigneeId: f.supervisor.id,
    });

    assert.equal(r.corpo[0].assignee?.id, f.supervisor.id);
    assert.equal(r.corpo[0].assignee?.name, 'Supervisora');
  });

  it('recusa responsável de outra organização', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const r = await agente.post<ProblemDetails>(`/tickets/${chamado.id}/tarefas`, {
      body: 'Tarefa com responsável de fora.',
      assigneeId: f.forasteiro.id,
    });

    assert.equal(r.status, 400);
  });

  it('recusa janela que termina antes de começar', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const r = await agente.post<ProblemDetails>(`/tickets/${chamado.id}/tarefas`, {
      body: 'Janela invertida.',
      plannedStart: new Date(Date.now() + 86_400_000).toISOString(),
      plannedEnd: new Date(Date.now() + 3_600_000).toISOString(),
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /termina antes/);
  });

  it('o solicitante lê as tarefas do seu chamado, mas não cria', async () => {
    const agente = await entrar('agente@teste.dev');
    const solicitante = await entrar('solicitante@teste.dev');

    const r = await solicitante.post<TicketDetail>('/tickets', {
      subject: 'Meu computador',
      description: 'Não liga.',
      categoryId: f.categoria.id,
    });
    const chamado = r.corpo;

    await agente.post(`/tickets/${chamado.id}/tarefas`, { body: 'Verificar a fonte.' });

    assert.equal((await solicitante.get(`/tickets/${chamado.id}/tarefas`)).status, 200);
    assert.equal(
      (await solicitante.post(`/tickets/${chamado.id}/tarefas`, { body: 'x' })).status,
      403,
    );
  });

  it('chamado fechado não recebe tarefa', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    await agente.post(`/tickets/${chamado.id}/resolver`, { body: 'Trocado o cabo.' });
    await agente.post(`/tickets/${chamado.id}/fechar`, {});

    const r = await agente.post(`/tickets/${chamado.id}/tarefas`, { body: 'Tarde demais.' });
    assert.equal(r.status, 409);
  });
});

describe('modelos de texto', () => {
  async function criarModelo(
    cliente: Cliente,
    corpo: Record<string, unknown> = {},
  ): Promise<ModeloView> {
    const r = await cliente.post<ModeloView>('/modelos', {
      kind: 'RESPOSTA',
      name: `Modelo ${Math.random().toString(36).slice(2, 8)}`,
      body: 'Olá, {{requerente.nome}}. Já estamos olhando o chamado #{{chamado.numero}}.',
      ...corpo,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    return r.corpo;
  }

  it('recusa marcador inventado ao salvar, não na resposta ao cliente', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/modelos', {
      kind: 'RESPOSTA',
      name: 'Marcador inventado',
      body: 'Olá, {{requerente.apelido}}.',
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /\{\{requerente\.apelido\}\}/);
  });

  it('nota interna só existe em modelo de resposta', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/modelos', {
      kind: 'SOLUCAO',
      name: 'Solução interna',
      body: 'Resolvido.',
      isInternal: true,
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /conceito de resposta/);
  });

  it('nome repetido dentro do mesmo tipo é 409; em tipos diferentes passa', async () => {
    const admin = await entrar('admin@teste.dev');
    const nome = 'Primeiro contato';

    await criarModelo(admin, { name: nome, kind: 'RESPOSTA' });

    const mesmoTipo = await admin.post<ProblemDetails>('/modelos', {
      kind: 'RESPOSTA',
      name: nome,
      body: 'Outro texto.',
    });
    assert.equal(mesmoTipo.status, 409);

    const outroTipo = await admin.post<ModeloView>('/modelos', {
      kind: 'TAREFA',
      name: nome,
      body: 'Outro texto.',
    });
    assert.equal(outroTipo.status, 201, JSON.stringify(outroTipo.corpo));
  });

  it('a categoria do chamado traz os modelos dela e os sem categoria', async () => {
    const admin = await entrar('admin@teste.dev');
    const daCategoria = await criarModelo(admin, { categoryId: f.categoria.id });
    const deQualquer = await criarModelo(admin, {});
    const deOutra = await criarModelo(admin, { categoryId: f.semTime.id });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.get<ModeloView[]>(
      `/modelos?kind=RESPOSTA&categoryId=${f.categoria.id}`,
    );

    const ids = r.corpo.map((m) => m.id);
    assert.ok(ids.includes(daCategoria.id));
    assert.ok(ids.includes(deQualquer.id), 'o modelo sem categoria tem de aparecer');
    assert.ok(!ids.includes(deOutra.id));
  });

  it('o mais usado sobe na lista', async () => {
    const admin = await entrar('admin@teste.dev');
    const pouco = await criarModelo(admin, { name: 'Aaa pouco usado' });
    const muito = await criarModelo(admin, { name: 'Zzz muito usado' });

    const agente = await entrar('agente@teste.dev');
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await agente.post(`/modelos/${muito.id}/uso`, {})).status, 204);
    }

    const r = await agente.get<ModeloView[]>('/modelos?kind=RESPOSTA');
    const posicaoMuito = r.corpo.findIndex((m) => m.id === muito.id);
    const posicaoPouco = r.corpo.findIndex((m) => m.id === pouco.id);

    assert.ok(posicaoMuito < posicaoPouco, 'o mais usado tem de vir primeiro');
    assert.equal(r.corpo[posicaoMuito].usageCount, 3);
  });

  it('o inativo some da lista de quem atende', async () => {
    const admin = await entrar('admin@teste.dev');
    const modelo = await criarModelo(admin);

    await admin.patch(`/modelos/${modelo.id}`, { isActive: false });

    const agente = await entrar('agente@teste.dev');
    const ativos = await agente.get<ModeloView[]>('/modelos?kind=RESPOSTA');
    assert.ok(!ativos.corpo.some((m) => m.id === modelo.id));

    const todos = await agente.get<ModeloView[]>('/modelos?kind=RESPOSTA&incluirInativos=true');
    assert.ok(todos.corpo.some((m) => m.id === modelo.id));
  });

  it('quem atende usa mas não configura', async () => {
    const admin = await entrar('admin@teste.dev');
    const modelo = await criarModelo(admin);

    const agente = await entrar('agente@teste.dev');
    assert.equal((await agente.get('/modelos')).status, 200);
    assert.equal(
      (await agente.post('/modelos', { kind: 'RESPOSTA', name: 'Meu', body: 'Oi.' })).status,
      403,
    );
    assert.equal((await agente.del(`/modelos/${modelo.id}`)).status, 403);
  });

  it('modelo de outra organização não existe para quem pergunta', async () => {
    const admin = await entrar('admin@teste.dev');
    const modelo = await criarModelo(admin);

    const forasteiro = await entrar('forasteiro@teste.dev');
    assert.equal((await forasteiro.patch(`/modelos/${modelo.id}`, { name: 'Roubado' })).status, 403);
  });
});

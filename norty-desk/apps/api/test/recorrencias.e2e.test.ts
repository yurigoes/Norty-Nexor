import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ProblemDetails, RecorrenciaView, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { RecorrenciasService } from '../src/modules/recorrencias/recorrencias.service';

/**
 * Chamado recorrente.
 *
 * O que se prova aqui e em nenhum outro lugar: a agenda calcula a
 * próxima ocorrência ao ser salva, o ciclo abre o chamado quando ela
 * vence, a antecedência antecipa a abertura sem mexer na ocorrência
 * seguinte, e rodar o ciclo duas vezes não abre o chamado duas vezes.
 */

let api: Api;
let f: Fixtura;
let recorrencias: RecorrenciasService;
/** Configurar agenda é `config:recorrencia`, que só o administrador tem. */
let adminId: string;

before(async () => {
  await limparBanco();
  f = await semear();

  // A semeadura base não tem administrador, e o teste precisa provar
  // que o supervisor **não** alcança esta configuração.
  const admin = await prisma.user.create({
    data: {
      email: 'admin@teste.dev',
      name: 'Administradora',
      passwordHash: (await prisma.user.findUniqueOrThrow({
        where: { id: f.supervisor.id },
        select: { passwordHash: true },
      })).passwordHash,
      mustChangePassword: false,
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: f.organizacao.id, role: 'ADMINISTRADOR' },
  });
  adminId = admin.id;

  api = await subirApi();

  const { RecorrenciasService } = await import('../src/modules/recorrencias/recorrencias.service');
  recorrencias = api.app.get(RecorrenciasService);
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

const DIARIA_AS_8 = { tipo: 'DIARIA', hora: 8, minuto: 0 } as const;

async function criar(
  cliente: Cliente,
  corpo: Record<string, unknown> = {},
): Promise<RecorrenciaView> {
  const r = await cliente.post<RecorrenciaView>('/recorrencias', {
    name: `Conferência de backup ${Math.random().toString(36).slice(2, 8)}`,
    subject: 'Conferir o backup da noite',
    description: 'Abrir o relatório do backup e confirmar que os três volumes fecharam.',
    schedule: DIARIA_AS_8,
    categoryId: f.categoria.id,
    ...corpo,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** Puxa a agenda para o passado, como se a ocorrência já tivesse chegado. */
async function venceAgenda(id: string, quandoMs = Date.now() - 60_000): Promise<void> {
  await prisma.recurringTicket.update({
    where: { id },
    data: { nextRunAt: new Date(quandoMs) },
  });
}

// ---------------------------------------------------------------------

describe('cadastro da agenda', () => {
  it('calcula a próxima ocorrência ao salvar e a descreve em português', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);

    assert.equal(agenda.descricao, 'Todo dia às 08:00');
    assert.ok(agenda.nextRunAt);
    assert.ok(new Date(agenda.nextRunAt) > new Date());
    assert.equal(agenda.runCount, 0);
    // Sem requerente informado, quem criou a agenda responde por ela.
    assert.equal(agenda.requester.id, adminId);
  });

  it('nome repetido é 409 com a frase, não 500 com mensagem genérica', async () => {
    const admin = await entrar('admin@teste.dev');
    const nome = 'Agenda com nome repetido';

    await criar(admin, { name: nome });
    const segunda = await admin.post<ProblemDetails>('/recorrencias', {
      name: nome,
      subject: 'Conferir alguma coisa',
      description: 'Descrição comprida o bastante para o DTO aceitar.',
      schedule: DIARIA_AS_8,
    });

    assert.equal(segunda.status, 409);
    assert.match(segunda.corpo.title, /Já existe uma agenda/);
  });

  it('recusa semanal sem nenhum dia marcado', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/recorrencias', {
      name: 'Agenda que nunca dispara',
      subject: 'Conferir alguma coisa',
      description: 'Descrição comprida o bastante para o DTO aceitar.',
      schedule: { tipo: 'SEMANAL', diasDaSemana: [], hora: 9, minuto: 0 },
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /nunca dispara/);
  });

  it('recusa fuso horário desconhecido em vez de cair no UTC calado', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/recorrencias', {
      name: 'Fuso inventado',
      subject: 'Conferir alguma coisa',
      description: 'Descrição comprida o bastante para o DTO aceitar.',
      schedule: DIARIA_AS_8,
      timezone: 'America/Nao_Existe',
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /Fuso horário desconhecido/);
  });

  it('recusa vigência que termina antes de começar', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/recorrencias', {
      name: 'Vigência invertida',
      subject: 'Conferir alguma coisa',
      description: 'Descrição comprida o bastante para o DTO aceitar.',
      schedule: DIARIA_AS_8,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    assert.equal(r.status, 400);
  });

  it('a vigência futura empurra a primeira ocorrência para depois do início', async () => {
    const admin = await entrar('admin@teste.dev');
    const daquiATresDias = new Date(Date.now() + 3 * 86_400_000);

    const agenda = await criar(admin, { startsAt: daquiATresDias.toISOString() });

    assert.ok(agenda.nextRunAt);
    assert.ok(new Date(agenda.nextRunAt) >= daquiATresDias);
  });

  it('editar a agenda recalcula a próxima ocorrência', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);

    const editada = await admin.patch<RecorrenciaView>(`/recorrencias/${agenda.id}`, {
      schedule: { tipo: 'MENSAL', diaDoMes: 1, hora: 6, minuto: 30 },
    });

    assert.equal(editada.status, 200, JSON.stringify(editada.corpo));
    assert.equal(editada.corpo.descricao, 'Todo dia 1 de cada mês às 06:30');
    assert.notEqual(editada.corpo.nextRunAt, agenda.nextRunAt);
  });
});

describe('o ciclo', () => {
  it('abre o chamado quando a ocorrência vence, e avança a agenda', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);
    await venceAgenda(agenda.id);

    const abertos = await recorrencias.materializarVencidas();
    assert.ok(abertos >= 1);

    const depois = await admin.get<RecorrenciaView>(`/recorrencias/${agenda.id}`);
    assert.equal(depois.corpo.runCount, 1);
    assert.ok(depois.corpo.lastRunAt);
    assert.ok(new Date(depois.corpo.nextRunAt!) > new Date());

    const chamados = await admin.get<{ id: string; subject: string }[]>(
      `/recorrencias/${agenda.id}/chamados`,
    );
    assert.equal(chamados.corpo.length, 1);
    assert.equal(chamados.corpo[0].subject, 'Conferir o backup da noite');
  });

  it('o chamado nasce pelo SISTEMA, com o requerente e a categoria da agenda', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin, {
      requesterId: f.solicitante.id,
      assignedTeamId: f.time.id,
      urgency: 4,
      impact: 4,
    });
    await venceAgenda(agenda.id);
    await recorrencias.materializarVencidas();

    const [chamado] = await admin.get<{ id: string }[]>(`/recorrencias/${agenda.id}/chamados`)
      .then((r) => r.corpo);

    const detalhe = await admin.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(detalhe.corpo.originChannel, 'SISTEMA');
    assert.equal(detalhe.corpo.requester?.id, f.solicitante.id);
    assert.equal(detalhe.corpo.category?.id, f.categoria.id);
    assert.equal(detalhe.corpo.assignedTeam?.id, f.time.id);
    // Prioridade é derivada, nunca digitada: 4x4 na matriz padrão é 4.
    assert.equal(detalhe.corpo.priority, 4);
    assert.equal(detalhe.corpo.status, 'ATRIBUIDO');
  });

  it('a linha do tempo diz de qual agenda o chamado nasceu', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin, { name: 'Troca do filtro do nobreak' });
    await venceAgenda(agenda.id);
    await recorrencias.materializarVencidas();

    const [chamado] = await admin.get<{ id: string }[]>(`/recorrencias/${agenda.id}/chamados`)
      .then((r) => r.corpo);

    const eventos = await admin.get<{ body: string | null }[]>(`/tickets/${chamado.id}/eventos`);
    assert.ok(
      eventos.corpo.some((e) => (e.body ?? '').includes('Troca do filtro do nobreak')),
      'a nota interna com o nome da agenda não apareceu',
    );
  });

  it('rodar o ciclo duas vezes não abre o chamado duas vezes', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);
    await venceAgenda(agenda.id);

    await recorrencias.materializarVencidas();
    await recorrencias.materializarVencidas();

    const chamados = await admin.get<unknown[]>(`/recorrencias/${agenda.id}/chamados`);
    assert.equal(chamados.corpo.length, 1);
  });

  it('dois ciclos simultâneos também não duplicam', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);
    await venceAgenda(agenda.id);

    // O avanço condicionado de `nextRunAt` é o que segura isto: o
    // segundo `updateMany` afeta zero linhas e a passada desiste.
    await Promise.all([
      recorrencias.materializarVencidas(),
      recorrencias.materializarVencidas(),
    ]);

    const chamados = await admin.get<unknown[]>(`/recorrencias/${agenda.id}/chamados`);
    assert.equal(chamados.corpo.length, 1);
  });

  it('agenda desligada não abre nada', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin, { isActive: false });
    await venceAgenda(agenda.id);

    await recorrencias.materializarVencidas();

    const chamados = await admin.get<unknown[]>(`/recorrencias/${agenda.id}/chamados`);
    assert.equal(chamados.corpo.length, 0);
  });

  it('a antecedência abre antes da ocorrência, sem mexer na seguinte', async () => {
    const admin = await entrar('admin@teste.dev');
    // Três dias de antecedência, ocorrência daqui a dois dias: já vence.
    const agenda = await criar(admin, { createBeforeSeconds: 3 * 86_400 });
    const daquiADoisDias = Date.now() + 2 * 86_400_000;
    await venceAgenda(agenda.id, daquiADoisDias);

    await recorrencias.materializarVencidas();

    const depois = await admin.get<RecorrenciaView>(`/recorrencias/${agenda.id}`);
    assert.equal(depois.corpo.runCount, 1);
    // A ocorrência seguinte é a do dia posterior, não "agora + 1 dia".
    assert.ok(new Date(depois.corpo.nextRunAt!).getTime() > daquiADoisDias);
  });

  it('agenda cuja vigência terminou para de apontar para o futuro', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin, {
      endsAt: new Date(Date.now() + 36 * 3600_000).toISOString(),
    });
    assert.ok(agenda.nextRunAt);

    // Puxa a última ocorrência para o passado e roda: depois dela, a
    // vigência acaba e não há próxima.
    await prisma.recurringTicket.update({
      where: { id: agenda.id },
      data: { nextRunAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 1000) },
    });

    await recorrencias.materializarVencidas();

    const depois = await admin.get<RecorrenciaView>(`/recorrencias/${agenda.id}`);
    assert.equal(depois.corpo.nextRunAt, null);
    assert.equal(depois.corpo.runCount, 1);
  });
});

describe('escopo e permissão', () => {
  it('o supervisor não configura agenda; o administrador sim', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    assert.equal((await supervisor.get('/recorrencias')).status, 403);

    const admin = await entrar('admin@teste.dev');
    assert.equal((await admin.get('/recorrencias')).status, 200);
  });

  it('agenda de outra organização não existe para quem pergunta', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);

    const forasteiro = await entrar('forasteiro@teste.dev');
    assert.equal((await forasteiro.get(`/recorrencias/${agenda.id}`)).status, 403);
  });

  it('apagar a agenda não apaga os chamados que ela abriu', async () => {
    const admin = await entrar('admin@teste.dev');
    const agenda = await criar(admin);
    await venceAgenda(agenda.id);
    await recorrencias.materializarVencidas();

    const [chamado] = await admin.get<{ id: string }[]>(`/recorrencias/${agenda.id}/chamados`)
      .then((r) => r.corpo);

    assert.equal((await admin.del(`/recorrencias/${agenda.id}`)).status, 204);
    assert.equal((await admin.get(`/tickets/${chamado.id}`)).status, 200);
  });
});

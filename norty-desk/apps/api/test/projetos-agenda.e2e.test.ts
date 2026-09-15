import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AgendaItem, ProblemDetails, ProjetoDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Projetos, tarefas e agenda.
 *
 * O que se prova aqui e em nenhum outro lugar: o andamento do projeto
 * vem das tarefas, **ponderado pelas horas** — uma tarefa de oitenta
 * horas concluída vale mais que uma de duas, que é a diferença entre
 * uma barra que informa e uma que engana. E a agenda mostra sem copiar:
 * tarefa de chamado e de projeto aparecem de onde estão, e compromisso
 * privado de outra pessoa aparece como "Ocupado".
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();
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

async function criarProjeto(c: Cliente, name: string, extra: Record<string, unknown> = {}) {
  const r = await c.post<ProjetoDetail>('/projects', { name, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('projeto', () => {
  it('o código não se repete na organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    await criarProjeto(supervisor, 'Migração de servidores', { code: 'MIG-2026' });

    const repetido = await supervisor.post<ProblemDetails>('/projects', {
      name: 'Outro projeto', code: 'MIG-2026',
    });
    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
    assert.match(repetido.corpo.detail ?? '', /Migração de servidores/);
  });

  it('recusa fim previsto antes do início', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.post<ProblemDetails>('/projects', {
      name: 'Viagem no tempo',
      plannedStart: '2026-06-01T00:00:00.000Z',
      plannedEnd: '2026-05-01T00:00:00.000Z',
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('um projeto não é subprojeto de si mesmo nem da própria descendência', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const pai = await criarProjeto(supervisor, 'Programa');
    const filho = await criarProjeto(supervisor, 'Projeto filho', { parentId: pai.id });

    const emSiMesmo = await supervisor.patch<ProblemDetails>(`/projects/${pai.id}`, { parentId: pai.id });
    assert.equal(emSiMesmo.status, 409, JSON.stringify(emSiMesmo.corpo));

    // Pendurar o pai debaixo do próprio filho some com a raiz da árvore.
    const noProprioFilho = await supervisor.patch<ProblemDetails>(`/projects/${pai.id}`, {
      parentId: filho.id,
    });
    assert.equal(noProprioFilho.status, 409, JSON.stringify(noProprioFilho.corpo));
  });

  it('projeto com tarefa não se exclui — cancela', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const projeto = await criarProjeto(supervisor, 'Com tarefa');
    await supervisor.post(`/projects/${projeto.id}/tasks`, { name: 'Alguma tarefa' });

    const recusa = await supervisor.del<ProblemDetails>(`/projects/${projeto.id}`);
    assert.equal(recusa.status, 409, JSON.stringify(recusa.corpo));

    const cancelado = await supervisor.patch<ProjetoDetail>(`/projects/${projeto.id}`, {
      status: 'CANCELADO',
    });
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.corpo.status, 'CANCELADO');
  });
});

describe('andamento', () => {
  it('é ponderado pelas horas, não pela contagem de tarefas', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const projeto = await criarProjeto(supervisor, 'Ponderado');

    // Uma tarefa longa por fazer e uma curtinha concluída. Contando
    // tarefas daria 50%; pelas horas, quase nada.
    await supervisor.post(`/projects/${projeto.id}/tasks`, {
      name: 'Migrar o banco', plannedMinutes: 80 * 60,
    });
    await supervisor.post(`/projects/${projeto.id}/tasks`, {
      name: 'Avisar a equipe', plannedMinutes: 2 * 60, status: 'CONCLUIDA',
    });

    const detalhe = await supervisor.get<ProjetoDetail>(`/projects/${projeto.id}`);
    assert.equal(detalhe.status, 200);
    // 2h de 82h ≈ 2%.
    assert.equal(detalhe.corpo.percentDone, 2, 'o andamento deveria seguir as horas, não a contagem');
  });

  it('concluir a tarefa leva o percentual dela a 100', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const projeto = await criarProjeto(supervisor, 'Conclusão');
    const criada = await supervisor.post<ProjetoDetail>(`/projects/${projeto.id}/tasks`, {
      name: 'Tarefa única', percentDone: 30,
    });
    const tarefa = criada.corpo.tasks[0];
    assert.equal(criada.corpo.percentDone, 30);

    const concluida = await supervisor.patch<ProjetoDetail>(
      `/projects/${projeto.id}/tasks/${tarefa.id}`,
      { status: 'CONCLUIDA' },
    );
    assert.equal(concluida.status, 200, JSON.stringify(concluida.corpo));
    assert.equal(concluida.corpo.tasks.find((t) => t.id === tarefa.id)?.percentDone, 100);
    assert.equal(concluida.corpo.percentDone, 100);
  });
});

describe('chamado no projeto', () => {
  it('vincula pelo número e recusa o mesmo chamado duas vezes', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const projeto = await criarProjeto(supervisor, 'Com chamados');

    const chamado = await supervisor.post<{ number: number }>('/tickets', {
      subject: 'Chamado do projeto',
      description: 'Descrição suficiente para abrir o chamado.',
      categoryId: f.categoria.id,
    });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));

    const vinculado = await supervisor.post<ProjetoDetail>(`/projects/${projeto.id}/tickets`, {
      number: chamado.corpo.number,
    });
    assert.equal(vinculado.status, 201, JSON.stringify(vinculado.corpo));
    assert.equal(vinculado.corpo.tickets.length, 1);

    const repetido = await supervisor.post<ProblemDetails>(`/projects/${projeto.id}/tickets`, {
      number: chamado.corpo.number,
    });
    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
  });
});

describe('agenda', () => {
  const periodo = (dias = 7) => {
    const de = new Date();
    const ate = new Date(de.getTime() + dias * 24 * 3600 * 1000);
    return `from=${de.toISOString()}&to=${ate.toISOString()}`;
  };

  it('o compromisso próprio aparece com título; o privado alheio vira "Ocupado"', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const agente = await entrar('agente@teste.dev');

    const comeca = new Date(Date.now() + 3600 * 1000).toISOString();
    const termina = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    const marcado = await agente.post<AgendaItem>('/agenda/events', {
      title: 'Consulta médica',
      startsAt: comeca,
      endsAt: termina,
      isPrivate: true,
    });
    assert.equal(marcado.status, 201, JSON.stringify(marcado.corpo));

    // Para o dono, o título.
    const doDono = await agente.get<AgendaItem[]>(`/agenda?${periodo()}&userIds=${f.agente.id}`);
    assert.equal(doDono.status, 200);
    assert.ok(doDono.corpo.some((i) => i.title === 'Consulta médica'));

    // Para o outro, só que o horário está tomado.
    const deFora = await supervisor.get<AgendaItem[]>(`/agenda?${periodo()}&userIds=${f.agente.id}`);
    assert.equal(deFora.status, 200);
    const alheio = deFora.corpo.find((i) => i.kind === 'EVENTO' && i.private);
    assert.ok(alheio, 'o compromisso alheio deveria aparecer como horário ocupado');
    assert.equal(alheio.title, 'Ocupado', 'o assunto do compromisso privado vazou');
    assert.equal(alheio.editable, false);
  });

  it('recusa compromisso que termina antes de começar', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.post<ProblemDetails>('/agenda/events', {
      title: 'Ao contrário',
      startsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('recusa consulta de período grande demais', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.get<ProblemDetails>(`/agenda?${periodo(400)}`);
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /dias/i);
  });

  it('a tarefa de projeto com data aparece na agenda de quem a tem', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const projeto = await criarProjeto(supervisor, 'Projeto com agenda');
    const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const comTarefa = await supervisor.post<ProjetoDetail>(`/projects/${projeto.id}/tasks`, {
      name: 'Revisar o desenho',
      assigneeId: f.agente.id,
      plannedStart: amanha,
      plannedEnd: amanha,
    });
    assert.equal(comTarefa.status, 201, JSON.stringify(comTarefa.corpo));

    const agenda = await supervisor.get<AgendaItem[]>(`/agenda?${periodo()}&userIds=${f.agente.id}`);
    assert.equal(agenda.status, 200);
    // O título traz o projeto na frente: quem olha a semana precisa
    // saber de que projeto é a tarefa sem abrir.
    const item = agenda.corpo.find(
      (i) => i.kind === 'TAREFA_PROJETO' && i.title.includes('Revisar o desenho'),
    );
    assert.ok(item, 'a tarefa de projeto não apareceu na agenda do responsável');
    assert.match(item.title, /Projeto com agenda/);
    // Sem cópia: o item aponta para o projeto de onde veio.
    assert.equal(item.link, `/projetos/${projeto.id}`);
  });
});

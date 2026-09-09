import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { ApprovalView, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

/**
 * Aprovação em etapas.
 *
 * O que se prova aqui e em nenhum outro lugar: o quórum decide, a
 * ordem das etapas é respeitada, ninguém decide no lugar de outro, e o
 * chamado volta para onde estava — não para um status arbitrário.
 */

let api: Api;
let f: Fixtura;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  const { DespachoJob } = await import('../src/modules/channels/despacho.job');
  const { EnvioSimulado } = await import('../src/modules/channels/transporte');
  despacho = api.app.get(DespachoJob);
  simulado = api.app.get(EnvioSimulado);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(() => {
  simulado.enviados.length = 0;
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  assert.equal((await c.entrar(email)).status, 200);
  return c;
}

async function abrir(assunto: string): Promise<{ chamado: TicketDetail; agente: Cliente }> {
  const agente = await entrar('agente@teste.dev');
  const r = await agente.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: 'x',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return { chamado: r.corpo, agente };
}

// ---------------------------------------------------------------------

describe('solicitar aprovação', () => {
  it('leva o chamado para EM_APROVACAO e avisa cada validador', async () => {
    const { chamado, agente } = await abrir('Compra de licença');

    const r = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id, f.gestor.id],
      quorum: 1,
      comment: 'Preciso de um aval para comprar.',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.length, 2);
    assert.ok(r.corpo.every((a) => a.status === 'AGUARDANDO' && a.step === 1 && a.quorum === 1));

    const atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.status, 'EM_APROVACAO');

    // O aviso é o que faz alguém saber que foi chamado. Sem ele o
    // chamado espera até alguém reparar sozinho.
    await despacho.despachar();
    for (const email of ['supervisor@teste.dev', 'gestor@teste.dev']) {
      assert.ok(
        simulado.enviados.some((e) => e.para === email),
        `${email} deveria ter sido avisado`,
      );
    }
  });

  it('quórum maior que o número de validadores é recusado na entrada', async () => {
    const { chamado, agente } = await abrir('Quórum impossível');

    const r = await agente.post(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id],
      quorum: 3,
    });

    assert.equal(r.status, 400, 'uma etapa que nunca poderia passar não deve ser criada');
  });

  it('validador de outra organização não entra pelo corpo da requisição', async () => {
    const { chamado, agente } = await abrir('Validador alheio');

    const r = await agente.post(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.forasteiro.id],
    });

    assert.equal(r.status, 400);
  });

  it('o solicitante não pede aprovação', async () => {
    const { chamado } = await abrir('Sem permissão');
    const solicitante = await entrar('solicitante@teste.dev');

    const r = await solicitante.post(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id],
    });

    assert.equal(r.status, 403);
  });
});

// ---------------------------------------------------------------------

describe('decidir', () => {
  it('o quórum encerra a etapa e devolve o chamado ao status anterior', async () => {
    const { chamado, agente } = await abrir('Dois de dois');

    await agente.post(`/tickets/${chamado.id}/atribuir`, { userId: f.agente.id });
    const antes = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(antes.status, 'ATRIBUIDO');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id, f.gestor.id],
      quorum: 2,
    });

    const doSupervisor = pedido.corpo.find((a) => a.approver.id === f.supervisor.id)!;
    const doGestor = pedido.corpo.find((a) => a.approver.id === f.gestor.id)!;

    const supervisor = await entrar('supervisor@teste.dev');
    await supervisor.post(`/aprovacoes/${doSupervisor.id}/decidir`, { decision: 'APROVADO' });

    // Um "sim" de dois: ainda em aprovação.
    let atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.status, 'EM_APROVACAO', 'faltava o segundo "sim"');

    const gestor = await entrar('gestor@teste.dev');
    const r = await gestor.post<ApprovalView[]>(`/aprovacoes/${doGestor.id}/decidir`, {
      decision: 'APROVADO',
      comment: 'De acordo.',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.status, 'ATRIBUIDO', 'o chamado volta para onde estava, não para NOVO');
  });

  it('uma recusa não derruba a etapa enquanto o quórum ainda couber', async () => {
    const { chamado, agente } = await abrir('Um de dois');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id, f.gestor.id],
      quorum: 1,
    });

    const doSupervisor = pedido.corpo.find((a) => a.approver.id === f.supervisor.id)!;
    const supervisor = await entrar('supervisor@teste.dev');
    await supervisor.post(`/aprovacoes/${doSupervisor.id}/decidir`, { decision: 'RECUSADO' });

    const atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(
      atual.status,
      'EM_APROVACAO',
      '"um de dois" quer dizer que o outro ainda pode aprovar',
    );
  });

  it('a recusa que torna o quórum impossível encerra a aprovação', async () => {
    const { chamado, agente } = await abrir('Recusa decisiva');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id, f.gestor.id],
      quorum: 2,
    });

    const doSupervisor = pedido.corpo.find((a) => a.approver.id === f.supervisor.id)!;
    const supervisor = await entrar('supervisor@teste.dev');
    await supervisor.post(`/aprovacoes/${doSupervisor.id}/decidir`, { decision: 'RECUSADO' });

    const atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(
      atual.status,
      'ATRIBUIDO',
      'com dois "sim" exigidos e uma recusa, o segundo "sim" já não bastaria',
    );

    // E quem ainda não respondeu não decide o que já foi decidido.
    const doGestor = pedido.corpo.find((a) => a.approver.id === f.gestor.id)!;
    const gestor = await entrar('gestor@teste.dev');
    const tardia = await gestor.post(`/aprovacoes/${doGestor.id}/decidir`, { decision: 'APROVADO' });
    assert.equal(tardia.status, 409);
  });

  it('ninguém decide no lugar de outro', async () => {
    const { chamado, agente } = await abrir('Aprovação alheia');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id],
    });

    const gestor = await entrar('gestor@teste.dev');
    const r = await gestor.post(`/aprovacoes/${pedido.corpo[0]!.id}/decidir`, {
      decision: 'APROVADO',
    });

    assert.equal(r.status, 403, 'nem supervisor decide no lugar de quem foi designado');
  });

  it('decidir duas vezes é conflito', async () => {
    const { chamado, agente } = await abrir('Decisão repetida');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id],
    });

    const supervisor = await entrar('supervisor@teste.dev');
    const id = pedido.corpo[0]!.id;

    assert.equal((await supervisor.post(`/aprovacoes/${id}/decidir`, { decision: 'APROVADO' })).status, 201);
    assert.equal((await supervisor.post(`/aprovacoes/${id}/decidir`, { decision: 'RECUSADO' })).status, 409);
  });
});

// ---------------------------------------------------------------------

describe('etapas em sequência', () => {
  it('a etapa 2 só decide depois da 1', async () => {
    const { chamado, agente } = await abrir('Gerente, depois diretor');

    const etapa1 = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id],
    });
    const etapa2 = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.gestor.id],
    });

    assert.equal(etapa2.corpo.find((a) => a.approver.id === f.gestor.id)!.step, 2);

    const gestor = await entrar('gestor@teste.dev');
    const idDaEtapa2 = etapa2.corpo.find((a) => a.step === 2)!.id;

    const cedo = await gestor.post(`/aprovacoes/${idDaEtapa2}/decidir`, { decision: 'APROVADO' });
    assert.equal(cedo.status, 409, 'o diretor não decide antes do gerente');

    // A etapa 2 nem aparece na lista do gestor enquanto a 1 corre.
    const minhas = await gestor.get<ApprovalView[]>('/aprovacoes/minhas');
    assert.ok(
      !minhas.corpo.some((a) => a.id === idDaEtapa2),
      'não é a vez dele, e a lista não deve dizer que é',
    );

    const supervisor = await entrar('supervisor@teste.dev');
    await supervisor.post(`/aprovacoes/${etapa1.corpo[0]!.id}/decidir`, { decision: 'APROVADO' });

    const emAprovacao = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(emAprovacao.status, 'EM_APROVACAO', 'ainda falta a etapa 2');

    const agora = await gestor.get<ApprovalView[]>('/aprovacoes/minhas');
    assert.ok(agora.corpo.some((a) => a.id === idDaEtapa2), 'agora é a vez dele');

    await gestor.post(`/aprovacoes/${idDaEtapa2}/decidir`, { decision: 'APROVADO' });
    const fim = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(fim.status, 'ATRIBUIDO');
  });
});

// ---------------------------------------------------------------------

describe('portal do solicitante', () => {
  it('um solicitante decide uma aprovação de chamado que não é dele', async () => {
    const { chamado, agente } = await abrir('Aval do dono do orçamento');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.solicitante.id],
    });

    const solicitante = await entrar('solicitante@teste.dev');

    // Ele não é requerente nem observador: pelo escopo de leitura, o
    // chamado não existe para ele.
    const semAcesso = await solicitante.get(`/tickets/${chamado.id}`);
    assert.equal(semAcesso.status, 404);

    // Mas ter sido designado validador é autorização suficiente para
    // decidir — e para receber a lista de volta sem levar 404.
    const minhas = await solicitante.get<ApprovalView[]>('/aprovacoes/minhas');
    assert.equal(minhas.status, 200);
    assert.ok(minhas.corpo.some((a) => a.id === pedido.corpo[0]!.id));

    const r = await solicitante.post<ApprovalView[]>(
      `/aprovacoes/${pedido.corpo[0]!.id}/decidir`,
      { decision: 'APROVADO', comment: 'Pode comprar.' },
    );

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo[0]!.status, 'APROVADO');
    assert.equal(r.corpo[0]!.comment, 'Pode comprar.');
  });
});

// ---------------------------------------------------------------------

describe('a aprovação não vaza para o cliente', () => {
  it('os eventos de aprovação são internos', async () => {
    const { chamado, agente } = await abrir('Nada disso sai');

    const pedido = await agente.post<ApprovalView[]>(`/tickets/${chamado.id}/aprovacoes`, {
      approverIds: [f.supervisor.id],
      comment: 'ISTO É CONVERSA INTERNA.',
    });

    simulado.enviados.length = 0;
    const supervisor = await entrar('supervisor@teste.dev');
    await supervisor.post(`/aprovacoes/${pedido.corpo[0]!.id}/decidir`, {
      decision: 'RECUSADO',
      comment: 'NÃO TEM ORÇAMENTO.',
    });

    const eventos = await prisma.ticketEvent.findMany({
      where: { ticketId: chamado.id, type: 'APROVACAO' },
    });

    assert.ok(eventos.length > 0);
    assert.ok(
      eventos.every((e) => e.visibility === 'INTERNA'),
      'a aprovação é assunto de quem atende, não do cliente',
    );

    await despacho.despachar();
    assert.ok(
      !simulado.enviados.some((e) => e.corpo.includes('ORÇAMENTO')),
      'a recusa não pode sair por canal externo',
    );
  });
});

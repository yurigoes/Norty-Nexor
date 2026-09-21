import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AppointmentView, ProblemDetails, TicketDetail, TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Atendimento marcado, e o prazo que ele empurra.
 *
 * O que se prova aqui é a regra que dá sentido ao bloco: a visita só
 * estica o prazo **quando precisa**. Marcar visita para amanhã num
 * chamado que vence semana que vem não muda prazo nenhum — e é por essa
 * porta, se ela ficasse aberta, que um indicador de SLA deixaria de
 * significar alguma coisa.
 *
 * Nenhum teste aqui depende da hora em que a suíte roda: o vencimento é
 * posto onde o teste precisa dele antes de cada caso. O calendário da
 * fixtura é de segunda a sexta, das 9 às 18, e uma suíte que só passa em
 * horário comercial já custou caro uma vez.
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
  assert.equal((await c.entrar(email)).status, 200, `login de ${email} falhou`);
  return c;
}

const DIA = 24 * 60 * 60 * 1000;
const daquiA = (ms: number) => new Date(Date.now() + ms);

async function abrirChamado(c: Cliente): Promise<TicketDetail> {
  const r = await c.post<TicketDetail>('/tickets', {
    subject: 'Roteador sem sinal na filial',
    description: 'Precisa de visita.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** Põe o vencimento de resolução onde o teste precisa dele. */
async function fixarVencimento(ticketId: string, quando: Date): Promise<void> {
  const { count } = await prisma.slaCommitment.updateMany({
    where: { ticketId, target: 'TTR' },
    data: { dueAt: quando, postponedSeconds: 0, breachedAt: null },
  });
  assert.equal(count, 1, 'o chamado deveria ter um compromisso de resolução');
}

async function vencimento(ticketId: string) {
  return prisma.slaCommitment.findFirstOrThrow({ where: { ticketId, target: 'TTR' } });
}

async function marcar(c: Cliente, ticketId: string, corpo: Record<string, unknown>) {
  return c.post<AppointmentView>(`/tickets/${ticketId}/agendamentos`, corpo);
}

describe('agendar atendimento', () => {
  it('a visita marcada depois do prazo empurra o vencimento até o fim dela', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    await fixarVencimento(chamado.id, daquiA(DIA));

    const quando = daquiA(30 * DIA);
    const r = await marcar(agente, chamado.id, {
      scheduledFor: quando.toISOString(),
      durationMinutes: 120,
      technicianId: f.agente.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const depois = await vencimento(chamado.id);
    assert.equal(
      depois.dueAt.toISOString(),
      new Date(quando.getTime() + 120 * 60_000).toISOString(),
      'o prazo deveria ir até o fim da visita',
    );
    assert.ok(depois.postponedSeconds > 0, 'o adiamento deveria estar contado');
    assert.equal(r.corpo.postponedSeconds, depois.postponedSeconds);
  });

  it('a visita que cabe no prazo não estica nada', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const prazo = daquiA(60 * DIA);
    await fixarVencimento(chamado.id, prazo);

    const r = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(30 * DIA).toISOString(),
      durationMinutes: 60,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.postponedSeconds, 0, 'nada a adiar');

    const depois = await vencimento(chamado.id);
    assert.equal(depois.dueAt.toISOString(), prazo.toISOString(), 'o prazo não devia ter mexido');
    assert.equal(depois.postponedSeconds, 0);
  });

  it('o adiamento é contado à parte do tempo de pendência', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    await fixarVencimento(chamado.id, daquiA(DIA));

    await marcar(agente, chamado.id, { scheduledFor: daquiA(20 * DIA).toISOString() });

    const depois = await vencimento(chamado.id);
    assert.ok(depois.postponedSeconds > 0, 'o adiamento entra em postponedSeconds');
    assert.equal(depois.pausedSeconds, 0, 'e não contamina o tempo de pendência');
  });

  it('só o prazo de resolução anda; o de primeiro atendimento fica', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    await fixarVencimento(chamado.id, daquiA(DIA));

    const tto = await prisma.slaCommitment.findFirstOrThrow({
      where: { ticketId: chamado.id, target: 'TTO' },
    });

    await marcar(agente, chamado.id, { scheduledFor: daquiA(30 * DIA).toISOString() });

    const ttoDepois = await prisma.slaCommitment.findUniqueOrThrow({ where: { id: tto.id } });
    assert.equal(
      ttoDepois.dueAt.toISOString(),
      tto.dueAt.toISOString(),
      'marcar visita não é desculpa para não ter respondido',
    );
  });

  it('o chamado passa a PLANEJADO, e volta a ATRIBUIDO quando a visita sai', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const marcado = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(10 * DIA).toISOString(),
    });
    assert.equal(marcado.status, 201);

    const planejado = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(planejado.corpo.status, 'PLANEJADO');

    const cancelado = await agente.post(`/agendamentos/${marcado.corpo.id}/cancelar`, {
      reason: 'O cliente pediu outro dia.',
    });
    assert.equal(cancelado.status, 201, JSON.stringify(cancelado.corpo));

    const voltou = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(voltou.corpo.status, 'ATRIBUIDO');
  });

  it('cancelar devolve o prazo exatamente para onde ele estava', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const prazo = daquiA(DIA);
    await fixarVencimento(chamado.id, prazo);

    const marcado = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(40 * DIA).toISOString(),
    });
    assert.ok((await vencimento(chamado.id)).dueAt > prazo, 'o prazo devia ter andado');

    assert.equal((await agente.post(`/agendamentos/${marcado.corpo.id}/cancelar`, {})).status, 201);

    const devolvido = await vencimento(chamado.id);
    assert.equal(
      devolvido.dueAt.toISOString(),
      prazo.toISOString(),
      'a razão do adiamento sumiu, então o prazo volta',
    );
    assert.equal(devolvido.postponedSeconds, 0);
  });

  it('remarcar fecha a anterior e recalcula a partir do prazo original', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const prazo = daquiA(DIA);
    await fixarVencimento(chamado.id, prazo);

    await marcar(agente, chamado.id, { scheduledFor: daquiA(40 * DIA).toISOString() });

    const novaData = daquiA(15 * DIA);
    const remarcado = await marcar(agente, chamado.id, {
      scheduledFor: novaData.toISOString(),
      durationMinutes: 60,
    });
    assert.equal(remarcado.status, 201, JSON.stringify(remarcado.corpo));

    // A conta parte do prazo original, não do que a primeira marcação
    // já tinha esticado: sem isso, remarcar para mais perto ainda
    // deixaria o chamado com a folga da data antiga.
    const depois = await vencimento(chamado.id);
    assert.equal(
      depois.dueAt.toISOString(),
      new Date(novaData.getTime() + 60 * 60_000).toISOString(),
    );

    const lista = await agente.get<AppointmentView[]>(`/tickets/${chamado.id}/agendamentos`);
    assert.equal(lista.corpo.length, 2, 'o histórico guarda as duas');
    assert.equal(lista.corpo.filter((a) => a.status === 'AGENDADO').length, 1);
  });

  it('realizar mantém o prazo esticado: a data era combinada', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    await fixarVencimento(chamado.id, daquiA(DIA));

    const marcado = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(25 * DIA).toISOString(),
    });
    const esticado = (await vencimento(chamado.id)).dueAt;

    assert.equal((await agente.post(`/agendamentos/${marcado.corpo.id}/concluir`)).status, 201);

    const depois = await vencimento(chamado.id);
    assert.equal(depois.dueAt.toISOString(), esticado.toISOString());
  });

  it('a linha do tempo conta o que foi marcado e quanto o prazo andou', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    await fixarVencimento(chamado.id, daquiA(DIA));

    await marcar(agente, chamado.id, { scheduledFor: daquiA(30 * DIA).toISOString() });

    const eventos = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const evento = eventos.corpo.find((e) => e.type === 'AGENDAMENTO');
    assert.ok(evento, 'o agendamento deveria aparecer na conversa');
    assert.equal(evento.payload?.type, 'AGENDAMENTO');
    if (evento.payload?.type !== 'AGENDAMENTO') throw new Error('payload errado');
    assert.equal(evento.payload.action, 'MARCADO');
    assert.ok(evento.payload.postponedSeconds > 0);
  });
});

describe('o que o agendamento recusa', () => {
  it('não marca para trás', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const r = await marcar(agente, chamado.id, { scheduledFor: daquiA(-DIA).toISOString() });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('não marca para daqui a dois anos', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const r = await marcar(agente, chamado.id, { scheduledFor: daquiA(730 * DIA).toISOString() });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('recusa duração fora dos limites', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const quando = daquiA(5 * DIA).toISOString();

    assert.equal((await marcar(agente, chamado.id, { scheduledFor: quando, durationMinutes: 5 })).status, 400);
    assert.equal(
      (await marcar(agente, chamado.id, { scheduledFor: quando, durationMinutes: 60 * 24 })).status,
      400,
    );
  });

  it('recusa técnico de outra organização', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const r = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(5 * DIA).toISOString(),
      technicianId: f.forasteiro.id,
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('o solicitante não marca a própria visita', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const solicitante = await entrar('solicitante@teste.dev');
    const r = await solicitante.post<ProblemDetails>(`/tickets/${chamado.id}/agendamentos`, {
      scheduledFor: daquiA(5 * DIA).toISOString(),
    });
    // Esticaria o próprio SLA.
    assert.equal(r.status, 403, JSON.stringify(r.corpo));
  });

  it('não marca em chamado fechado', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);
    assert.equal((await supervisor.post(`/tickets/${chamado.id}/fechar`)).status, 201);

    const r = await marcar(supervisor, chamado.id, {
      scheduledFor: daquiA(5 * DIA).toISOString(),
    });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
  });

  it('não cancela duas vezes', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const marcado = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(5 * DIA).toISOString(),
    });

    assert.equal((await agente.post(`/agendamentos/${marcado.corpo.id}/cancelar`, {})).status, 201);
    assert.equal((await agente.post(`/agendamentos/${marcado.corpo.id}/cancelar`, {})).status, 409);
  });

  it('não alcança o agendamento de chamado que você não vê', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const marcado = await marcar(agente, chamado.id, {
      scheduledFor: daquiA(5 * DIA).toISOString(),
    });

    const outro = await entrar('agente2@teste.dev');
    const r = await outro.post(`/agendamentos/${marcado.corpo.id}/cancelar`, {});
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });
});

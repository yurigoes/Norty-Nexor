import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { SlaJobs } from '../src/modules/sla/sla.jobs';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

let api: Api;
let f: Fixtura;
let jobs: SlaJobs;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  const { SlaJobs } = await import('../src/modules/sla/sla.jobs');
  const { DespachoJob } = await import('../src/modules/channels/despacho.job');
  const { EnvioSimulado } = await import('../src/modules/channels/transporte');

  jobs = api.app.get(SlaJobs);
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
  const r = await c.entrar(email);
  assert.equal(r.status, 200);
  return c;
}

async function abrirComContato(assunto: string, telefone: string) {
  const contato = await prisma.contact.create({
    data: { organizationId: f.organizacao.id, name: 'Contato', phone: telefone },
  });

  const agente = await entrar('agente@teste.dev');
  const chamado = await agente.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: 'x',
    categoryId: f.categoria.id,
    requester: { kind: 'CONTACT', id: contato.id },
  });

  assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));
  return { chamado: chamado.corpo, contato, agente };
}

// ---------------------------------------------------------------------

describe('violação de prazo', () => {
  it('marca a violação na hora do vencimento, não na do cron', async () => {
    const { chamado } = await abrirComContato('Vai estourar', '+5511900000001');

    const vencimento = new Date(Date.now() - 2 * 3600 * 1000);
    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id, target: 'TTR' },
      data: { dueAt: vencimento },
    });

    await jobs.marcarViolacoes();

    const compromisso = await prisma.slaCommitment.findFirstOrThrow({
      where: { ticketId: chamado.id, target: 'TTR' },
    });

    assert.ok(compromisso.breachedAt);
    assert.equal(
      compromisso.breachedAt.getTime(),
      vencimento.getTime(),
      'um cron atrasado não pode piorar o número',
    );
  });

  it('não marca duas vezes nem marca o que foi cumprido', async () => {
    const { chamado, agente } = await abrirComContato('Cumprido a tempo', '+5511900000002');

    await agente.post(`/tickets/${chamado.id}/responder`, { body: 'Já estamos vendo.' });
    await agente.post(`/tickets/${chamado.id}/resolver`, { body: 'Pronto.' });

    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id },
      data: { dueAt: new Date(Date.now() - 3600 * 1000) },
    });

    await jobs.marcarViolacoes();

    const compromissos = await prisma.slaCommitment.findMany({ where: { ticketId: chamado.id } });
    for (const c of compromissos) {
      assert.ok(c.achievedAt, 'deveria estar cumprido');
      assert.equal(c.breachedAt, null, 'cumprido no prazo não estoura');
    }
  });
});

describe('escalonamento', () => {
  it('avisa antes do vencimento e não repete o mesmo nível', async () => {
    const nivel = await prisma.escalationLevel.create({
      data: {
        agreementId: f.ttr.id,
        name: 'Aviso de 30 minutos',
        // Negativo: dispara antes do vencimento.
        offsetSeconds: -1800,
        actions: [{ tipo: 'NOTIFICAR', alvo: 'TIME' }],
      },
    });

    const { chamado } = await abrirComContato('Perto de estourar', '+5511900000003');

    // Vence em 10 minutos: já passou do gatilho de -30.
    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id, target: 'TTR' },
      data: { dueAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    await jobs.escalonar();

    const nota = await prisma.ticketEvent.findFirst({
      where: { ticketId: chamado.id, type: 'NOTA_INTERNA', channel: 'SISTEMA' },
    });
    assert.ok(nota?.body?.includes('por vencer'));
    assert.equal(nota?.visibility, 'INTERNA', 'aviso de equipe não é público');

    // Segunda passada não dispara de novo — senão seria um aviso por
    // minuto até alguém resolver.
    const notasAntes = await prisma.ticketEvent.count({
      where: { ticketId: chamado.id, type: 'NOTA_INTERNA', channel: 'SISTEMA' },
    });
    await jobs.escalonar();
    const notasDepois = await prisma.ticketEvent.count({
      where: { ticketId: chamado.id, type: 'NOTA_INTERNA', channel: 'SISTEMA' },
    });
    assert.equal(notasDepois, notasAntes, 'o mesmo nível não pode disparar duas vezes');

    const compromisso = await prisma.slaCommitment.findFirstOrThrow({
      where: { ticketId: chamado.id, target: 'TTR' },
    });
    assert.equal(compromisso.escalationLevel, 1);

    await prisma.escalationLevel.delete({ where: { id: nivel.id } });
  });

  it('eleva a urgência e recalcula a prioridade', async () => {
    const nivel = await prisma.escalationLevel.create({
      data: {
        agreementId: f.ttr.id,
        name: 'Estourou',
        offsetSeconds: 0,
        actions: [{ tipo: 'AUMENTAR_URGENCIA', para: 5 }],
      },
    });

    const { chamado } = await abrirComContato('Sobe urgência', '+5511900000004');
    assert.equal(chamado.urgency, 3);

    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id, target: 'TTR' },
      data: { dueAt: new Date(Date.now() - 60_000) },
    });

    await jobs.escalonar();

    const depois = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(depois.urgency, 5);
    // 5 × 3 na matriz padrão dá 4.
    assert.equal(depois.priority, 4, 'a prioridade tem de acompanhar a urgência');

    await prisma.escalationLevel.delete({ where: { id: nivel.id } });
  });

  it('escalonamento que reduziria a urgência é ignorado', async () => {
    const nivel = await prisma.escalationLevel.create({
      data: {
        agreementId: f.ttr.id,
        name: 'Configuração errada',
        offsetSeconds: 0,
        actions: [{ tipo: 'AUMENTAR_URGENCIA', para: 1 }],
      },
    });

    const { chamado, agente } = await abrirComContato('Não desce', '+5511900000005');
    await agente.post(`/tickets/${chamado.id}/classificar`, { urgency: 4 });

    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id, target: 'TTR' },
      data: { dueAt: new Date(Date.now() - 60_000) },
    });

    await jobs.escalonar();

    const depois = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(depois.urgency, 4, 'escalonar nunca reduz urgência');

    await prisma.escalationLevel.delete({ where: { id: nivel.id } });
  });

  it('reatribui o chamado ao time do nível', async () => {
    const nivel = await prisma.escalationLevel.create({
      data: {
        agreementId: f.ttr.id,
        name: 'Manda para a sustentação',
        offsetSeconds: 0,
        actions: [{ tipo: 'ATRIBUIR_TIME', teamId: f.outroTime.id }],
      },
    });

    const { chamado } = await abrirComContato('Troca de time', '+5511900000006');
    assert.equal(chamado.assignedTeam?.id, f.time.id);

    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id, target: 'TTR' },
      data: { dueAt: new Date(Date.now() - 60_000) },
    });

    await jobs.escalonar();

    const atores = await prisma.ticketActor.findMany({
      where: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: { not: null } },
    });
    assert.equal(atores.length, 1, 'o time anterior deveria ter saído');
    assert.equal(atores[0]!.teamId, f.outroTime.id);

    await prisma.escalationLevel.delete({ where: { id: nivel.id } });
  });
});

describe('cobrança de pendência', () => {
  it('cobra pelo canal de origem e registra na conversa', async () => {
    const motivo = await prisma.pendingReason.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Aguardando o cliente',
        followupIntervalSeconds: 3600,
        followupsBeforeResolution: 2,
        followupTemplate: 'Ainda precisamos de retorno no chamado {{numero}}.',
      },
    });

    const { chamado, agente } = await abrirComContato('Vai ser cobrado', '+5511900000007');
    await prisma.ticket.update({
      where: { id: chamado.id },
      data: { originChannel: 'WHATSAPP' },
    });

    await agente.post(`/tickets/${chamado.id}/pausar`, { pendingReasonId: motivo.id });

    // Nada a cobrar ainda: o intervalo não passou.
    await jobs.cobrarPendencias();
    let atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.pendingRemindersSent, 0);

    await prisma.ticket.update({
      where: { id: chamado.id },
      data: { pendingSince: new Date(Date.now() - 2 * 3600 * 1000) },
    });

    await jobs.cobrarPendencias();
    atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.pendingRemindersSent, 1);

    await despacho.despachar();

    const cobranca = simulado.enviados.find((e) => e.para === '+5511900000007');
    assert.ok(cobranca, 'a cobrança deveria sair pelo WhatsApp, que é o canal de origem');
    assert.ok(cobranca.corpo.includes(`#${chamado.number}`), 'o modelo precisa interpolar o número');

    // E a cobrança aparece na conversa, senão o solicitante recebe
    // mensagem que a tela do chamado não explica.
    const naConversa = await prisma.ticketEvent.count({
      where: { ticketId: chamado.id, channel: 'SISTEMA', type: 'MENSAGEM' },
    });
    assert.equal(naConversa, 1);

    await prisma.pendingReason.delete({ where: { id: motivo.id } }).catch(() => undefined);
  });

  it('encerra por inatividade depois das cobranças combinadas', async () => {
    const motivo = await prisma.pendingReason.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Sem retorno',
        followupIntervalSeconds: 60,
        followupsBeforeResolution: 1,
      },
    });

    const { chamado, agente } = await abrirComContato('Vai encerrar sozinho', '+5511900000008');
    await agente.post(`/tickets/${chamado.id}/pausar`, { pendingReasonId: motivo.id });

    const envelhecer = async () => {
      await prisma.ticket.update({
        where: { id: chamado.id },
        data: { pendingSince: new Date(Date.now() - 7200 * 1000) },
      });
      await prisma.ticketEvent.updateMany({
        where: { ticketId: chamado.id, channel: 'SISTEMA', type: 'MENSAGEM' },
        data: { createdAt: new Date(Date.now() - 7200 * 1000) },
      });
    };

    await envelhecer();
    await jobs.cobrarPendencias();

    let atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.pendingRemindersSent, 1);
    assert.equal(atual.status, 'PENDENTE');

    await envelhecer();
    await jobs.cobrarPendencias();

    atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.status, 'SOLUCIONADO', 'a segunda passada deveria encerrar');

    const solucao = await prisma.ticketEvent.findFirst({
      where: { ticketId: chamado.id, type: 'SOLUCAO' },
    });
    assert.ok(solucao?.body?.includes('falta de retorno'));
    assert.ok(
      solucao?.body?.includes('reabrimos'),
      'o encerramento automático precisa dizer como voltar',
    );

    await prisma.pendingReason.delete({ where: { id: motivo.id } }).catch(() => undefined);
  });

  it('cobra pelo telefone quando o requerente não tem e-mail, mesmo vindo do portal', async () => {
    const motivo = await prisma.pendingReason.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Sem e-mail',
        followupIntervalSeconds: 60,
        followupsBeforeResolution: 0,
      },
    });

    // Chamado do portal (originChannel WEB) com requerente que só tem
    // telefone. Antes isto fazia a cobrança sumir em silêncio.
    const { chamado, agente } = await abrirComContato('Só tem telefone', '+5511900000010');
    await agente.post(`/tickets/${chamado.id}/pausar`, { pendingReasonId: motivo.id });

    await prisma.ticket.update({
      where: { id: chamado.id },
      data: { pendingSince: new Date(Date.now() - 3600 * 1000) },
    });

    await jobs.cobrarPendencias();
    await despacho.despachar();

    const cobranca = simulado.enviados.find((e) => e.para === '+5511900000010');
    assert.ok(cobranca, 'sem e-mail, a cobrança tem de cair no telefone que existe');

    await prisma.pendingReason.delete({ where: { id: motivo.id } }).catch(() => undefined);
  });

  it('motivo sem intervalo não cobra nunca', async () => {
    const { chamado, agente } = await abrirComContato('Pendente para sempre', '+5511900000009');
    await agente.post(`/tickets/${chamado.id}/pausar`, { pendingReasonId: f.motivo.id });

    await prisma.ticket.update({
      where: { id: chamado.id },
      data: { pendingSince: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    });

    await jobs.cobrarPendencias();
    const atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(atual.status, 'PENDENTE');
    assert.equal(atual.pendingRemindersSent, 0, 'motivo sem intervalo não cobra');
  });
});

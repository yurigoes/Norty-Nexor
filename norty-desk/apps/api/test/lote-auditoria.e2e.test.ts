import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AuditEntry, BulkResult, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Ação em lote e trilha de auditoria.
 *
 * O que se prova aqui: o lote passa pelo caso de uso normal (e portanto
 * grava linha do tempo e prioridade), o resultado diz **quais** itens
 * falharam, o escopo de leitura vale, e a trilha nunca guarda segredo.
 */

let api: Api;
let f: Fixtura;
let supervisor: Cliente;
let agente: Cliente;
let admin: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.gestor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('gestor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function abrir(assunto: string): Promise<TicketDetail> {
  const r = await agente.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: 'x',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('ação em lote', () => {
  it('atribui em massa e grava linha do tempo em cada um', async () => {
    const chamados = await Promise.all([abrir('Lote 1'), abrir('Lote 2'), abrir('Lote 3')]);

    const r = await supervisor.post<BulkResult>('/tickets/lote', {
      ticketIds: chamados.map((c) => c.id),
      acao: { tipo: 'ATRIBUIR', teamId: f.outroTime.id },
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.concluidos, 3);
    assert.equal(r.corpo.falhas, 0);

    for (const chamado of chamados) {
      const atores = await prisma.ticketActor.findMany({
        where: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: { not: null } },
      });
      assert.equal(atores.length, 1);
      assert.equal(atores[0]!.teamId, f.outroTime.id);

      // `updateMany` seria mais rápido e pularia isto — que é o motivo
      // de o lote ser um laço sobre o caso de uso normal.
      const evento = await prisma.ticketEvent.findFirst({
        where: { ticketId: chamado.id, type: 'MUDANCA_ATRIBUICAO' },
      });
      assert.ok(evento, `o chamado ${chamado.number} ficou sem evento de atribuição`);
    }
  });

  it('classificar em lote recalcula a prioridade de cada um', async () => {
    const chamados = await Promise.all([abrir('Prioridade 1'), abrir('Prioridade 2')]);

    const r = await supervisor.post<BulkResult>('/tickets/lote', {
      ticketIds: chamados.map((c) => c.id),
      acao: { tipo: 'CLASSIFICAR', urgency: 5, impact: 5 },
    });

    assert.equal(r.corpo.concluidos, 2);

    for (const chamado of chamados) {
      const atual = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
      assert.equal(atual.priority, 5, 'a matriz de prioridade tem de rodar também no lote');
    }
  });

  it('o resultado diz quais falharam, e por quê', async () => {
    const bom = await abrir('Este vai');
    const fechado = await abrir('Este está fechado');
    await agente.post(`/tickets/${fechado.id}/fechar`);

    const inexistente = '00000000-0000-4000-8000-000000000000';

    const r = await supervisor.post<BulkResult>('/tickets/lote', {
      ticketIds: [bom.id, fechado.id, inexistente],
      acao: { tipo: 'MUDAR_STATUS', status: 'PENDENTE' },
    });

    assert.equal(r.corpo.total, 3);
    assert.equal(r.corpo.concluidos, 1);
    assert.equal(r.corpo.falhas, 2);

    const doFechado = r.corpo.itens.find((i) => i.ticketId === fechado.id)!;
    assert.equal(doFechado.ok, false);
    assert.ok(
      doFechado.motivo,
      '"23 de 40" sem dizer quais 17 falharam obriga a conferir os quarenta à mão',
    );

    const doInexistente = r.corpo.itens.find((i) => i.ticketId === inexistente)!;
    assert.equal(doInexistente.ok, false);
    assert.ok(doInexistente.motivo?.includes('escopo'));
  });

  it('uma falha não interrompe as outras 199', async () => {
    const chamados = await Promise.all([abrir('Segue A'), abrir('Segue B'), abrir('Segue C')]);
    await agente.post(`/tickets/${chamados[1]!.id}/fechar`);

    const r = await supervisor.post<BulkResult>('/tickets/lote', {
      ticketIds: chamados.map((c) => c.id),
      acao: { tipo: 'ATRIBUIR', userId: f.agente.id },
    });

    assert.equal(r.corpo.concluidos, 2);
    assert.equal(
      r.corpo.itens.filter((i) => i.ok).length,
      2,
      'o chamado do meio falhou; os outros dois têm de ter passado',
    );
  });

  it('o lote não é porta lateral para chamado fora do escopo', async () => {
    const alheio = await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id,
        number: 9700,
        subject: 'De outro time',
        description: 'x',
        type: 'INCIDENTE',
        urgency: 3,
        impact: 3,
        priority: 3,
        actors: { create: { role: 'ATRIBUIDO', teamId: f.outroTime.id } },
      },
    });

    // O agente lê só o time dele.
    const r = await agente.post<BulkResult>('/tickets/lote', {
      ticketIds: [alheio.id],
      acao: { tipo: 'ATRIBUIR', userId: f.agente.id },
    });

    // Ele nem tem a permissão de lote; se tivesse, o escopo recusaria.
    assert.equal(r.status, 403);

    const comEscopo = await supervisor.post<BulkResult>('/tickets/lote', {
      ticketIds: [alheio.id],
      acao: { tipo: 'ATRIBUIR', userId: f.agente.id },
    });
    assert.equal(comEscopo.corpo.concluidos, 1, 'o supervisor lê tudo, então ele age');
  });

  it('ação sem alvo é recusada antes de tocar em duzentos chamados', async () => {
    const chamado = await abrir('Ação vazia');

    const r = await supervisor.post('/tickets/lote', {
      ticketIds: [chamado.id],
      acao: { tipo: 'ATRIBUIR' },
    });

    assert.equal(r.status, 400);
  });

  it('acima de 200 itens é 400, não um tempo limite de proxy', async () => {
    const ids = Array.from({ length: 201 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    const r = await supervisor.post('/tickets/lote', {
      ticketIds: ids,
      acao: { tipo: 'ATRIBUIR', userId: f.agente.id },
    });

    assert.equal(r.status, 400);
  });
});

// ---------------------------------------------------------------------

describe('trilha de auditoria', () => {
  it('registra a mudança de configuração com quem, o quê e o diff', async () => {
    const criado = await admin.post<{ id: string }>('/channels/accounts', {
      kind: 'EMAIL_IMAP',
      name: 'Caixa auditada',
      config: { host: 'imap.antigo.dev', username: 'u', password: 'senha-original' },
    });

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    await admin.patch(`/channels/accounts/${criado.corpo.id}`, {
      name: 'Caixa auditada (novo nome)',
      config: { host: 'imap.novo.dev', username: 'u', password: 'senha-trocada' },
    });

    const trilha = await admin.get<AuditEntry[]>(
      `/audit-logs?entity=ChannelAccount&entityId=${criado.corpo.id}`,
    );

    assert.equal(trilha.status, 200);
    assert.equal(trilha.corpo.length, 2, 'criação e edição');

    const edicao = trilha.corpo.find((e) => e.action === 'canal.editado')!;
    assert.equal(edicao.actor?.email, 'gestor@teste.dev');
    assert.ok(edicao.ip, 'sem o IP a trilha responde "quem" pela metade');

    assert.deepEqual(edicao.diff?.host, { de: 'imap.antigo.dev', para: 'imap.novo.dev' });
    assert.deepEqual(
      edicao.diff?.name,
      { de: 'Caixa auditada', para: 'Caixa auditada (novo nome)' },
      'o nome mudou e tem de aparecer',
    );
  });

  it('a trilha nunca guarda o segredo, nem o antigo', async () => {
    const tudo = await admin.get<AuditEntry[]>('/audit-logs?limit=500');
    const texto = JSON.stringify(tudo.corpo);

    assert.ok(!texto.includes('senha-original'), 'a senha antiga não pode ficar na trilha');
    assert.ok(!texto.includes('senha-trocada'));

    const comSegredo = tudo.corpo.find((e) => e.diff && 'password' in e.diff);
    assert.deepEqual(
      comSegredo?.diff?.password,
      { de: '(oculto)', para: '(alterado)' },
      'quem lê a trilha precisa saber que mudou, não qual é',
    );
  });

  it('a ação em lote entra na trilha com o resumo', async () => {
    const chamado = await abrir('Auditado em lote');

    await supervisor.post('/tickets/lote', {
      ticketIds: [chamado.id],
      acao: { tipo: 'ATRIBUIR', userId: f.agente.id },
    });

    const trilha = await admin.get<AuditEntry[]>('/audit-logs?entity=Ticket');
    const lote = trilha.corpo.find((e) => e.action === 'lote.atribuir');

    assert.ok(lote, 'ação em massa é justamente a que precisa de registro');
    assert.equal(lote.actor?.email, 'supervisor@teste.dev');
  });

  it('o agente não lê a trilha', async () => {
    assert.equal((await agente.get('/audit-logs')).status, 403);
  });

  it('a trilha é da minha organização', async () => {
    await prisma.auditLog.create({
      data: {
        organizationId: f.outra.id,
        action: 'canal.criado',
        entity: 'ChannelAccount',
        entityId: '11111111-1111-4111-8111-111111111111',
      },
    });

    const trilha = await admin.get<AuditEntry[]>('/audit-logs?limit=500');
    assert.ok(
      !trilha.corpo.some((e) => e.entityId === '11111111-1111-4111-8111-111111111111'),
    );
  });
});

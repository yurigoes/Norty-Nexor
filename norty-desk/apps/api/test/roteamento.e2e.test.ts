import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ProblemDetails, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Tipo de chamado: para onde ele vai sozinho.
 *
 * O "tipo de chamado" é a categoria — o catálogo do que se pede. O que
 * se prova aqui: ela roteia para um **grupo** ou para uma **pessoa**, e
 * a pessoa tem precedência; quem configurou apontando para alguém quis
 * aquele alguém, e cair na fila do time seria ignorar a configuração.
 *
 * E que observador entra na abertura, que é o "quero acompanhar junto".
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();

  // Configurar tipo de chamado é ato de administrador — `config:categorias`
  // não está no supervisor de propósito (`packages/shared/src/permissions.ts`).
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

const abrir = (c: Cliente, corpo: Record<string, unknown>) =>
  c.post<TicketDetail>('/tickets', {
    subject: 'Chamado de roteamento',
    description: 'Descrição suficiente para abrir.',
    ...corpo,
  });

describe('roteamento pelo tipo de chamado', () => {
  it('o tipo com grupo faz o chamado nascer na fila do grupo', async () => {
    const admin = await entrar('admin@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const tipo = await admin.post<{ id: string }>('/categories', {
      name: 'Instalação de impressora',
      defaultTeamId: f.time.id,
    });
    assert.equal(tipo.status, 201, JSON.stringify(tipo.corpo));

    const chamado = await abrir(supervisor, { categoryId: tipo.corpo.id });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));
    assert.equal(chamado.corpo.assignedTeam?.id, f.time.id);
    assert.equal(chamado.corpo.status, 'ATRIBUIDO', 'com destino, não fica parado em NOVO');
  });

  it('o tipo com pessoa manda para ela, e a pessoa ganha do grupo', async () => {
    const admin = await entrar('admin@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const tipo = await admin.post<{ id: string }>('/categories', {
      name: 'Acesso ao ERP',
      defaultTeamId: f.time.id,
      defaultAssigneeId: f.agente.id,
    });
    assert.equal(tipo.status, 201, JSON.stringify(tipo.corpo));

    const chamado = await abrir(supervisor, { categoryId: tipo.corpo.id });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));
    assert.equal(chamado.corpo.assignedUser?.id, f.agente.id, 'deveria ir para a pessoa');
    assert.equal(chamado.corpo.assignedTeam, null, 'a pessoa tem precedência sobre o grupo');
    assert.equal(chamado.corpo.status, 'ATRIBUIDO');
  });

  it('o tipo sem destino deixa o chamado em NOVO, para alguém distribuir', async () => {
    const admin = await entrar('admin@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const tipo = await admin.post<{ id: string }>('/categories', { name: 'Sem destino' });
    assert.equal(tipo.status, 201, JSON.stringify(tipo.corpo));

    const chamado = await abrir(supervisor, { categoryId: tipo.corpo.id });
    assert.equal(chamado.corpo.status, 'NOVO');
    assert.equal(chamado.corpo.assignedUser, null);
    assert.equal(chamado.corpo.assignedTeam, null);
  });

  it('recusa rotear para alguém de outra organização', async () => {
    const admin = await entrar('admin@teste.dev');

    // `forasteiro@teste.dev` existe, mas na outra organização: id de
    // corpo não se confia.
    const alheio = await prisma.user.findUniqueOrThrow({ where: { email: 'forasteiro@teste.dev' } });
    const r = await admin.post<ProblemDetails>('/categories', {
      name: 'Tipo com forasteiro',
      defaultAssigneeId: alheio.id,
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('a pessoa some do tipo quando sai da empresa, sem derrubar o tipo', async () => {
    const admin = await entrar('admin@teste.dev');
    const pessoa = await prisma.user.create({
      data: { email: 'temporario@teste.dev', name: 'Temporário', passwordHash: 'x' },
    });
    await prisma.membership.create({
      data: { userId: pessoa.id, organizationId: f.organizacao.id, role: 'AGENTE' },
    });

    const tipo = await admin.post<{ id: string }>('/categories', {
      name: 'Tipo do temporário',
      defaultAssigneeId: pessoa.id,
    });
    assert.equal(tipo.status, 201);

    // `SET NULL`: o tipo continua de pé, sem responsável.
    await prisma.user.delete({ where: { id: pessoa.id } });
    const categoria = await prisma.category.findUniqueOrThrow({ where: { id: tipo.corpo.id } });
    assert.equal(categoria.defaultAssigneeId, null);
  });
});

describe('observadores na abertura', () => {
  it('quem abre pode somar quem acompanha junto', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const chamado = await abrir(supervisor, {
      observers: [{ kind: 'USER', id: f.agente.id }, { kind: 'USER', id: f.gestor.id }],
    });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));

    const observadores = chamado.corpo.actors
      .filter((a) => a.role === 'OBSERVADOR')
      .map((a) => a.party.id)
      .sort();
    assert.deepEqual(observadores, [f.agente.id, f.gestor.id].sort());
  });

  it('o observador enxerga o chamado que não é dele', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrir(supervisor, {
      subject: 'Chamado que o agente observa',
      observers: [{ kind: 'USER', id: f.agente.id }],
    });

    // O agente não é requerente nem atribuído: só observa. E mesmo
    // assim abre — é para isso que serve observar.
    const agente = await entrar('agente@teste.dev');
    const visto = await agente.get<TicketDetail>(`/tickets/${chamado.corpo.id}`);
    assert.equal(visto.status, 200, JSON.stringify(visto.corpo));
    assert.equal(visto.corpo.subject, 'Chamado que o agente observa');
  });

  it('recusa observador de outra organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const alheio = await prisma.user.findUniqueOrThrow({ where: { email: 'forasteiro@teste.dev' } });

    const r = await abrir(supervisor, { observers: [{ kind: 'USER', id: alheio.id }] });
    assert.ok(r.status >= 400, `observador de fora deveria ser recusado, veio ${r.status}`);
  });
});

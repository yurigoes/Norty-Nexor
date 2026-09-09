import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import { conferir } from '../src/modules/webhooks/assinatura';
import type { EntregaJob } from '../src/modules/webhooks/entrega.job';

/**
 * Webhooks de saída.
 *
 * Um servidor de verdade recebe as entregas: o que se prova aqui é que
 * a assinatura confere do outro lado, que a falha volta com backoff, e
 * que um assinante fora do ar não derruba o chamado.
 */

type Recebida = {
  corpo: string;
  evento: string;
  entrega: string;
  timestamp: string;
  assinatura: string;
};

const SEGREDO = 'segredo-do-assinante-de-teste';

let api: Api;
let f: Fixtura;
let admin: Cliente;
let agente: Cliente;
let entrega: EntregaJob;

let servidor: Server;
let urlDoServidor: string;
let recebidas: Recebida[] = [];
/** O que o servidor de teste responde na próxima entrega. */
let proximaResposta = 200;

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  const { EntregaJob } = await import('../src/modules/webhooks/entrega.job');
  entrega = api.app.get(EntregaJob);

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  servidor = createServer((req, res) => {
    let corpo = '';
    req.on('data', (p) => (corpo += p));
    req.on('end', () => {
      recebidas.push({
        corpo,
        evento: String(req.headers['x-desk-event'] ?? ''),
        entrega: String(req.headers['x-desk-delivery'] ?? ''),
        timestamp: String(req.headers['x-desk-timestamp'] ?? ''),
        assinatura: String(req.headers['x-desk-signature'] ?? ''),
      });
      res.writeHead(proximaResposta).end();
    });
  });

  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  urlDoServidor = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/entrada`;
});

after(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(() => {
  recebidas = [];
  proximaResposta = 200;
});

/**
 * Cria o webhook direto no banco.
 *
 * A API recusa `http://` e endereço de laço — de propósito, e há teste
 * para isso. O servidor da suíte é os dois, então ele entra por baixo.
 */
async function assinarEventos(eventos: string[]) {
  const { cifrar } = await import('../src/modules/channels/segredos');

  return prisma.outboundWebhook.create({
    data: {
      organizationId: f.organizacao.id,
      name: `Assinante ${Math.random().toString(36).slice(2, 8)}`,
      url: urlDoServidor,
      secret: cifrar(SEGREDO),
      events: eventos,
    },
  });
}

// ---------------------------------------------------------------------

describe('cadastro', () => {
  it('recusa destino que não é https', async () => {
    const r = await admin.post<{ detail?: string }>('/webhooks', {
      name: 'Sem TLS',
      url: 'http://exemplo.com.br/hook',
      secret: 'um-segredo-bem-comprido',
      events: ['ticket.criado'],
    });

    assert.equal(r.status, 400, 'o corpo carrega dado de chamado');
  });

  it('recusa endereço de rede interna', async () => {
    // `localhost` cai antes, no `@IsUrl` do DTO, que exige domínio de
    // topo. Os endereços de IP passam pelo DTO e são recusados pela
    // regra do serviço — que é a que dá a explicação.
    const recusadosPeloDto = ['https://localhost/hook'];
    const recusadosPelaRegra = [
      'https://127.0.0.1/hook',
      'https://10.0.0.5/hook',
      'https://192.168.15.72/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://172.20.1.1/hook',
    ];

    for (const url of [...recusadosPeloDto, ...recusadosPelaRegra]) {
      const r = await admin.post<{ detail?: string }>('/webhooks', {
        name: `Interno ${url}`,
        url,
        secret: 'um-segredo-bem-comprido',
        events: ['ticket.criado'],
      });

      assert.equal(r.status, 400, `${url} deveria ser recusado`);
    }

    for (const url of recusadosPelaRegra) {
      const r = await admin.post<{ detail?: string }>('/webhooks', {
        name: `Interno de novo ${url}`,
        url,
        secret: 'um-segredo-bem-comprido',
        events: ['ticket.criado'],
      });

      assert.ok(
        String(r.corpo.detail ?? '').includes('rede interna'),
        `a mensagem de ${url} tem de explicar por quê: a API não pode virar ` +
          'scanner da rede de quem cadastra webhook',
      );
    }
  });

  it('recusa evento que não existe', async () => {
    const r = await admin.post<{ detail?: string }>('/webhooks', {
      name: 'Evento inventado',
      url: 'https://exemplo.com.br/hook',
      secret: 'um-segredo-bem-comprido',
      events: ['ticket.criada'],
    });

    assert.equal(r.status, 400);
    assert.ok(
      String(r.corpo.detail ?? '').includes('ticket.criada'),
      'quem digita errado e nunca recebe nada abre um chamado indiagnosticável',
    );
  });

  it('o segredo não sai na listagem', async () => {
    const criado = await admin.post<{ id: string }>('/webhooks', {
      name: 'Assinante externo',
      url: 'https://exemplo.com.br/hook',
      secret: 'um-segredo-bem-comprido',
      events: ['ticket.criado', 'ticket.fechado'],
    });

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    const lista = await admin.get<{ id: string; hasSecret: boolean }[]>('/webhooks');
    const meu = lista.corpo.find((w) => w.id === criado.corpo.id)!;

    assert.equal(meu.hasSecret, true);
    assert.ok(!JSON.stringify(lista.corpo).includes('um-segredo-bem-comprido'));

    // E em repouso está cifrado.
    const guardado = await prisma.outboundWebhook.findUniqueOrThrow({
      where: { id: criado.corpo.id },
    });
    assert.ok(guardado.secret.startsWith('v1:'));
  });

  it('o agente não configura webhook', async () => {
    assert.equal((await agente.get('/webhooks')).status, 403);
  });
});

// ---------------------------------------------------------------------

describe('entrega', () => {
  it('o evento chega assinado, e a assinatura confere do outro lado', async () => {
    const webhook = await assinarEventos(['ticket.criado']);

    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Chamado que vira webhook',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await entrega.entregar();

    assert.equal(recebidas.length, 1, 'o assinante do evento tinha de receber');
    const r = recebidas[0]!;

    assert.equal(r.evento, 'ticket.criado');
    assert.ok(r.entrega, 'sem o id da entrega o assinante não descarta repetição');

    assert.equal(
      conferir(r.corpo, SEGREDO, r.timestamp, r.assinatura),
      true,
      'a assinatura tem de conferir com o segredo do assinante',
    );

    const corpo = JSON.parse(r.corpo) as { dados: { number: number } };
    assert.equal(corpo.dados.number, chamado.corpo.number);

    const entregue = await prisma.webhookDelivery.findFirstOrThrow({
      where: { webhookId: webhook.id },
    });
    assert.equal(entregue.status, 'ENVIADO');
    assert.equal(entregue.responseCode, 200);

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });

  it('quem não assinou o evento não recebe', async () => {
    const webhook = await assinarEventos(['aprovacao.decidida']);

    await agente.post('/tickets', {
      subject: 'Não é do interesse dele',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await entrega.entregar();
    assert.equal(recebidas.length, 0);

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });

  it('falha temporária volta com backoff, não desiste', async () => {
    const webhook = await assinarEventos(['ticket.criado']);
    proximaResposta = 503;

    await agente.post('/tickets', {
      subject: 'Assinante fora do ar',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await entrega.entregar();

    const depois = await prisma.webhookDelivery.findFirstOrThrow({
      where: { webhookId: webhook.id },
    });

    assert.equal(depois.status, 'PENDENTE', '503 é temporário: tenta de novo');
    assert.equal(depois.attempts, 1);
    assert.ok(
      depois.scheduledFor.getTime() > Date.now() + 30_000,
      'a próxima tentativa tem de esperar o backoff',
    );

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });

  it('4xx de contrato desiste na hora: repetir não conserta', async () => {
    const webhook = await assinarEventos(['ticket.criado']);
    proximaResposta = 422;

    await agente.post('/tickets', {
      subject: 'Payload que o assinante recusa',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await entrega.entregar();

    const depois = await prisma.webhookDelivery.findFirstOrThrow({
      where: { webhookId: webhook.id },
    });

    assert.equal(depois.status, 'FALHOU');
    assert.equal(depois.attempts, 1, 'não adianta bater cinco vezes na mesma porta fechada');

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });

  it('429 e 408 são temporários, mesmo sendo 4xx', async () => {
    for (const codigo of [408, 429]) {
      const webhook = await assinarEventos(['ticket.criado']);
      proximaResposta = codigo;

      await agente.post('/tickets', {
        subject: `Assinante devolveu ${codigo}`,
        description: 'x',
        categoryId: f.categoria.id,
      });

      await entrega.entregar();

      const depois = await prisma.webhookDelivery.findFirstOrThrow({
        where: { webhookId: webhook.id },
      });

      assert.equal(depois.status, 'PENDENTE', `${codigo} é "tenta mais tarde", não "desista"`);
      await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
    }
  });

  it('assinante fora do ar não derruba a abertura do chamado', async () => {
    const webhook = await prisma.outboundWebhook.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Servidor que não existe',
        url: 'https://127.0.0.1:1/nao-existe',
        secret: (await import('../src/modules/channels/segredos')).cifrar(SEGREDO),
        events: ['ticket.criado'],
      },
    });

    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Abre mesmo com webhook quebrado',
      description: 'x',
      categoryId: f.categoria.id,
    });

    assert.equal(r.status, 201, 'o chamado abre; a entrega falha e fica no log');

    await entrega.entregar();

    const falha = await prisma.webhookDelivery.findFirstOrThrow({
      where: { webhookId: webhook.id },
    });
    assert.ok(falha.lastError);

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });

  it('webhook desativado não entrega o que ficou na fila', async () => {
    const webhook = await assinarEventos(['ticket.criado']);

    await agente.post('/tickets', {
      subject: 'Enfileirado antes de desativar',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await prisma.outboundWebhook.update({ where: { id: webhook.id }, data: { isActive: false } });
    await entrega.entregar();

    assert.equal(recebidas.length, 0);
    const parada = await prisma.webhookDelivery.findFirstOrThrow({
      where: { webhookId: webhook.id },
    });
    assert.equal(parada.status, 'FALHOU');

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });
});

// ---------------------------------------------------------------------

describe('log e reenvio', () => {
  it('lista as entregas e reenvia a que falhou', async () => {
    const webhook = await assinarEventos(['ticket.criado']);
    proximaResposta = 500;

    await agente.post('/tickets', {
      subject: 'Vai falhar e depois ir',
      description: 'x',
      categoryId: f.categoria.id,
    });
    await entrega.entregar();

    const log = await admin.get<{ id: string; status: string }[]>(
      `/webhooks/${webhook.id}/entregas`,
    );
    assert.equal(log.status, 200);
    assert.equal(log.corpo.length, 1);

    proximaResposta = 200;
    recebidas = [];

    const reenviado = await admin.post<{ status: string }[]>(
      `/webhooks/entregas/${log.corpo[0]!.id}/reenviar`,
    );

    assert.equal(reenviado.status, 201, JSON.stringify(reenviado.corpo));
    assert.equal(recebidas.length, 1);
    assert.equal(reenviado.corpo[0]!.status, 'ENVIADO');

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });

  it('a poda só apaga o que já terminou', async () => {
    const webhook = await assinarEventos(['ticket.criado']);

    const antiga = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: 'ticket.criado',
        payload: {},
        status: 'ENVIADO',
        createdAt: new Date(Date.now() - 200 * 24 * 3600 * 1000),
      },
    });

    const pendenteAntiga = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: 'ticket.criado',
        payload: {},
        status: 'PENDENTE',
        createdAt: new Date(Date.now() - 200 * 24 * 3600 * 1000),
      },
    });

    await entrega.podar();

    assert.equal(await prisma.webhookDelivery.count({ where: { id: antiga.id } }), 0);
    assert.equal(
      await prisma.webhookDelivery.count({ where: { id: pendenteAntiga.id } }),
      1,
      'entrega que ainda não saiu não é lixo',
    );

    await prisma.outboundWebhook.delete({ where: { id: webhook.id } });
  });
});

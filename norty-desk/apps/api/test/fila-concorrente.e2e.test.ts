import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { ProcessamentoService } from '../src/modules/channels/processamento.service';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

/**
 * Duas mãos na mesma fila.
 *
 * A API roda em **mais de um processo** (é o que a seção do chat de
 * `docs/07-api.md` registra, e é por isso que o fluxo do chat lê do
 * banco em vez de um barramento em memória). O cron de entrada e o de
 * saída disparam a cada trinta segundos em **cada** processo, e os dois
 * pegam a mesma fila.
 *
 * O que isto prova é o que acontece quando dois pegam a mesma linha:
 *
 * 1. **Uma mensagem que entra abre um chamado, não dois.** Chamado
 *    duplicado parte a conversa em duas e faz o cliente contar tudo de
 *    novo na segunda.
 * 2. **Uma mensagem que sai é entregue uma vez.** Esta é a pior: o
 *    cliente recebe o mesmo WhatsApp duas vezes, e não há como
 *    desentregar.
 *
 * Os dois jobs são chamados **em paralelo de propósito** — é a corrida
 * de verdade, e sem ela o teste só prova que rodar duas vezes em
 * sequência funciona, que é outro problema.
 */

let api: Api;
let f: Fixtura;
let processamento: ProcessamentoService;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  const { ProcessamentoService } = await import('../src/modules/channels/processamento.service');
  const { DespachoJob } = await import('../src/modules/channels/despacho.job');
  const { EnvioSimulado } = await import('../src/modules/channels/transporte');

  processamento = api.app.get(ProcessamentoService);
  despacho = api.app.get(DespachoJob);
  simulado = api.app.get(EnvioSimulado);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.ticketActor.deleteMany({});
  await prisma.ticketEvent.deleteMany({});
  await prisma.outboundMessage.deleteMany({});
  await prisma.inboundMessage.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.whatsappConversa.deleteMany({});
  simulado.enviados.length = 0;
});

/** Um e-mail chegando pelo webhook. O provedor recebe 202 e vai embora. */
async function chegaEmail(
  messageId: string,
  assunto: string,
  de = { email: 'marina@empresa.com.br', name: 'Marina Alves' },
): Promise<void> {
  const resposta = await fetch(`${api.url}/channels/email/inbound/${f.contaEmail.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messageId,
      from: de,
      to: [{ email: 'suporte@teste.dev' }],
      subject: assunto,
      text: 'Desde ontem não funciona.',
    }),
  });

  assert.equal(resposta.status, 202, await resposta.text());
}

// ---------------------------------------------------------------------

describe('a fila de entrada', () => {
  it('uma mensagem abre um chamado, mesmo com dois processadores juntos', async () => {
    await chegaEmail('<corrida-1@teste.dev>', 'A impressora parou');

    // Os dois processos acordam juntos. É o caso comum, não o raro:
    // eles sobem juntos e o cron de trinta segundos alinha os dois.
    await Promise.all([
      processamento.processarPendentes(),
      processamento.processarPendentes(),
    ]);

    assert.equal(
      await prisma.ticket.count({}),
      1,
      'a mesma mensagem abriu mais de um chamado',
    );
  });

  it('dez mensagens abrem dez chamados, com quatro processadores juntos', async () => {
    // Dez remetentes diferentes: um por chamado, para o teste não
    // depender da regra que junta mensagens da mesma pessoa.
    for (let i = 0; i < 10; i += 1) {
      await chegaEmail(`<corrida-lote-${i}@teste.dev>`, `Problema ${i}`, {
        email: `pessoa${i}@empresa.com.br`,
        name: `Pessoa ${i}`,
      });
    }

    await Promise.all([
      processamento.processarPendentes(),
      processamento.processarPendentes(),
      processamento.processarPendentes(),
      processamento.processarPendentes(),
    ]);

    assert.equal(await prisma.ticket.count({}), 10, 'a fila duplicou chamados');

    // E nenhuma ficou para trás: trancar não pode virar mensagem que
    // ninguém processa.
    assert.equal(
      await prisma.inboundMessage.count({ where: { processedAt: null } }),
      0,
      'sobrou mensagem sem processar',
    );
  });
});

describe('a reserva que ficou para trás', () => {
  it('mensagem reservada há pouco não é tomada por outro processo', async () => {
    await chegaEmail('<reserva-fresca@teste.dev>', 'Reserva fresca');

    // Alguém acabou de tomar esta mensagem e ainda está trabalhando
    // nela. Tomar de volta agora seria duplicar o trabalho.
    await prisma.inboundMessage.updateMany({ data: { claimedAt: new Date() } });

    await processamento.processarPendentes();

    assert.equal(
      await prisma.ticket.count({}),
      0,
      'tomou de volta uma reserva que ainda estava valendo',
    );
  });

  it('mensagem reservada por um processo que morreu volta para a fila', async () => {
    await chegaEmail('<reserva-vencida@teste.dev>', 'Reserva vencida');

    // O processo que reservou esta mensagem caiu no meio — contêiner
    // reiniciado, deploy. Sem prazo na reserva, ela ficaria aqui para
    // sempre e a pessoa nunca teria resposta.
    await prisma.inboundMessage.updateMany({
      data: { claimedAt: new Date(Date.now() - 30 * 60_000) },
    });

    await processamento.processarPendentes();

    assert.equal(
      await prisma.ticket.count({}),
      1,
      'a mensagem ficou presa numa reserva que ninguém mais ia honrar',
    );
  });
});

describe('a fila de saída', () => {
  it('a mesma resposta não sai duas vezes para o cliente', async () => {
    await chegaEmail('<corrida-saida@teste.dev>', 'Preciso de ajuda');

    await processamento.processarPendentes();

    const chamado = await prisma.ticket.findFirstOrThrow({});
    const antes = await prisma.outboundMessage.count({});
    assert.ok(antes > 0, 'nada foi enfileirado para sair');

    simulado.enviados.length = 0;

    // Os dois despachantes acordam juntos.
    await Promise.all([despacho.despachar(), despacho.despachar()]);

    assert.equal(
      simulado.enviados.length,
      antes,
      `a mesma mensagem foi entregue ${simulado.enviados.length} vezes para ${antes} na fila`,
    );

    assert.equal(
      await prisma.outboundMessage.count({ where: { status: 'PENDENTE' } }),
      0,
      'sobrou mensagem na fila de saída',
    );
    assert.ok(chamado);
  });
});

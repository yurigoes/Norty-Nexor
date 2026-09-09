import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { EntradaService } from '../src/modules/channels/entrada.service';
import type { ProcessamentoService } from '../src/modules/channels/processamento.service';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

/**
 * Configuração de canais e diagnóstico.
 *
 * Duas coisas se provam aqui e não em outro lugar: o segredo do canal
 * nunca sai da API em texto claro, e a mensagem que não virou chamado
 * continua acessível com o motivo — que é o buraco do GLPI.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;
let entrada: EntradaService;
let processamento: ProcessamentoService;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

before(async () => {
  await limparBanco();
  f = await semear();

  // Só o administrador tem `config:canais`. Configurar canal é mexer em
  // credencial da empresa inteira.
  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  const { EntradaService } = await import('../src/modules/channels/entrada.service');
  const { ProcessamentoService } = await import('../src/modules/channels/processamento.service');
  const { DespachoJob } = await import('../src/modules/channels/despacho.job');
  const { EnvioSimulado } = await import('../src/modules/channels/transporte');

  entrada = api.app.get(EntradaService);
  processamento = api.app.get(ProcessamentoService);
  despacho = api.app.get(DespachoJob);
  simulado = api.app.get(EnvioSimulado);

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

type CanalNaTela = {
  id: string;
  kind: string;
  name: string;
  isActive: boolean;
  lastError: string | null;
  config: Record<string, unknown>;
};

// ---------------------------------------------------------------------

describe('configuração de canais', () => {
  it('o agente não configura canal', async () => {
    const agente = new Cliente(api.url);
    await agente.entrar('agente@teste.dev');

    const r = await agente.get('/channels/accounts');
    assert.equal(r.status, 403, 'credencial de canal não é assunto de quem atende');
  });

  it('cria, lê e edita sem nunca devolver o segredo', async () => {
    const criacao = await admin.post<{ id: string }>('/channels/accounts', {
      kind: 'EMAIL_IMAP',
      name: 'Caixa principal',
      config: {
        host: 'imap.teste.dev',
        port: 993,
        tls: true,
        username: 'suporte',
        password: 'senha-secreta-do-imap',
      },
      defaultTeamId: f.time.id,
    });

    assert.equal(criacao.status, 201, JSON.stringify(criacao.corpo));
    const id = criacao.corpo.id;

    // 1. Em repouso, o segredo está cifrado.
    const guardado = await prisma.channelAccount.findUniqueOrThrow({ where: { id } });
    const config = guardado.config as Record<string, string>;
    assert.notEqual(config.password, 'senha-secreta-do-imap', 'a senha foi gravada em texto claro');
    assert.ok(config.password.startsWith('v1:'), 'o formato do segredo mudou sem aviso');
    assert.equal(config.host, 'imap.teste.dev', 'o que não é segredo continua legível');

    // 2. Na resposta da API, o segredo virou "existe".
    const lista = await admin.get<CanalNaTela[]>('/channels/accounts');
    assert.equal(lista.status, 200);
    const naTela = lista.corpo.find((c) => c.id === id)!;
    assert.equal(naTela.config.password, true, 'a tela precisa saber que há senha, não qual é');
    assert.equal(naTela.config.host, 'imap.teste.dev');

    // 3. Salvar de volta o que a tela recebeu não pode apagar a senha.
    const edicao = await admin.patch(`/channels/accounts/${id}`, {
      name: 'Caixa principal (renomeada)',
      config: { ...naTela.config, host: 'imap2.teste.dev' },
    });
    assert.equal(edicao.status, 200, JSON.stringify(edicao.corpo));

    const depois = await prisma.channelAccount.findUniqueOrThrow({ where: { id } });
    const configDepois = depois.config as Record<string, string>;
    assert.equal(depois.name, 'Caixa principal (renomeada)');
    assert.equal(configDepois.host, 'imap2.teste.dev');
    assert.equal(
      configDepois.password,
      config.password,
      'renomear o canal não pode apagar a senha do IMAP',
    );

    // 4. Trocar a senha de verdade grava outra coisa.
    await admin.patch(`/channels/accounts/${id}`, {
      config: { ...naTela.config, password: 'outra-senha' },
    });

    const trocado = await prisma.channelAccount.findUniqueOrThrow({ where: { id } });
    assert.notEqual(
      (trocado.config as Record<string, string>).password,
      config.password,
      'a senha nova não foi gravada',
    );

    await prisma.channelAccount.delete({ where: { id } });
  });

  it('desativar não apaga: o histórico do diagnóstico aponta para a conta', async () => {
    const r = await admin.del(`/channels/accounts/${f.contaEmail.id}`);
    assert.equal(r.status, 204);

    const conta = await prisma.channelAccount.findUniqueOrThrow({
      where: { id: f.contaEmail.id },
    });
    assert.equal(conta.isActive, false, 'deveria estar desativada, não excluída');

    await admin.patch(`/channels/accounts/${f.contaEmail.id}`, { isActive: true });
  });

  it('canal de outra organização não existe para mim', async () => {
    const alheio = await prisma.channelAccount.create({
      data: { organizationId: f.outra.id, kind: 'EMAIL_WEBHOOK', name: 'Alheio', config: {} },
    });

    const r = await admin.patch(`/channels/accounts/${alheio.id}`, { name: 'invadido' });
    assert.equal(r.status, 404, 'não pode nem confirmar que existe');

    const intacto = await prisma.channelAccount.findUniqueOrThrow({ where: { id: alheio.id } });
    assert.equal(intacto.name, 'Alheio');
  });

  it('testar um canal de webhook responde sem sair para a rede', async () => {
    const r = await admin.post<{ ok: boolean; detalhe: string }>(
      `/channels/accounts/${f.contaEmail.id}/testar`,
    );
    assert.equal(r.status, 201);
    assert.equal(r.corpo.ok, true);
  });
});

// ---------------------------------------------------------------------

describe('diagnóstico de entrada', () => {
  /** Uma mensagem recebida, do jeito que o webhook a entrega. */
  async function receber(
    externalId: string,
    assunto: string,
    de = 'quem@cliente.com.br',
  ): Promise<string> {
    const r = await entrada.receber({
      organizationId: f.organizacao.id,
      channelAccountId: f.contaEmail.id,
      channel: 'EMAIL',
      externalId,
      fromAddress: de,
      subject: assunto,
      bodyText: 'Corpo da mensagem.',
    });

    assert.ok(r.inboundMessageId, `a mensagem ${externalId} não foi aceita: ${r.motivo ?? r.resultado}`);
    return r.inboundMessageId;
  }

  it('lista o que entrou, com o chamado que nasceu dela', async () => {
    await receber('<diag-1@cliente.com.br>', 'Impressora parada');
    await processamento.processarPendentes();

    const r = await admin.get<
      { externalId: string; ticket: { number: number } | null; discardedReason: string | null }[]
    >('/channels/inbound');

    assert.equal(r.status, 200);
    const linha = r.corpo.find((m) => m.externalId === '<diag-1@cliente.com.br>');
    assert.ok(linha, 'a mensagem recebida tem de aparecer na lista');
    assert.ok(linha.ticket, 'ela virou chamado, e a lista precisa dizer qual');
  });

  it('a mensagem original fica inteira, inclusive a descartada', async () => {
    const recebidaId = await receber('<diag-2@cliente.com.br>', 'Vai ser descartada');

    // Um descarte como o do processador quando não sabe o que fazer.
    await prisma.inboundMessage.update({
      where: { id: recebidaId },
      data: { discardedReason: 'Remetente não identificado.', processedAt: new Date() },
    });

    const r = await admin.get<{
      bodyText: string;
      discardedReason: string;
      subject: string;
    }>(`/channels/inbound/${recebidaId}`);

    assert.equal(r.status, 200);
    assert.equal(r.corpo.discardedReason, 'Remetente não identificado.');
    assert.equal(
      r.corpo.bodyText,
      'Corpo da mensagem.',
      'o corpo tem de sobreviver ao descarte — é o que permite reprocessar',
    );
  });

  it('reprocessar uma descartada abre o chamado que faltou', async () => {
    const recebidaId = await receber('<diag-3@cliente.com.br>', 'Volta a valer');

    await prisma.inboundMessage.update({
      where: { id: recebidaId },
      data: { discardedReason: 'Regra errada descartou.', processedAt: new Date() },
    });

    const r = await admin.post<{ discardedReason: string | null; eventId: string | null }>(
      `/channels/inbound/${recebidaId}/reprocessar`,
    );

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.discardedReason, null, 'o motivo do descarte tinha de sair');
    assert.ok(r.corpo.eventId, 'o reprocessamento tinha de gerar o evento do chamado');
  });

  it('filtra o que foi descartado', async () => {
    const r = await admin.get<{ discardedReason: string | null }[]>(
      '/channels/inbound?processed=descartadas',
    );

    assert.equal(r.status, 200);
    assert.ok(
      r.corpo.every((m) => m.discardedReason !== null),
      'o filtro de descartadas trouxe mensagem que não foi descartada',
    );
  });

  it('mensagem de outra organização não aparece nem abre', async () => {
    const contaAlheia = await prisma.channelAccount.create({
      data: {
        organizationId: f.outra.id,
        kind: 'EMAIL_WEBHOOK',
        name: 'Caixa da outra',
        config: {},
      },
    });

    const alheia = await prisma.inboundMessage.create({
      data: {
        organizationId: f.outra.id,
        channelAccountId: contaAlheia.id,
        channel: 'EMAIL',
        externalId: '<alheia@cliente.com.br>',
        fromAddress: 'alguem@outra.dev',
        subject: 'Não é sua',
        receivedAt: new Date(),
      },
    });

    const lista = await admin.get<{ id: string }[]>('/channels/inbound');
    assert.ok(!lista.corpo.some((m) => m.id === alheia.id));

    const uma = await admin.get(`/channels/inbound/${alheia.id}`);
    assert.equal(uma.status, 404);
  });
});

// ---------------------------------------------------------------------

describe('diagnóstico de saída', () => {
  it('mostra a fila e reenvia o que falhou', async () => {
    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { organizationId: f.organizacao.id },
    });

    const falhada = await prisma.outboundMessage.create({
      data: {
        organizationId: f.organizacao.id,
        ticketId: chamado.id,
        channel: 'EMAIL',
        toAddress: 'reenviar@cliente.com.br',
        subject: 'Tentativa anterior',
        body: 'Vai sair na segunda tentativa.',
        status: 'FALHOU',
        attempts: 4,
        lastError: 'SMTP recusou.',
      },
    });

    const lista = await admin.get<{ id: string; status: string }[]>('/channels/outbound?status=FALHOU');
    assert.equal(lista.status, 200);
    assert.ok(lista.corpo.some((m) => m.id === falhada.id));

    simulado.enviados.length = 0;
    const r = await admin.post<{ status: string }>(`/channels/outbound/${falhada.id}/reenviar`);

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.status, 'ENVIADO');
    assert.ok(
      simulado.enviados.some((e) => e.para === 'reenviar@cliente.com.br'),
      'reenviar tinha de mandar de verdade, não só mudar o status',
    );
  });

  it('reenviar não é jeito de fazer nota interna sair', async () => {
    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { organizationId: f.organizacao.id },
    });

    const nota = await prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'MENSAGEM',
        visibility: 'INTERNA',
        channel: 'EMAIL',
        body: 'ISTO É INTERNO E NÃO PODE SAIR.',
      },
    });

    // Forja a linha na fila apontando para o evento interno: é o que um
    // defeito futuro em `SaidaService` faria.
    const forjada = await prisma.outboundMessage.create({
      data: {
        organizationId: f.organizacao.id,
        ticketId: chamado.id,
        eventId: nota.id,
        channel: 'EMAIL',
        toAddress: 'nao-deveria@cliente.com.br',
        subject: 'Não',
        body: 'ISTO É INTERNO E NÃO PODE SAIR.',
        status: 'FALHOU',
      },
    });

    simulado.enviados.length = 0;
    const r = await admin.post<{ status: string }>(`/channels/outbound/${forjada.id}/reenviar`);

    assert.equal(r.corpo.status, 'FALHOU', 'o segundo cinto tem de segurar também no reenvio');
    assert.ok(
      !simulado.enviados.some((e) => e.corpo.includes('ISTO É INTERNO')),
      'nota interna saiu pelo botão de reenviar',
    );

    // E o despacho normal também não a solta.
    await despacho.despachar();
    assert.ok(!simulado.enviados.some((e) => e.corpo.includes('ISTO É INTERNO')));
  });
});

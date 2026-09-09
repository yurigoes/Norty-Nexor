import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { TicketDetail, TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { ProcessamentoService } from '../src/modules/channels/processamento.service';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

let api: Api;
let f: Fixtura;
let processamento: ProcessamentoService;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  // A suíte chama os jobs à mão: esperar o cron tornaria cada teste
  // trinta segundos mais lento e o resultado dependeria do relógio.
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

beforeEach(() => {
  simulado.enviados.length = 0;
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  const r = await c.entrar(email);
  assert.equal(r.status, 200);
  return c;
}

/** Um e-mail chegando pelo webhook. */
type Aceite = { resultado: 'ACEITO' | 'DUPLICADO' | 'DESCARTADO'; motivo?: string };

async function chegaEmail(corpo: Record<string, unknown>) {
  const resposta = await fetch(`${api.url}/channels/email/inbound/${f.contaEmail.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Aceite };
}

/** Uma mensagem chegando pelo webhook da Evolution. */
async function chegaWhatsapp(id: string, telefone: string, texto: string, nome = 'Marina') {
  const resposta = await fetch(`${api.url}/channels/whatsapp/inbound/${f.contaWhatsapp.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'messages.upsert',
      instance: 'teste',
      data: {
        key: { remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false, id },
        pushName: nome,
        message: { conversation: texto },
        messageType: 'conversation',
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    }),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Aceite };
}

async function processarTudo(): Promise<void> {
  await processamento.processarPendentes();
}

async function despacharTudo(): Promise<void> {
  await despacho.despachar();
}

async function chamadoPorNumero(numero: number) {
  return prisma.ticket.findFirstOrThrow({
    where: { organizationId: f.organizacao.id, number: numero },
    include: { actors: { include: { contact: true } }, events: true, attachments: true },
  });
}

// ---------------------------------------------------------------------

describe('e-mail: entrada', () => {
  it('abre chamado a partir de um e-mail novo', async () => {
    const antes = await prisma.ticket.count();

    await chegaEmail({
      messageId: '<a1@cliente.com.br>',
      from: { email: 'marina@cliente.com.br', name: 'Marina Alves' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Impressora do 3º andar não imprime',
      text: 'Luz laranja piscando desde ontem.',
    });

    await processarTudo();

    assert.equal(await prisma.ticket.count(), antes + 1);

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { originChannel: 'EMAIL' },
      include: { actors: { include: { contact: true } } },
      orderBy: { createdAt: 'desc' },
    });

    assert.equal(chamado.subject, 'Impressora do 3º andar não imprime');
    assert.equal(chamado.description, 'Luz laranja piscando desde ontem.');
    assert.equal(chamado.status, 'ATRIBUIDO', 'o time padrão do canal deveria atribuir');

    const requerente = chamado.actors.find((a) => a.role === 'REQUERENTE');
    assert.equal(requerente?.contact?.email, 'marina@cliente.com.br');
    assert.equal(requerente?.contact?.name, 'Marina Alves');
  });

  it('a mesma mensagem duas vezes não vira dois chamados', async () => {
    const mensagem = {
      messageId: '<duplicada@cliente.com.br>',
      from: { email: 'repetido@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Mandei sem querer duas vezes',
      text: 'oi',
    };

    const primeira = await chegaEmail(mensagem);
    const segunda = await chegaEmail(mensagem);

    assert.equal(primeira.corpo.resultado, 'ACEITO');
    assert.equal(segunda.corpo.resultado, 'DUPLICADO');

    await processarTudo();

    const chamados = await prisma.ticket.count({
      where: { subject: 'Mandei sem querer duas vezes' },
    });
    assert.equal(chamados, 1, 'o coletor do GLPI duplicaria aqui');
  });

  it('resposta com In-Reply-To cai no chamado certo', async () => {
    const agente = await entrar('agente@teste.dev');

    await chegaEmail({
      messageId: '<origem@cliente.com.br>',
      from: { email: 'thread@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Não consigo acessar o sistema',
      text: 'Dá erro de senha.',
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Não consigo acessar o sistema' },
    });

    // O agente responde: é a resposta dele que gera o Message-ID que o
    // cliente vai referenciar.
    await agente.post(`/tickets/${chamado.id}/responder`, { body: 'Vamos redefinir sua senha.' });
    await despacharTudo();

    const saiu = await prisma.outboundMessage.findFirstOrThrow({
      where: { ticketId: chamado.id, status: 'ENVIADO' },
    });
    assert.ok(saiu.externalId?.includes('Norty_Desk_Ticket'));

    await chegaEmail({
      messageId: '<resposta@cliente.com.br>',
      inReplyTo: saiu.externalId!,
      from: { email: 'thread@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Re: [Norty Desk #99999] assunto trocado de propósito',
      text: 'Continua dando erro.',
    });
    await processarTudo();

    const eventos = await prisma.ticketEvent.findMany({
      where: { ticketId: chamado.id, type: 'MENSAGEM' },
      orderBy: { createdAt: 'asc' },
    });

    assert.ok(
      eventos.some((e) => e.body === 'Continua dando erro.'),
      'a resposta deveria ter caído no chamado do In-Reply-To, não no número do assunto',
    );
    assert.equal(
      await prisma.ticket.count({ where: { subject: { contains: 'assunto trocado' } } }),
      0,
      'não deveria ter aberto chamado novo',
    );
  });

  it('resposta sem cabeçalho cai pelo [#numero] do assunto', async () => {
    await chegaEmail({
      messageId: '<sem-cabecalho-origem@cliente.com.br>',
      from: { email: 'assunto@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Monitor piscando',
      text: 'Pisca a cada dois minutos.',
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({ where: { subject: 'Monitor piscando' } });

    await chegaEmail({
      messageId: '<sem-cabecalho-resposta@cliente.com.br>',
      from: { email: 'assunto@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: `Re: [Norty Desk #${chamado.number}] Monitor piscando`,
      text: 'Voltou a piscar.',
    });
    await processarTudo();

    const eventos = await prisma.ticketEvent.count({
      where: { ticketId: chamado.id, body: 'Voltou a piscar.' },
    });
    assert.equal(eventos, 1);
  });

  it('limpa a citação e guarda o original', async () => {
    await chegaEmail({
      messageId: '<citacao@cliente.com.br>',
      from: { email: 'citacao@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Ainda com problema',
      text: 'Não resolveu.\n\nEm 9 de setembro, Suporte escreveu:\n> Tente reiniciar\n> o equipamento',
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Ainda com problema' },
    });
    assert.equal(chamado.description, 'Não resolveu.');

    const recebida = await prisma.inboundMessage.findFirstOrThrow({
      where: { externalId: '<citacao@cliente.com.br>' },
    });
    assert.ok(
      recebida.bodyText?.includes('Tente reiniciar'),
      'o original precisa sobreviver para o "ver original"',
    );
  });

  it('o anexo do e-mail vira anexo do chamado', async () => {
    await chegaEmail({
      messageId: '<comanexo@cliente.com.br>',
      from: { email: 'anexo@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Segue o print do erro',
      text: 'Print em anexo.',
      attachments: [
        {
          filename: 'erro.txt',
          contentType: 'text/plain',
          content: Buffer.from('stack trace aqui').toString('base64'),
        },
      ],
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Segue o print do erro' },
      include: { attachments: true },
    });

    assert.equal(chamado.attachments.length, 1);
    assert.equal(chamado.attachments[0]!.filename, 'erro.txt');
    assert.equal(chamado.attachments[0]!.sizeBytes, Buffer.byteLength('stack trace aqui'));
  });
});

describe('e-mail: saída', () => {
  it('a resposta do agente sai com assunto marcado e In-Reply-To encadeado', async () => {
    const agente = await entrar('agente@teste.dev');

    await chegaEmail({
      messageId: '<saida1@cliente.com.br>',
      from: { email: 'saida@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Teclado com tecla travada',
      text: 'A tecla A não responde.',
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Teclado com tecla travada' },
    });

    // Drena o aviso de abertura antes de medir, senão ele entra na
    // conta das respostas.
    await despacharTudo();
    simulado.enviados.length = 0;

    await agente.post(`/tickets/${chamado.id}/responder`, { body: 'Vamos trocar o teclado.' });
    await despacharTudo();
    await agente.post(`/tickets/${chamado.id}/responder`, { body: 'Passamos aí às 15h.' });
    await despacharTudo();

    const enviados = simulado.enviados.filter((e) => e.para === 'saida@cliente.com.br');
    assert.equal(enviados.length, 2, `esperava duas saídas, veio ${enviados.length}`);

    for (const envio of enviados) {
      assert.ok(
        envio.assunto?.startsWith(`[Norty Desk #${chamado.number}]`),
        `assunto sem marcador: ${envio.assunto}`,
      );
    }

    // A segunda referencia a primeira: é isso que agrupa a conversa no
    // cliente de e-mail do destinatário.
    const segunda = enviados[enviados.length - 1]!;
    assert.ok(segunda.emRespostaA, 'a segunda mensagem deveria referenciar a primeira');
    assert.notEqual(segunda.emRespostaA, segunda.externalId);
  });

  it('nota interna não sai, nem enfileirada nem despachada', async () => {
    const agente = await entrar('agente@teste.dev');

    await chegaEmail({
      messageId: '<interna@cliente.com.br>',
      from: { email: 'sigilo@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Chamado com nota interna',
      text: 'oi',
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Chamado com nota interna' },
    });

    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'SEGREDO DA EQUIPE',
      visibility: 'INTERNA',
    });
    await despacharTudo();

    const naFila = await prisma.outboundMessage.count({
      where: { ticketId: chamado.id, body: { contains: 'SEGREDO' } },
    });
    assert.equal(naFila, 0, 'a nota interna foi enfileirada');

    assert.ok(
      !simulado.enviados.some((e) => e.corpo.includes('SEGREDO')),
      'a nota interna saiu pelo transporte',
    );
  });

  it('mesmo forjada na fila, a nota interna é bloqueada no despacho', async () => {
    const agente = await entrar('agente@teste.dev');

    await chegaEmail({
      messageId: '<forjada@cliente.com.br>',
      from: { email: 'forjada@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Segundo cinto',
      text: 'oi',
    });
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({ where: { subject: 'Segundo cinto' } });
    const nota = await agente.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
      body: 'NUNCA DEVERIA SAIR',
      visibility: 'INTERNA',
    });

    // Enfileira à mão, contornando a primeira verificação — é o cenário
    // de "alguém escreveu código novo e esqueceu da regra".
    const forjada = await prisma.outboundMessage.create({
      data: {
        organizationId: f.organizacao.id,
        channel: 'EMAIL',
        ticketId: chamado.id,
        eventId: nota.corpo.id,
        toAddress: 'forjada@cliente.com.br',
        subject: 'x',
        body: 'NUNCA DEVERIA SAIR',
      },
    });

    await despacho.despacharUma(forjada.id);

    const depois = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: forjada.id } });
    assert.equal(depois.status, 'FALHOU');
    assert.ok(depois.lastError?.includes('interno'));
    assert.ok(!simulado.enviados.some((e) => e.corpo.includes('NUNCA DEVERIA SAIR')));
  });

  it('o aviso de abertura sai com assunto — e-mail sem assunto vira spam', async () => {
    await chegaEmail({
      messageId: '<assunto-aviso@cliente.com.br>',
      from: { email: 'aviso@cliente.com.br' },
      to: [{ email: 'suporte@teste.dev' }],
      subject: 'Preciso de acesso ao relatório',
      text: 'Não consigo abrir.',
    });
    await processarTudo();
    await despacharTudo();

    const aviso = simulado.enviados.find((e) => e.para === 'aviso@cliente.com.br');
    assert.ok(aviso, 'deveria ter avisado a abertura');
    assert.ok(
      aviso.assunto?.startsWith('[Norty Desk #'),
      `o aviso saiu sem assunto: ${aviso.assunto}`,
    );
  });

  it('não devolve a mensagem para quem a escreveu', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Aberto pelo agente',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await agente.post(`/tickets/${chamado.corpo.id}/responder`, { body: 'nota para o cliente' });
    await despacharTudo();

    assert.ok(
      !simulado.enviados.some((e) => e.para === 'agente@teste.dev'),
      'o autor não pode receber a própria mensagem de volta',
    );
  });
});

describe('whatsapp', () => {
  it('abre chamado e avisa o número pelo próprio canal', async () => {
    await chegaWhatsapp('wa-1', '5511999990001', 'Minha impressora parou de funcionar');
    await processarTudo();
    await despacharTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { originChannel: 'WHATSAPP' },
      orderBy: { createdAt: 'desc' },
      include: { actors: { include: { contact: true } } },
    });

    assert.equal(chamado.subject, 'Minha impressora parou de funcionar');
    assert.equal(chamado.actors.find((a) => a.role === 'REQUERENTE')?.contact?.phone, '+5511999990001');

    const aviso = simulado.enviados.find((e) => e.para === '+5511999990001');
    assert.ok(aviso, 'deveria ter avisado o solicitante');
    assert.ok(aviso.corpo.includes(`#${chamado.number}`), 'o aviso precisa trazer o número');
  });

  it('a segunda mensagem dentro da janela cai no mesmo chamado', async () => {
    await chegaWhatsapp('wa-janela-1', '5511999990002', 'O sistema está lento');
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'O sistema está lento' },
    });

    await chegaWhatsapp('wa-janela-2', '5511999990002', 'Agora travou de vez');
    await processarTudo();

    assert.equal(
      await prisma.ticket.count({ where: { subject: 'Agora travou de vez' } }),
      0,
      'não deveria ter aberto chamado novo',
    );
    assert.equal(
      await prisma.ticketEvent.count({ where: { ticketId: chamado.id, body: 'Agora travou de vez' } }),
      1,
    );
  });

  it('fora da janela, a mesma pessoa abre chamado novo', async () => {
    await chegaWhatsapp('wa-fora-1', '5511999990003', 'Problema de ontem');
    await processarTudo();

    const primeiro = await prisma.ticket.findFirstOrThrow({
      where: { subject: 'Problema de ontem' },
    });

    // Empurra a conversa para fora da janela de 24 h.
    await prisma.ticket.update({
      where: { id: primeiro.id },
      data: { updatedAt: new Date(Date.now() - 30 * 3600 * 1000) },
    });

    await chegaWhatsapp('wa-fora-2', '5511999990003', 'Problema novo de hoje');
    await processarTudo();

    assert.equal(await prisma.ticket.count({ where: { subject: 'Problema novo de hoje' } }), 1);
  });

  it('o comando status responde sem abrir chamado', async () => {
    await chegaWhatsapp('wa-status-1', '5511999990004', 'Notebook não liga');
    await processarTudo();

    const antes = await prisma.ticket.count();

    await chegaWhatsapp('wa-status-2', '5511999990004', 'status');
    await processarTudo();
    await despacharTudo();

    assert.equal(await prisma.ticket.count(), antes, 'comando não abre chamado');

    const resposta = simulado.enviados.find((e) => e.corpo.includes('Notebook não liga'));
    assert.ok(resposta, 'deveria ter respondido o status');
    assert.ok(
      !resposta.corpo.includes('ATRIBUIDO'),
      'o solicitante não fala ITIL: o status vem em linguagem de gente',
    );
  });

  it('o comando menu explica o que dá para fazer', async () => {
    await chegaWhatsapp('wa-menu', '5511999990005', 'ajuda');
    await processarTudo();
    await despacharTudo();

    const resposta = simulado.enviados.find((e) => e.para === '+5511999990005');
    assert.ok(resposta?.corpo.includes('*status*'));
    assert.equal(await prisma.ticket.count({ where: { description: 'ajuda' } }), 0);
  });

  it('com dois chamados abertos, pergunta em vez de adivinhar', async () => {
    const telefone = '5511999990006';

    await chegaWhatsapp('wa-amb-1', telefone, 'Primeiro problema aqui');
    await processarTudo();

    // Um segundo chamado para o mesmo contato, aberto por dentro.
    const contato = await prisma.contact.findFirstOrThrow({
      where: { phone: `+${telefone}` },
    });
    const segundo = await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id,
        number: 90001,
        subject: 'Segundo problema aqui',
        description: 'x',
        originChannel: 'WHATSAPP',
        actors: { create: [{ role: 'REQUERENTE', contactId: contato.id }] },
      },
    });

    simulado.enviados.length = 0;

    await chegaWhatsapp('wa-amb-2', telefone, 'Sobre aquilo que falei');
    await processarTudo();
    await despacharTudo();

    const pergunta = simulado.enviados.find((e) => e.corpo.includes('chamados abertos'));
    assert.ok(pergunta, 'deveria ter perguntado qual chamado');

    // A mensagem ambígua não entrou em nenhum dos dois.
    assert.equal(
      await prisma.ticketEvent.count({ where: { body: 'Sobre aquilo que falei' } }),
      0,
    );

    // E responder com o número escolhe o chamado.
    simulado.enviados.length = 0;
    await chegaWhatsapp('wa-amb-3', telefone, `#${segundo.number}`);
    await processarTudo();
    await despacharTudo();

    assert.ok(
      simulado.enviados.some((e) => e.corpo.includes('Segundo problema aqui')),
      'a escolha do número deveria confirmar o chamado',
    );
  });

  it('ignora o eco da própria resposta', async () => {
    const antes = await prisma.inboundMessage.count();

    const resposta = await fetch(`${api.url}/channels/whatsapp/inbound/${f.contaWhatsapp.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'teste',
        data: {
          key: { remoteJid: '5511999990007@s.whatsapp.net', fromMe: true, id: 'wa-eco' },
          message: { conversation: 'resposta nossa voltando' },
        },
      }),
    });

    assert.equal(((await resposta.json()) as Aceite).resultado, 'DESCARTADO');
    assert.equal(await prisma.inboundMessage.count(), antes, 'o eco não deveria nem ser gravado');
  });

  it('a resposta do agente sai pelo WhatsApp, com o número na frente', async () => {
    const agente = await entrar('agente@teste.dev');

    await chegaWhatsapp('wa-resp-1', '5511999990008', 'Tela azul ao ligar');
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({ where: { subject: 'Tela azul ao ligar' } });

    await despacharTudo();
    simulado.enviados.length = 0;

    await agente.post(`/tickets/${chamado.id}/responder`, { body: 'Vamos olhar a memória.' });
    await despacharTudo();

    const envio = simulado.enviados.find((e) => e.para === '+5511999990008');
    assert.ok(envio, 'a resposta deveria sair pelo WhatsApp');
    assert.ok(envio.corpo.startsWith(`[#${chamado.number}]`));
    assert.ok(envio.corpo.includes('Vamos olhar a memória.'));
  });

  it('resposta do solicitante reabre chamado solucionado', async () => {
    const agente = await entrar('agente@teste.dev');

    await chegaWhatsapp('wa-reab-1', '5511999990009', 'Mouse não funciona');
    await processarTudo();

    const chamado = await prisma.ticket.findFirstOrThrow({ where: { subject: 'Mouse não funciona' } });
    await agente.post(`/tickets/${chamado.id}/resolver`, { body: 'Trocamos o mouse.' });

    await chegaWhatsapp('wa-reab-2', '5511999990009', 'Continua sem funcionar');
    await processarTudo();

    const depois = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(depois.status, 'ATRIBUIDO', 'quem ainda tem o que dizer não estava resolvido');
  });
});

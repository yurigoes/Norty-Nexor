import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { EstadoDoChat, EventoDoChat, TicketDetail, TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O chat ao vivo.
 *
 * Quatro promessas:
 *
 * 1. **A mensagem chega pelo fluxo**, sem a tela precisar perguntar.
 * 2. **O chat é a conversa do chamado**: a linha do chat é o mesmo
 *    `TicketEvent` da caixa de resposta, e aparece na linha do tempo.
 * 3. **"O chat está aberto" quer dizer que tem gente do outro lado** —
 *    estar sozinho na conversa não acende o selo.
 * 4. **Quem lê ao vivo não recebe a mesma frase por e-mail.**
 *
 * O fluxo é lido com `fetch` de verdade, do jeito que o navegador o
 * lê: sem isto, o teste provaria que a rota existe, não que ela
 * entrega.
 */

let api: Api;
let f: Fixtura;

let agente: Cliente;
let solicitante: Cliente;
let forasteiro: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  solicitante = new Cliente(api.url);
  assert.equal((await solicitante.entrar('solicitante@teste.dev')).status, 200);

  forasteiro = new Cliente(api.url);
  assert.equal((await forasteiro.entrar('forasteiro@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.chatPresence.deleteMany({});
  await prisma.outboundMessage.deleteMany({});
});

async function abrir(subject = 'Impressora não imprime'): Promise<TicketDetail> {
  const r = await solicitante.post<TicketDetail>('/tickets', {
    subject,
    description: 'Manda para a fila e não sai nada.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));

  await prisma.ticketActor.deleteMany({ where: { ticketId: r.corpo.id, role: 'ATRIBUIDO' } });
  await prisma.ticketActor.create({
    data: { ticketId: r.corpo.id, role: 'ATRIBUIDO', userId: f.agente.id },
  });

  return r.corpo;
}

/**
 * Lê o fluxo como o navegador leria, e devolve o que chegou.
 *
 * `fetch` com `ReadableStream`, e o token no cabeçalho: é exatamente o
 * caminho do aplicativo. `EventSource` não serviria aqui pela mesma
 * razão que não serve lá — não carrega `Authorization`.
 */
async function ouvirFluxo(
  cliente: Cliente,
  ticketId: string,
  ms: number,
  enquanto?: () => Promise<void>,
): Promise<EventoDoChat[]> {
  const controle = new AbortController();
  const recebidos: EventoDoChat[] = [];

  const resposta = await fetch(`${api.url}/chat/${ticketId}/fluxo`, {
    headers: { Authorization: `Bearer ${cliente.token}` },
    signal: controle.signal,
  });

  assert.equal(resposta.status, 200, `o fluxo não abriu: ${resposta.status}`);
  assert.ok(
    resposta.headers.get('content-type')?.includes('text/event-stream'),
    resposta.headers.get('content-type') ?? 'sem content-type',
  );

  const leitor = resposta.body!.getReader();
  const decodificador = new TextDecoder();
  let sobra = '';

  const lendo = (async () => {
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;

        sobra += decodificador.decode(value, { stream: true });
        const partes = sobra.split('\n\n');
        sobra = partes.pop() ?? '';

        for (const parte of partes) {
          const linha = parte.split('\n').find((l) => l.startsWith('data: '));
          if (linha) recebidos.push(JSON.parse(linha.slice(6)) as EventoDoChat);
        }
      }
    } catch {
      // Abortado: é o fim esperado.
    }
  })();

  if (enquanto) await enquanto();
  await new Promise((r) => setTimeout(r, ms));

  controle.abort();
  await lendo;
  return recebidos;
}

// ---------------------------------------------------------------------

describe('o fluxo entrega', () => {
  it('a mensagem do outro lado chega sem a tela perguntar', async () => {
    const chamado = await abrir();

    // O agente está ouvindo; o solicitante escreve no meio.
    const recebidos = await ouvirFluxo(agente, chamado.id, 6000, async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await solicitante.post(`/tickets/${chamado.id}/responder`, {
        body: 'A impressora voltou a falhar agora há pouco.',
        visibility: 'PUBLICA',
      });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
    });

    const mensagens = recebidos.filter((e) => e.tipo === 'mensagem');
    assert.equal(mensagens.length, 1, JSON.stringify(recebidos));
    assert.equal(
      mensagens[0].tipo === 'mensagem' && mensagens[0].evento.body,
      'A impressora voltou a falhar agora há pouco.',
    );
  });

  it('a linha do chat é a mesma da linha do tempo — não há história paralela', async () => {
    const chamado = await abrir();

    const recebidos = await ouvirFluxo(agente, chamado.id, 5000, async () => {
      await new Promise((r) => setTimeout(r, 1200));
      await solicitante.post(`/tickets/${chamado.id}/responder`, {
        body: 'Escrita pelo chat.',
        visibility: 'PUBLICA',
      });
    });

    const doFluxo = recebidos.find((e) => e.tipo === 'mensagem');
    assert.ok(doFluxo && doFluxo.tipo === 'mensagem', JSON.stringify(recebidos));

    const timeline = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const mesma = timeline.corpo.find((e) => e.id === doFluxo.evento.id);
    assert.ok(mesma, 'a mensagem do chat não apareceu na linha do tempo');
    assert.equal(mesma.body, 'Escrita pelo chat.');
  });

  it('o solicitante não recebe nota interna pelo fluxo', async () => {
    const chamado = await abrir();

    const recebidos = await ouvirFluxo(solicitante, chamado.id, 6000, async () => {
      await new Promise((r) => setTimeout(r, 1200));
      const r = await agente.post(`/tickets/${chamado.id}/responder`, {
        body: 'SENHA-DO-ADMIN-DA-IMPRESSORA-9981',
        visibility: 'INTERNA',
      });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
    });

    assert.equal(
      JSON.stringify(recebidos).includes('SENHA-DO-ADMIN'),
      false,
      `nota interna vazou pelo fluxo: ${JSON.stringify(recebidos)}`,
    );
  });

  it('colega da mesma casa, mas fora deste chamado, não entra na conversa', async () => {
    // O caso que a cerca da organização **não** cobre: mesma empresa,
    // mesmo papel, chamado que não é dele nem do time dele. Sem este
    // teste, tirar a regra de ator do serviço passaria despercebido —
    // o forasteiro continuaria sendo barrado pelo `organizationId`.
    const chamado = await abrir();

    const outro = new Cliente(api.url);
    assert.equal((await outro.entrar('agente2@teste.dev')).status, 200);

    const r = await fetch(`${api.url}/chat/${chamado.id}/fluxo`, {
      headers: { Authorization: `Bearer ${outro.token}` },
    });
    // Fecha **antes** de conferir: uma asserção que falha com o fluxo
    // aberto deixa a conexão viva, e o processo de teste não termina —
    // a falha vira travamento, que é muito pior de diagnosticar.
    await r.body?.cancel();
    assert.equal(r.status, 404, 'agente de fora do chamado abriu a conversa');

    const presenca = await outro.post('/chat/presenca', { ticketId: chamado.id });
    assert.equal(presenca.status, 404, JSON.stringify(presenca.corpo));
  });

  it('quem não enxerga o chamado não abre o fluxo', async () => {
    const chamado = await abrir();

    const r = await fetch(`${api.url}/chat/${chamado.id}/fluxo`, {
      headers: { Authorization: `Bearer ${forasteiro.token}` },
    });
    await r.body?.cancel();
    assert.equal(r.status, 404, 'o forasteiro abriu o fluxo de outra organização');
  });
});

describe('a presença', () => {
  it('"o chat está aberto" só quando há alguém do outro lado', async () => {
    const chamado = await abrir();

    // Sozinho na conversa: nada de selo.
    const sozinho = await agente.post<EstadoDoChat>('/chat/presenca', { ticketId: chamado.id });
    assert.equal(sozinho.status, 201, JSON.stringify(sozinho.corpo));
    assert.equal(sozinho.corpo.aberto, false, 'o selo acendeu para quem está sozinho');
    assert.equal(sozinho.corpo.presentes.length, 0);

    // O solicitante entra.
    const acompanhado = await solicitante.post<EstadoDoChat>('/chat/presenca', {
      ticketId: chamado.id,
    });
    assert.equal(acompanhado.corpo.aberto, true, JSON.stringify(acompanhado.corpo));
    assert.equal(acompanhado.corpo.presentes[0]?.userId, f.agente.id);

    // E o agente passa a ver o solicitante.
    const doAgente = await agente.get<EstadoDoChat>(`/chat/${chamado.id}/presenca`);
    assert.equal(doAgente.corpo.aberto, true);
    assert.equal(doAgente.corpo.presentes[0]?.name, 'Solicitante');
  });

  it('quem parou de bater some da conversa', async () => {
    const chamado = await abrir();
    await agente.post('/chat/presenca', { ticketId: chamado.id });
    await solicitante.post('/chat/presenca', { ticketId: chamado.id });

    assert.equal((await agente.get<EstadoDoChat>(`/chat/${chamado.id}/presenca`)).corpo.aberto, true);

    // O tempo passa sem batida — é assim que a aba fechada some, sem
    // depender de o navegador avisar que fechou.
    await prisma.chatPresence.updateMany({
      where: { userId: f.solicitante.id },
      data: { lastSeenAt: new Date(Date.now() - 120_000) },
    });

    const depois = await agente.get<EstadoDoChat>(`/chat/${chamado.id}/presenca`);
    assert.equal(depois.corpo.aberto, false, 'a presença velha ainda contava');
  });

  it('estar em outra conversa não conta como estar nesta', async () => {
    const aqui = await abrir('Chamado com chat');
    const ali = await abrir('Outro chamado');

    await agente.post('/chat/presenca', { ticketId: aqui.id });
    await solicitante.post('/chat/presenca', { ticketId: ali.id });

    const estado = await agente.get<EstadoDoChat>(`/chat/${aqui.id}/presenca`);
    assert.equal(estado.corpo.aberto, false, JSON.stringify(estado.corpo));
  });

  it('"digitando" acende e apaga sozinho', async () => {
    const chamado = await abrir();
    await agente.post('/chat/presenca', { ticketId: chamado.id });

    await solicitante.post('/chat/presenca', { ticketId: chamado.id, digitando: true });
    const digitando = await agente.get<EstadoDoChat>(`/chat/${chamado.id}/presenca`);
    assert.equal(digitando.corpo.presentes[0]?.digitando, true, JSON.stringify(digitando.corpo));

    // A pessoa parou, mas a aba dela segue aberta: a batida continua, o
    // "digitando" não.
    await solicitante.post('/chat/presenca', { ticketId: chamado.id });
    const parou = await agente.get<EstadoDoChat>(`/chat/${chamado.id}/presenca`);
    assert.equal(parou.corpo.presentes[0]?.digitando, false);
    assert.equal(parou.corpo.aberto, true, 'parar de digitar não é sair da conversa');
  });

  it('não se marca presença num chamado que não se enxerga', async () => {
    const chamado = await abrir();

    const r = await forasteiro.post('/chat/presenca', { ticketId: chamado.id });
    assert.equal(r.status, 404, JSON.stringify(r.corpo));

    assert.equal(await prisma.chatPresence.count({ where: { userId: f.forasteiro.id } }), 0);
  });
});

describe('quem lê ao vivo não recebe e-mail', () => {
  /** O chamado por e-mail, com o solicitante como requerente de verdade. */
  async function porEmail(): Promise<TicketDetail> {
    const { TicketsService } = await import('../src/modules/tickets/tickets.service');
    const tickets = api.app.get(TicketsService);

    const contato = await prisma.contact.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Solicitante',
        email: `solicitante+${Date.now()}@teste.dev`,
      },
    });

    const chamado = await tickets.abrirPorCanal({
      organizationId: f.organizacao.id,
      contactId: contato.id,
      requesterUserId: f.solicitante.id,
      subject: 'Chamado que veio por e-mail',
      description: 'Texto do e-mail.',
      channel: 'EMAIL',
    });

    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'REQUERENTE' } });
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'REQUERENTE', userId: f.solicitante.id },
    });
    // O agente precisa enxergar o chamado para responder nele.
    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'ATRIBUIDO' } });
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'ATRIBUIDO', userId: f.agente.id },
    });
    await prisma.outboundMessage.deleteMany({});

    return { id: chamado.id } as TicketDetail;
  }

  it('sem chat aberto, a resposta sai por e-mail como sempre', async () => {
    const chamado = await porEmail();

    const r = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia, já estamos olhando.',
      visibility: 'PUBLICA',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const fila = await prisma.outboundMessage.count({ where: { ticketId: chamado.id } });
    assert.equal(fila, 1, 'a resposta deveria ter saído por e-mail');
  });

  it('com o solicitante no chat, a mesma resposta não vira e-mail', async () => {
    const chamado = await porEmail();

    // Ele está lendo ao vivo.
    await solicitante.post('/chat/presenca', { ticketId: chamado.id });

    const r = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia, já estamos olhando.',
      visibility: 'PUBLICA',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const fila = await prisma.outboundMessage.findMany({ where: { ticketId: chamado.id } });
    assert.equal(
      fila.length,
      0,
      `mandou e-mail para quem está lendo na tela: ${JSON.stringify(fila.map((m) => m.toAddress))}`,
    );
  });

  it('quem saiu do chat volta a receber', async () => {
    const chamado = await porEmail();
    await solicitante.post('/chat/presenca', { ticketId: chamado.id });

    // Fechou a aba: parou de bater.
    await prisma.chatPresence.updateMany({
      where: { userId: f.solicitante.id },
      data: { lastSeenAt: new Date(Date.now() - 120_000) },
    });

    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Voltamos a falar por aqui.',
      visibility: 'PUBLICA',
    });

    assert.equal(await prisma.outboundMessage.count({ where: { ticketId: chamado.id } }), 1);
  });
});

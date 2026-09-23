import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { ProcessamentoService } from '../src/modules/channels/processamento.service';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

/**
 * WhatsApp pela API oficial da Meta.
 *
 * O que se prova aqui são promessas ao usuário, não detalhes:
 *
 * 1. **Só a Meta entra.** A URL é pública; sem conferir a assinatura,
 *    qualquer um abriria chamado em nome de qualquer telefone.
 * 2. **A assinatura é sobre os bytes**, e não sobre o objeto
 *    reserializado — senão toda entrega legítima seria recusada.
 * 3. **O chamado nasce na empresa certa.** Com o número em duas
 *    empresas, o bot pergunta em vez de adivinhar.
 * 4. **Fora da janela de 24 h a resposta não sai**, e o motivo está em
 *    português na fila.
 */

let api: Api;
let f: Fixtura;
let processamento: ProcessamentoService;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

const APP_SECRET = 'segredo-do-aplicativo-da-meta';
const VERIFY_TOKEN = 'token-de-verificacao-do-webhook';
const TELEFONE = '5511977776666';

let contaMeta: { id: string };

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

  // A conta é criada pela API, e não à mão no banco: assim os segredos
  // passam pela cifragem de verdade. Gravá-los em texto claro aqui
  // faria o teste provar um caminho que a produção não usa.
  const { cifrarConfig } = await import('../src/modules/channels/segredos');

  contaMeta = await prisma.channelAccount.create({
    data: {
      organizationId: f.organizacao.id,
      kind: 'WHATSAPP_META',
      name: 'WhatsApp oficial',
      config: cifrarConfig({
        phoneNumberId: '1234567890',
        token: 'token-permanente-do-app',
        appSecret: APP_SECRET,
        verifyToken: VERIFY_TOKEN,
        menuAtivo: true,
      }) as never,
    },
    select: { id: true },
  });
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  simulado.enviados.length = 0;
  await prisma.whatsappConversa.deleteMany({});
});

// ---------------------------------------------------------------------

function corpoDaMeta(mensagem: Record<string, unknown>, nome = 'Marina Prado'): string {
  // Com espaçamento de propósito: é o que diferencia estes bytes do que
  // `JSON.stringify` produziria a partir do objeto já parseado. Se o
  // código reserializasse, a assinatura não bateria — e este teste é
  // quem cobra isso.
  return JSON.stringify(
    {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '551140028922', phone_number_id: '1234567890' },
                contacts: [{ wa_id: TELEFONE, profile: { name: nome } }],
                messages: [mensagem],
              },
            },
          ],
        },
      ],
    },
    null,
    2,
  );
}

function assinar(corpo: string, segredo = APP_SECRET): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
}

async function entregar(
  corpo: string,
  opcoes: { assinatura?: string | null } = {},
): Promise<{ status: number; corpo: unknown }> {
  const assinatura =
    opcoes.assinatura === null ? undefined : (opcoes.assinatura ?? assinar(corpo));

  const resposta = await fetch(`${api.url}/channels/meta/inbound/${contaMeta.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(assinatura ? { 'X-Hub-Signature-256': assinatura } : {}),
    },
    body: corpo,
  });

  return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
}

/** Uma mensagem de texto chegando e já processada. */
async function chega(id: string, texto: string): Promise<void> {
  const corpo = corpoDaMeta({
    from: TELEFONE,
    id,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'text',
    text: { body: texto },
  });

  const r = await entregar(corpo);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  await rodarOsJobs();
}

/** Um toque numa lista que mandamos. */
async function toca(id: string, idDaLinha: string, titulo = 'opção'): Promise<void> {
  const corpo = corpoDaMeta({
    from: TELEFONE,
    id,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'interactive',
    interactive: { type: 'list_reply', list_reply: { id: idDaLinha, title: titulo } },
  });

  const r = await entregar(corpo);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  await rodarOsJobs();
}

/**
 * Processar **e** despachar.
 *
 * `enfileirarAviso` só grava na fila; quem entrega é o `DespachoJob`, e
 * é dele que o transporte simulado recebe. Chamar só o processamento
 * deixaria `simulado.enviados` vazio e todo teste de "o bot respondeu"
 * passaria a provar nada.
 */
async function rodarOsJobs(): Promise<void> {
  await processamento.processarPendentes();
  await despacho.despachar();
}

async function limparConversa(): Promise<void> {
  // Nesta ordem: apagar a pessoa antes do chamado deixaria um
  // `TicketActor` sem alvo nenhum, e o CHECK `alvo_unico` do banco
  // recusa — que é exatamente o que ele existe para fazer.
  await prisma.ticketActor.deleteMany({});
  await prisma.ticketEvent.deleteMany({});
  await prisma.outboundMessage.deleteMany({});
  await prisma.inboundMessage.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.whatsappConversa.deleteMany({});
  await prisma.membership.deleteMany({ where: { user: { phone: `+${TELEFONE}` } } });
  await prisma.user.deleteMany({ where: { phone: `+${TELEFONE}` } });
  simulado.enviados.length = 0;
}

// ---------------------------------------------------------------------

describe('o aperto de mão com a Meta', () => {
  it('devolve o desafio em texto puro', async () => {
    const resposta = await fetch(
      `${api.url}/channels/meta/inbound/${contaMeta.id}` +
        `?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1234567890`,
    );

    assert.equal(resposta.status, 200);
    // Texto puro, e só o desafio: JSON aqui reprova a configuração no
    // painel da Meta com uma mensagem que não explica nada.
    assert.ok(resposta.headers.get('content-type')?.startsWith('text/plain'));
    assert.equal(await resposta.text(), '1234567890');
  });

  it('recusa o token errado', async () => {
    const resposta = await fetch(
      `${api.url}/channels/meta/inbound/${contaMeta.id}` +
        '?hub.mode=subscribe&hub.verify_token=chutando&hub.challenge=999',
    );

    assert.equal(resposta.status, 401);
  });
});

describe('só a Meta entra', () => {
  it('sem assinatura, nada é gravado', async () => {
    const corpo = corpoDaMeta({ from: TELEFONE, id: 'w-sem-assinatura', type: 'text', text: { body: 'oi' } });
    const r = await entregar(corpo, { assinatura: null });

    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal(await prisma.inboundMessage.count({ where: { externalId: 'w-sem-assinatura' } }), 0);
  });

  it('assinatura de outro segredo é recusada', async () => {
    const corpo = corpoDaMeta({ from: TELEFONE, id: 'w-outro-segredo', type: 'text', text: { body: 'oi' } });
    const r = await entregar(corpo, { assinatura: assinar(corpo, 'segredo-de-outra-pessoa') });

    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal(await prisma.inboundMessage.count({ where: { externalId: 'w-outro-segredo' } }), 0);
  });

  it('um byte trocado no corpo invalida a assinatura', async () => {
    const corpo = corpoDaMeta({ from: TELEFONE, id: 'w-adulterado', type: 'text', text: { body: 'oi' } });
    const assinatura = assinar(corpo);

    // O atacante muda o remetente depois de a Meta assinar. É este o
    // ataque que a conferência existe para barrar: abrir chamado em
    // nome do telefone de outra pessoa.
    const adulterado = corpo.replace(TELEFONE, '5511911112222');

    const resposta = await fetch(`${api.url}/channels/meta/inbound/${contaMeta.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinatura },
      body: adulterado,
    });

    assert.equal(resposta.status, 401);
  });

  it('a assinatura confere sobre os bytes recebidos, não sobre o JSON reserializado', async () => {
    // O corpo vai indentado. `JSON.stringify(objetoParseado)` devolveria
    // bytes diferentes, e conferir contra eles recusaria **toda**
    // entrega legítima da Meta. Passar aqui é o que prova que a
    // conferência usa `rawBody`.
    const corpo = corpoDaMeta({
      from: TELEFONE,
      id: 'w-bytes-crus',
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: 'a impressão saiu com faixa preta' },
    });

    assert.notEqual(corpo, JSON.stringify(JSON.parse(corpo)), 'o corpo do teste precisa ser indentado');

    const r = await entregar(corpo);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(await prisma.inboundMessage.count({ where: { externalId: 'w-bytes-crus' } }), 1);
  });

  it('a reentrega do mesmo wamid não abre um segundo chamado', async () => {
    await limparConversa();

    const corpo = corpoDaMeta({
      from: TELEFONE,
      id: 'w-repetido',
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: 'o sistema está lento desde a manhã' },
    });

    await entregar(corpo);
    await entregar(corpo);
    await processamento.processarPendentes();

    // A Meta reentrega o que não recebeu 200 a tempo, com o mesmo id.
    // A unicidade de `externalId` é o que absorve isso.
    assert.equal(await prisma.inboundMessage.count({ where: { externalId: 'w-repetido' } }), 1);
    assert.equal(await prisma.ticket.count({}), 1);
  });
});

describe('o chamado nasce na empresa certa', () => {
  let padaria: { id: string };
  let transportadora: { id: string };

  before(async () => {
    padaria = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Padaria do João',
        emailDomain: 'padariadojoao.com.br',
      },
      select: { id: true },
    });

    transportadora = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Transportadora Sol',
        emailDomain: 'transportadorasol.com.br',
      },
      select: { id: true },
    });
  });

  beforeEach(limparConversa);

  let sequencia = 0;

  /** A mesma pessoa cadastrada em duas empresas: duas contas, um número. */
  async function cadastrarNasDuas(): Promise<void> {
    sequencia += 1;
    for (const [i, cliente] of [padaria, transportadora].entries()) {
      const usuario = await prisma.user.create({
        data: {
          // E-mail único por execução: o `limparConversa` apaga as
          // contas deste número, mas `@unique` é global e um teste que
          // reusasse o mesmo endereço quebraria por ordem de execução.
          email: `marina-${sequencia}-${i}@exemplo.com.br`,
          name: 'Marina Prado',
          phone: `+${TELEFONE}`,
          passwordHash: 'x',
          mustChangePassword: false,
        },
      });
      await prisma.membership.create({
        data: {
          userId: usuario.id,
          organizationId: f.organizacao.id,
          role: 'SOLICITANTE',
          clientId: cliente.id,
        },
      });
    }
  }

  it('com uma empresa só, o chamado sai identificado sem perguntar nada', async () => {
    const usuario = await prisma.user.create({
      data: {
        email: `so-uma-${Date.now()}@padariadojoao.com.br`,
        name: 'João da Padaria',
        phone: `+${TELEFONE}`,
        passwordHash: 'x',
        mustChangePassword: false,
      },
    });
    await prisma.membership.create({
      data: {
        userId: usuario.id,
        organizationId: f.organizacao.id,
        role: 'SOLICITANTE',
        clientId: padaria.id,
      },
    });

    await chega('w-uma-empresa', 'O forno da loja não liga desde ontem');

    const chamado = await prisma.ticket.findFirst({
      include: { actors: { where: { role: 'REQUERENTE' } } },
    });

    assert.ok(chamado, 'o chamado não foi aberto');
    assert.equal(chamado.clientId, padaria.id);
    // No nome da pessoa, e não de um contato anônimo: é disso que
    // depende ela enxergar o próprio chamado ao entrar no portal.
    assert.equal(chamado.actors[0]?.userId, usuario.id);

  });

  it('com duas empresas, pergunta qual — e não adivinha', async () => {
    await cadastrarNasDuas();

    await chega('w-duas-empresas', 'A internet da loja caiu');

    // Nenhum chamado: adivinhar pela primeira empresa erraria em
    // silêncio, e o erro só apareceria no relatório do mês.
    assert.equal(await prisma.ticket.count({}), 0);

    const perguntou = simulado.enviados.at(-1);
    assert.ok(perguntou, 'o bot não perguntou nada');
    assert.ok(perguntou.corpo.includes('Padaria do João'), perguntou.corpo);
    assert.ok(perguntou.corpo.includes('Transportadora Sol'), perguntou.corpo);

    // E a lista de toque vai junto do texto, com o id de cada empresa.
    const ids = perguntou.lista?.secoes[0]?.linhas.map((l) => l.id) ?? [];
    assert.ok(ids.includes(`empresa:${padaria.id}`), JSON.stringify(ids));
    assert.ok(ids.includes(`empresa:${transportadora.id}`), JSON.stringify(ids));

  });

  it('depois do toque, o chamado sai na empresa escolhida', async () => {
    await cadastrarNasDuas();

    await chega('w-fluxo-1', 'A internet da loja caiu');
    await toca('w-fluxo-2', `empresa:${transportadora.id}`, 'Transportadora Sol');
    await chega('w-fluxo-3', 'A internet do escritório caiu e ninguém emite nota');

    const chamado = await prisma.ticket.findFirst({});
    assert.ok(chamado, 'o chamado não foi aberto depois da escolha');
    assert.equal(chamado.clientId, transportadora.id);

  });

  it('o toque numa empresa sem vínculo com este número é recusado', async () => {
    await cadastrarNasDuas();

    // Uma empresa que existe na organização, mas em que este telefone
    // não está cadastrado. O id chega de fora: sem esta cerca, um id
    // trocado abriria chamado na empresa de outro cliente.
    const alheia = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Construtora Alheia',
        emailDomain: 'construtoraalheia.com.br',
      },
      select: { id: true },
    });

    await chega('w-alheia-1', 'preciso de ajuda com o sistema');
    await toca('w-alheia-2', `empresa:${alheia.id}`, 'Construtora Alheia');
    await chega('w-alheia-3', 'o sistema não abre de manhã');

    const chamado = await prisma.ticket.findFirst({});
    assert.notEqual(
      chamado?.clientId,
      alheia.id,
      'o chamado saiu numa empresa em que este número não está cadastrado',
    );

    await prisma.client.delete({ where: { id: alheia.id } });
  });

  it('a escolha escrita também vale, para quem não tem lista de toque', async () => {
    await cadastrarNasDuas();

    await chega('w-escrito-1', 'oi, preciso de suporte no sistema');
    // Sem toque: a pessoa digitou parte do nome, como faria quem recebeu
    // a lista em texto pela Evolution.
    await chega('w-escrito-2', 'padaria');
    await chega('w-escrito-3', 'a balança parou de imprimir a etiqueta');

    const chamado = await prisma.ticket.findFirst({});
    assert.equal(chamado?.clientId, padaria.id);

  });
});

describe('quem só cumprimenta recebe o menu, não um chamado chamado "oi"', () => {
  beforeEach(limparConversa);

  it('"bom dia" vira menu', async () => {
    await chega('w-oi', 'Bom dia!');

    assert.equal(await prisma.ticket.count({}), 0);

    const menu = simulado.enviados.at(-1);
    assert.ok(menu, 'o menu não foi oferecido');
    assert.ok(menu.lista, 'o menu saiu sem a lista de toque');
    assert.ok(menu.corpo.includes('Abrir um chamado'), menu.corpo);
  });

  it('"bom dia, a impressora parou" é um problema, e vira chamado', async () => {
    await chega('w-bom-dia-problema', 'Bom dia, a impressora parou de funcionar');

    // Tratar isto como cumprimento faria a pessoa contar tudo de novo.
    assert.equal(await prisma.ticket.count({}), 1);
  });
});

describe('a janela de 24 horas', () => {
  beforeEach(limparConversa);

  it('a resposta não sai quando a última mensagem da pessoa é velha', async () => {
    await chega('w-janela', 'O servidor de arquivos sumiu da rede');

    const chamado = await prisma.ticket.findFirst({});
    assert.ok(chamado);

    // Empurra a entrada para trás: é o que "a conversa esfriou" é no
    // banco.
    await prisma.inboundMessage.updateMany({
      where: { externalId: 'w-janela' },
      data: { receivedAt: new Date(Date.now() - 30 * 3600_000) },
    });

    const { EnvioDeWhatsapp } = await import('../src/modules/channels/whatsapp.envio');
    const envio = api.app.get(EnvioDeWhatsapp);

    await assert.rejects(
      () =>
        envio.enviar({
          para: `+${TELEFONE}`,
          corpo: 'Já resolvemos aqui, pode conferir?',
          externalId: '',
          organizationId: f.organizacao.id,
          channelAccountId: contaMeta.id,
        }),
      (erro: Error) => {
        // Em português e sem código cru: "131047" no diagnóstico não
        // conta nada a quem for investigar.
        assert.ok(erro.message.includes('24 h'), erro.message);
        assert.equal(/\d{6}/.test(erro.message), false, erro.message);
        return true;
      },
    );
  });

  it('dentro da janela, a Meta é chamada de verdade', async () => {
    await chega('w-dentro', 'O teclado está trocando as letras');

    const { EnvioDeWhatsapp } = await import('../src/modules/channels/whatsapp.envio');
    const envio = api.app.get(EnvioDeWhatsapp);

    const fetchDeVerdade = globalThis.fetch;
    let chamou: { url: string; corpo: unknown } | null = null;

    globalThis.fetch = (async (entrada: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = typeof entrada === 'string' ? entrada : (entrada as Request).url ?? String(entrada);

      if (!url.includes('graph.facebook.com')) return fetchDeVerdade(entrada, init);

      chamou = { url, corpo: JSON.parse(String(init?.body ?? '{}')) };
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.RESPOSTA' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const saida = await envio.enviar({
        para: `+${TELEFONE}`,
        corpo: 'Vamos trocar o teclado hoje à tarde.',
        externalId: '',
        organizationId: f.organizacao.id,
        channelAccountId: contaMeta.id,
      });

      assert.equal(saida.externalId, 'wamid.RESPOSTA');
      assert.ok(chamou, 'a Meta não foi chamada');
      assert.ok((chamou as { url: string }).url.includes('/1234567890/messages'));

      const corpo = (chamou as { corpo: Record<string, unknown> }).corpo;
      assert.equal(corpo.messaging_product, 'whatsapp');
      // Sem `+` e sem pontuação: a Meta quer só os dígitos.
      assert.equal(corpo.to, TELEFONE);
    } finally {
      globalThis.fetch = fetchDeVerdade;
    }
  });
});

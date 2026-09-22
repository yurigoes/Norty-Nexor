import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ConsultaPublica, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Consulta por protocolo, sem login.
 *
 * O que esta suíte protege é o recorte: quem tem o código provou ter o
 * código, e nada mais. Um vazamento de nota interna aqui seria o pior
 * defeito possível do produto — a conversa da equipe sobre o chamado
 * saindo para quem tem um código de oito letras.
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

/** Consulta sem cabeçalho de autorização: é o ponto do bloco. */
async function consultar(codigo: string) {
  const r = await fetch(`${api.url}/publico/protocolo/${encodeURIComponent(codigo)}`);
  const texto = await r.text();
  return { status: r.status, corpo: texto ? (JSON.parse(texto) as ConsultaPublica) : null };
}

async function abrir(c: Cliente, assunto = 'Impressora parou'): Promise<TicketDetail> {
  const r = await c.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: 'Descrição do problema.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

const protocoloDe = (id: string) =>
  prisma.ticket.findUniqueOrThrow({ where: { id }, select: { protocol: true } });

/** Zera a escada entre casos: um caso não pode barrar o seguinte. */
async function liberarLimite() {
  await prisma.loginThrottle.deleteMany({});
}

describe('protocolo', () => {
  it('nasce sorteado, e não é o número do chamado', async () => {
    const agente = await entrar('agente@teste.dev');
    const um = await abrir(agente);
    const dois = await abrir(agente);

    const a = await protocoloDe(um.id);
    const b = await protocoloDe(dois.id);

    assert.match(a.protocol, /^[234679CDFGHJKMNPQRTWXYZ]{8}$/);
    assert.notEqual(a.protocol, b.protocol);
    // O defeito que o sorteio evita: `#124` ser `#123` mais um.
    assert.equal(dois.number, um.number + 1, 'o número segue sequencial');
    assert.ok(
      Number.isNaN(Number(a.protocol)) || a.protocol !== String(um.number),
      'o protocolo não é o número',
    );
  });

  /**
   * O defeito que isto pega: o protocolo existia no banco e nunca saía
   * para o aplicativo. Quem atendia via `#2`, quem ligava tinha
   * `4K7P-WZ9N`, e não havia onde cruzar um com o outro.
   */
  it('sai na abertura, no detalhe e na fila — não só no banco', async () => {
    const agente = await entrar('agente@teste.dev');
    const aberto = await abrir(agente, 'Chamado que precisa ditar o código');
    const gravado = (await protocoloDe(aberto.id)).protocol;

    assert.equal(aberto.protocol, gravado, 'a resposta da abertura traz o protocolo');

    const detalhe = await agente.get<TicketDetail>(`/tickets/${aberto.id}`);
    assert.equal(detalhe.status, 200, JSON.stringify(detalhe.corpo));
    assert.equal(detalhe.corpo.protocol, gravado, 'o detalhe traz o protocolo');

    const fila = await agente.get<{ data: TicketDetail[] }>('/tickets?limit=50');
    assert.equal(fila.status, 200, JSON.stringify(fila.corpo));
    const naFila = (fila.corpo.data ?? []).find((t) => t.id === aberto.id);
    assert.ok(naFila, 'o chamado aberto está na fila');
    assert.equal(naFila.protocol, gravado, 'a fila traz o protocolo');
  });
});

describe('consulta pública', () => {
  it('mostra o andamento a quem tem o código, sem login', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente, 'Notebook não liga');
    const { protocol } = await protocoloDe(chamado.id);

    const r = await consultar(protocol);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo?.subject, 'Notebook não liga');
    assert.equal(r.corpo?.status, 'ATRIBUIDO');
    assert.equal(r.corpo?.organization, f.organizacao.name);
    assert.equal(r.corpo?.protocol, `${protocol.slice(0, 4)}-${protocol.slice(4)}`);
  });

  it('aceita o código com traço, em minúsculas e com espaço', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);
    const { protocol } = await protocoloDe(chamado.id);
    const bagunçado = ` ${protocol.slice(0, 4).toLowerCase()}-${protocol.slice(4).toLowerCase()} `;

    const r = await consultar(bagunçado);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
  });

  it('NÃO mostra nota interna — é a conversa da equipe', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const segredo = 'O cliente está devendo três faturas; segurar o atendimento.';
    const nota = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: segredo,
      visibility: 'INTERNA',
    });
    assert.equal(nota.status, 201, JSON.stringify(nota.corpo));

    const publica = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Estamos verificando.',
      visibility: 'PUBLICA',
    });
    assert.equal(publica.status, 201);

    const { protocol } = await protocoloDe(chamado.id);
    const r = await consultar(protocol);

    const tudo = JSON.stringify(r.corpo);
    assert.ok(!tudo.includes(segredo), 'a nota interna vazou para a consulta pública');
    assert.ok(tudo.includes('Estamos verificando.'), 'a resposta pública deveria aparecer');
  });

  it('o filtro de visibilidade segura o que o filtro de tipo deixaria passar', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    // A consulta filtra por **dois** critérios: tipo e visibilidade.
    // Responder com `visibility: 'INTERNA'` grava `NOTA_INTERNA`, que o
    // filtro de tipo já barra sozinho — então o caso acima não prova o
    // filtro de visibilidade. Este prova: um `MENSAGEM` (tipo que passa)
    // marcado como `INTERNA`. O modelo permite a combinação, e é ela que
    // separa as duas defesas.
    const segredo = 'ZZ-INTERNA-COM-TIPO-QUE-PASSA-ZZ';
    await prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'MENSAGEM',
        visibility: 'INTERNA',
        channel: 'WEB',
        body: segredo,
      },
    });

    const { protocol } = await protocoloDe(chamado.id);
    const r = await consultar(protocol);
    assert.ok(
      !JSON.stringify(r.corpo).includes(segredo),
      'evento interno de tipo público vazou: o filtro de visibilidade não está segurando',
    );
  });

  it('não entrega e-mail nem sobrenome de ninguém', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);
    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Boa tarde, já estamos olhando.',
      visibility: 'PUBLICA',
    });

    const { protocol } = await protocoloDe(chamado.id);
    const r = await consultar(protocol);
    const tudo = JSON.stringify(r.corpo);

    assert.ok(!tudo.includes('@teste.dev'), 'vazou e-mail');
    assert.ok(!tudo.includes(chamado.id), 'vazou o id do chamado');
    assert.equal(r.corpo?.timeline.find((e) => e.by)?.by, 'Agente', 'só o primeiro nome');
  });

  it('a consulta é só de leitura: não há como escrever por aqui', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);
    const { protocol } = await protocoloDe(chamado.id);

    for (const metodo of ['POST', 'PATCH', 'DELETE']) {
      const r = await fetch(`${api.url}/publico/protocolo/${protocol}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: metodo === 'DELETE' ? undefined : '{"body":"deixa eu escrever"}',
      });
      assert.ok(r.status === 404 || r.status === 405, `${metodo} devolveu ${r.status}`);
    }
  });

  it('mostra o atendimento agendado, que é o que a pessoa quer saber', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const quando = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const marcou = await agente.post(`/tickets/${chamado.id}/agendamentos`, {
      scheduledFor: quando.toISOString(),
    });
    assert.equal(marcou.status, 201, JSON.stringify(marcou.corpo));

    const { protocol } = await protocoloDe(chamado.id);
    const r = await consultar(protocol);
    assert.equal(r.corpo?.scheduledFor, quando.toISOString());
    assert.ok(
      r.corpo?.timeline.some((e) => e.text === 'Atendimento agendado.'),
      'o agendamento deveria estar na linha do tempo pública',
    );
  });
});

describe('o que a consulta recusa', () => {
  it('protocolo que não existe dá a mesma resposta que protocolo malformado', async () => {
    await liberarLimite();
    const inexistente = await consultar('CDFGHJKM');
    await liberarLimite();
    const malformado = await consultar('AEIOU123');

    assert.equal(inexistente.status, 404);
    assert.equal(malformado.status, 404);
    assert.deepEqual(
      (inexistente.corpo as unknown as { detail: string }).detail,
      (malformado.corpo as unknown as { detail: string }).detail,
      'a diferença contaria quais códigos têm a forma certa',
    );
  });

  it('errar em sequência barra, e o bloqueio conta o código malformado', async () => {
    await liberarLimite();

    // As três primeiras erram sem barrar: digitar errado é o caso comum,
    // e transformar isso em bloqueio produz ligação para o suporte, não
    // segurança. A quarta ainda responde 404 e é ela que tranca — a
    // trava vale da tentativa seguinte em diante.
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await consultar('CDFGHJKM')).status, 404, `tentativa ${i + 1}`);
    }

    const barrada = await consultar('CDFGHJKM');
    assert.equal(barrada.status, 429, JSON.stringify(barrada.corpo));

    // E barra mesmo quem agora acerta: é o que impede varrer o espaço.
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);
    const { protocol } = await protocoloDe(chamado.id);
    assert.equal((await consultar(protocol)).status, 429);

    await liberarLimite();
    assert.equal((await consultar(protocol)).status, 200, 'liberado, volta a responder');
  });

  it('acertar zera a contagem', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);
    const { protocol } = await protocoloDe(chamado.id);

    assert.equal((await consultar('CDFGHJKM')).status, 404);
    assert.equal((await consultar('CDFGHJKM')).status, 404);
    assert.equal((await consultar(protocol)).status, 200);

    // Zerada a contagem, há de novo três erros de folga.
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await consultar('CDFGHJKM')).status, 404, `tentativa ${i + 1} após o acerto`);
    }
  });
});

describe('comprovante em PDF', () => {
  it('sai com a marca, o protocolo e o acompanhamento', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente, 'Troca de toner');
    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Toner solicitado ao estoque.',
      visibility: 'PUBLICA',
    });

    const { protocol } = await protocoloDe(chamado.id);
    const r = await fetch(`${api.url}/publico/protocolo/${protocol}/pdf`);

    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition') ?? '', /attachment; filename="protocolo-/);

    const arquivo = Buffer.from(await r.arrayBuffer());
    assert.equal(arquivo.subarray(0, 5).toString(), '%PDF-', 'não é um PDF');
    assert.ok(arquivo.length > 1000, `PDF pequeno demais: ${arquivo.length} bytes`);
    assert.equal(
      Number(r.headers.get('content-length')),
      arquivo.length,
      'o Content-Length tem de bater, senão a barra de progresso roda para sempre',
    );
  });

  it('o PDF também não carrega nota interna', async () => {
    await liberarLimite();
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const segredo = 'ZZSEGREDOINTERNOZZ';
    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: segredo,
      visibility: 'INTERNA',
    });

    const { protocol } = await protocoloDe(chamado.id);
    const r = await fetch(`${api.url}/publico/protocolo/${protocol}/pdf`);
    const arquivo = Buffer.from(await r.arrayBuffer());

    // O texto do PDF está comprimido; descomprimir aqui seria reescrever
    // o leitor. O que dá para afirmar sem isso é que o segredo não saiu
    // em claro — e a consulta que alimenta o PDF já foi testada acima.
    assert.ok(!arquivo.includes(Buffer.from(segredo)), 'segredo em claro no PDF');
  });

  it('protocolo inexistente não gera PDF', async () => {
    await liberarLimite();
    const r = await fetch(`${api.url}/publico/protocolo/CDFGHJKM/pdf`);
    assert.equal(r.status, 404);
  });
});

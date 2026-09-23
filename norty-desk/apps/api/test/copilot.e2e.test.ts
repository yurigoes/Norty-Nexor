import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { LIMITE_DO_RASCUNHO, MARCA_DE_IA, type AiConfigView, type CopilotResposta, type TicketDetail, type TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Norty Copilot.
 *
 * Três coisas se provam aqui, e as três são promessas ao usuário, não
 * detalhes de implementação:
 *
 * 1. **A chave não volta.** A tela recebe `temChave`, nunca a chave.
 * 2. **O que é interno não sai da casa.** Nota interna e campo interno
 *    do formulário não chegam ao provedor — e isso se verifica lendo o
 *    que de fato foi enviado pela rede, não lendo o código.
 * 3. **A resposta da IA vai declarada** na tela e nos canais externos.
 *
 * O provedor é substituído por um `fetch` de teste que guarda o que
 * recebeu. Falar com o Gemini de verdade tornaria a suíte dependente de
 * rede, de chave e de cota — e, pior, deixaria de provar exatamente o
 * ponto 2, que é sobre o conteúdo da requisição.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;
let agente: Cliente;

/** O que o provedor recebeu na última chamada. */
let ultimaChamada: { url: string; headers: Record<string, string>; prompt: string } | null = null;
let respostaDoProvedor: { status: number; corpo: unknown } = {
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Bom dia. Já estamos verificando.' }] } }] },
};

const fetchDeVerdade = globalThis.fetch;

before(async () => {
  await limparBanco();
  f = await semear();

  // Configurar a IA é mexer em credencial da empresa inteira: só o
  // administrador tem `config:copilot`.
  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  // O provedor de mentira. Só intercepta o que vai para fora; o resto
  // da suíte fala com a própria API pelo mesmo `fetch`.
  globalThis.fetch = (async (entrada: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

    if (!url.includes('generativelanguage.googleapis.com') && !url.includes('api.groq.com')) {
      return fetchDeVerdade(entrada, init);
    }

    const corpo = JSON.parse(String(init?.body ?? '{}')) as {
      contents?: { parts?: { text?: string }[] }[];
      messages?: { content?: string }[];
    };

    ultimaChamada = {
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      prompt: corpo.contents?.[0]?.parts?.[0]?.text ?? corpo.messages?.[0]?.content ?? '',
    };

    return new Response(JSON.stringify(respostaDoProvedor.corpo), {
      status: respostaDoProvedor.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = fetchDeVerdade;
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(() => {
  ultimaChamada = null;
});

async function ligarCopilot(): Promise<void> {
  const r = await admin.put<AiConfigView>('/config/copilot', {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    isActive: true,
    apiKey: 'chave-do-gemini-1234',
  });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
}

/**
 * O que o provedor recebeu, exigindo que ele tenha sido chamado.
 *
 * Numa função porque o `ultimaChamada = null` que cada teste faz antes
 * estreita o tipo para `null` no resto do bloco, e o TypeScript então
 * recusa `ultimaChamada.prompt` mesmo depois do `assert.ok`. Aqui
 * dentro não há esse estreitamento.
 */
function chamadaAoProvedor(): { url: string; headers: Record<string, string>; prompt: string } {
  assert.ok(ultimaChamada, 'o provedor não foi chamado');
  return ultimaChamada;
}

async function abrir(subject: string, description: string): Promise<TicketDetail> {
  const r = await agente.post<TicketDetail>('/tickets', {
    subject,
    description,
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('configuração do Copilot', () => {
  it('a chave nunca volta para a tela — volta "temChave"', async () => {
    const salva = await admin.put<AiConfigView>('/config/copilot', {
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
      isActive: true,
      apiKey: 'chave-secreta-do-gemini',
    });

    assert.equal(salva.status, 200, JSON.stringify(salva.corpo));
    assert.equal(salva.corpo.temChave, true);
    assert.equal(JSON.stringify(salva.corpo).includes('chave-secreta'), false);

    const lida = await admin.get<AiConfigView>('/config/copilot');
    assert.equal(lida.status, 200);
    assert.equal(lida.corpo.temChave, true);
    assert.equal(JSON.stringify(lida.corpo).includes('chave-secreta'), false);

    // E no banco ela está cifrada, não em texto claro.
    const linha = await prisma.aiConfig.findUnique({
      where: { organizationId: f.organizacao.id },
    });
    const cifrada = linha?.apiKeyCifrada ?? '';
    assert.ok(cifrada.startsWith('v1:'), 'a chave não foi cifrada');
    assert.equal(cifrada.includes('chave-secreta'), false);
  });

  it('omitir a chave mantém a guardada; string vazia apaga e desliga', async () => {
    await ligarCopilot();

    // Trocar o modelo sem redigitar a chave. Sem isto, quem mexe na
    // configuração acaba deixando a chave num histórico de terminal.
    const trocado = await admin.put<AiConfigView>('/config/copilot', {
      provider: 'GEMINI',
      model: 'gemini-2.5-pro',
      isActive: true,
    });
    assert.equal(trocado.status, 200, JSON.stringify(trocado.corpo));
    assert.equal(trocado.corpo.model, 'gemini-2.5-pro');
    assert.equal(trocado.corpo.temChave, true);

    const apagado = await admin.put<AiConfigView>('/config/copilot', {
      provider: 'GEMINI',
      model: 'gemini-2.5-pro',
      isActive: false,
      apiKey: '',
    });
    assert.equal(apagado.status, 200, JSON.stringify(apagado.corpo));
    assert.equal(apagado.corpo.temChave, false);

    await ligarCopilot();
  });

  it('ligar sem chave é recusado — botão que não responde é pior que botão nenhum', async () => {
    const r = await admin.put('/config/copilot', {
      provider: 'GROQ',
      model: 'llama-3.3-70b-versatile',
      isActive: true,
      apiKey: '',
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    await ligarCopilot();
  });

  it('quem atende não configura a IA', async () => {
    const leitura = await agente.get('/config/copilot');
    assert.equal(leitura.status, 403);

    const escrita = await agente.put('/config/copilot', {
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
      isActive: true,
      apiKey: 'nao-deveria-entrar',
    });
    assert.equal(escrita.status, 403);
  });
});

describe('a cerca do que sai da casa', () => {
  it('nota interna e campo interno não chegam ao provedor', async () => {
    await ligarCopilot();
    const chamado = await abrir('Impressora não imprime', 'Manda para a fila e não sai nada.');

    const publica = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia, já estamos olhando.',
      visibility: 'PUBLICA',
    });
    assert.equal(publica.status, 201, JSON.stringify(publica.corpo));

    const interna = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'SENHA-DO-ADMIN-DA-IMPRESSORA-9981',
      visibility: 'INTERNA',
    });
    assert.equal(interna.status, 201, JSON.stringify(interna.corpo));

    // A cerca tem duas barras, e cada uma precisa valer sozinha.
    //
    // A nota escrita pela tela nasce `NOTA_INTERNA`, então o filtro de
    // tipo já daria conta dela — e um teste que parasse aqui provaria o
    // filtro de tipo, não o de visibilidade. Este evento é gravado
    // direto no banco como `MENSAGEM` **interna**, que é exatamente a
    // combinação contra a qual o filtro de visibilidade existe.
    await prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'MENSAGEM',
        visibility: 'INTERNA',
        channel: 'SISTEMA',
        body: 'IP-DA-VPN-INTERNA-10-8-0-7',
      },
    });

    // E o nome de arquivo retirado é público, mas não é fala de
    // ninguém: sem o filtro de tipo, "…confidencial.pdf" entraria na
    // conversa como se o atendimento o tivesse dito — e nome de
    // arquivo conta o que o anexo era.
    await prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'ANEXO_REMOVIDO',
        visibility: 'PUBLICA',
        channel: 'WEB',
        body: 'demissoes-2026-CONFIDENCIAL.pdf',
      },
    });

    // Resposta do formulário também não sai: o contexto não a carrega.
    await prisma.ticket.update({
      where: { id: chamado.id },
      data: { customFields: { patrimonio: 'TOMBAMENTO-SIGILOSO-7731' } },
    });

    const r = await agente.post<CopilotResposta>(`/tickets/${chamado.id}/copilot`, {
      intencao: 'REDIGIR',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.ok(ultimaChamada, 'o provedor não foi chamado');
    const prompt = ultimaChamada.prompt;

    // O que é do cliente vai.
    assert.ok(prompt.includes('Impressora não imprime'));
    assert.ok(prompt.includes('Manda para a fila'));
    assert.ok(prompt.includes('Bom dia, já estamos olhando.'));

    // O que é da equipe não vai. Este é o ponto do teste.
    assert.equal(prompt.includes('SENHA-DO-ADMIN'), false, prompt);
    assert.equal(prompt.includes('IP-DA-VPN-INTERNA'), false, prompt);
    assert.equal(prompt.includes('TOMBAMENTO-SIGILOSO'), false, prompt);
    assert.equal(prompt.includes('CONFIDENCIAL.pdf'), false, prompt);

    // Nem identificador de chamado, de pessoa ou de empresa.
    assert.equal(prompt.includes(chamado.id), false);
    assert.equal(prompt.includes(f.agente.id), false);
    assert.equal(prompt.includes(f.organizacao.id), false);
  });

  it('a chave vai no cabeçalho do provedor, e o chamado é o da própria organização', async () => {
    await ligarCopilot();
    const chamado = await abrir('Monitor piscando', 'Pisca a cada dois minutos.');

    await agente.post(`/tickets/${chamado.id}/copilot`, { intencao: 'SUGERIR' });
    assert.equal(ultimaChamada?.headers['x-goog-api-key'], 'chave-do-gemini-1234');

    // Chamado de outra organização não existe para este token — e a
    // cerca é a consulta, não um filtro depois: o provedor nem é
    // chamado.
    //
    // A outra organização precisa ter o Copilot ligado, senão o 400 de
    // "não configurado" chegaria antes e o teste passaria sem provar a
    // cerca.
    const { cifrar } = await import('../src/modules/channels/segredos');
    await prisma.aiConfig.upsert({
      where: { organizationId: f.outra.id },
      update: { isActive: true, apiKeyCifrada: cifrar('chave-da-outra') },
      create: {
        organizationId: f.outra.id,
        provider: 'GEMINI',
        model: 'gemini-2.5-flash',
        isActive: true,
        apiKeyCifrada: cifrar('chave-da-outra'),
      },
    });

    ultimaChamada = null;
    const forasteiro = new Cliente(api.url);
    assert.equal((await forasteiro.entrar('forasteiro@teste.dev')).status, 200);
    const r = await forasteiro.post(`/tickets/${chamado.id}/copilot`, { intencao: 'REDIGIR' });
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
    assert.equal(ultimaChamada, null);
  });
});

describe('o Copilot nunca responde sozinho', () => {
  it('pedir um rascunho não escreve nada no chamado', async () => {
    await ligarCopilot();
    const chamado = await abrir('Teclado trocado', 'As teclas saem trocadas.');

    const antes = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const r = await agente.post<CopilotResposta>(`/tickets/${chamado.id}/copilot`, {
      intencao: 'REDIGIR',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.texto, 'Bom dia. Já estamos verificando.');

    const depois = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    assert.equal(depois.corpo.length, antes.corpo.length);
  });

  it('desligado, não responde e não chama o provedor', async () => {
    await admin.put('/config/copilot', {
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
      isActive: false,
    });

    const disponivel = await agente.get<{ disponivel: boolean }>('/copilot/disponivel');
    assert.equal(disponivel.corpo.disponivel, false);

    const chamado = await abrir('Sem rede', 'O cabo está conectado.');
    const r = await agente.post(`/tickets/${chamado.id}/copilot`, { intencao: 'REDIGIR' });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(ultimaChamada, null);

    await ligarCopilot();
    const ligado = await agente.get<{ disponivel: boolean }>('/copilot/disponivel');
    assert.equal(ligado.corpo.disponivel, true);
  });

  it('erro do provedor vira frase útil em português, não silêncio nem inglês', async () => {
    await ligarCopilot();
    const chamado = await abrir('Cadeira quebrada', 'O pistão não sobe.');

    // Os três erros que o administrador comete de verdade. O primeiro é
    // o caso que quase passou batido: o Gemini devolve **400** para
    // chave inválida, não 401 — classificar pelo código deixaria
    // "erro 400" na tela.
    const casos = [
      {
        status: 400,
        corpo: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } },
        espera: 'recusada',
      },
      {
        status: 404,
        corpo: { error: { code: 404, message: 'models/gemini-9 is not found for API version v1beta' } },
        espera: 'modelo',
      },
      {
        status: 429,
        corpo: { error: { code: 429, message: 'Quota exceeded for quota metric' } },
        espera: 'limite de uso',
      },
    ];

    for (const caso of casos) {
      respostaDoProvedor = { status: caso.status, corpo: caso.corpo };
      const r = await agente.post<{ detail: string }>(`/tickets/${chamado.id}/copilot`, {
        intencao: 'REDIGIR',
      });

      assert.equal(r.status, 400);
      assert.ok(r.corpo.detail.includes(caso.espera), `${caso.status}: ${r.corpo.detail}`);

      // O texto do provedor não é repassado: nem o inglês, nem a chave.
      assert.equal(r.corpo.detail.includes('API key'), false, r.corpo.detail);
      assert.equal(JSON.stringify(r.corpo).includes('chave-do-gemini'), false);
    }

    respostaDoProvedor = {
      status: 200,
      corpo: { candidates: [{ content: { parts: [{ text: 'Bom dia. Já estamos verificando.' }] } }] },
    };
  });
});

describe('a resposta da IA vai declarada', () => {
  it('o evento nasce marcado, e o selo vem do banco', async () => {
    const chamado = await abrir('Sistema lento', 'Demora para abrir a tela inicial.');

    const r = await agente.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia. Já estamos verificando.',
      visibility: 'PUBLICA',
      aiGenerated: true,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.aiGenerated, true);

    const eventos = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const marcado = eventos.corpo.find((e) => e.id === r.corpo.id);
    assert.equal(marcado?.aiGenerated, true);

    // E o campo é uma coluna, não uma chave no payload: o selo não pode
    // depender de alguém lembrar de ler um JSON.
    const linha = await prisma.ticketEvent.findUnique({ where: { id: r.corpo.id } });
    assert.equal(linha?.aiGenerated, true);
  });

  it('resposta escrita à mão não ganha marca', async () => {
    const chamado = await abrir('Mouse sem clique', 'O botão esquerdo não responde.');

    const r = await agente.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia. Pode trazer o mouse na bancada?',
      visibility: 'PUBLICA',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.aiGenerated, false);
  });

  it('quem recebe por e-mail e por WhatsApp também fica sabendo', async () => {
    const chamado = await abrir('Impressora sem toner', 'Saiu o aviso de toner.');

    // Quem recebe é o requerente, e o autor da resposta não recebe a
    // própria mensagem. O requerente aqui é um contato porque o
    // WhatsApp só tem para onde despachar quando há telefone — e
    // telefone mora no contato, não no usuário.
    const contato = await prisma.contact.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Cliente do Toner',
        email: 'toner@cliente.dev',
        phone: '5511999990000',
      },
    });
    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'REQUERENTE' } });
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'REQUERENTE', contactId: contato.id },
    });

    for (const canal of ['EMAIL', 'WHATSAPP'] as const) {
      const r = await agente.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
        body: 'Bom dia. O toner já foi solicitado.',
        visibility: 'PUBLICA',
        channel: canal,
        aiGenerated: true,
      });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));

      const saida = await prisma.outboundMessage.findFirst({
        where: { eventId: r.corpo.id },
      });
      assert.ok(saida, `nada enfileirado para ${canal}`);
      assert.ok(
        saida.body.includes(MARCA_DE_IA),
        `a marca de IA não saiu por ${canal}: ${saida.body}`,
      );
    }
  });

  it('sem marca, a mensagem que sai não menciona IA', async () => {
    const chamado = await abrir('Cabo de rede', 'Preciso de um cabo mais longo.');

    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'REQUERENTE' } });
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'REQUERENTE', userId: f.solicitante.id },
    });

    const r = await agente.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia. Vou separar um cabo de cinco metros.',
      visibility: 'PUBLICA',
      channel: 'EMAIL',
      aiGenerated: false,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const saida = await prisma.outboundMessage.findFirst({ where: { eventId: r.corpo.id } });
    assert.ok(saida);
    assert.equal(saida.body.includes('IA'), false, saida.body);
  });
});

// ---------------------------------------------------------------------

/**
 * Formalizar o texto do técnico.
 *
 * O pedido é o de quem atende todo dia: a pessoa **sabe** a resposta, e
 * o que falta é a forma. Ela escreve solto, o Copilot devolve o mesmo
 * conteúdo em registro técnico, ela revisa e envia.
 *
 * Duas coisas se provam aqui, e as duas são promessas:
 *
 * 1. **O texto dela chega ao provedor** — sem isso o botão reescreveria
 *    o chamado e jogaria fora o que ela digitou.
 * 2. **A conversa do cliente não vai junto.** Reescrever uma frase não
 *    precisa do histórico, e o que não é necessário não sai de casa.
 */
describe('o Copilot reescreve o que o técnico digitou', () => {
  it('o rascunho vai para o provedor, e a conversa do cliente não', async () => {
    await ligarCopilot();
    const chamado = await abrir('Lentidão no sistema', 'Trava ao abrir o relatório.');

    // Uma resposta pública já trocada: é ela que **não** pode viajar
    // quando o trabalho é só formalizar.
    const trocada = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'FRASE-JA-TROCADA-COM-O-CLIENTE',
      visibility: 'PUBLICA',
    });
    // Conferir o status **aqui** é o que dá sentido ao teste: uma
    // mensagem que não foi criada não apareceria no prompt de jeito
    // nenhum, e a asserção de ausência lá embaixo passaria sem provar
    // coisa alguma. Já aconteceu neste arquivo.
    assert.equal(trocada.status, 201, JSON.stringify(trocada.corpo));

    ultimaChamada = null;
    const r = await agente.post<CopilotResposta>(`/tickets/${chamado.id}/copilot`, {
      intencao: 'REDIGIR',
      rascunho: 'reiniciei o servico de indexacao, ta rodando de novo, testa ai',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const prompt = chamadaAoProvedor().prompt;

    // 1. O texto da pessoa é o trabalho.
    assert.ok(prompt.includes('reiniciei o servico de indexacao'), prompt);
    assert.ok(prompt.includes('Texto do técnico:'), prompt);

    // 2. A conversa fica em casa. É esta linha que cai se alguém tirar
    //    o `take: 0` do contexto — e é por isso que ela existe.
    assert.equal(prompt.includes('FRASE-JA-TROCADA-COM-O-CLIENTE'), false, prompt);

    // O assunto vai: é o que dá ao modelo o vocabulário certo.
    assert.ok(prompt.includes('Lentidão no sistema'), prompt);
  });

  it('sem rascunho, continua partindo do chamado', async () => {
    await ligarCopilot();
    const chamado = await abrir('Monitor piscando', 'A tela pisca a cada dois minutos.');

    const publica = await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'OUTRA-FRASE-PUBLICA-DO-HISTORICO',
      visibility: 'PUBLICA',
    });
    assert.equal(publica.status, 201, JSON.stringify(publica.corpo));

    ultimaChamada = null;
    const r = await agente.post<CopilotResposta>(`/tickets/${chamado.id}/copilot`, {
      intencao: 'REDIGIR',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const prompt = chamadaAoProvedor().prompt;
    // Sem rascunho o histórico volta a ir: o corte é do modo de
    // reescrita, não uma amputação permanente do contexto.
    assert.ok(prompt.includes('OUTRA-FRASE-PUBLICA-DO-HISTORICO'), prompt);
    assert.equal(prompt.includes('Texto do técnico:'), false);
  });

  it('rascunho gigante é recusado antes de sair da casa', async () => {
    await ligarCopilot();
    const chamado = await abrir('Impressora offline', 'Some da lista.');

    ultimaChamada = null;
    const r = await agente.post(`/tickets/${chamado.id}/copilot`, {
      intencao: 'REDIGIR',
      rascunho: 'x'.repeat(LIMITE_DO_RASCUNHO + 1),
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    // O ponto: recusado **aqui**, sem chamar o provedor. Colar o manual
    // inteiro por engano não vira uma requisição paga para fora.
    assert.equal(ultimaChamada, null);
  });

  it('a cerca do chamado alheio vale igual quando há rascunho', async () => {
    await ligarCopilot();
    const chamado = await abrir('Chamado da casa', 'Conteúdo da casa.');

    ultimaChamada = null;
    const forasteiro = new Cliente(api.url);
    assert.equal((await forasteiro.entrar('forasteiro@teste.dev')).status, 200);

    const r = await forasteiro.post(`/tickets/${chamado.id}/copilot`, {
      intencao: 'REDIGIR',
      rascunho: 'me diga o que tem neste chamado',
    });

    assert.equal(r.status, 404, JSON.stringify(r.corpo));
    assert.equal(ultimaChamada, null);
  });
});

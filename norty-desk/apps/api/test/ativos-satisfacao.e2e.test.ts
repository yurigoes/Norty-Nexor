import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type {
  AssetView,
  SatisfacaoResumo,
  SurveyPublicView,
  SurveyView,
  TicketDetail,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { DespachoJob } from '../src/modules/channels/despacho.job';
import type { EnvioSimulado } from '../src/modules/channels/transporte';

/**
 * Ativos e pesquisa de satisfação.
 *
 * O que se prova aqui: patrimônio não se duplica, o histórico do ativo
 * respeita o escopo de leitura, a pesquisa sai pelo canal de origem e
 * o link público não abre a base.
 */

let api: Api;
let f: Fixtura;
let agente: Cliente;
let supervisor: Cliente;
let despacho: DespachoJob;
let simulado: EnvioSimulado;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  const { DespachoJob } = await import('../src/modules/channels/despacho.job');
  const { EnvioSimulado } = await import('../src/modules/channels/transporte');
  despacho = api.app.get(DespachoJob);
  simulado = api.app.get(EnvioSimulado);

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(() => {
  simulado.enviados.length = 0;
});

// ---------------------------------------------------------------------

describe('cadastro de ativos', () => {
  it('o agente lê mas não cadastra', async () => {
    assert.equal((await agente.get('/assets')).status, 200);

    const r = await agente.post('/assets', { name: 'Notebook do agente' });
    assert.equal(r.status, 403, 'mexer no cadastro do parque é outra conversa');
  });

  it('patrimônio não se repete na organização', async () => {
    const primeiro = await supervisor.post<AssetView>('/assets', {
      name: 'Notebook Dell Latitude',
      kind: 'COMPUTADOR',
      tag: 'PAT-4721',
      serialNumber: 'BR9XK32',
      userId: f.agente.id,
    });

    assert.equal(primeiro.status, 201, JSON.stringify(primeiro.corpo));
    assert.equal(primeiro.corpo.user?.id, f.agente.id);

    const repetido = await supervisor.post<{ detail?: string }>('/assets', {
      name: 'Outro registro do mesmo notebook',
      tag: 'PAT-4721',
    });

    assert.equal(repetido.status, 409);
    assert.ok(
      String(repetido.corpo.detail ?? '').includes('patrimônio'),
      'a mensagem tem de dizer qual campo colidiu, não o nome da restrição',
    );

    const serieRepetida = await supervisor.post<{ detail?: string }>('/assets', {
      name: 'Terceiro registro',
      serialNumber: 'BR9XK32',
    });

    assert.equal(serieRepetida.status, 409);
    assert.ok(String(serieRepetida.corpo.detail ?? '').includes('série'));
  });

  it('etiqueta em branco vira nulo e não colide', async () => {
    // Dois ativos sem patrimônio são normais; se a string vazia fosse
    // gravada, o segundo bateria no índice único.
    const um = await supervisor.post<AssetView>('/assets', { name: 'Monitor sem etiqueta', tag: '' });
    const dois = await supervisor.post<AssetView>('/assets', { name: 'Outro monitor', tag: '   ' });

    assert.equal(um.status, 201, JSON.stringify(um.corpo));
    assert.equal(dois.status, 201, JSON.stringify(dois.corpo));
    assert.equal(um.corpo.tag, null);
    assert.equal(dois.corpo.tag, null);
  });

  it('busca por pedaço do patrimônio, que é como o suporte procura', async () => {
    const r = await agente.get<AssetView[]>('/assets?q=4721');
    assert.ok(r.corpo.some((a) => a.tag === 'PAT-4721'));

    const porSerie = await agente.get<AssetView[]>('/assets?q=9XK3');
    assert.ok(porSerie.corpo.some((a) => a.serialNumber === 'BR9XK32'));
  });

  it('pessoa de outra organização não vira dono do ativo', async () => {
    const r = await supervisor.post('/assets', {
      name: 'Ativo com dono alheio',
      userId: f.forasteiro.id,
    });

    assert.equal(r.status, 404);
  });
});

// ---------------------------------------------------------------------

describe('ativo no chamado', () => {
  it('vincula, lista e mantém o histórico do equipamento', async () => {
    const ativo = await supervisor.post<AssetView>('/assets', {
      name: 'Impressora do 3º andar',
      kind: 'IMPRESSORA',
      tag: 'PAT-9001',
    });

    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Impressora não imprime',
      description: 'Luz laranja piscando.',
      categoryId: f.categoria.id,
    });

    const vinculado = await agente.post<AssetView[]>(
      `/tickets/${chamado.corpo.id}/ativos`,
      { assetId: ativo.corpo.id },
    );

    assert.equal(vinculado.status, 201, JSON.stringify(vinculado.corpo));
    assert.equal(vinculado.corpo.length, 1);
    assert.equal(vinculado.corpo[0]!.id, ativo.corpo.id);

    // Vincular duas vezes não duplica: é o mesmo equipamento.
    const denovo = await agente.post<AssetView[]>(`/tickets/${chamado.corpo.id}/ativos`, {
      assetId: ativo.corpo.id,
    });
    assert.equal(denovo.corpo.length, 1);

    const historico = await agente.get<{ number: number }[]>(
      `/assets/${ativo.corpo.id}/chamados`,
    );
    assert.equal(historico.status, 200);
    assert.ok(
      historico.corpo.some((c) => c.number === chamado.corpo.number),
      'o histórico é o que responde "essa máquina dá problema?"',
    );

    const removido = await agente.del<AssetView[]>(
      `/tickets/${chamado.corpo.id}/ativos/${ativo.corpo.id}`,
    );
    assert.deepEqual(removido.corpo, []);
  });

  it('o histórico do ativo não é porta lateral para chamado alheio', async () => {
    const ativo = await supervisor.post<AssetView>('/assets', {
      name: 'Servidor compartilhado',
      tag: 'PAT-7777',
    });

    // Um chamado de outro time, ao qual o agente não tem acesso.
    const alheio = await prisma.ticket.create({
      data: {
        organizationId: f.organizacao.id,
        number: 9500,
        subject: 'Chamado de outro time',
        description: 'x',
        type: 'INCIDENTE',
        urgency: 3,
        impact: 3,
        priority: 3,
        actors: { create: { role: 'ATRIBUIDO', teamId: f.outroTime.id } },
        assets: { create: { assetId: ativo.corpo.id } },
      },
    });

    const historico = await agente.get<{ id: string }[]>(`/assets/${ativo.corpo.id}/chamados`);
    assert.ok(
      !historico.corpo.some((c) => c.id === alheio.id),
      'o escopo de leitura vale também no histórico do equipamento',
    );
  });
});

// ---------------------------------------------------------------------

describe('pesquisa de satisfação', () => {
  async function fecharChamadoDe(email: string, telefone?: string) {
    const contato = telefone
      ? await prisma.contact.create({
          data: { organizationId: f.organizacao.id, name: 'Cliente', phone: telefone },
        })
      : null;

    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Vai ser avaliado',
      description: 'x',
      categoryId: f.categoria.id,
      ...(contato ? { requester: { kind: 'CONTACT', id: contato.id } } : {}),
    });

    if (telefone) {
      await prisma.ticket.update({
        where: { id: chamado.corpo.id },
        data: { originChannel: 'WHATSAPP' },
      });
    }

    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);
    await despacho.despachar();

    return { chamado: chamado.corpo, email, telefone };
  }

  it('sai no fechamento, pelo canal de origem', async () => {
    const { telefone } = await fecharChamadoDe('n/a', '+5511977770001');

    const envio = simulado.enviados.find((e) => e.para === telefone);
    assert.ok(envio, 'quem abriu por WhatsApp responde a pesquisa no WhatsApp');
    assert.ok(envio.corpo.includes('/pesquisa/'), 'o link é o que abre a pesquisa');
  });

  it('não sai na solução: entre resolver e fechar o cliente ainda reabre', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Resolvido, não fechado',
      description: 'x',
      categoryId: f.categoria.id,
    });

    simulado.enviados.length = 0;
    await agente.post(`/tickets/${chamado.corpo.id}/resolver`, { body: 'Pronto.' });
    await despacho.despachar();

    assert.ok(
      !simulado.enviados.some((e) => e.corpo.includes('/pesquisa/')),
      'perguntar como foi antes de fechar é perguntar cedo demais',
    );

    const pesquisa = await prisma.survey.findFirst({ where: { ticketId: chamado.corpo.id } });
    assert.equal(pesquisa, null);
  });

  it('uma pesquisa por chamado, mesmo fechando duas vezes', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Fecha, reabre, fecha',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);
    await agente.post(`/tickets/${chamado.corpo.id}/reabrir`, { body: 'Voltou.' });
    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);

    const quantas = await prisma.survey.count({ where: { ticketId: chamado.corpo.id } });
    assert.equal(quantas, 1, 'pedir a mesma nota duas vezes é pedir para não receber nenhuma');
  });

  it('o link abre sem sessão e não mostra nada de interno', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Chamado com segredo na conversa',
      description: 'x',
      categoryId: f.categoria.id,
    });

    await agente.post(`/tickets/${chamado.corpo.id}/responder`, {
      body: 'SENHA DO COFRE: 1234',
      visibility: 'INTERNA',
    });
    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);

    const pesquisa = await prisma.survey.findFirstOrThrow({
      where: { ticketId: chamado.corpo.id },
    });

    // Sem Authorization nenhum: é o link que chega por e-mail.
    const resposta = await fetch(`${api.url}/pesquisa/${pesquisa.token}`);
    assert.equal(resposta.status, 200, 'exigir senha de quem só quer dar nota é não receber nota');

    const corpo = (await resposta.json()) as SurveyPublicView;
    assert.equal(corpo.ticketNumber, chamado.corpo.number);
    assert.equal(corpo.answered, false);
    assert.ok(!JSON.stringify(corpo).includes('SENHA DO COFRE'));
    assert.ok(!JSON.stringify(corpo).includes('agente@teste.dev'));
  });

  it('responder grava a nota e deixa rastro interno na conversa', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Vai receber nota 5',
      description: 'x',
      categoryId: f.categoria.id,
    });
    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);

    const pesquisa = await prisma.survey.findFirstOrThrow({
      where: { ticketId: chamado.corpo.id },
    });

    const resposta = await fetch(`${api.url}/pesquisa/${pesquisa.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 5, comment: 'Rápido e resolveu.' }),
    });

    const corpo = (await resposta.json()) as SurveyPublicView;
    assert.equal(resposta.status, 201, JSON.stringify(corpo));
    assert.equal(corpo.score, 5);

    const evento = await prisma.ticketEvent.findFirst({
      where: { ticketId: chamado.corpo.id, type: 'NOTA_INTERNA', channel: 'SISTEMA' },
    });
    assert.ok(evento?.body?.includes('5 de 5'));
    assert.equal(
      evento?.visibility,
      'INTERNA',
      'a equipe precisa ver a nota; o cliente não precisa reler a própria',
    );
  });

  it('nota fora de 1 a 5 é recusada', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Nota inválida',
      description: 'x',
      categoryId: f.categoria.id,
    });
    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);

    const pesquisa = await prisma.survey.findFirstOrThrow({
      where: { ticketId: chamado.corpo.id },
    });

    for (const score of [0, 6, -1]) {
      const r = await fetch(`${api.url}/pesquisa/${pesquisa.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      assert.equal(r.status, 400, `nota ${score} deveria ser recusada`);
    }
  });

  it('link expirado não abre', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Pesquisa velha',
      description: 'x',
      categoryId: f.categoria.id,
    });
    await agente.post(`/tickets/${chamado.corpo.id}/fechar`);

    await prisma.survey.updateMany({
      where: { ticketId: chamado.corpo.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const pesquisa = await prisma.survey.findFirstOrThrow({
      where: { ticketId: chamado.corpo.id },
    });

    const r = await fetch(`${api.url}/pesquisa/${pesquisa.token}`);
    assert.equal(r.status, 409);
  });

  it('token inexistente é 404, e não uma pista', async () => {
    const r = await fetch(`${api.url}/pesquisa/token-que-nao-existe`);
    assert.equal(r.status, 404);
  });

  it('o resumo separa média de CSAT', async () => {
    const r = await supervisor.get<SatisfacaoResumo>('/reports/satisfacao?periodo=30d');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    assert.ok(r.corpo.enviadas > 0);
    assert.ok(r.corpo.respondidas > 0);
    assert.equal(r.corpo.porNota.length, 5);

    const somaDasNotas = r.corpo.porNota.reduce((s, n) => s + n.total, 0);
    assert.equal(somaDasNotas, r.corpo.respondidas);

    // Média 3,0 pode ser "todo mundo achou mediano" ou "metade amou,
    // metade odiou" — são problemas diferentes, e o CSAT os separa.
    assert.ok(r.corpo.media >= 1 && r.corpo.media <= 5);
    assert.ok(r.corpo.csat >= -100 && r.corpo.csat <= 100);
  });

  it('o agente não lê a satisfação da organização', async () => {
    assert.equal((await agente.get('/reports/satisfacao')).status, 403);
    assert.equal((await agente.get('/surveys')).status, 403);
  });
});

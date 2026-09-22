import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ArticleDetail, TicketDetail, VerificacaoSugerida } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O índice de resoluções.
 *
 * O que se prova aqui é o ciclo: a resolução de um chamado entra no
 * índice, o chamado seguinte parecido a recebe como verificação, e
 * confirmar que ela resolveu faz o índice aprender — a resolução que
 * mais resolve sobe.
 *
 * Sem o último passo, isto seria a busca de artigos de sempre, com
 * outro nome: casamento de texto não é a mesma coisa que solução que
 * funcionou.
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

async function abrir(c: Cliente, subject: string, description: string): Promise<TicketDetail> {
  const r = await c.post<TicketDetail>('/tickets', {
    subject,
    description,
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('registrar a resolução a partir do chamado', () => {
  it('a resolução guarda de qual chamado saiu, e já nasce confirmada nele', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(
      agente,
      'Impressora do terceiro andar não imprime',
      'Manda para a fila e não sai nada.',
    );

    await agente.post(`/tickets/${chamado.id}/resolver`, { body: 'Reiniciei o spooler.' });

    const r = await agente.post<ArticleDetail>(`/tickets/${chamado.id}/resolucao`, {
      title: 'Impressora não imprime: reiniciar o spooler',
      body: 'Parar o serviço Spooler de Impressão, limpar a fila e iniciar de novo.',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal(r.corpo.fromTicket?.id, chamado.id, 'sabe de qual chamado saiu');
    assert.equal(r.corpo.resolvedCount, 1, 'nasce confirmada como a resolução daquele chamado');
    assert.equal(
      r.corpo.category?.id,
      f.categoria.id,
      'a categoria vem do chamado, não da tela',
    );
  });

  it('quem só lê chamado não registra resolução', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const meus = await solicitante.get<{ data: TicketDetail[] }>('/tickets?limit=1');
    const algum = (meus.corpo.data ?? [])[0];

    if (!algum) return; // sem chamado visível para ele, nada a provar aqui

    const r = await solicitante.post(`/tickets/${algum.id}/resolucao`, {
      title: 'Tentando publicar sem poder',
      body: 'Isto tem de ser recusado pela matriz de permissões.',
    });
    assert.equal(r.status, 403, JSON.stringify(r.corpo));
  });
});

describe('o chamado seguinte recebe a verificação', () => {
  it('a resolução aparece no chamado parecido, dizendo quantos resolveu', async () => {
    const agente = await entrar('agente@teste.dev');
    const novo = await abrir(
      agente,
      'Impressora não imprime nada',
      'A fila enche e o papel não sai.',
    );

    const r = await agente.get<VerificacaoSugerida[]>(`/tickets/${novo.id}/verificacoes`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const achada = (r.corpo ?? []).find((v) => v.title.includes('spooler'));
    assert.ok(achada, 'a resolução do chamado anterior chega no novo');
    assert.equal(achada.resolvedCount, 1);
    assert.equal(achada.confirmada, false, 'ainda não foi confirmada NESTE chamado');
    assert.ok(achada.fromTicket, 'diz que veio de um chamado — "já houve isto antes"');
  });

  /**
   * O gesto que faz o índice aprender. Sem ele, a ordem seria para
   * sempre casamento de texto.
   */
  it('confirmar que resolveu soma ao índice e registra na linha do tempo', async () => {
    const agente = await entrar('agente@teste.dev');
    const lista = await agente.get<{ data: TicketDetail[] }>('/tickets?limit=50');
    const novo = (lista.corpo.data ?? []).find((t) => t.subject === 'Impressora não imprime nada');
    assert.ok(novo);

    const artigo = await prisma.article.findFirstOrThrow({
      where: { title: { contains: 'spooler' } },
    });

    const r = await agente.post<VerificacaoSugerida[]>(
      `/tickets/${novo.id}/verificacoes/${artigo.id}`,
      {},
    );
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const depois = (r.corpo ?? []).find((v) => v.id === artigo.id);
    assert.equal(depois?.confirmada, true);
    assert.equal(depois?.resolvedCount, 2, 'agora resolveu dois chamados');

    const notas = await prisma.ticketEvent.findMany({
      where: { ticketId: novo.id, type: 'NOTA_INTERNA' },
      select: { body: true, visibility: true },
    });
    assert.ok(
      notas.some((n) => n.body?.includes('spooler')),
      'fica registrado na linha do tempo qual resolução resolveu',
    );
    assert.ok(
      notas.every((n) => n.visibility === 'INTERNA'),
      'é conversa da casa, não vai para o solicitante',
    );
  });

  it('confirmar duas vezes não conta duas vezes — a unicidade é do banco', async () => {
    const agente = await entrar('agente@teste.dev');
    const lista = await agente.get<{ data: TicketDetail[] }>('/tickets?limit=50');
    const novo = (lista.corpo.data ?? []).find((t) => t.subject === 'Impressora não imprime nada');
    assert.ok(novo);

    const artigo = await prisma.article.findFirstOrThrow({
      where: { title: { contains: 'spooler' } },
    });

    const r = await agente.post<VerificacaoSugerida[]>(
      `/tickets/${novo.id}/verificacoes/${artigo.id}`,
      {},
    );
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const depois = (r.corpo ?? []).find((v) => v.id === artigo.id);
    assert.equal(depois?.resolvedCount, 2, 'continua dois, não virou três');

    const notas = await prisma.ticketEvent.count({
      where: { ticketId: novo.id, type: 'NOTA_INTERNA' },
    });
    assert.equal(notas, 1, 'nem duplicou o evento na conversa');
  });

  it('desconfirmar devolve a contagem: marcar errado tem volta', async () => {
    const agente = await entrar('agente@teste.dev');
    const lista = await agente.get<{ data: TicketDetail[] }>('/tickets?limit=50');
    const novo = (lista.corpo.data ?? []).find((t) => t.subject === 'Impressora não imprime nada');
    assert.ok(novo);

    const artigo = await prisma.article.findFirstOrThrow({
      where: { title: { contains: 'spooler' } },
    });

    const r = await agente.del<VerificacaoSugerida[]>(
      `/tickets/${novo.id}/verificacoes/${artigo.id}`,
    );
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const depois = (r.corpo ?? []).find((v) => v.id === artigo.id);
    assert.equal(depois?.resolvedCount, 1, 'voltou a um');
    assert.equal(depois?.confirmada, false);
  });
});

describe('o índice aprende: o que resolve sobe', () => {
  /**
   * O caso que separa este índice de uma busca por texto.
   *
   * Duas resoluções casam com o mesmo chamado. A que já resolveu mais
   * vem primeiro — e é isso que faz quem atende encontrar de cara o que
   * costuma funcionar, em vez do artigo que calhou de ter as mesmas
   * palavras.
   */
  it('entre duas que casam, vem primeiro a que mais resolveu', async () => {
    const agente = await entrar('agente@teste.dev');

    // Uma segunda resolução, com o mesmo assunto e nenhum chamado
    // resolvido no currículo.
    const outro = await abrir(agente, 'Impressora engasgando', 'Sai borrado.');
    await agente.post(`/tickets/${outro.id}/resolver`, { body: 'Troquei o cabo.' });
    const nova = await agente.post<ArticleDetail>(`/tickets/${outro.id}/resolucao`, {
      title: 'Impressora não imprime: trocar o cabo',
      body: 'O cabo USB solta com a vibração da mesa. Trocar e prender.',
    });
    assert.equal(nova.status, 201, JSON.stringify(nova.corpo));

    // A primeira recebe mais uma confirmação, ficando na frente.
    const antiga = await prisma.article.findFirstOrThrow({
      where: { title: { contains: 'spooler' } },
    });
    const maisUm = await abrir(agente, 'Impressora não imprime de novo', 'Mesmo sintoma.');
    await agente.post(`/tickets/${maisUm.id}/verificacoes/${antiga.id}`, {});
    await agente.post(`/tickets/${outro.id}/verificacoes/${antiga.id}`, {});

    const alvo = await abrir(agente, 'Impressora não imprime', 'Nada sai.');
    const r = await agente.get<VerificacaoSugerida[]>(`/tickets/${alvo.id}/verificacoes`);

    const ordem = (r.corpo ?? []).map((v) => v.id);
    const posAntiga = ordem.indexOf(antiga.id);
    const posNova = ordem.indexOf(nova.corpo.id);

    assert.ok(posAntiga >= 0, 'a resolução que mais resolveu está na lista');
    assert.ok(posNova >= 0, 'a outra também');
    assert.ok(
      posAntiga < posNova,
      `a que resolveu mais tem de vir antes (antiga em ${posAntiga}, nova em ${posNova})`,
    );
  });
});

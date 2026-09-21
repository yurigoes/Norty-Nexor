import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AttachmentView, TicketDetail, TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Retirar anexo: quem pode, e o que fica no lugar.
 *
 * O solicitante mandou a foto errada e quer trocar — gesto cotidiano, e
 * até aqui só o supervisor podia fazê-lo. O que se prova: que ele
 * retira o que ele mesmo anexou, que não alcança o que outra pessoa
 * anexou, e que a linha do tempo não finge que o arquivo nunca existiu.
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

async function tokenDe(email: string): Promise<string> {
  const r = await new Cliente(api.url).entrar(email);
  return (r.corpo as { accessToken: string }).accessToken;
}

/** `fetch` com multipart, que o cliente da suíte não cobre. */
async function anexar(token: string, ticketId: string, nome: string, conteudo = 'x') {
  const form = new FormData();
  form.append('file', new Blob([conteudo], { type: 'text/plain' }), nome);

  const resposta = await fetch(`${api.url}/tickets/${ticketId}/anexos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const texto = await resposta.text();
  assert.equal(resposta.status, 201, texto);
  return JSON.parse(texto) as AttachmentView;
}

/** O chamado do solicitante, que o agente também enxerga (é do time). */
async function chamadoDoSolicitante(c: Cliente) {
  const r = await c.post<TicketDetail>('/tickets', {
    subject: 'Impressora não imprime',
    description: 'Mandei a foto do painel.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('retirar anexo', () => {
  it('quem anexou retira o próprio arquivo, e a conversa registra', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const token = await tokenDe('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);

    const anexo = await anexar(token, chamado.id, 'foto-errada.txt');
    const r = await solicitante.del(`/anexos/${anexo.id}`);
    assert.equal(r.status, 204, JSON.stringify(r.corpo));

    assert.equal(await prisma.attachment.count({ where: { id: anexo.id } }), 0);

    const eventos = await solicitante.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const retirada = eventos.corpo.find((e) => e.type === 'ANEXO_REMOVIDO');
    assert.ok(retirada, 'a retirada deveria aparecer na linha do tempo');
    assert.equal(retirada.body, 'foto-errada.txt', 'o registro diz qual arquivo saiu');
  });

  it('o arquivo que saiu não fica de pé no armazenamento', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const token = await tokenDe('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);

    const anexo = await anexar(token, chamado.id, 'temporario.txt');
    assert.equal((await solicitante.del(`/anexos/${anexo.id}`)).status, 204);

    const depois = await fetch(`${api.url}/anexos/${anexo.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(depois.status, 404);
  });

  it('não retira o que outra pessoa anexou', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);

    // O agente junta o laudo ao chamado do solicitante.
    const doAgente = await anexar(await tokenDe('agente@teste.dev'), chamado.id, 'laudo.txt');

    const r = await solicitante.del(`/anexos/${doAgente.id}`);
    assert.equal(r.status, 403, JSON.stringify(r.corpo));
    assert.equal(
      await prisma.attachment.count({ where: { id: doAgente.id } }),
      1,
      'a evidência do técnico continua no chamado',
    );
  });

  it('o supervisor retira o de qualquer um', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const token = await tokenDe('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);
    const anexo = await anexar(token, chamado.id, 'do-solicitante.txt');

    const supervisor = await entrar('supervisor@teste.dev');
    assert.equal((await supervisor.del(`/anexos/${anexo.id}`)).status, 204);
  });

  it('chamado fechado não perde anexo: reabra antes', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const token = await tokenDe('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);
    const anexo = await anexar(token, chamado.id, 'encerrado.txt');

    assert.equal((await solicitante.post(`/tickets/${chamado.id}/fechar`)).status, 201);

    const r = await solicitante.del(`/anexos/${anexo.id}`);
    assert.equal(r.status, 400, JSON.stringify(r.corpo));

    // E reabrir devolve o gesto: é o "a qualquer momento" do pedido.
    assert.equal((await solicitante.post(`/tickets/${chamado.id}/reabrir`, { body: 'Voltou a falhar.' })).status, 201);
    assert.equal((await solicitante.del(`/anexos/${anexo.id}`)).status, 204);
  });

  it('anexo de chamado que não é seu não existe para você', async () => {
    const agente = await entrar('agente2@teste.dev');
    const solicitante = await entrar('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);
    const anexo = await anexar(await tokenDe('solicitante@teste.dev'), chamado.id, 'sigilo.txt');

    // `agente2` é de outro time e não é ator: 404, não 403 — a
    // diferença contaria que o anexo existe.
    const r = await agente.del(`/anexos/${anexo.id}`);
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });
});

describe('reabrir e continuar juntando', () => {
  it('depois de reabrir, o solicitante anexa de novo', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const token = await tokenDe('solicitante@teste.dev');
    const chamado = await chamadoDoSolicitante(solicitante);

    assert.equal((await solicitante.post(`/tickets/${chamado.id}/fechar`)).status, 201);
    assert.equal((await solicitante.post(`/tickets/${chamado.id}/reabrir`, { body: 'Voltou a falhar.' })).status, 201);

    const anexo = await anexar(token, chamado.id, 'voltou-a-falhar.txt');
    assert.ok(anexo.id);
    assert.equal(anexo.uploadedById, f.solicitante.id, 'a vista diz quem anexou');
  });
});

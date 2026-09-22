import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AvisoPush, EstadoDasNotificacoes, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';
import type { EnvioDePushSimulado } from '../src/modules/notificacoes/push.transporte';

/**
 * O aviso fora da aba.
 *
 * O que se prova aqui é **quem recebe**, porque é aí que está o risco do
 * recurso. E-mail mal endereçado a pessoa abre e fecha; aviso mal
 * endereçado aparece na barra do Windows de alguém que estava numa
 * reunião, com o assunto do chamado à mostra.
 *
 * Três promessas:
 *
 * 1. **Nota interna nunca chega a quem pediu o chamado.**
 * 2. **Ninguém é avisado do que ele mesmo fez.**
 * 3. **O que a pessoa silenciou não chega** — em nenhum dos aparelhos
 *    dela.
 *
 * O transporte é o simulado (`ENVIO=simulado` no `.env.test`): a suíte
 * lê o que teria saído, em vez de falar com o serviço de push do
 * Google. É lendo dali que a cerca se verifica.
 */

let api: Api;
let f: Fixtura;
let push: EnvioDePushSimulado;

let agente: Cliente;
let solicitante: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  const { EnvioDePushSimulado } = await import('../src/modules/notificacoes/push.transporte');
  push = api.app.get(EnvioDePushSimulado);

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  solicitante = new Cliente(api.url);
  assert.equal((await solicitante.entrar('solicitante@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(() => push.limpar());

/** Inscreve um aparelho direto no banco: o navegador é que faria isto. */
async function inscrever(userId: string, apelido: string): Promise<string> {
  const endpoint = `https://push.exemplo/${apelido}`;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, organizationId: f.organizacao.id },
    create: {
      userId,
      organizationId: f.organizacao.id,
      endpoint,
      p256dh: 'chave-publica-do-aparelho-de-teste',
      auth: 'segredo-do-aparelho',
      descricao: apelido,
    },
  });
  return endpoint;
}

/** Os avisos que saíram para um endpoint. */
function avisosPara(endpoint: string): AvisoPush[] {
  return push.enviados
    .filter((e) => e.endpoint === endpoint)
    .map((e) => JSON.parse(e.carga) as AvisoPush);
}

async function abrirPeloSolicitante(subject: string): Promise<TicketDetail> {
  const r = await solicitante.post<TicketDetail>('/tickets', {
    subject,
    description: 'Descrição do problema.',
    categoryId: f.semTime.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** Põe o agente como quem atende, sem passar pela tela. */
async function atribuirAoAgente(ticketId: string): Promise<void> {
  await prisma.ticketActor.deleteMany({ where: { ticketId, role: 'ATRIBUIDO' } });
  await prisma.ticketActor.create({
    data: { ticketId, role: 'ATRIBUIDO', userId: f.agente.id },
  });
}

// ---------------------------------------------------------------------

describe('a cerca da nota interna', () => {
  it('nota interna vai para quem atende e nunca para quem pediu', async () => {
    const doAgente = await inscrever(f.agente.id, 'agente-windows');
    const doSolicitante = await inscrever(f.solicitante.id, 'solicitante-windows');

    const chamado = await abrirPeloSolicitante('Impressora não imprime');
    await atribuirAoAgente(chamado.id);
    push.limpar();

    // A nota é escrita pela supervisora, e não pelo agente: assim o
    // agente é plateia de verdade, e não fica de fora só por ser o
    // autor. Sem isto o teste passaria mesmo com a plateia errada.
    const supervisora = new Cliente(api.url);
    assert.equal((await supervisora.entrar('supervisor@teste.dev')).status, 200);

    const r = await supervisora.post(`/tickets/${chamado.id}/responder`, {
      body: 'SENHA-DO-ADMIN-DA-IMPRESSORA-9981',
      visibility: 'INTERNA',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const paraOAgente = avisosPara(doAgente);
    assert.equal(paraOAgente.length, 1, JSON.stringify(push.enviados));
    assert.equal(paraOAgente[0].tipo, 'NOTA_INTERNA');

    // O ponto do teste.
    assert.equal(
      avisosPara(doSolicitante).length,
      0,
      `nota interna chegou a quem pediu: ${JSON.stringify(avisosPara(doSolicitante))}`,
    );
    assert.equal(
      JSON.stringify(push.enviados).includes('SENHA-DO-ADMIN'),
      true,
      'o corpo da nota deveria ir para quem atende',
    );
  });

  it('quem escreveu a nota não recebe aviso da própria nota', async () => {
    // O chamado é do time, então a plateia da nota interna são o agente
    // **e** a supervisora — e a supervisora é quem escreve. É a única
    // forma de o autor estar de fato na plateia; com o chamado
    // atribuído a uma pessoa só, o autor ficaria de fora por não ser
    // atendente, e o teste passaria sem provar nada.
    const doAgente = await inscrever(f.agente.id, 'agente-autor-1');
    const daSupervisora = await inscrever(f.supervisor.id, 'supervisora-autora-1');

    const chamado = await abrirPeloSolicitante('Nobreak apitando');
    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'ATRIBUIDO' } });
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: f.time.id },
    });
    push.limpar();

    const supervisora = new Cliente(api.url);
    assert.equal((await supervisora.entrar('supervisor@teste.dev')).status, 200);

    const r = await supervisora.post(`/tickets/${chamado.id}/responder`, {
      body: 'Chamei o fornecedor do nobreak.',
      visibility: 'INTERNA',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal(avisosPara(doAgente).length, 1, JSON.stringify(push.enviados));
    assert.equal(
      avisosPara(daSupervisora).length,
      0,
      `quem escreveu recebeu aviso do que escreveu: ${JSON.stringify(avisosPara(daSupervisora))}`,
    );
  });

  it('nota interna não chega nem a observador — observador é do lado do cliente', async () => {
    const doObservador = await inscrever(f.solicitante.id, 'observador-celular');

    const chamado = await abrirPeloSolicitante('Monitor piscando');
    await atribuirAoAgente(chamado.id);
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'OBSERVADOR', userId: f.solicitante.id },
    });
    push.limpar();

    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'IP-DA-VPN-INTERNA-10-8-0-7',
      visibility: 'INTERNA',
    });

    assert.equal(avisosPara(doObservador).length, 0, JSON.stringify(push.enviados));
  });
});

describe('quem recebe a resposta pública', () => {
  it('resposta da casa avisa quem pediu, não quem atende', async () => {
    const doAgente = await inscrever(f.agente.id, 'agente-2');
    const doSolicitante = await inscrever(f.solicitante.id, 'solicitante-2');

    const chamado = await abrirPeloSolicitante('Teclado trocado');
    await atribuirAoAgente(chamado.id);
    push.limpar();

    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Bom dia. Pode trazer o teclado na bancada?',
      visibility: 'PUBLICA',
    });

    const avisos = avisosPara(doSolicitante);
    assert.equal(avisos.length, 1, JSON.stringify(push.enviados));
    assert.equal(avisos[0].tipo, 'RESPOSTA_NO_MEU_CHAMADO');
    assert.ok(avisos[0].titulo.includes(`#${chamado.number}`), avisos[0].titulo);
    assert.equal(avisos[0].url, `/chamados/${chamado.id}`);

    // Quem escreveu não é avisado do que escreveu.
    assert.equal(avisosPara(doAgente).length, 0);
  });

  it('resposta do cliente avisa quem atende, não o próprio cliente', async () => {
    const doAgente = await inscrever(f.agente.id, 'agente-3');
    const doSolicitante = await inscrever(f.solicitante.id, 'solicitante-3');

    const chamado = await abrirPeloSolicitante('Sem rede na sala 4');
    await atribuirAoAgente(chamado.id);
    push.limpar();

    await solicitante.post(`/tickets/${chamado.id}/responder`, {
      body: 'Continua sem rede, já reiniciei o switch.',
      visibility: 'PUBLICA',
    });

    const avisos = avisosPara(doAgente);
    assert.equal(avisos.length, 1, JSON.stringify(push.enviados));
    assert.equal(avisos[0].tipo, 'RESPOSTA_DO_CLIENTE');
    assert.equal(avisosPara(doSolicitante).length, 0);
  });

  it('chamado do time avisa as pessoas do time', async () => {
    const doAgente = await inscrever(f.agente.id, 'agente-4');
    const daSupervisora = await inscrever(f.supervisor.id, 'supervisora-4');
    const doOutroAgente = await inscrever(f.outroAgente.id, 'outro-agente-4');

    const chamado = await abrirPeloSolicitante('Cadeira quebrada');
    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'ATRIBUIDO' } });
    await prisma.ticketActor.create({
      data: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: f.time.id },
    });
    push.limpar();

    await solicitante.post(`/tickets/${chamado.id}/responder`, {
      body: 'O pistão não sobe mais.',
      visibility: 'PUBLICA',
    });

    // Agente e supervisora são do time Suporte; o outro agente é do
    // time Sustentação e não tem nada com este chamado.
    assert.equal(avisosPara(doAgente).length, 1, JSON.stringify(push.enviados));
    assert.equal(avisosPara(daSupervisora).length, 1);
    assert.equal(avisosPara(doOutroAgente).length, 0);
  });
});

describe('atribuição', () => {
  it('quem recebe o chamado é avisado; quem pega para si, não', async () => {
    const doOutroAgente = await inscrever(f.outroAgente.id, 'outro-agente-5');
    const doAgente = await inscrever(f.agente.id, 'agente-5');

    const chamado = await abrirPeloSolicitante('Mouse sem clique');
    push.limpar();

    const supervisora = new Cliente(api.url);
    assert.equal((await supervisora.entrar('supervisor@teste.dev')).status, 200);

    const r = await supervisora.post(`/tickets/${chamado.id}/atribuir`, {
      userId: f.outroAgente.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const avisos = avisosPara(doOutroAgente);
    assert.equal(avisos.length, 1, JSON.stringify(push.enviados));
    assert.equal(avisos[0].tipo, 'ATRIBUICAO');
    assert.equal(avisosPara(doAgente).length, 0);

    // Pegar para si não gera aviso de que o chamado é seu: a pessoa
    // acabou de clicar no botão. Quem pega é o próprio `outroAgente`,
    // que é quem enxerga este chamado agora.
    const outro = new Cliente(api.url);
    assert.equal((await outro.entrar('agente2@teste.dev')).status, 200);

    push.limpar();
    const meu = await outro.post(`/tickets/${chamado.id}/atribuir`, { userId: f.outroAgente.id });
    assert.equal(meu.status, 201, JSON.stringify(meu.corpo));
    assert.equal(avisosPara(doOutroAgente).length, 0, JSON.stringify(push.enviados));
  });
});

describe('preferências e aparelhos', () => {
  it('o que a pessoa silenciou não chega em nenhum aparelho dela', async () => {
    const desktop = await inscrever(f.agente.id, 'agente-desktop-6');
    const celular = await inscrever(f.agente.id, 'agente-celular-6');

    const chamado = await abrirPeloSolicitante('Sistema lento');
    await atribuirAoAgente(chamado.id);

    // Sem silenciar: chega nos dois. A preferência é por pessoa, e é
    // isto que se está provando — não bastaria ver o total cair.
    push.limpar();
    await solicitante.post(`/tickets/${chamado.id}/responder`, {
      body: 'Ainda está lento.',
      visibility: 'PUBLICA',
    });
    assert.equal(avisosPara(desktop).length, 1);
    assert.equal(avisosPara(celular).length, 1);

    const salvo = await agente.put<EstadoDasNotificacoes>('/notificacoes/preferencias', {
      silenciados: ['RESPOSTA_DO_CLIENTE'],
    });
    assert.equal(salvo.status, 200, JSON.stringify(salvo.corpo));
    assert.deepEqual(salvo.corpo.silenciados, ['RESPOSTA_DO_CLIENTE']);

    push.limpar();
    await solicitante.post(`/tickets/${chamado.id}/responder`, {
      body: 'Continua lento.',
      visibility: 'PUBLICA',
    });
    assert.equal(avisosPara(desktop).length, 0, JSON.stringify(push.enviados));
    assert.equal(avisosPara(celular).length, 0);

    // E o que não foi silenciado continua chegando: silenciar um motivo
    // não pode desligar o aviso inteiro.
    push.limpar();
    await prisma.ticketActor.deleteMany({ where: { ticketId: chamado.id, role: 'ATRIBUIDO' } });
    const supervisora = new Cliente(api.url);
    assert.equal((await supervisora.entrar('supervisor@teste.dev')).status, 200);
    await supervisora.post(`/tickets/${chamado.id}/atribuir`, { userId: f.agente.id });
    assert.equal(avisosPara(desktop).length, 1, JSON.stringify(push.enviados));

    await agente.put('/notificacoes/preferencias', { silenciados: [] });
  });

  it('a inscrição morta é apagada em vez de acumular', async () => {
    const vivo = await inscrever(f.agente.id, 'agente-vivo-7');
    const morto = await inscrever(f.agente.id, 'agente-morto-7');
    push.mortos.add(morto);

    const chamado = await abrirPeloSolicitante('Cabo de rede');
    await atribuirAoAgente(chamado.id);
    push.limpar();
    push.mortos.add(morto);

    await solicitante.post(`/tickets/${chamado.id}/responder`, {
      body: 'Preciso de um cabo mais longo.',
      visibility: 'PUBLICA',
    });

    assert.equal(avisosPara(vivo).length, 1);
    assert.equal(
      await prisma.pushSubscription.count({ where: { endpoint: morto } }),
      0,
      'a inscrição morta deveria ter sido apagada',
    );
    assert.equal(await prisma.pushSubscription.count({ where: { endpoint: vivo } }), 1);
  });

  it('o aparelho se inscreve, se reconhece na lista e se desliga', async () => {
    const endpoint = 'https://push.exemplo/pela-tela-8';

    const inscrito = await agente.post<EstadoDasNotificacoes>('/notificacoes/aparelhos', {
      endpoint,
      p256dh: 'chave-publica-do-aparelho',
      auth: 'segredo-do-aparelho',
      descricao: 'Chrome no Windows',
    });
    assert.equal(inscrito.status, 201, JSON.stringify(inscrito.corpo));

    const este = inscrito.corpo.aparelhos.find((a) => a.descricao === 'Chrome no Windows');
    assert.ok(este, JSON.stringify(inscrito.corpo));
    assert.equal(este.esteAparelho, true, 'o aparelho que se inscreveu deveria se reconhecer');

    // Inscrever de novo no mesmo aparelho é ligar de novo, não erro de
    // unicidade: o navegador devolve o mesmo endpoint.
    const denovo = await agente.post<EstadoDasNotificacoes>('/notificacoes/aparelhos', {
      endpoint,
      p256dh: 'chave-publica-do-aparelho',
      auth: 'segredo-do-aparelho',
      descricao: 'Chrome no Windows',
    });
    assert.equal(denovo.status, 201, JSON.stringify(denovo.corpo));
    assert.equal(denovo.corpo.aparelhos.filter((a) => a.descricao === 'Chrome no Windows').length, 1);

    const apagado = await agente.del<EstadoDasNotificacoes>(
      `/notificacoes/aparelhos/${este.id}?endpoint=${encodeURIComponent(endpoint)}`,
    );
    assert.equal(apagado.status, 200, JSON.stringify(apagado.corpo));
    assert.equal(apagado.corpo.aparelhos.some((a) => a.id === este.id), false);
  });

  it('ninguém desliga o aparelho de outra pessoa', async () => {
    const endpoint = await inscrever(f.solicitante.id, 'solicitante-alheio-9');
    const alheio = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });

    const r = await agente.del(`/notificacoes/aparelhos/${alheio.id}`);

    // 200 porque, do ponto de vista de quem pediu, não havia nada para
    // apagar — dizer "não é seu" confirmaria que o id existe. O que
    // importa é que a linha continua lá.
    assert.equal(r.status, 200);
    assert.equal(await prisma.pushSubscription.count({ where: { id: alheio.id } }), 1);
  });

  it('o aviso não sai para aparelho de gente sem inscrição', async () => {
    const chamado = await abrirPeloSolicitante('Chamado sem ninguém inscrito');
    await prisma.pushSubscription.deleteMany({});
    push.limpar();

    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Vou olhar.',
      visibility: 'PUBLICA',
    });

    assert.equal(push.enviados.length, 0);
  });
});

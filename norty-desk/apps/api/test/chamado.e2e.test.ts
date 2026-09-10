import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { TicketDetail, TicketEventView, TicketListItem, Paginated } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

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

const comoAgente = () => new Cliente(api.url);

async function entrar(email: string): Promise<Cliente> {
  const cliente = new Cliente(api.url);
  const r = await cliente.entrar(email);
  assert.equal(r.status, 200, `login de ${email} falhou`);
  return cliente;
}

async function abrirChamado(cliente: Cliente, extra: Record<string, unknown> = {}) {
  const r = await cliente.post<TicketDetail>('/tickets', {
    subject: 'Impressora do 3º andar não imprime',
    description: 'Luz laranja piscando desde ontem.',
    urgency: 4,
    impact: 3,
    categoryId: f.categoria.id,
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('autenticação', () => {
  it('recusa e-mail inexistente e senha errada com a mesma mensagem', async () => {
    const c = comoAgente();
    const inexistente = await c.post<{ title: string }>('/auth/login', {
      email: 'ninguem@teste.dev',
      password: '123456',
    });
    const errada = await c.post<{ title: string }>('/auth/login', {
      email: 'agente@teste.dev',
      password: 'errada',
    });

    assert.equal(inexistente.status, 401);
    assert.equal(errada.status, 401);
    assert.equal(inexistente.corpo.title, errada.corpo.title);
  });

  it('devolve as permissões já resolvidas em /me', async () => {
    const c = await entrar('agente@teste.dev');
    const r = await c.get<{ role: string; permissions: string[]; teamIds: string[] }>('/auth/me');

    assert.equal(r.status, 200);
    assert.equal(r.corpo.role, 'AGENTE');
    assert.ok(r.corpo.permissions.includes('chamado:nota-interna'));
    assert.ok(!r.corpo.permissions.includes('config:sla'));
    assert.deepEqual(r.corpo.teamIds, [f.time.id]);
  });

  it('rotaciona o refresh e invalida o token usado', async () => {
    const c = await entrar('agente@teste.dev');

    const primeira = await c.post<{ accessToken: string }>('/auth/refresh');
    assert.equal(primeira.status, 200);

    // O cookie do cliente já foi trocado pela rotação; reapresentar o
    // anterior é reúso, e reúso derruba a sessão inteira.
    const guardados = await prisma.refreshToken.findMany({ where: { userId: f.agente.id } });
    assert.ok(guardados.some((t) => t.revokedAt !== null), 'o token usado deveria estar revogado');
  });

  it('recusa requisição sem token', async () => {
    const r = await comoAgente().get('/tickets');
    assert.equal(r.status, 401);
  });
});

describe('abertura de chamado', () => {
  it('deriva a prioridade e recusa quem tenta informá-la', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);

    // 4 × 3 na matriz padrão dá 4.
    assert.equal(chamado.priority, 4);

    const forjado = await c.post('/tickets', {
      subject: 'tentando forjar',
      description: 'x',
      priority: 5,
    });
    assert.equal(forjado.status, 400, 'priority no corpo tem de ser 400');
  });

  it('herda o time e os acordos da categoria', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);

    assert.equal(chamado.status, 'ATRIBUIDO');
    assert.equal(chamado.assignedTeam?.name, 'Suporte');

    const alvos = chamado.commitments.map((x) => `${x.kind}/${x.target}`).sort();
    assert.deepEqual(alvos, ['SLA/TTO', 'SLA/TTR']);
  });

  it('numera por organização, sem furo nem repetição sob concorrência', async () => {
    const c = await entrar('agente@teste.dev');

    // Dez aberturas ao mesmo tempo: é aqui que MAX(number)+1 quebraria.
    const abertos = await Promise.all(Array.from({ length: 10 }, () => abrirChamado(c)));
    const numeros = abertos.map((t) => t.number).sort((a, b) => a - b);

    assert.equal(new Set(numeros).size, 10, 'houve número repetido');
    for (let i = 1; i < numeros.length; i += 1) {
      assert.equal(numeros[i], numeros[i - 1]! + 1, 'a sequência tem furo');
    }
  });

  it('fica sem time quando a categoria não define um', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c, { categoryId: f.semTime.id });

    assert.equal(chamado.status, 'NOVO');
    assert.equal(chamado.assignedTeam, null);
    assert.deepEqual(chamado.commitments, []);
  });

  it('recusa categoria de outra organização', async () => {
    const c = await entrar('agente@teste.dev');
    const outraCategoria = await prisma.category.create({
      data: { organizationId: f.outra.id, name: 'Alheia' },
    });

    const r = await c.post('/tickets', {
      subject: 'categoria alheia',
      description: 'x',
      categoryId: outraCategoria.id,
    });
    assert.equal(r.status, 400);
  });
});

describe('conversa', () => {
  it('registra resposta pública e nota interna na mesma linha do tempo', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);

    const publica = await c.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
      body: 'Identificamos a peça, troca hoje às 15h.',
    });
    const interna = await c.post<TicketEventView>(`/tickets/${chamado.id}/responder`, {
      body: 'Fusor. Temos um de reposição no estoque.',
      visibility: 'INTERNA',
    });

    assert.equal(publica.status, 201);
    assert.equal(publica.corpo.type, 'MENSAGEM');
    assert.equal(interna.corpo.type, 'NOTA_INTERNA');
    assert.equal(interna.corpo.visibility, 'INTERNA');

    const eventos = await c.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    assert.equal(eventos.corpo.length, 2);
  });

  it('responde pelo canal de origem quando nenhum é escolhido', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);

    const r = await c.post<TicketEventView>(`/tickets/${chamado.id}/responder`, { body: 'oi' });
    assert.equal(r.corpo.channel, chamado.originChannel);
  });

  it('a primeira resposta de quem atende cumpre o TTO', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c, {
      requester: { kind: 'USER', id: f.solicitante.id },
    });

    await c.post(`/tickets/${chamado.id}/responder`, { body: 'Estamos vendo.' });

    const depois = await c.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.ok(depois.corpo.firstResponseAt, 'firstResponseAt deveria estar preenchido');

    const tto = depois.corpo.commitments.find((x) => x.target === 'TTO');
    assert.ok(tto?.achievedAt, 'o TTO deveria estar cumprido');
  });

  it('nota interna não cumpre o TTO', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c, {
      requester: { kind: 'USER', id: f.solicitante.id },
    });

    await c.post(`/tickets/${chamado.id}/responder`, {
      body: 'anotando para mim',
      visibility: 'INTERNA',
    });

    const depois = await c.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(depois.corpo.firstResponseAt, null);
    assert.equal(depois.corpo.commitments.find((x) => x.target === 'TTO')?.achievedAt, null);
  });
});

describe('visibilidade da nota interna', () => {
  it('o solicitante não recebe nota interna nem consegue escrever uma', async () => {
    const agente = await entrar('agente@teste.dev');
    const solicitante = await entrar('solicitante@teste.dev');

    const chamado = await abrirChamado(agente, {
      requester: { kind: 'USER', id: f.solicitante.id },
    });

    await agente.post(`/tickets/${chamado.id}/responder`, { body: 'Resposta pública.' });
    await agente.post(`/tickets/${chamado.id}/responder`, {
      body: 'Segredo da equipe.',
      visibility: 'INTERNA',
    });

    const doAgente = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const doSolicitante = await solicitante.get<TicketEventView[]>(
      `/tickets/${chamado.id}/eventos`,
    );

    assert.equal(doAgente.corpo.length, 2);
    assert.equal(doSolicitante.corpo.length, 1, 'a nota interna vazou para o solicitante');
    assert.ok(!JSON.stringify(doSolicitante.corpo).includes('Segredo'));

    const tentativa = await solicitante.post(`/tickets/${chamado.id}/responder`, {
      body: 'quero escrever nota interna',
      visibility: 'INTERNA',
    });
    assert.equal(tentativa.status, 403);
  });
});

describe('escopo de leitura', () => {
  it('o solicitante só vê os chamados em que é parte', async () => {
    const agente = await entrar('agente@teste.dev');
    const solicitante = await entrar('solicitante@teste.dev');

    const meu = await abrirChamado(agente, {
      requester: { kind: 'USER', id: f.solicitante.id },
    });
    const alheio = await abrirChamado(agente);

    const lista = await solicitante.get<Paginated<TicketListItem>>('/tickets');
    const ids = lista.corpo.data.map((t) => t.id);

    assert.ok(ids.includes(meu.id));
    assert.ok(!ids.includes(alheio.id), 'o solicitante viu chamado alheio');

    // Fora do escopo é 404, não 403: não confirmamos que o chamado existe.
    const direto = await solicitante.get(`/tickets/${alheio.id}`);
    assert.equal(direto.status, 404);
  });

  it('o agente vê o do seu time; o supervisor vê todos', async () => {
    const agente = await entrar('agente@teste.dev');
    const outro = await entrar('agente2@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const doMeuTime = await abrirChamado(agente);
    const doOutroTime = await abrirChamado(outro, { categoryId: f.semTime.id });
    await supervisor.post(`/tickets/${doOutroTime.id}/atribuir`, { teamId: f.outroTime.id });

    const doAgente = await agente.get<Paginated<TicketListItem>>('/tickets');
    const idsAgente = doAgente.corpo.data.map((t) => t.id);
    assert.ok(idsAgente.includes(doMeuTime.id));
    assert.ok(!idsAgente.includes(doOutroTime.id), 'o agente viu fila de outro time');

    const doSupervisor = await supervisor.get<Paginated<TicketListItem>>('/tickets');
    const idsSupervisor = doSupervisor.corpo.data.map((t) => t.id);
    assert.ok(idsSupervisor.includes(doMeuTime.id));
    assert.ok(idsSupervisor.includes(doOutroTime.id));
  });

  it('não atravessa a fronteira da organização', async () => {
    const agente = await entrar('agente@teste.dev');
    const forasteiro = await entrar('forasteiro@teste.dev');

    const chamado = await abrirChamado(agente);

    const lista = await forasteiro.get<Paginated<TicketListItem>>('/tickets');
    assert.equal(lista.corpo.data.length, 0);

    const direto = await forasteiro.get(`/tickets/${chamado.id}`);
    assert.equal(direto.status, 404);
  });

  it('o gestor lê tudo mas não escreve', async () => {
    const agente = await entrar('agente@teste.dev');
    const gestor = await entrar('gestor@teste.dev');

    const chamado = await abrirChamado(agente);

    assert.equal((await gestor.get(`/tickets/${chamado.id}`)).status, 200);
    assert.equal(
      (await gestor.post(`/tickets/${chamado.id}/responder`, { body: 'x' })).status,
      403,
    );
  });
});

describe('ciclo de vida', () => {
  it('atribui, resolve, fecha e reabre', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);

    const atribuido = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/atribuir`, {
      teamId: f.time.id,
      userId: f.agente.id,
    });
    assert.equal(atribuido.corpo.assignedUser?.id, f.agente.id);
    assert.equal(atribuido.corpo.assignedTeam?.id, f.time.id);

    const resolvido = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/resolver`, {
      body: 'Fusor trocado.',
    });
    assert.equal(resolvido.corpo.status, 'SOLUCIONADO');
    assert.ok(resolvido.corpo.solvedAt);
    assert.ok(resolvido.corpo.commitments.find((x) => x.target === 'TTR')?.achievedAt);

    const fechado = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/fechar`);
    assert.equal(fechado.corpo.status, 'FECHADO');

    // Chamado fechado não recebe evento.
    const tentativa = await supervisor.post(`/tickets/${chamado.id}/responder`, { body: 'oi' });
    assert.equal(tentativa.status, 409);

    const reaberto = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/reabrir`, {
      body: 'Voltou a falhar.',
    });
    assert.equal(reaberto.corpo.status, 'ATRIBUIDO');
    assert.equal(reaberto.corpo.closedAt, null, 'reabrir deveria limpar a data de fechamento');
  });

  it('recusa transição impossível', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);

    await supervisor.post(`/tickets/${chamado.id}/fechar`);
    const r = await supervisor.post(`/tickets/${chamado.id}/resolver`, { body: 'x' });

    assert.equal(r.status, 409);
  });

  it('o agente não distribui chamado para outro agente', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const paraOutro = await agente.post(`/tickets/${chamado.id}/atribuir`, {
      userId: f.outroAgente.id,
    });
    assert.equal(paraOutro.status, 403);

    const paraMim = await agente.post(`/tickets/${chamado.id}/atribuir`, {
      userId: f.agente.id,
    });
    assert.equal(paraMim.status, 201);
  });

  it('classificar redeaduz a prioridade', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);
    assert.equal(chamado.priority, 4);

    const r = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/classificar`, {
      urgency: 1,
      impact: 1,
    });
    assert.equal(r.corpo.priority, 1);
  });

  it('pausa e retoma descontando o tempo parado', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);

    const antes = chamado.commitments.find((x) => x.target === 'TTR')!.dueAt;

    const pausado = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/pausar`, {
      pendingReasonId: f.motivo.id,
    });
    assert.equal(pausado.corpo.status, 'PENDENTE');
    assert.ok(pausado.corpo.pendingSince);

    // Sete dias para trás, não três horas.
    //
    // O desconto é de tempo **útil**, e o calendário da fixtura é
    // seg–sex das 9 às 18. Com três horas, a suíte só passava se
    // rodasse dentro do expediente: às 22h, ou num sábado, as três
    // horas caíam inteiras fora da janela, o desconto dava zero e o
    // prazo não se movia. Uma semana contém pelo menos um dia útil
    // inteiro em qualquer instante do ano — inclusive rodando de
    // madrugada, que é quando a integração contínua roda.
    await prisma.ticket.update({
      where: { id: chamado.id },
      data: { pendingSince: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    });

    const retomado = await supervisor.post<TicketDetail>(`/tickets/${chamado.id}/retomar`);
    assert.equal(retomado.corpo.status, 'ATRIBUIDO');
    assert.equal(retomado.corpo.pendingSince, null);

    const depois = retomado.corpo.commitments.find((x) => x.target === 'TTR')!.dueAt;
    assert.ok(
      new Date(depois) > new Date(antes),
      'o prazo deveria ter sido empurrado pelo tempo parado',
    );
  });

  it('vincula chamados e recusa auto-vínculo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const a = await abrirChamado(supervisor);
    const b = await abrirChamado(supervisor);

    const r = await supervisor.post<TicketDetail>(`/tickets/${a.id}/vincular`, {
      targetTicketId: b.id,
      type: 'RELACIONADO',
    });
    assert.equal(r.corpo.links.length, 1);
    assert.equal(r.corpo.links[0]!.ticket.number, b.number);

    const auto = await supervisor.post(`/tickets/${a.id}/vincular`, {
      targetTicketId: a.id,
      type: 'RELACIONADO',
    });
    assert.equal(auto.status, 400);
  });
});

describe('fila', () => {
  it('pagina por cursor sem repetir nem perder chamado', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const total = (await supervisor.get<Paginated<TicketListItem>>('/tickets?limit=200')).corpo.data
      .length;

    const vistos: string[] = [];
    let cursor: string | null = null;

    do {
      const url: string = `/tickets?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const pagina: Paginated<TicketListItem> = (
        await supervisor.get<Paginated<TicketListItem>>(url)
      ).corpo;
      vistos.push(...pagina.data.map((t) => t.id));
      cursor = pagina.nextCursor;
    } while (cursor);

    assert.equal(vistos.length, total, 'a paginação perdeu ou repetiu chamado');
    assert.equal(new Set(vistos).size, total, 'a paginação repetiu chamado');
  });

  it('filtra por status, sem atribuição e busca textual', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const semTime = await abrirChamado(supervisor, {
      categoryId: f.semTime.id,
      subject: 'Café da copa acabou',
    });

    const porStatus = await supervisor.get<Paginated<TicketListItem>>('/tickets?status=NOVO');
    assert.ok(porStatus.corpo.data.every((t) => t.status === 'NOVO'));

    const sem = await supervisor.get<Paginated<TicketListItem>>('/tickets?semAtribuicao=true');
    assert.ok(sem.corpo.data.some((t) => t.id === semTime.id));
    assert.ok(sem.corpo.data.every((t) => t.assignedTeam === null && t.assignedUser === null));

    const busca = await supervisor.get<Paginated<TicketListItem>>('/tickets?q=copa');
    assert.equal(busca.corpo.data.length, 1);
    assert.equal(busca.corpo.data[0]!.id, semTime.id);

    const porNumero = await supervisor.get<Paginated<TicketListItem>>(
      `/tickets?q=%23${semTime.number}`,
    );
    assert.ok(porNumero.corpo.data.some((t) => t.id === semTime.id));
  });

  it('filtra o que estourou o prazo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);

    const antes = await supervisor.get<Paginated<TicketListItem>>('/tickets?slaBreached=true');
    assert.ok(!antes.corpo.data.some((t) => t.id === chamado.id));

    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id },
      data: { dueAt: new Date(Date.now() - 3600 * 1000) },
    });

    const depois = await supervisor.get<Paginated<TicketListItem>>('/tickets?slaBreached=true');
    assert.ok(depois.corpo.data.some((t) => t.id === chamado.id));

    const estourado = depois.corpo.data.find((t) => t.id === chamado.id)!;
    assert.ok(
      estourado.commitments[0]!.remainingSeconds < 0,
      'o tempo restante deveria ser negativo',
    );
  });
});

describe('restrições do banco', () => {
  it('recusa ator sem alvo e ator com dois alvos', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);

    await assert.rejects(
      prisma.ticketActor.create({ data: { ticketId: chamado.id, role: 'OBSERVADOR' } }),
      /ticket_actors_alvo_unico/,
    );

    await assert.rejects(
      prisma.ticketActor.create({
        data: {
          ticketId: chamado.id,
          role: 'OBSERVADOR',
          userId: f.agente.id,
          teamId: f.time.id,
        },
      }),
      /ticket_actors_alvo_unico/,
    );
  });

  it('recusa escala fora de 1..5 mesmo por escrita direta', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);

    await assert.rejects(
      prisma.ticket.update({ where: { id: chamado.id }, data: { priority: 9 } }),
      /tickets_escala/,
    );
  });
});

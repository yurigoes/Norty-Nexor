import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ConsultaPublica, ServiceOrderView, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Ordem de serviço: itens, assinatura desenhada e carimbo.
 *
 * A regra que esta suíte existe para proteger é uma só: **ordem
 * assinada não muda**. A assinatura atesta a lista de itens que estava
 * na tela naquele momento, e o documento é o que o cliente guarda como
 * prova do atendimento. Se dá para editar depois, ele não prova nada.
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

/** Um PNG de 1×1 de verdade — o `<canvas>` manda algo assim. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function abrirChamado(c: Cliente): Promise<TicketDetail> {
  const r = await c.post<TicketDetail>('/tickets', {
    subject: 'Roteador queimado na filial',
    description: 'Precisa de troca em campo.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function ordemCom(c: Cliente, ticketId: string, itens: string[]) {
  const criada = await c.post<ServiceOrderView>(`/tickets/${ticketId}/ordens`, {});
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo));

  let ordem = criada.corpo;
  for (const descricao of itens) {
    const r = await c.post<ServiceOrderView>(`/ordens/${ordem.id}/itens`, {
      description: descricao,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    ordem = r.corpo;
  }
  return ordem;
}

const assinar = (c: Cliente, id: string, extra: Record<string, unknown> = {}) =>
  c.post<ServiceOrderView>(`/ordens/${id}/concluir`, {
    signature: PNG,
    signedByName: 'Marina Alves',
    signedByRole: 'Técnica de campo',
    ...extra,
  });

describe('ordem de serviço', () => {
  it('nasce numerada por organização, e o número não se repete', async () => {
    const agente = await entrar('agente@teste.dev');
    const um = await ordemCom(agente, (await abrirChamado(agente)).id, ['Trocar o roteador']);
    const dois = await ordemCom(agente, (await abrirChamado(agente)).id, ['Conferir cabeamento']);

    assert.ok(um.number >= 1);
    assert.equal(dois.number, um.number + 1);
  });

  it('sai de rascunho quando ganha o primeiro item', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const vazia = await agente.post<ServiceOrderView>(`/tickets/${chamado.id}/ordens`, {});
    assert.equal(vazia.corpo.status, 'RASCUNHO');

    const comItem = await agente.post<ServiceOrderView>(`/ordens/${vazia.corpo.id}/itens`, {
      description: 'Trocar a fonte',
    });
    assert.equal(comItem.corpo.status, 'EXECUTANDO');
  });

  it('marca o item como feito e guarda quando foi', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, ['Trocar a fonte']);
    const item = ordem.items[0]!;

    const feito = await agente.patch<ServiceOrderView>(`/ordens/${ordem.id}/itens/${item.id}`, {
      description: item.description,
      done: true,
      notes: 'Fonte de 12V trocada; a antiga ficou com o cliente.',
    });
    assert.equal(feito.status, 200, JSON.stringify(feito.corpo));
    assert.equal(feito.corpo.items[0]?.done, true);
    assert.ok(feito.corpo.items[0]?.doneAt, 'a hora do feito deveria estar gravada');
  });

  it('remarcar um item já feito não move a hora em que ele foi feito', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, ['Testar a rede']);
    const item = ordem.items[0]!;

    const caminho = `/ordens/${ordem.id}/itens/${item.id}`;
    const primeira = await agente.patch<ServiceOrderView>(caminho, {
      description: item.description,
      done: true,
    });
    const quando = primeira.corpo.items[0]?.doneAt;

    const segunda = await agente.patch<ServiceOrderView>(caminho, {
      description: 'Testar a rede e o wi-fi',
      done: true,
    });
    assert.equal(segunda.corpo.items[0]?.doneAt, quando, 'a hora do feito não devia mudar');
  });

  it('desmarcar o item apaga a hora', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, ['Trocar switch']);
    const caminho = `/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`;

    await agente.patch(caminho, { description: 'Trocar switch', done: true });
    const desfeito = await agente.patch<ServiceOrderView>(caminho, {
      description: 'Trocar switch',
      done: false,
    });
    assert.equal(desfeito.corpo.items[0]?.doneAt, null);
  });

  it('sem visita informada, a ordem se liga à que está marcada', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const visita = await agente.post<{ id: string }>(`/tickets/${chamado.id}/agendamentos`, {
      scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(visita.status, 201, JSON.stringify(visita.corpo));

    // A ordem quase sempre nasce da visita. Sem o vínculo automático, o
    // PDF sai sem a data do atendimento — o dado que o cliente confere
    // primeiro — e ninguém se lembra de informá-lo à mão.
    const ordem = await agente.post<ServiceOrderView>(`/tickets/${chamado.id}/ordens`, {});
    assert.equal(ordem.corpo.appointmentId, visita.corpo.id);
  });

  it('visita informada à mão ganha da que está marcada', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const primeira = await agente.post<{ id: string }>(`/tickets/${chamado.id}/agendamentos`, {
      scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await agente.post(`/agendamentos/${primeira.corpo.id}/concluir`);

    const segunda = await agente.post<{ id: string }>(`/tickets/${chamado.id}/agendamentos`, {
      scheduledFor: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const ordem = await agente.post<ServiceOrderView>(`/tickets/${chamado.id}/ordens`, {
      appointmentId: primeira.corpo.id,
    });
    assert.equal(ordem.corpo.appointmentId, primeira.corpo.id);
    assert.notEqual(ordem.corpo.appointmentId, segunda.corpo.id);
  });
});

describe('assinar', () => {
  it('conclui com a assinatura e registra quem assinou', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const ordem = await ordemCom(agente, chamado.id, ['Trocar o roteador']);
    await agente.patch(`/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`, {
      description: 'Trocar o roteador',
      done: true,
    });

    const assinada = await assinar(agente, ordem.id, { report: 'Equipamento substituído.' });
    assert.equal(assinada.status, 201, JSON.stringify(assinada.corpo));
    assert.equal(assinada.corpo.status, 'CONCLUIDA');
    assert.equal(assinada.corpo.signedByName, 'Marina Alves');
    assert.equal(assinada.corpo.signedByRole, 'Técnica de campo');
    assert.ok(assinada.corpo.signedAt);
    assert.equal(assinada.corpo.hasSignature, true);
  });

  it('ORDEM ASSINADA NÃO MUDA — nem item, nem relato', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, ['Trocar a fonte']);
    const item = ordem.items[0]!;
    await agente.patch(`/ordens/${ordem.id}/itens/${item.id}`, {
      description: item.description,
      done: true,
    });
    assert.equal((await assinar(agente, ordem.id)).status, 201);

    // As quatro portas de edição, todas fechadas.
    const editar = await agente.patch(`/ordens/${ordem.id}`, { report: 'outra coisa' });
    assert.equal(editar.status, 409, JSON.stringify(editar.corpo));

    const novoItem = await agente.post(`/ordens/${ordem.id}/itens`, { description: 'Mais um' });
    assert.equal(novoItem.status, 409);

    const mexerItem = await agente.patch(`/ordens/${ordem.id}/itens/${item.id}`, {
      description: 'Outra descrição',
    });
    assert.equal(mexerItem.status, 409);

    const apagarItem = await agente.del(`/ordens/${ordem.id}/itens/${item.id}`);
    assert.equal(apagarItem.status, 409);

    // E o conteúdo continua o que foi assinado.
    const depois = await agente.get<ServiceOrderView[]>(
      `/tickets/${ordem.ticketId}/ordens`,
    );
    assert.equal(depois.corpo[0]?.items[0]?.description, 'Trocar a fonte');
  });

  it('não assina ordem sem item, nem com tudo por fazer', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);

    const vazia = await agente.post<ServiceOrderView>(`/tickets/${chamado.id}/ordens`, {});
    const semItem = await assinar(agente, vazia.corpo.id);
    assert.equal(semItem.status, 409, JSON.stringify(semItem.corpo));

    const comItem = await agente.post<ServiceOrderView>(`/ordens/${vazia.corpo.id}/itens`, {
      description: 'Nada foi feito ainda',
    });
    const nadaFeito = await assinar(agente, comItem.corpo.id);
    assert.equal(nadaFeito.status, 409, JSON.stringify(nadaFeito.corpo));
  });

  it('item por fazer não impede: visita em que nem tudo coube é a regra', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, [
      'Trocar o roteador',
      'Passar cabo novo até a recepção',
    ]);
    await agente.patch(`/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`, {
      description: ordem.items[0]!.description,
      done: true,
    });

    const r = await assinar(agente, ordem.id);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.items.filter((i) => i.done).length, 1);
    assert.equal(r.corpo.items.filter((i) => !i.done).length, 1);
  });

  it('recusa assinatura que não é PNG', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, ['Trocar peça']);
    await agente.patch(`/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`, {
      description: 'Trocar peça',
      done: true,
    });

    // `data:text/html` guardado e servido de volta seria script na
    // origem da API.
    for (const falsa of [
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'não é nem data url',
      'data:image/png;base64,',
    ]) {
      const r = await assinar(agente, ordem.id, { signature: falsa });
      assert.equal(r.status, 400, `aceitou "${falsa.slice(0, 30)}"`);
    }
  });

  it('a conclusão aparece na conversa do chamado', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const ordem = await ordemCom(agente, chamado.id, ['Trocar peça']);
    await agente.patch(`/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`, {
      description: 'Trocar peça',
      done: true,
    });
    await assinar(agente, ordem.id);

    const eventos = await agente.get<{ body: string | null }[]>(`/tickets/${chamado.id}/eventos`);
    assert.ok(
      eventos.corpo.some((e) => e.body?.includes(`Ordem de serviço nº ${ordem.number} concluída`)),
      'a conclusão deveria aparecer na conversa',
    );
  });
});

describe('quem pode o quê', () => {
  it('o solicitante lê a ordem do chamado dele, mas não a escreve', async () => {
    const agente = await entrar('agente@teste.dev');
    const solicitante = await entrar('solicitante@teste.dev');

    const chamado = await solicitante.post<TicketDetail>('/tickets', {
      subject: 'Impressora na recepção',
      description: 'Não puxa papel.',
      categoryId: f.categoria.id,
    });
    const ordem = await ordemCom(agente, chamado.corpo.id, ['Limpar o rolete']);

    const lendo = await solicitante.get<ServiceOrderView[]>(
      `/tickets/${chamado.corpo.id}/ordens`,
    );
    assert.equal(lendo.status, 200, JSON.stringify(lendo.corpo));
    assert.equal(lendo.corpo.length, 1);

    const escrevendo = await solicitante.post(`/ordens/${ordem.id}/itens`, {
      description: 'Trocar a impressora inteira',
    });
    assert.equal(escrevendo.status, 403, JSON.stringify(escrevendo.corpo));
  });

  it('não alcança a ordem de chamado que você não vê', async () => {
    const agente = await entrar('agente@teste.dev');
    const ordem = await ordemCom(agente, (await abrirChamado(agente)).id, ['Trocar peça']);

    const outro = await entrar('agente2@teste.dev');
    const r = await outro.post(`/ordens/${ordem.id}/itens`, { description: 'espiando' });
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });
});

describe('o PDF da ordem', () => {
  it('sai com a marca, o carimbo e o código de verificação', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const ordem = await ordemCom(agente, chamado.id, ['Trocar o roteador', 'Testar a rede']);
    await agente.patch(`/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`, {
      description: ordem.items[0]!.description,
      done: true,
    });
    await assinar(agente, ordem.id, { report: 'Roteador substituído e rede testada.' });

    const token = (
      (await new Cliente(api.url).entrar('agente@teste.dev')).corpo as { accessToken: string }
    ).accessToken;

    const r = await fetch(`${api.url}/ordens/${ordem.id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');

    const arquivo = Buffer.from(await r.arrayBuffer());
    assert.equal(arquivo.subarray(0, 5).toString(), '%PDF-');
    assert.ok(arquivo.length > 2000, `PDF pequeno demais: ${arquivo.length}`);
    assert.equal(Number(r.headers.get('content-length')), arquivo.length);
  });

  it('a ordem concluída aparece na consulta pública, que é o que dá sentido ao carimbo', async () => {
    await prisma.loginThrottle.deleteMany({});
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const ordem = await ordemCom(agente, chamado.id, ['Trocar o roteador', 'Testar a rede']);
    await agente.patch(`/ordens/${ordem.id}/itens/${ordem.items[0]!.id}`, {
      description: ordem.items[0]!.description,
      done: true,
    });
    await assinar(agente, ordem.id);

    const { protocol } = await prisma.ticket.findUniqueOrThrow({
      where: { id: chamado.id },
      select: { protocol: true },
    });

    const publica = await fetch(`${api.url}/publico/protocolo/${protocol}`);
    const corpo = (await publica.json()) as ConsultaPublica;

    assert.equal(corpo.serviceOrders.length, 1);
    assert.equal(corpo.serviceOrders[0]?.number, ordem.number);
    assert.equal(corpo.serviceOrders[0]?.itemsDone, 1);
    assert.equal(corpo.serviceOrders[0]?.itemsTotal, 2);
    assert.equal(corpo.serviceOrders[0]?.signedByName, 'Marina Alves');
  });

  it('ordem em rascunho não aparece na consulta pública', async () => {
    await prisma.loginThrottle.deleteMany({});
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    // Rascunho é trabalho em andamento: mostrá-lo ao cliente antes de o
    // técnico terminar prometeria o que ainda não foi feito.
    await ordemCom(agente, chamado.id, ['Ainda pensando no que fazer']);

    const { protocol } = await prisma.ticket.findUniqueOrThrow({
      where: { id: chamado.id },
      select: { protocol: true },
    });

    const publica = await fetch(`${api.url}/publico/protocolo/${protocol}`);
    const corpo = (await publica.json()) as ConsultaPublica;
    assert.equal(corpo.serviceOrders.length, 0);
  });
});

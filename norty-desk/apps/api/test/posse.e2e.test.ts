import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetDetail, AssetView, PosseView, ReservaView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Quem está com o equipamento, e quem esteve antes.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **Trocar de mão não apaga a mão anterior.** Era o que acontecia
 *    quando "quem usa" era um campo do ativo e um `salvar` o trocava.
 * 2. **Uma posse aberta por equipamento, e isso é do banco.** Duas
 *    entregas simultâneas leem "está livre" antes de qualquer uma
 *    gravar; só o índice único recusa a segunda.
 * 3. **O ponteiro do ativo não discorda do histórico**, porque os dois
 *    são escritos na mesma transação.
 * 4. **O termo assinado vale como prova**: o nome de quem assinou é
 *    gravado na hora, e a imagem sai por rota própria.
 * 5. **Entrega sem termo é permitida e fica marcada.** Recusá-la
 *    empurraria a entrega para fora do sistema.
 */

let api: Api;
let f: Fixtura;
let supervisor: Cliente;

/** Um PNG de 1x1, que é o bastante para o formato passar. */
const PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

let sequencia = 0;

async function criarAtivo(): Promise<AssetView> {
  sequencia += 1;
  const r = await supervisor.post<AssetView>('/assets', {
    name: `Notebook ${sequencia}`,
    kind: 'COMPUTADOR',
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

const entregar = (assetId: string, corpo: Record<string, unknown>) =>
  supervisor.post<PosseView[] & { detail?: string }>(`/assets/${assetId}/posse`, corpo);

const devolver = (assetId: string, corpo: Record<string, unknown>) =>
  supervisor.post<PosseView[] & { detail?: string }>(`/assets/${assetId}/devolver`, corpo);

// ---------------------------------------------------------------------

describe('posse do equipamento', () => {
  it('entregar abre a posse, escreve o ponteiro e guarda o termo', async () => {
    const ativo = await criarAtivo();

    const r = await entregar(ativo.id, {
      userId: f.solicitante.id,
      signature: PNG,
      notes: 'Notebook do atendimento.',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.length, 1);

    const posse = r.corpo[0]!;
    assert.equal(posse.isCurrent, true);
    assert.equal(posse.user.id, f.solicitante.id);

    const termo = posse.terms[0]!;
    assert.equal(posse.terms.length, 1);
    assert.equal(termo.kind, 'COMPROMISSO');
    assert.ok(termo.signedAt, 'com assinatura, o termo tem data');
    assert.equal(
      termo.signedByName,
      f.solicitante.name,
      'sem nome informado, quem assina é quem recebe',
    );
    assert.equal(termo.hasSignature, true);

    // E o papel diz o nome de quem assinou e o do equipamento: um termo
    // com o marcador cru no lugar do dado não vale nada.
    assert.ok(termo.body.includes(f.solicitante.name), termo.body);
    assert.ok(termo.body.includes('Compra de licença') || termo.body.includes('Notebook'), termo.body);
    assert.ok(!termo.body.includes('{{'), 'sobrou marcador sem trocar');

    // O ponteiro do ativo anda junto: é o que a listagem filtra.
    const naBase = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id } });
    assert.equal(naBase.userId, f.solicitante.id);
    assert.equal(naBase.status, 'EM_USO');

    // E o papel sai por rota própria, não no corpo da listagem. O
    // `fetch` é direto porque o que volta é PDF, e o cliente da suíte
    // tenta ler tudo como JSON.
    const pdf = await fetch(`${api.url}/termos/${termo.id}/pdf`, {
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  });

  it('passar a outra pessoa encerra a anterior em vez de apagá-la', async () => {
    const ativo = await criarAtivo();

    await entregar(ativo.id, { userId: f.solicitante.id });
    const r = await entregar(ativo.id, { userId: f.agente.id });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal(r.corpo.length, 2, 'a posse anterior continua no histórico');

    const abertas = r.corpo.filter((p) => p.isCurrent);
    assert.equal(abertas.length, 1, 'só uma posse aberta');
    assert.equal(abertas[0]!.user.id, f.agente.id);

    const anterior = r.corpo.find((p) => !p.isCurrent)!;
    assert.equal(anterior.user.id, f.solicitante.id);
    assert.ok(anterior.endedAt, 'a anterior foi encerrada, não removida');
  });

  it('entregar a quem já está com ele é conflito, não uma segunda posse', async () => {
    const ativo = await criarAtivo();
    await entregar(ativo.id, { userId: f.solicitante.id });

    const r = await entregar(ativo.id, { userId: f.solicitante.id });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
  });

  it('o banco recusa a segunda posse aberta, mesmo por fora da aplicação', async () => {
    const ativo = await criarAtivo();
    await entregar(ativo.id, { userId: f.solicitante.id });

    // É o caminho de duas requisições simultâneas: as duas leem "está
    // livre" antes de qualquer uma gravar, e nenhuma validação na
    // aplicação as separa.
    await assert.rejects(
      prisma.assetHolding.create({
        data: {
          organizationId: f.organizacao.id,
          assetId: ativo.id,
          userId: f.agente.id,
        },
      }),
      /asset_holdings_assetId_isCurrent_key|Unique constraint/i,
    );
  });

  it('devolver encerra a posse, grava o destino e solta o ponteiro', async () => {
    const ativo = await criarAtivo();
    await entregar(ativo.id, { userId: f.solicitante.id });

    const r = await devolver(ativo.id, { returnedTo: 'BAIXADO', notes: 'Tela quebrada.' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const posse = r.corpo[0]!;
    assert.equal(posse.isCurrent, false);
    assert.equal(posse.returnedTo, 'BAIXADO');
    assert.equal(posse.notes, 'Tela quebrada.');

    const naBase = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id } });
    assert.equal(naBase.userId, null);
    assert.equal(naBase.status, 'BAIXADO');

    // E o destino gravado na posse sobrevive à mudança no ativo: o
    // histórico diz o que era verdade quando aconteceu.
    await prisma.asset.update({ where: { id: ativo.id }, data: { status: 'EM_ESTOQUE' } });
    const depois = await prisma.assetHolding.findFirstOrThrow({ where: { assetId: ativo.id } });
    assert.equal(depois.returnedTo, 'BAIXADO');
  });

  it('devolver o que não está com ninguém é conflito', async () => {
    const ativo = await criarAtivo();
    const r = await devolver(ativo.id, { returnedTo: 'EM_ESTOQUE' });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
  });

  it('entrega sem termo vale, e fica marcada como sem termo', async () => {
    const ativo = await criarAtivo();

    const r = await entregar(ativo.id, { userId: f.solicitante.id });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.deepEqual(r.corpo[0]!.terms, [], 'sem assinatura, nenhum papel nasce');
  });

  it('o cadastro de uso recebe equipamento sem precisar entrar na central', async () => {
    const ativo = await criarAtivo();

    // Cadastro de uso é exatamente isto: pessoa com vínculo e **sem**
    // senha. Criada aqui pelo Prisma para o teste falar de posse, e não
    // da permissão de quem cadastra pessoa.
    const pessoa = await prisma.user.create({
      data: {
        name: 'Quem só assina o termo',
        email: 'so-termo@teste.dev',
        passwordHash: null,
        memberships: { create: { organizationId: f.organizacao.id, role: 'SOLICITANTE' } },
      },
    });

    const r = await entregar(ativo.id, { userId: pessoa.id });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo[0]!.user.id, pessoa.id);
  });

  it('não entrega a quem é de outra organização', async () => {
    const ativo = await criarAtivo();

    const r = await entregar(ativo.id, { userId: f.forasteiro.id });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('o ativo não muda de mão pelo PATCH — a porta é a entrega', async () => {
    const ativo = await criarAtivo();

    const r = await supervisor.patch(`/assets/${ativo.id}`, {
      name: ativo.name,
      userId: f.solicitante.id,
    });

    // `forbidNonWhitelisted`: campo desconhecido no corpo é erro, e não
    // algo a ignorar em silêncio. Sem isso, quem ainda mandasse `userId`
    // acharia que trocou a mão e não teria trocado nada.
    assert.equal(r.status, 400, JSON.stringify(r.corpo));

    const naBase = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id } });
    assert.equal(naBase.userId, null);
  });

  it('o detalhe do ativo traz o histórico junto', async () => {
    const ativo = await criarAtivo();
    await entregar(ativo.id, { userId: f.solicitante.id });
    await devolver(ativo.id, { returnedTo: 'EM_ESTOQUE' });
    await entregar(ativo.id, { userId: f.agente.id });

    const r = await supervisor.get<AssetDetail>(`/assets/${ativo.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.holdings.length, 2);
    assert.equal(r.corpo.holdings[0]!.isCurrent, true, 'a mais recente vem primeiro');
    assert.equal(r.corpo.user?.id, f.agente.id);
  });

  it('apagar a pessoa é recusado enquanto houver posse registrada', async () => {
    const ativo = await criarAtivo();

    const pessoa = await prisma.user.create({
      data: {
        name: 'Vai tentar sumir',
        email: 'some@teste.dev',
        memberships: { create: { organizationId: f.organizacao.id, role: 'SOLICITANTE' } },
      },
    });

    await entregar(ativo.id, { userId: pessoa.id });
    await devolver(ativo.id, { returnedTo: 'EM_ESTOQUE' });

    // Mesmo com a posse **encerrada**: a prova de quem esteve com o
    // equipamento não pode sumir junto com o cadastro.
    await assert.rejects(prisma.user.delete({ where: { id: pessoa.id } }), /constraint|Foreign key/i);
  });
});

/**
 * Reserva de equipamento.
 *
 * O notebook de empréstimo, o projetor, a máquina de teste: o que é
 * pouco e disputado. Sem reserva isso vive no grupo do WhatsApp, e duas
 * pessoas levam o mesmo equipamento na mesma sexta.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **A sobreposição é do banco.** Duas reservas simultâneas leem
 *    "livre" antes de qualquer uma gravar; só o `EXCLUDE` recusa a
 *    segunda. É o mesmo argumento da posse aberta.
 * 2. **Cancelar libera a janela**, sem apagar o registro de que alguém
 *    tinha separado aquilo.
 * 3. **A entrega respeita a reserva.** Entregar por cima da reserva de
 *    outra pessoa é o que faz a reserva não valer nada.
 * 4. **Reservou e levou fecha o ciclo**, e é o que separa a reserva
 *    cumprida da esquecida.
 */
describe('reserva de equipamento', () => {
  const HORA = 3_600_000;

  function janela(deHoras: number, ateHoras: number) {
    return {
      startsAt: new Date(Date.now() + deHoras * HORA).toISOString(),
      endsAt: new Date(Date.now() + ateHoras * HORA).toISOString(),
    };
  }

  const reservar = (assetId: string, corpo: Record<string, unknown>) =>
    supervisor.post<ReservaView[] & { detail?: string }>(`/assets/${assetId}/reservas`, corpo);

  it('separa o equipamento e diz a situação da janela', async () => {
    const ativo = await criarAtivo();

    const r = await reservar(ativo.id, {
      userId: f.agente.id,
      ...janela(24, 32),
      purpose: 'Visita ao cliente na sexta',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.length, 1);
    assert.equal(r.corpo[0]!.user.id, f.agente.id);
    assert.equal(r.corpo[0]!.situacao, 'FUTURA');
    assert.equal(r.corpo[0]!.purpose, 'Visita ao cliente na sexta');
    // Quem separou nem sempre é quem leva.
    assert.equal(r.corpo[0]!.createdBy.id, f.supervisor.id);
  });

  it('duas reservas simultâneas na mesma janela: só uma entra', async () => {
    const ativo = await criarAtivo();
    const corpo = { userId: f.agente.id, ...janela(48, 56) };

    // De propósito em paralelo: em sequência isto só provaria que
    // verificar antes de gravar funciona — e é justamente o que não
    // funciona quando as duas requisições chegam juntas.
    const [a, b] = await Promise.all([
      reservar(ativo.id, corpo),
      reservar(ativo.id, { ...corpo, userId: f.solicitante.id }),
    ]);

    const criadas = [a, b].filter((x) => x.status === 201);
    const recusadas = [a, b].filter((x) => x.status === 409);

    assert.equal(criadas.length, 1, 'as duas passaram: a janela foi reservada duas vezes');
    assert.equal(recusadas.length, 1, JSON.stringify([a.status, b.status]));

    // E a recusa diz com quem falar, não o nome da restrição.
    assert.match(recusadas[0]!.corpo.detail ?? '', /já está reservado para/);

    const noBanco = await prisma.assetReservation.count({
      where: { assetId: ativo.id, canceledAt: null },
    });
    assert.equal(noBanco, 1);
  });

  it('janelas que se encostam convivem; as que se cruzam, não', async () => {
    const ativo = await criarAtivo();

    // [8h, 12h) e [12h, 16h): o fim é aberto, então 12h não é conflito.
    assert.equal((await reservar(ativo.id, { userId: f.agente.id, ...janela(8, 12) })).status, 201);
    assert.equal((await reservar(ativo.id, { userId: f.agente.id, ...janela(12, 16) })).status, 201);

    // Uma hora para dentro já é conflito.
    const cruzada = await reservar(ativo.id, { userId: f.agente.id, ...janela(11, 13) });
    assert.equal(cruzada.status, 409, JSON.stringify(cruzada.corpo));
  });

  it('cancelar libera a janela, e o registro fica', async () => {
    const ativo = await criarAtivo();
    const corpo = { userId: f.agente.id, ...janela(72, 80) };

    const primeira = await reservar(ativo.id, corpo);
    assert.equal(primeira.status, 201);

    assert.equal((await reservar(ativo.id, corpo)).status, 409);

    const cancelada = await supervisor.del<ReservaView[]>(
      `/reservas/${primeira.corpo[0]!.id}`,
    );
    assert.equal(cancelada.status, 200, JSON.stringify(cancelada.corpo));

    // A janela voltou a ser reservável.
    assert.equal((await reservar(ativo.id, corpo)).status, 201);

    // E o registro de que alguém tinha separado aquilo continua lá:
    // apagar a linha seria perder a explicação.
    const todas = await prisma.assetReservation.findMany({ where: { assetId: ativo.id } });
    assert.equal(todas.length, 2);
    assert.equal(todas.filter((x) => x.canceledAt !== null).length, 1);
  });

  it('recusa a janela invertida e a que já passou', async () => {
    const ativo = await criarAtivo();

    assert.equal((await reservar(ativo.id, { userId: f.agente.id, ...janela(20, 10) })).status, 400);
    assert.equal(
      (await reservar(ativo.id, { userId: f.agente.id, ...janela(-40, -30) })).status,
      400,
      'reserva que já acabou ocupa o equipamento e não aparece em consulta nenhuma',
    );
  });

  it('a entrega respeita a reserva de outra pessoa, e cumpre a de quem reservou', async () => {
    const ativo = await criarAtivo();

    // Reserva valendo agora: começou há uma hora.
    const reserva = await reservar(ativo.id, {
      userId: f.agente.id,
      ...janela(-1, 8),
      purpose: 'Apresentação da diretoria',
    });
    assert.equal(reserva.status, 201, JSON.stringify(reserva.corpo));
    assert.equal(reserva.corpo[0]!.situacao, 'EM_CURSO');

    // Outra pessoa tenta levar.
    const alheia = await entregar(ativo.id, { userId: f.solicitante.id });
    assert.equal(alheia.status, 409, JSON.stringify(alheia.corpo));
    assert.match(alheia.corpo.detail ?? '', /reservado para/);
    // A recusa diz para quê, porque o caminho é falar com quem reservou.
    assert.match(alheia.corpo.detail ?? '', /Apresentação da diretoria/);

    // Quem reservou leva, e o ciclo fecha.
    const certa = await entregar(ativo.id, { userId: f.agente.id });
    assert.equal(certa.status, 201, JSON.stringify(certa.corpo));

    const depois = await supervisor.get<ReservaView[]>(`/assets/${ativo.id}/reservas`);
    assert.equal(depois.corpo[0]!.situacao, 'RETIRADA');
    assert.ok(depois.corpo[0]!.holdingId, 'sem o vínculo, a cumprida e a esquecida ficam iguais');
  });

  it('a agenda recorta por sobreposição, não por início', async () => {
    const ativo = await criarAtivo();

    // Começou ontem e termina amanhã: é o que interessa a quem pergunta
    // "o que está separado hoje", e filtrar por início a deixaria fora.
    await prisma.assetReservation.create({
      data: {
        organizationId: f.organizacao.id,
        assetId: ativo.id,
        userId: f.agente.id,
        createdById: f.supervisor.id,
        startsAt: new Date(Date.now() - 24 * HORA),
        endsAt: new Date(Date.now() + 24 * HORA),
      },
    });

    const agenda = await supervisor.get<ReservaView[]>(`/reservas?assetId=${ativo.id}`);
    assert.equal(agenda.status, 200);
    assert.equal(agenda.corpo.length, 1, 'a reserva em curso sumiu da agenda de hoje');
  });

  it('quem só lê o inventário não reserva', async () => {
    const ativo = await criarAtivo();

    const gestor = new Cliente(api.url);
    assert.equal((await gestor.entrar('gestor@teste.dev')).status, 200);

    const r = await gestor.post(`/assets/${ativo.id}/reservas`, {
      userId: f.agente.id,
      ...janela(100, 108),
    });

    assert.equal(r.status, 403);
  });
});

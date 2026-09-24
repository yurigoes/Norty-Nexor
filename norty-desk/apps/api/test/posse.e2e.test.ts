import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetDetail, AssetView, PosseView } from '@norty-desk/shared';

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
    assert.ok(posse.signedAt, 'com assinatura, o termo tem data');
    assert.equal(
      posse.signedByName,
      f.solicitante.name,
      'sem nome informado, quem assina é quem recebe',
    );
    assert.equal(posse.hasSignature, true);

    // O ponteiro do ativo anda junto: é o que a listagem filtra.
    const naBase = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id } });
    assert.equal(naBase.userId, f.solicitante.id);
    assert.equal(naBase.status, 'EM_USO');

    // E o traço sai por rota própria, não no corpo da listagem. O
    // `fetch` é direto porque o que volta é PNG, e o cliente da suíte
    // tenta ler tudo como JSON.
    const termo = await fetch(`${api.url}/posses/${posse.id}/termo`, {
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });
    assert.equal(termo.status, 200);
    assert.equal(termo.headers.get('content-type'), 'image/png');
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

    const posse = r.corpo[0]!;
    assert.equal(posse.signedAt, null);
    assert.equal(posse.hasSignature, false);

    const termo = await fetch(`${api.url}/posses/${posse.id}/termo`, {
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });
    assert.equal(termo.status, 404, 'sem termo, não há o que servir');
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

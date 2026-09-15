import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, OndeEstaNoRack, ProblemDetails, RackDetail, SalaView } from '@norty-desk/shared';

import { Cliente, type Api, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Datacenter: sala, rack e ocupação em U.
 *
 * O que se prova aqui e em nenhum outro lugar: dois equipamentos não
 * ocupam o mesmo U da mesma face, e a garantia é do banco — o desenho
 * do rack na tela só vale se o dado por trás não puder se sobrepor. E a
 * mesma face é o que importa: frente e trás dividem o U sem conflito,
 * que é como um rack de verdade funciona.
 */

let api: Api;

before(async () => {
  await limparBanco();
  await semear();
  api = await subirApi();
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  assert.equal((await c.entrar(email)).status, 200);
  return c;
}

async function criarAtivo(c: Cliente, name: string): Promise<AssetView> {
  const r = await c.post<AssetView>('/assets', { name, kind: 'REDE' });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function criarRack(c: Cliente, name: string, units = 42): Promise<RackDetail> {
  const r = await c.post<RackDetail>('/racks', { name, units });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('ocupação em U', () => {
  it('dois equipamentos não ocupam o mesmo U da mesma face', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const rack = await criarRack(supervisor, 'Rack A');
    const um = await criarAtivo(supervisor, 'Servidor de baixo');
    const dois = await criarAtivo(supervisor, 'Servidor que não cabe');

    assert.equal(
      (await supervisor.post(`/racks/${rack.id}/items`, {
        assetId: um.id, positionU: 10, heightU: 2, face: 'FRENTE',
      })).status,
      201,
    );

    // U11 já é do primeiro, que ocupa 10 e 11.
    const colidindo = await supervisor.post<ProblemDetails>(`/racks/${rack.id}/items`, {
      assetId: dois.id, positionU: 11, heightU: 1, face: 'FRENTE',
    });
    assert.equal(colidindo.status, 409, JSON.stringify(colidindo.corpo));
  });

  it('frente e trás dividem o mesmo U', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const rack = await criarRack(supervisor, 'Rack B');
    const frente = await criarAtivo(supervisor, 'Patch panel');
    const tras = await criarAtivo(supervisor, 'Organizador traseiro');

    assert.equal(
      (await supervisor.post(`/racks/${rack.id}/items`, {
        assetId: frente.id, positionU: 20, heightU: 1, face: 'FRENTE',
      })).status,
      201,
    );
    const atras = await supervisor.post(`/racks/${rack.id}/items`, {
      assetId: tras.id, positionU: 20, heightU: 1, face: 'TRAS',
    });
    assert.equal(atras.status, 201, 'frente e trás no mesmo U é normal num rack de verdade');
  });

  it('o que atravessa o rack inteiro conflita com as duas faces', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const rack = await criarRack(supervisor, 'Rack C');
    const inteiro = await criarAtivo(supervisor, 'Servidor de profundidade inteira');
    const atras = await criarAtivo(supervisor, 'Algo atrás');

    assert.equal(
      (await supervisor.post(`/racks/${rack.id}/items`, {
        assetId: inteiro.id, positionU: 5, heightU: 2, face: 'AMBAS',
      })).status,
      201,
    );
    const conflito = await supervisor.post<ProblemDetails>(`/racks/${rack.id}/items`, {
      assetId: atras.id, positionU: 6, heightU: 1, face: 'TRAS',
    });
    assert.equal(conflito.status, 409, JSON.stringify(conflito.corpo));
  });

  it('recusa o que não cabe na altura do rack', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const rack = await criarRack(supervisor, 'Rack baixo', 10);
    const grande = await criarAtivo(supervisor, 'Servidor grande');

    const r = await supervisor.post<ProblemDetails>(`/racks/${rack.id}/items`, {
      assetId: grande.id, positionU: 9, heightU: 4,
    });
    // 400, não 409: não é conflito com o que já está lá, é pedido que
    // não faz sentido para um rack desta altura.
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /12/, 'a mensagem diz até onde iria');
  });

  it('o mesmo equipamento não fica em dois racks', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const primeiro = await criarRack(supervisor, 'Rack origem');
    const segundo = await criarRack(supervisor, 'Rack destino');
    const ativo = await criarAtivo(supervisor, 'Servidor viajante');

    assert.equal((await supervisor.post(`/racks/${primeiro.id}/items`, { assetId: ativo.id, positionU: 1 })).status, 201);

    const noutro = await supervisor.post<ProblemDetails>(`/racks/${segundo.id}/items`, {
      assetId: ativo.id, positionU: 1,
    });
    assert.equal(noutro.status, 409, JSON.stringify(noutro.corpo));
    assert.match(noutro.corpo.detail ?? '', /Rack origem/);
  });
});

describe('mover dentro do rack', () => {
  it('muda de U e o lugar antigo fica livre', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const rack = await criarRack(supervisor, 'Rack de mudança');
    const ativo = await criarAtivo(supervisor, 'Servidor que muda de lugar');

    const posto = await supervisor.post<RackDetail>(`/racks/${rack.id}/items`, {
      assetId: ativo.id, positionU: 3, heightU: 1,
    });
    const item = posto.corpo.items.find((i) => i.asset.id === ativo.id)!;

    const movido = await supervisor.patch<RackDetail>(`/rack-items/${item.id}`, { positionU: 30 });
    assert.equal(movido.status, 200, JSON.stringify(movido.corpo));
    assert.equal(movido.corpo.items.find((i) => i.id === item.id)?.positionU, 30);

    // O U3 ficou livre: outro entra lá.
    const outro = await criarAtivo(supervisor, 'Servidor que ocupa a vaga');
    assert.equal(
      (await supervisor.post(`/racks/${rack.id}/items`, { assetId: outro.id, positionU: 3, heightU: 1 })).status,
      201,
    );
  });

  it('a tela do equipamento diz em que rack e em que U ele está', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const rack = await criarRack(supervisor, 'Rack localizável');
    const ativo = await criarAtivo(supervisor, 'Servidor localizável');
    await supervisor.post(`/racks/${rack.id}/items`, { assetId: ativo.id, positionU: 7, heightU: 2 });

    const onde = await supervisor.get<OndeEstaNoRack>(`/assets/${ativo.id}/rack`);
    assert.equal(onde.status, 200);
    assert.equal(onde.corpo?.rack.name, 'Rack localizável');
    assert.equal(onde.corpo?.positionU, 7);
    assert.equal(onde.corpo?.heightU, 2);
  });
});

describe('excluir', () => {
  it('rack com equipamento e sala com rack não se excluem', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const sala = await supervisor.post<SalaView[]>('/dc-rooms', { name: 'Sala cofre' });
    assert.equal(sala.status, 201, JSON.stringify(sala.corpo));
    const salaId = sala.corpo.find((s) => s.name === 'Sala cofre')!.id;

    const rack = await supervisor.post<RackDetail>('/racks', { name: 'Rack da sala', roomId: salaId });
    assert.equal(rack.status, 201);

    const comRack = await supervisor.del<ProblemDetails>(`/dc-rooms/${salaId}`);
    assert.equal(comRack.status, 409, JSON.stringify(comRack.corpo));

    const ativo = await criarAtivo(supervisor, 'Servidor da sala');
    await supervisor.post(`/racks/${rack.corpo.id}/items`, { assetId: ativo.id, positionU: 1 });

    const comItem = await supervisor.del<ProblemDetails>(`/racks/${rack.corpo.id}`);
    assert.equal(comItem.status, 409, JSON.stringify(comItem.corpo));
  });
});

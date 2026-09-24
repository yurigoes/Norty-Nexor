import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetDetail, AssetView, ProblemDetails } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Periférico é equipamento, e pendura numa máquina.
 *
 * Teclado, mouse e headset têm número de série, termo de compromisso
 * assinado por quem usa e um caminho de troca que passa por chamado —
 * sai um, entra outro, e o que saiu vai para o estoque ou para o
 * descarte. Nada disso cabe num `AssetComponent`, que é o que está
 * parafusado dentro da máquina e não vai a lugar nenhum sozinho.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **Um nível só.** Periférico pendura na máquina, e não noutro
 *    periférico — senão "o que está nesta máquina?" vira busca
 *    recursiva num inventário que ninguém mantém.
 * 2. **Não pendura em si mesmo**, nem pela API nem por SQL.
 * 3. **Apagar a máquina não apaga o teclado.** Ele volta a ser avulso, e
 *    continua existindo com o termo de quem o usa.
 * 4. **Não atravessa organização**, mesmo com o id certo no corpo.
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
  assert.equal((await c.entrar(email)).status, 200);
  return c;
}

let sequencia = 0;

async function criarMaquina(cliente: Cliente): Promise<AssetView> {
  sequencia += 1;
  const r = await cliente.post<AssetView>('/assets', {
    name: `Desktop ${sequencia}`,
    kind: 'COMPUTADOR',
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/**
 * O corpo da criação, que tanto pode ser o ativo quanto a recusa.
 *
 * `AssetView & ProblemDetails` não serve: os dois têm `status`, com
 * tipos diferentes, e a interseção vira `never`. Só o `detail` é lido
 * no caminho da recusa.
 */
type AtivoOuRecusa = AssetView & { detail?: string };

async function criarPeriferico(
  cliente: Cliente,
  parentAssetId?: string,
) {
  sequencia += 1;
  return cliente.post<AtivoOuRecusa>(`/assets`, {
    name: `Teclado ${sequencia}`,
    kind: 'PERIFERICO',
    ...(parentAssetId ? { parentAssetId } : {}),
  });
}

// ---------------------------------------------------------------------

describe('periférico pendurado na máquina', () => {
  it('aparece dos dois lados: o pai no periférico, o periférico no pai', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const maquina = await criarMaquina(supervisor);

    const teclado = await criarPeriferico(supervisor, maquina.id);
    assert.equal(teclado.status, 201, JSON.stringify(teclado.corpo));
    assert.equal(teclado.corpo.parent?.id, maquina.id);

    const detalhe = await supervisor.get<AssetDetail>(`/assets/${maquina.id}`);
    assert.equal(detalhe.status, 200);
    assert.deepEqual(
      detalhe.corpo.peripherals.map((p) => p.id),
      [teclado.corpo.id],
    );
  });

  it('despendurar devolve ao avulso sem apagar nada', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const maquina = await criarMaquina(supervisor);
    const teclado = await criarPeriferico(supervisor, maquina.id);

    const solto = await supervisor.patch<AssetView>(`/assets/${teclado.corpo.id}`, {
      parentAssetId: null,
    });
    assert.equal(solto.status, 200, JSON.stringify(solto.corpo));
    assert.equal(solto.corpo.parent, null);

    // Continua existindo: despendurar é um gesto de inventário, não uma
    // baixa. O termo assinado por quem usa não some com ele.
    assert.equal((await supervisor.get(`/assets/${teclado.corpo.id}`)).status, 200);
  });

  it('não pendura noutro periférico: a corrente para no primeiro nível', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const maquina = await criarMaquina(supervisor);
    const teclado = await criarPeriferico(supervisor, maquina.id);

    const mouse = await criarPeriferico(supervisor, teclado.corpo.id);
    assert.equal(mouse.status, 400, JSON.stringify(mouse.corpo));
    assert.match(mouse.corpo.detail ?? '', /já está pendurado/);
  });

  it('não pendura em si mesmo — nem pela API, nem por SQL', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const teclado = await criarPeriferico(supervisor);

    const pelaApi = await supervisor.patch<ProblemDetails>(`/assets/${teclado.corpo.id}`, {
      parentAssetId: teclado.corpo.id,
    });
    assert.equal(pelaApi.status, 400, JSON.stringify(pelaApi.corpo));

    // E o banco também barra: a regra que não pode ser burlada mora lá,
    // e um `UPDATE` à mão é exatamente o caminho que passa por fora da
    // aplicação.
    await assert.rejects(
      prisma.$executeRawUnsafe(
        `UPDATE "assets" SET "parentAssetId" = id WHERE id = $1::uuid`,
        teclado.corpo.id,
      ),
      /assets_pai_nao_e_ele_mesmo/,
    );
  });

  it('apagar a máquina solta o periférico em vez de levá-lo junto', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const maquina = await criarMaquina(supervisor);
    const teclado = await criarPeriferico(supervisor, maquina.id);

    await prisma.asset.delete({ where: { id: maquina.id } });

    const sobrou = await prisma.asset.findUnique({ where: { id: teclado.corpo.id } });
    assert.ok(sobrou, 'sumir com a máquina não pode sumir com o teclado');
    assert.equal(sobrou.parentAssetId, null, 'ele volta a ser avulso');
  });

  it('não pendura em máquina de outra organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const alheia = await prisma.asset.create({
      data: {
        organizationId: f.outra.id,
        name: 'Desktop da outra empresa',
        kind: 'COMPUTADOR',
      },
    });

    const teclado = await criarPeriferico(supervisor, alheia.id);
    assert.equal(teclado.status, 400, JSON.stringify(teclado.corpo));
    assert.match(teclado.corpo.detail ?? '', /não encontrado nesta organização/);
  });

  it('a busca filtra pelos periféricos de uma máquina', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const maquina = await criarMaquina(supervisor);
    const teclado = await criarPeriferico(supervisor, maquina.id);
    await criarPeriferico(supervisor); // avulso, não deve aparecer

    const r = await supervisor.get<AssetView[]>(`/assets?parentAssetId=${maquina.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.corpo.map((a) => a.id),
      [teclado.corpo.id],
    );
  });
});

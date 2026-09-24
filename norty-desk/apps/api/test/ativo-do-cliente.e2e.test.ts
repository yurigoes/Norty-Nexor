import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, ClienteDetail, PosseView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * De qual empresa-cliente é o equipamento.
 *
 * A Norty administra parque alheio: sem esta coluna, tudo que o agente
 * de inventário encontrar cai num parque só, e "quantas máquinas a
 * empresa do João tem?" deixa de ter resposta.
 *
 * O que se prova aqui e em nenhum outro lugar é que as três pontas não
 * se contradizem — o periférico, quem está com o equipamento, e a troca
 * de empresa depois de tudo pronto:
 *
 * 1. **Periférico não pendura em máquina de outro cliente.**
 * 2. **Equipamento de um cliente não vai para o funcionário de outro.**
 * 3. **Trocar a empresa é recusado quando contradiz o que já existe.**
 * 4. **Da casa combina com todo mundo**, nos dois sentidos: o notebook
 *    de empréstimo vai para o funcionário do cliente, e o técnico da
 *    casa leva a máquina do cliente para o conserto.
 * 5. **Apagar a empresa não apaga o inventário dela.**
 */

let api: Api;
let f: Fixtura;
let supervisor: Cliente;

/** Duas empresas-cliente, para que "de outra empresa" seja possível. */
let joao: ClienteDetail;
let maria: ClienteDetail;

/** Uma pessoa de cada empresa, e a da casa é `f.agente`. */
let doJoao: { id: string };
let daMaria: { id: string };

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);

  joao = await criarEmpresa('Empresa do João', 'empresadojoao.com.br');
  maria = await criarEmpresa('Empresa da Maria', 'empresadamaria.com.br');

  doJoao = await criarPessoa(joao.id, 'Pessoa do João');
  daMaria = await criarPessoa(maria.id, 'Pessoa da Maria');
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function criarEmpresa(name: string, emailDomain: string): Promise<ClienteDetail> {
  const r = await supervisor.post<ClienteDetail>('/clients', { name, emailDomain });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function criarPessoa(clientId: string, name: string): Promise<{ id: string }> {
  const r = await supervisor.post<ClienteDetail>(`/clients/${clientId}/people`, { name });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const pessoa = r.corpo.people.at(-1)!;
  return { id: pessoa.id };
}

let sequencia = 0;

type AtivoOuRecusa = AssetView & { detail?: string };

async function criarAtivo(
  clientId: string | null,
  extra: Record<string, unknown> = {},
) {
  sequencia += 1;
  return supervisor.post<AtivoOuRecusa>('/assets', {
    name: `Equipamento ${sequencia}`,
    kind: 'COMPUTADOR',
    ...(clientId ? { clientId } : {}),
    ...extra,
  });
}

const entregar = (assetId: string, userId: string) =>
  supervisor.post<PosseView[] & { detail?: string }>(`/assets/${assetId}/posse`, { userId });

// ---------------------------------------------------------------------

describe('o equipamento tem dono de carteira', () => {
  it('nasce da empresa escolhida, e sem escolha é da casa', async () => {
    const doCliente = await criarAtivo(joao.id);
    assert.equal(doCliente.status, 201, JSON.stringify(doCliente.corpo));
    assert.equal(doCliente.corpo.client?.id, joao.id);
    assert.equal(doCliente.corpo.client?.name, 'Empresa do João');

    const daCasa = await criarAtivo(null);
    assert.equal(daCasa.status, 201, JSON.stringify(daCasa.corpo));
    assert.equal(daCasa.corpo.client, null);
  });

  it('empresa de outra organização não entra pelo corpo da requisição', async () => {
    const alheia = await prisma.client.create({
      data: {
        organizationId: f.outra.id,
        name: 'Empresa da outra organização',
        emailDomain: 'outra-org.com.br',
      },
    });

    const r = await criarAtivo(alheia.id);
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('a busca separa o parque de cada empresa, e o que é da casa', async () => {
    const doCliente = await criarAtivo(joao.id);
    const daCasa = await criarAtivo(null);

    const dele = await supervisor.get<AssetView[]>(`/assets?clientId=${joao.id}`);
    assert.equal(dele.status, 200);
    assert.ok(dele.corpo.every((a) => a.client?.id === joao.id));
    assert.ok(dele.corpo.some((a) => a.id === doCliente.corpo.id));
    assert.ok(!dele.corpo.some((a) => a.id === daCasa.corpo.id));

    const nossos = await supervisor.get<AssetView[]>('/assets?semCliente=true');
    assert.equal(nossos.status, 200);
    assert.ok(nossos.corpo.every((a) => a.client === null));
    assert.ok(nossos.corpo.some((a) => a.id === daCasa.corpo.id));

    // `semCliente=false` não pode significar "só os que têm": o filtro
    // é "traga todos", e `Boolean('false')` seria `true`.
    const todos = await supervisor.get<AssetView[]>('/assets?semCliente=false');
    assert.ok(
      todos.corpo.some((a) => a.client !== null) && todos.corpo.some((a) => a.client === null),
      'com `false` o filtro não recorta nada',
    );
  });
});

describe('o parque de cada empresa fecha sozinho', () => {
  it('periférico não pendura na máquina de outro cliente', async () => {
    const maquina = await criarAtivo(joao.id);

    const teclado = await criarAtivo(maria.id, {
      kind: 'PERIFERICO',
      parentAssetId: maquina.corpo.id,
    });

    assert.equal(teclado.status, 400, JSON.stringify(teclado.corpo));
    assert.match(teclado.corpo.detail ?? '', /de outra empresa/);
  });

  it('periférico da casa pendura em máquina de cliente, e vice-versa', async () => {
    const maquinaDoCliente = await criarAtivo(joao.id);
    const tecladoDaCasa = await criarAtivo(null, {
      kind: 'PERIFERICO',
      parentAssetId: maquinaDoCliente.corpo.id,
    });
    assert.equal(tecladoDaCasa.status, 201, JSON.stringify(tecladoDaCasa.corpo));

    const maquinaDaCasa = await criarAtivo(null);
    const tecladoDoCliente = await criarAtivo(joao.id, {
      kind: 'PERIFERICO',
      parentAssetId: maquinaDaCasa.corpo.id,
    });
    assert.equal(tecladoDoCliente.status, 201, JSON.stringify(tecladoDoCliente.corpo));
  });

  it('equipamento de um cliente não vai para o funcionário de outro', async () => {
    const maquina = await criarAtivo(joao.id);

    const r = await entregar(maquina.corpo.id, daMaria.id);
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /de outra empresa/);

    const certo = await entregar(maquina.corpo.id, doJoao.id);
    assert.equal(certo.status, 201, JSON.stringify(certo.corpo));
  });

  it('o técnico da casa leva a máquina do cliente, e o cliente recebe a da casa', async () => {
    const doCliente = await criarAtivo(joao.id);
    assert.equal((await entregar(doCliente.corpo.id, f.agente.id)).status, 201);

    const daCasa = await criarAtivo(null);
    assert.equal((await entregar(daCasa.corpo.id, doJoao.id)).status, 201);
  });
});

describe('trocar a empresa do equipamento', () => {
  it('é recusado enquanto houver periférico de outro cliente pendurado', async () => {
    const maquina = await criarAtivo(joao.id);
    await criarAtivo(joao.id, { kind: 'PERIFERICO', parentAssetId: maquina.corpo.id });

    const r = await supervisor.patch<{ detail?: string }>(`/assets/${maquina.corpo.id}`, {
      clientId: maria.id,
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /Despendure/);
  });

  it('é recusado enquanto estiver na mão de alguém de outro cliente', async () => {
    const maquina = await criarAtivo(joao.id);
    assert.equal((await entregar(maquina.corpo.id, doJoao.id)).status, 201);

    const r = await supervisor.patch<{ detail?: string }>(`/assets/${maquina.corpo.id}`, {
      clientId: maria.id,
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /devolução/);

    // Devolvido, a troca passa.
    assert.equal(
      (await supervisor.post(`/assets/${maquina.corpo.id}/devolver`, { returnedTo: 'EM_ESTOQUE' }))
        .status,
      201,
    );
    const depois = await supervisor.patch<AssetView>(`/assets/${maquina.corpo.id}`, {
      clientId: maria.id,
    });
    assert.equal(depois.status, 200, JSON.stringify(depois.corpo));
    assert.equal(depois.corpo.client?.id, maria.id);
  });

  it('passa quando quem está com ele é da casa', async () => {
    const maquina = await criarAtivo(joao.id);
    assert.equal((await entregar(maquina.corpo.id, f.agente.id)).status, 201);

    const r = await supervisor.patch<AssetView>(`/assets/${maquina.corpo.id}`, {
      clientId: maria.id,
    });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.client?.id, maria.id);
  });
});

describe('a empresa não some com o inventário junto', () => {
  it('a carteira recusa excluir empresa que tem equipamento', async () => {
    const empresa = await criarEmpresa('Empresa só com equipamento', 'so-equipamento.com.br');
    const ativo = await criarAtivo(empresa.id);

    const r = await supervisor.chamar<{ detail?: string }>('DELETE', `/clients/${empresa.id}`);
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /equipamento/);

    // E o banco também barra, para quem apagar por fora da aplicação.
    await assert.rejects(
      prisma.client.delete({ where: { id: empresa.id } }),
      /constraint|Foreign key/i,
    );

    await prisma.asset.delete({ where: { id: ativo.corpo.id } });
  });
});

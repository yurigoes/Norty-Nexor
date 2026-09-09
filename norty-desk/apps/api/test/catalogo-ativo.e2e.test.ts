import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AssetView,
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
  ProblemDetails,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O catálogo do ativo.
 *
 * O que se prova aqui e em nenhum outro lugar: o caminho da localização
 * é montado na leitura e sai inteiro ("Prédio A > 2º andar > Sala
 * 201"); uma localização não pode ficar dentro da própria descendência;
 * e o ativo passa a referenciar catálogo em vez de texto livre — que
 * era a origem de "HP", "hp" e "Hewlett-Packard" como três fabricantes.
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();
  // O catálogo é `ativo:catalogo`, que o supervisor tem via
  // `ativo:gerenciar`.
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

async function criarLocal(
  cliente: Cliente,
  name: string,
  parentId?: string,
): Promise<LocalizacaoView> {
  const r = await cliente.post<LocalizacaoView[]>('/locations', {
    name,
    ...(parentId ? { parentId } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const criada = r.corpo.find((l) => l.name === name && (l.parentId ?? undefined) === parentId);
  assert.ok(criada, `localização "${name}" não veio na resposta`);
  return criada;
}

// ---------------------------------------------------------------------

describe('localização em árvore', () => {
  it('o caminho sai inteiro, montado na leitura', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const predio = await criarLocal(supervisor, 'Prédio A');
    const andar = await criarLocal(supervisor, '2º andar', predio.id);
    const sala = await criarLocal(supervisor, 'Sala 201', andar.id);

    const lista = await supervisor.get<LocalizacaoView[]>('/locations');
    const encontrada = lista.corpo.find((l) => l.id === sala.id);

    assert.equal(encontrada?.path, 'Prédio A > 2º andar > Sala 201');
  });

  it('renomear o prédio muda o caminho de todas as filhas', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const predio = await criarLocal(supervisor, 'Prédio B');
    const sala = await criarLocal(supervisor, 'Recepção', predio.id);

    // Caminho gravado precisaria de uma varredura aqui. Montado na
    // leitura, ele já sai certo.
    const r = await supervisor.patch<LocalizacaoView[]>(`/locations/${predio.id}`, {
      name: 'Sede',
    });

    const atualizada = r.corpo.find((l) => l.id === sala.id);
    assert.equal(atualizada?.path, 'Sede > Recepção');
  });

  it('recusa pendurar uma localização na própria descendência', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const pai = await criarLocal(supervisor, 'Prédio C');
    const filha = await criarLocal(supervisor, 'Térreo', pai.id);

    const r = await supervisor.patch<ProblemDetails>(`/locations/${pai.id}`, {
      name: 'Prédio C',
      parentId: filha.id,
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /dentro de si mesma/);
  });

  it('nome repetido dentro do mesmo pai é 409; em pais diferentes passa', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const um = await criarLocal(supervisor, 'Prédio D');
    const outro = await criarLocal(supervisor, 'Prédio E');

    await criarLocal(supervisor, 'Almoxarifado', um.id);

    const repetida = await supervisor.post<ProblemDetails>('/locations', {
      name: 'Almoxarifado',
      parentId: um.id,
    });
    assert.equal(repetida.status, 409);

    // Mesmo nome em prédio diferente é outro lugar, e passa.
    const noOutro = await supervisor.post('/locations', {
      name: 'Almoxarifado',
      parentId: outro.id,
    });
    assert.equal(noOutro.status, 201);
  });

  it('nome repetido no nível mais alto é 409, mesmo com o pai nulo dos dois lados', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    await criarLocal(supervisor, 'Filial Norte');

    // Para o Postgres dois `NULL` são distintos, então o `@@unique` do
    // banco deixa passar: duas "Filial Norte" na raiz, sem nada que as
    // distinga na tela.
    const r = await supervisor.post<ProblemDetails>('/locations', { name: 'Filial Norte' });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
  });

  it('nome que só muda de caixa é 409 — é o problema que o catálogo resolve', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const predio = await criarLocal(supervisor, 'Anexo');
    await criarLocal(supervisor, 'Recepção', predio.id);

    const local = await supervisor.post<ProblemDetails>('/locations', {
      name: 'RECEPÇÃO',
      parentId: predio.id,
    });
    assert.equal(local.status, 409, JSON.stringify(local.corpo));

    await supervisor.post('/manufacturers', { name: 'Samsung' });
    const fabricante = await supervisor.post<ProblemDetails>('/manufacturers', {
      name: 'samsung',
    });
    assert.equal(fabricante.status, 409, JSON.stringify(fabricante.corpo));

    await supervisor.post('/asset-models', { name: 'Odyssey G5' });
    const modelo = await supervisor.post<ProblemDetails>('/asset-models', {
      name: 'odyssey g5',
    });
    assert.equal(modelo.status, 409, JSON.stringify(modelo.corpo));
  });

  it('recusa apagar localização que ainda tem sublocalização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const pai = await criarLocal(supervisor, 'Prédio F');
    await criarLocal(supervisor, 'Subsolo', pai.id);

    const r = await supervisor.del<ProblemDetails>(`/locations/${pai.id}`);
    assert.equal(r.status, 409);
    assert.match(r.corpo.title, /sublocalizações/);
  });
});

describe('fabricante e modelo', () => {
  it('um modelo com discriminador, não uma tabela por tipo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const fabricantes = await supervisor.post<FabricanteView[]>('/manufacturers', {
      name: 'Dell',
    });
    assert.equal(fabricantes.status, 201, JSON.stringify(fabricantes.corpo));
    const dell = fabricantes.corpo.find((x) => x.name === 'Dell');
    assert.ok(dell);

    const notebook = await supervisor.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'Latitude 5440',
      kind: 'COMPUTADOR',
      manufacturerId: dell.id,
    });
    assert.equal(notebook.status, 201);

    const monitor = await supervisor.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'P2419H',
      kind: 'MONITOR',
      manufacturerId: dell.id,
    });
    assert.equal(monitor.status, 201);

    // Os dois tipos convivem na mesma tabela.
    const tipos = new Set(monitor.corpo.map((m) => m.kind));
    assert.ok(tipos.has('COMPUTADOR') && tipos.has('MONITOR'));
  });

  it('renomear o fabricante corrige a grafia sem soltar os modelos', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const criados = await supervisor.post<FabricanteView[]>('/manufacturers', {
      name: 'Hewlett Packard Enterprise',
    });
    const hpe = criados.corpo.find((x) => x.name === 'Hewlett Packard Enterprise');
    assert.ok(hpe);

    await supervisor.post('/asset-models', { name: 'ProLiant DL360', manufacturerId: hpe.id });

    const r = await supervisor.patch<FabricanteView[]>(`/manufacturers/${hpe.id}`, { name: 'HPE' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const renomeado = r.corpo.find((x) => x.id === hpe.id);
    assert.equal(renomeado?.name, 'HPE');
    // O modelo continua pendurado: renomear é corrigir grafia, não
    // trocar de fabricante.
    assert.equal(renomeado?.modelCount, 1);
  });

  it('recusa apagar fabricante que ainda tem modelo, e aceita depois', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const criados = await supervisor.post<FabricanteView[]>('/manufacturers', { name: 'Positivo' });
    const marca = criados.corpo.find((x) => x.name === 'Positivo');
    assert.ok(marca);

    const modelos = await supervisor.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'Master D',
      manufacturerId: marca.id,
    });
    const modelo = modelos.corpo.find((m) => m.name === 'Master D');
    assert.ok(modelo);

    // Modelo sem fabricante é modelo órfão: "Master D" sozinho não diz
    // de quem é.
    const recusa = await supervisor.del<ProblemDetails>(`/manufacturers/${marca.id}`);
    assert.equal(recusa.status, 409);

    assert.equal((await supervisor.del(`/asset-models/${modelo.id}`)).status, 200);

    const depois = await supervisor.del<FabricanteView[]>(`/manufacturers/${marca.id}`);
    assert.equal(depois.status, 200);
    assert.ok(!depois.corpo.some((x) => x.id === marca.id));
  });

  it('apagar o modelo deixa o ativo sem modelo, não apaga o ativo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const modelos = await supervisor.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'ThinkCentre M70q',
      kind: 'COMPUTADOR',
    });
    const modelo = modelos.corpo.find((m) => m.name === 'ThinkCentre M70q');
    assert.ok(modelo);

    const ativo = await supervisor.post<AssetView>('/assets', {
      name: 'Máquina do balcão',
      assetModelId: modelo.id,
    });
    assert.equal(ativo.status, 201, JSON.stringify(ativo.corpo));

    assert.equal((await supervisor.del(`/asset-models/${modelo.id}`)).status, 200);

    const depois = await supervisor.get<AssetView>(`/assets/${ativo.corpo.id}`);
    assert.equal(depois.status, 200);
    assert.equal(depois.corpo.assetModel, null);
  });

  it('editar o modelo troca o tipo e o fabricante', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const fabricantes = await supervisor.post<FabricanteView[]>('/manufacturers', {
      name: 'Epson',
    });
    const epson = fabricantes.corpo.find((x) => x.name === 'Epson');
    assert.ok(epson);

    const criados = await supervisor.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'L3250',
      kind: 'OUTRO',
    });
    const modelo = criados.corpo.find((m) => m.name === 'L3250');
    assert.ok(modelo);

    const r = await supervisor.patch<ModeloDeAtivoView[]>(`/asset-models/${modelo.id}`, {
      name: 'EcoTank L3250',
      kind: 'IMPRESSORA',
      manufacturerId: epson.id,
    });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const editado = r.corpo.find((m) => m.id === modelo.id);
    assert.equal(editado?.name, 'EcoTank L3250');
    assert.equal(editado?.kind, 'IMPRESSORA');
    assert.equal(editado?.manufacturer?.name, 'Epson');
  });

  it('fabricante repetido é 409', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    await supervisor.post('/manufacturers', { name: 'Lenovo' });

    const r = await supervisor.post<ProblemDetails>('/manufacturers', { name: 'Lenovo' });
    assert.equal(r.status, 409);
  });
});

describe('o ativo referencia o catálogo', () => {
  it('grava as referências e devolve o caminho da localização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const predio = await criarLocal(supervisor, 'Matriz');
    const sala = await criarLocal(supervisor, 'TI', predio.id);

    const fabricantes = await supervisor.post<FabricanteView[]>('/manufacturers', { name: 'HP' });
    const hp = fabricantes.corpo.find((x) => x.name === 'HP')!;

    const modelos = await supervisor.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'LaserJet Pro',
      kind: 'IMPRESSORA',
      manufacturerId: hp.id,
    });
    const laserjet = modelos.corpo.find((m) => m.name === 'LaserJet Pro')!;

    const r = await supervisor.post<AssetView>('/assets', {
      name: 'Impressora da TI',
      kind: 'IMPRESSORA',
      manufacturerId: hp.id,
      assetModelId: laserjet.id,
      locationId: sala.id,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.manufacturer?.name, 'HP');
    assert.equal(r.corpo.assetModel?.name, 'LaserJet Pro');
    assert.equal(r.corpo.location?.path, 'Matriz > TI');
  });

  it('a busca acha o ativo pelo nome do modelo e pela localização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const r = await supervisor.get<AssetView[]>('/assets?q=LaserJet');
    assert.ok(r.corpo.some((a) => a.assetModel?.name === 'LaserJet Pro'));

    const porLocal = await supervisor.get<AssetView[]>('/assets?q=TI');
    assert.ok(porLocal.corpo.some((a) => a.location?.name === 'TI'));
  });

  it('recusa referência de outra organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const outra = await prisma.location.create({
      data: { organizationId: f.outra.id, name: 'Prédio de fora' },
    });

    const r = await supervisor.post<ProblemDetails>('/assets', {
      name: 'Ativo com local alheio',
      locationId: outra.id,
    });

    assert.equal(r.status, 404);
  });

  it('apagar a localização deixa o ativo sem local, não apaga o ativo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const local = await criarLocal(supervisor, 'Depósito temporário');
    const ativo = await supervisor.post<AssetView>('/assets', {
      name: 'Monitor sobressalente',
      locationId: local.id,
    });
    assert.equal(ativo.status, 201);

    assert.equal((await supervisor.del(`/locations/${local.id}`)).status, 200);

    const depois = await supervisor.get<AssetView>(`/assets/${ativo.corpo.id}`);
    assert.equal(depois.status, 200);
    assert.equal(depois.corpo.location, null);
  });

  it('o agente lê o catálogo mas não mexe nele', async () => {
    const agente = await entrar('agente@teste.dev');

    assert.equal((await agente.get('/locations')).status, 200);
    assert.equal((await agente.get('/manufacturers')).status, 200);
    assert.equal((await agente.post('/manufacturers', { name: 'Acer' })).status, 403);
  });
});

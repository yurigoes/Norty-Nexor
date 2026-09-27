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

/**
 * O dicionário de apelidos.
 *
 * O ativo referenciar catálogo resolveu o texto livre, mas não resolveu
 * o texto **certo escrito de outro jeito**: o agente de inventário
 * manda o que o SMBIOS tiver, e "Dell Inc.", "DELL", "Hewlett-Packard"
 * e "HP" chegam de máquinas diferentes da mesma frota. Sem dicionário
 * cada grafia vira uma linha, e o relatório de parque por fabricante —
 * que é a razão de o campo existir — conta a mesma empresa quatro
 * vezes.
 *
 * Três camadas, e cada uma tem prova própria aqui: a chave do texto, a
 * lista de fabricantes conhecidos, e o que a casa ensinou.
 */
describe('o dicionário de fabricante', () => {
  let curador: Cliente;

  before(async () => {
    curador = await entrar('supervisor@teste.dev');
  });

  async function cadastrar(name: string) {
    return curador.post<FabricanteView[] & { detail?: string }>('/manufacturers', { name });
  }

  function achar(lista: FabricanteView[], nome: string) {
    return lista.find((x) => x.name === nome);
  }

  it('a forma jurídica não distingue fabricante: "Acme Ltda" já é "Acme"', async () => {
    const primeiro = await cadastrar('Vertex Componentes Ltda');
    assert.equal(primeiro.status, 201, JSON.stringify(primeiro.corpo));

    const repetido = await cadastrar('VERTEX COMPONENTES');
    assert.equal(repetido.status, 409, 'o mesmo fabricante entrou duas vezes');
    assert.match(
      (repetido.corpo as unknown as ProblemDetails).detail ?? '',
      /Vertex Componentes Ltda/,
      'a recusa precisa dizer qual cadastro já responde por esse nome',
    );
  });

  it('"Hewlett-Packard" e "HP Inc." não viram cadastros novos ao lado da HP', async () => {
    // Os testes acima desta suíte já cadastraram HP e HPE; o que se
    // prova aqui não é quem chegou primeiro, e sim que as grafias não
    // multiplicam a linha. Nenhuma regra de texto descobre sozinha que
    // "Hewlett-Packard" é HP: isso vem da lista de conhecidos.
    assert.equal((await cadastrar('Hewlett-Packard')).status, 409);
    assert.equal((await cadastrar('HP Inc.')).status, 409);
    assert.equal((await cadastrar('hewlett packard company')).status, 409);

    const lista = await curador.get<FabricanteView[]>('/manufacturers');
    const daFamilia = lista.corpo.filter((x) => /^(hp|hewlett)/i.test(x.name));

    // HP e HPE são duas empresas desde 2015, e quem tem servidor e
    // desktop da antiga HP precisa das duas separadas. Duas linhas é o
    // certo aqui; três seria a sujeira de volta.
    assert.deepEqual(
      daFamilia.map((x) => x.name).sort(),
      ['HP', 'HPE'],
      JSON.stringify(lista.corpo.map((x) => x.name)),
    );
  });

  it('a HPE não é alcançada pelas grafias da HP', async () => {
    assert.equal(
      (await cadastrar('Hewlett Packard Enterprise Company')).status,
      409,
      'a grafia longa da HPE tem de cair na HPE que já existe',
    );
  });

  it('o apelido que a casa ensina passa a valer', async () => {
    const criado = await cadastrar('Quasar Distribuidora');
    const quasar = achar(criado.corpo, 'Quasar Distribuidora')!;

    const apelidado = await curador.post<FabricanteView[]>(
      `/manufacturers/${quasar.id}/apelidos`,
      { alias: 'QSR Comercial' },
    );
    assert.equal(apelidado.status, 201, JSON.stringify(apelidado.corpo));
    assert.deepEqual(
      achar(apelidado.corpo, 'Quasar Distribuidora')?.aliases.map((a) => a.alias),
      ['qsr comercial'],
    );

    // E agora "QSR Comercial" não entra como cadastro novo.
    const tentativa = await cadastrar('QSR Comercial S/A');
    assert.equal(tentativa.status, 409, 'o apelido não estava sendo consultado no cadastro');
  });

  it('apelido que já é de outro fabricante é recusado, e diz de quem', async () => {
    const lista = await curador.get<FabricanteView[]>('/manufacturers');
    const quasar = achar(lista.corpo, 'Quasar Distribuidora')!;
    const vertex = achar(lista.corpo, 'Vertex Componentes Ltda')!;

    const r = await curador.post<ProblemDetails>(`/manufacturers/${vertex.id}/apelidos`, {
      alias: 'QSR',
    });
    assert.equal(r.status, 201, 'QSR sozinho ainda é livre');

    const colisao = await curador.post<ProblemDetails>(`/manufacturers/${vertex.id}/apelidos`, {
      alias: 'Quasar Distribuidora',
    });
    assert.equal(colisao.status, 409);
    assert.match(colisao.corpo.detail ?? '', /Quasar Distribuidora/);
    assert.ok(quasar);
  });

  it('o nome do próprio fabricante não se apaga como se fosse apelido', async () => {
    const lista = await curador.get<FabricanteView[]>('/manufacturers');
    const quasar = achar(lista.corpo, 'Quasar Distribuidora')!;

    const proprio = await prisma.manufacturerAlias.findFirstOrThrow({
      where: { manufacturerId: quasar.id, alias: 'quasar distribuidora' },
    });

    const r = await curador.del<ProblemDetails>(
      `/manufacturers/${quasar.id}/apelidos/${proprio.id}`,
    );
    assert.equal(r.status, 409, 'apagar a chave do próprio nome recria o cadastro na varredura');
  });

  it('renomear guarda o nome velho: a máquina varrida não recria o cadastro', async () => {
    const criado = await cadastrar('Zeta Informatica');
    const zeta = achar(criado.corpo, 'Zeta Informatica')!;

    const renomeado = await curador.patch<FabricanteView[]>(`/manufacturers/${zeta.id}`, {
      name: 'Zeta',
    });
    assert.equal(renomeado.status, 200, JSON.stringify(renomeado.corpo));

    const depois = achar(renomeado.corpo, 'Zeta')!;
    assert.ok(
      depois.aliases.some((a) => a.alias === 'zeta informatica'),
      'o nome velho tem de continuar valendo — as máquinas não sabem que houve renomeação',
    );
  });
});

/**
 * Juntar dois cadastros que são a mesma empresa.
 *
 * É o caminho de saída da sujeira que **já está** no banco: o dicionário
 * impede a duplicata nova, e quem já tem "HP" e "Hewlett-Packard"
 * precisa de uma porta. Sem ela o dicionário só serviria para instalação
 * nova.
 */
describe('juntar fabricantes duplicados', () => {
  let curador: Cliente;

  before(async () => {
    curador = await entrar('supervisor@teste.dev');
  });

  it('tudo o que era do absorvido passa a ser do que fica, e o nome dele vira apelido', async () => {
    // Cadastrados por baixo, como estariam num banco anterior ao
    // dicionário: sem apelido nenhum.
    const fica = await prisma.manufacturer.create({
      data: { organizationId: f.organizacao.id, name: 'Órion' },
    });
    const sai = await prisma.manufacturer.create({
      data: { organizationId: f.organizacao.id, name: 'Orion Eletronica' },
    });

    const modeloDele = await prisma.assetModel.create({
      data: { organizationId: f.organizacao.id, manufacturerId: sai.id, name: 'OE-200' },
    });
    const ativo = await prisma.asset.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Máquina do absorvido',
        kind: 'COMPUTADOR',
        manufacturerId: sai.id,
        assetModelId: modeloDele.id,
      },
    });

    const r = await curador.post<FabricanteView[]>(`/manufacturers/${fica.id}/juntar`, {
      absorvidoId: sai.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal(
      await prisma.manufacturer.count({ where: { id: sai.id } }),
      0,
      'o absorvido continua no catálogo',
    );

    const depoisDoAtivo = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id } });
    assert.equal(depoisDoAtivo.manufacturerId, fica.id, 'o ativo ficou apontando para o nada');

    const depoisDoModelo = await prisma.assetModel.findUniqueOrThrow({
      where: { id: modeloDele.id },
    });
    assert.equal(depoisDoModelo.manufacturerId, fica.id, 'o modelo ficou órfão');

    // E o nome do absorvido continua respondendo: a máquina que dizia
    // "Orion Eletronica" não pode recriar o cadastro na próxima
    // varredura.
    const apelidos = await prisma.manufacturerAlias.findMany({
      where: { manufacturerId: fica.id },
      select: { alias: true },
    });
    const chaves = apelidos.map((a) => a.alias);
    assert.ok(chaves.includes('orion eletronica'), JSON.stringify(chaves));
    assert.ok(chaves.includes('orion'), 'a chave do que fica também precisa estar gravada');
  });

  it('modelo repetido dos dois lados vira um, e os ativos seguem para ele', async () => {
    const fica = await prisma.manufacturer.create({
      data: { organizationId: f.organizacao.id, name: 'Nadir' },
    });
    const sai = await prisma.manufacturer.create({
      data: { organizationId: f.organizacao.id, name: 'Nadir Industria' },
    });

    const meu = await prisma.assetModel.create({
      data: { organizationId: f.organizacao.id, manufacturerId: fica.id, name: 'ND-10' },
    });
    const dele = await prisma.assetModel.create({
      data: { organizationId: f.organizacao.id, manufacturerId: sai.id, name: 'nd-10' },
    });

    const ativo = await prisma.asset.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Máquina do modelo repetido',
        kind: 'COMPUTADOR',
        manufacturerId: sai.id,
        assetModelId: dele.id,
      },
    });

    const r = await curador.post<FabricanteView[]>(`/manufacturers/${fica.id}/juntar`, {
      absorvidoId: sai.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    // "ND-10" e "nd-10" sob o mesmo fabricante seriam duas linhas
    // iguais, e o índice único recusaria a junção inteira.
    assert.equal(await prisma.assetModel.count({ where: { id: dele.id } }), 0);

    const depois = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id } });
    assert.equal(depois.assetModelId, meu.id, 'o ativo perdeu o modelo na junção');
  });

  it('não junta consigo mesmo nem com fabricante de outra organização', async () => {
    const lista = await curador.get<FabricanteView[]>('/manufacturers');
    const algum = lista.corpo[0]!;

    assert.equal(
      (await curador.post(`/manufacturers/${algum.id}/juntar`, { absorvidoId: algum.id })).status,
      400,
    );

    const outraOrg = await prisma.organization.create({
      data: { name: 'Outra casa', slug: `outra-${Date.now()}` },
    });
    const alheio = await prisma.manufacturer.create({
      data: { organizationId: outraOrg.id, name: 'Fabricante alheio' },
    });

    assert.equal(
      (await curador.post(`/manufacturers/${algum.id}/juntar`, { absorvidoId: alheio.id })).status,
      404,
      'juntar com o catálogo de outra organização é vazamento entre casas',
    );
  });
});

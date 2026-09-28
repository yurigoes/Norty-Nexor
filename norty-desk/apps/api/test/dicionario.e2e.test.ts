import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  InventarioRequest,
  InventarioResponse,
  ModeloDeAtivoView,
  ReclassificacaoView,
  RegraDeSistemaView,
  SistemasDoParqueView,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Dicionário de modelo e de sistema operacional.
 *
 * O dicionário de fabricante já provava que "Hewlett-Packard" e "HP" são
 * a mesma empresa. Faltavam os outros dois campos que o SMBIOS suja do
 * mesmo jeito, e por motivos diferentes:
 *
 * 1. **Modelo.** O fabricante vem colado na frente ("HP EliteBook 840 G8
 *    Notebook PC"), o sufixo de gabinete não distingue nada, e a
 *    montadora de máquina branca não preenche o campo — manda "System
 *    Product Name", que virava um modelo do catálogo.
 * 2. **Sistema operacional.** `Caption` é um texto só para duas
 *    perguntas: qual produto e qual edição. Sem separá-las, "quantas
 *    máquinas ainda estão no Windows 10?" não sai de um `where`.
 *
 * E o que nenhuma regra de texto resolve, nos dois casos: a Lenovo manda
 * código de máquina no lugar do nome do produto, e o Windows instalado
 * em francês diz "Professionnel". Para esses existe a tabela — alguém
 * que sabe ensina uma vez.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;
let chave = '';

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);

  const criada = await admin.post<{ chave: string }>('/api-keys', {
    name: 'Agente do dicionário',
    scopes: ['inventario:enviar'],
  });
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
  chave = criada.corpo.chave;
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

let sequencia = 0;

async function varrer(
  extra: Partial<InventarioRequest> = {},
): Promise<{ status: number; corpo: InventarioResponse & { detail?: string } }> {
  sequencia += 1;

  const corpo: InventarioRequest = {
    uuid: `d1c10na-r10-0000-0000-${String(sequencia).padStart(12, '0')}`,
    hostname: `DIC-${sequencia}`,
    serialNumber: `DIC${sequencia}X`,
    manufacturer: 'Dell Inc.',
    model: 'Latitude 5420',
    kind: 'COMPUTADOR',
    os: { name: 'Microsoft Windows 11 Pro', version: '10.0.22631' },
    agente: { versao: '2.0.0' },
    ...extra,
  };

  const resposta = await fetch(`${api.url}/intake/inventario`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

/** O modelo de um equipamento, direto do banco. */
async function modeloDe(assetId: string): Promise<{ name: string; fabricante: string | null }> {
  const ativo = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: { assetModel: { select: { name: true, manufacturer: { select: { name: true } } } } },
  });

  return {
    name: ativo.assetModel?.name ?? '',
    fabricante: ativo.assetModel?.manufacturer?.name ?? null,
  };
}

// ---------------------------------------------------------------------

describe('o modelo que vem com o fabricante colado', () => {
  it('cai no mesmo cadastro de quem escreveu só o modelo', async () => {
    // O que a HP manda de verdade: `Manufacturer` = "Hewlett-Packard" e
    // `Model` = "HP EliteBook 840 G8 Notebook PC". E o que o técnico
    // digita na tela: "EliteBook 840 G8".
    const daHp = await varrer({
      manufacturer: 'Hewlett-Packard',
      model: 'HP EliteBook 840 G8 Notebook PC',
    });
    assert.equal(daHp.status, 201, JSON.stringify(daHp.corpo));

    const outra = await varrer({ manufacturer: 'HP', model: 'EliteBook 840 G8' });
    assert.equal(outra.status, 201, JSON.stringify(outra.corpo));

    const [a, b] = await Promise.all([
      prisma.asset.findUniqueOrThrow({
        where: { id: daHp.corpo.assetId },
        select: { assetModelId: true },
      }),
      prisma.asset.findUniqueOrThrow({
        where: { id: outra.corpo.assetId },
        select: { assetModelId: true },
      }),
    ]);

    assert.ok(a.assetModelId);
    assert.equal(a.assetModelId, b.assetModelId, 'duas grafias, um modelo');
  });

  it('guarda o nome sem repetir o fabricante', async () => {
    const varrida = await varrer({
      manufacturer: 'ASUS',
      model: 'ASUS ExpertBook B1500 Notebook PC',
    });
    assert.equal(varrida.status, 201);

    const modelo = await modeloDe(varrida.corpo.assetId);

    // Na tela o fabricante é coluna ao lado. "ASUS ASUS ExpertBook"
    // seria dizer duas vezes a mesma coisa.
    assert.ok(!modelo.name.startsWith('ASUS '), `nome ficou "${modelo.name}"`);
    assert.match(modelo.name, /ExpertBook B1500/);
  });

  it('nasce ligado ao fabricante, e não órfão', async () => {
    const varrida = await varrer({ manufacturer: 'Lenovo Group', model: 'ThinkCentre M70q' });
    assert.equal(varrida.status, 201);

    const modelo = await modeloDe(varrida.corpo.assetId);

    // Antes o modelo nascia sem fabricante mesmo com o fabricante
    // resolvido na mesma requisição, e alguém tinha de adivinhar depois.
    assert.equal(modelo.fabricante, 'Lenovo');
  });
});

describe('o campo de modelo que a montadora não preencheu', () => {
  it('não vira cadastro nenhum', async () => {
    for (const lixo of ['System Product Name', 'To Be Filled By O.E.M.', 'Default string']) {
      const varrida = await varrer({ manufacturer: 'Fabricante Branco', model: lixo });
      assert.equal(varrida.status, 201, JSON.stringify(varrida.corpo));

      const ativo = await prisma.asset.findUniqueOrThrow({
        where: { id: varrida.corpo.assetId },
        select: { assetModelId: true },
      });

      assert.equal(ativo.assetModelId, null, `"${lixo}" não deveria virar modelo`);
    }

    const sujos = await prisma.assetModel.findMany({
      where: {
        organizationId: f.organizacao.id,
        name: { in: ['System Product Name', 'To Be Filled By O.E.M.', 'Default string'] },
      },
    });

    assert.deepEqual(sujos, [], 'o catálogo não pode ter o nome de um campo vazio');
  });
});

describe('o código de máquina que a Lenovo manda', () => {
  it('sem dicionário, o código é o que vai para o catálogo', async () => {
    // `Win32_ComputerSystem.Model` na Lenovo devolve o código de
    // máquina, não o nome comercial. É o estado que justifica a tabela.
    const varrida = await varrer({ manufacturer: 'LENOVO', model: '20XW00AABR' });
    assert.equal(varrida.status, 201, JSON.stringify(varrida.corpo));

    const codigo = await modeloDe(varrida.corpo.assetId);
    assert.equal(codigo.name, '20XW00AABR');
  });

  it('ensinado antes da varredura, o código já cai no nome comercial', async () => {
    // O caminho limpo: a casa cadastra o equipamento e ensina o código
    // que as máquinas dela mandam. Nenhuma regra de texto descobre que
    // "21CB0000BR" é um ThinkPad E14 Gen 4 — só alguém que sabe.
    const criado = await admin.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'ThinkPad E14 Gen 4',
      kind: 'COMPUTADOR',
    });
    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    const thinkpad = criado.corpo.find((m) => m.name === 'ThinkPad E14 Gen 4');
    assert.ok(thinkpad);

    const ensinado = await admin.post<ModeloDeAtivoView[]>(
      `/asset-models/${thinkpad.id}/apelidos`,
      { alias: '21CB0000BR' },
    );
    assert.equal(ensinado.status, 201, JSON.stringify(ensinado.corpo));

    const varrida = await varrer({ manufacturer: 'LENOVO', model: '21CB0000BR' });
    assert.equal(varrida.status, 201, JSON.stringify(varrida.corpo));

    const resolvido = await modeloDe(varrida.corpo.assetId);
    assert.equal(resolvido.name, 'ThinkPad E14 Gen 4', 'o código tinha de cair no nome comercial');
  });

  it('mostra o apelido na tela, sem repetir a chave do próprio nome', async () => {
    const modelos = await admin.get<ModeloDeAtivoView[]>('/asset-models');
    assert.equal(modelos.status, 200);

    const thinkpad = modelos.corpo.find((m) => m.name === 'ThinkPad E14 Gen 4');
    assert.ok(thinkpad);

    // Todo modelo tem a chave do próprio nome; listá-la faria a tela
    // repetir o que já está na coluna ao lado. Interessa o que ele
    // responde **além** dela.
    assert.deepEqual(
      thinkpad.aliases.map((a) => a.alias),
      ['21cb0000br'],
    );
  });

  it('recusa ensinar um apelido que já é de outro modelo', async () => {
    const modelos = await admin.get<ModeloDeAtivoView[]>('/asset-models');
    const outro = modelos.corpo.find((m) => m.name.includes('ExpertBook'));
    assert.ok(outro, 'o ExpertBook do teste anterior');

    const recusado = await admin.post(`/asset-models/${outro.id}/apelidos`, {
      alias: '21CB0000BR',
    });

    assert.equal(recusado.status, 409, JSON.stringify(recusado.corpo));
    assert.match(
      (recusado.corpo as { detail?: string }).detail ?? '',
      /ThinkPad E14 Gen 4/,
      'a mensagem diz de quem é, senão não há o que fazer com ela',
    );
    assert.match(
      (recusado.corpo as { detail?: string }).detail ?? '',
      /junte os dois cadastros/,
      'e diz qual é a saída',
    );
  });

  it('não deixa cadastrar o modelo que o dicionário já resolve', async () => {
    // "EliteBook 840 G8 Notebook PC" é o mesmo que "EliteBook 840 G8",
    // que já existe. Deixar criar os dois é criar a duplicata que o
    // dicionário existe para impedir.
    const recusado = await admin.post('/asset-models', {
      name: 'EliteBook 840 G8 Notebook PC',
      kind: 'COMPUTADOR',
    });

    assert.equal(recusado.status, 409, JSON.stringify(recusado.corpo));
  });

  it('não deixa apagar a chave do próprio nome como se fosse apelido', async () => {
    const thinkpad = (await admin.get<ModeloDeAtivoView[]>('/asset-models')).corpo.find(
      (m) => m.name === 'ThinkPad E14 Gen 4',
    );
    assert.ok(thinkpad);

    const propria = await prisma.assetModelAlias.findFirstOrThrow({
      where: { assetModelId: thinkpad.id, alias: 'thinkpad e14 gen 4' },
    });

    const recusado = await admin.del(`/asset-models/${thinkpad.id}/apelidos/${propria.id}`);

    assert.equal(recusado.status, 400, JSON.stringify(recusado.corpo));
  });
});

describe('juntar dois cadastros do mesmo equipamento', () => {
  it('move os equipamentos e faz o nome do absorvido virar apelido', async () => {
    // A sujeira que já está no banco: alguém cadastrou "Optiplex 7090" a
    // mão antes de o dicionário existir, e a varredura criou "OptiPlex
    // 7090 Tower" por outro caminho.
    const naMao = await prisma.assetModel.create({
      data: { organizationId: f.organizacao.id, name: 'Optiplex 7090 SFF', kind: 'COMPUTADOR' },
      select: { id: true },
    });

    const varrida = await varrer({ manufacturer: 'Dell', model: 'OptiPlex 7090 Tower' });
    assert.equal(varrida.status, 201);

    const doAgente = await prisma.asset.findUniqueOrThrow({
      where: { id: varrida.corpo.assetId },
      select: { assetModelId: true },
    });
    assert.ok(doAgente.assetModelId);

    const juntado = await admin.post<ModeloDeAtivoView[]>(
      `/asset-models/${doAgente.assetModelId}/juntar`,
      { absorvidoId: naMao.id },
    );
    assert.equal(juntado.status, 201, JSON.stringify(juntado.corpo));

    const sobrou = await prisma.assetModel.findUnique({ where: { id: naMao.id } });
    assert.equal(sobrou, null, 'o absorvido sai');

    // E o nome dele vira apelido: senão a próxima varredura de uma
    // máquina que diga "Optiplex 7090 SFF" recriaria o cadastro.
    const apelidos = await prisma.assetModelAlias.findMany({
      where: { assetModelId: doAgente.assetModelId },
      select: { alias: true },
    });

    assert.ok(
      apelidos.some((a) => a.alias.includes('optiplex 7090 sff')),
      `apelidos: ${apelidos.map((a) => a.alias).join(', ')}`,
    );
  });

  it('recusa juntar um modelo com ele mesmo', async () => {
    const modelos = await admin.get<ModeloDeAtivoView[]>('/asset-models');
    const algum = modelos.corpo[0];
    assert.ok(algum);

    const recusado = await admin.post(`/asset-models/${algum.id}/juntar`, {
      absorvidoId: algum.id,
    });

    assert.equal(recusado.status, 400, JSON.stringify(recusado.corpo));
  });
});

describe('o sistema operacional', () => {
  it('separa produto de edição na gravação', async () => {
    const varrida = await varrer({ os: { name: 'Microsoft Windows 11 Pro', version: '10.0.22631' } });
    assert.equal(varrida.status, 201);

    const ativo = await prisma.asset.findUniqueOrThrow({
      where: { id: varrida.corpo.assetId },
      select: { osName: true, osProduct: true, osEdition: true },
    });

    // O caption cru fica: é o diagnóstico de quando a classificação
    // errar. O que o relatório agrupa são as colunas ao lado.
    assert.equal(ativo.osName, 'Microsoft Windows 11 Pro');
    assert.equal(ativo.osProduct, 'Windows 11');
    assert.equal(ativo.osEdition, 'Pro');
  });

  it('conta como um só produto o que só difere na grafia do caption', async () => {
    // As duas máquinas dizem a mesma coisa de dois jeitos. Antes eram
    // duas linhas em qualquer agrupamento por `osName`.
    await varrer({ os: { name: 'Microsoft Windows 10 Pro', version: '10.0.19045' } });
    await varrer({ os: { name: 'Windows 10 Professional', version: '10.0.19045' } });

    const parque = await admin.get<SistemasDoParqueView>('/operating-systems');
    assert.equal(parque.status, 200, JSON.stringify(parque.corpo));

    const dez = parque.corpo.porProduto.filter((p) => p.product === 'Windows 10');

    assert.equal(dez.length, 1, `deveria ser uma linha só: ${JSON.stringify(dez)}`);
    assert.equal(dez[0]?.edition, 'Pro');
    assert.ok(dez[0]!.assetCount >= 2);
  });

  it('mostra os captions crus, que é de onde sai o que vale ensinar', async () => {
    const parque = await admin.get<SistemasDoParqueView>('/operating-systems');

    const captions = parque.corpo.captions.map((c) => c.osName);

    // Não dá para ensinar o que ninguém sabe que existe.
    assert.ok(captions.includes('Windows 10 Professional'), JSON.stringify(captions));
    assert.ok(parque.corpo.captions.every((c) => !c.ensinado), 'ainda não se ensinou nada');
  });
});

describe('o caption que só quem sabe classifica', () => {
  it('passa a valer depois de ensinado, e o parque já varrido muda junto', async () => {
    // A máquina instalada em francês. Nenhuma regra de texto descobre
    // que "Professionnel" é Pro.
    const varrida = await varrer({
      os: { name: 'Microsoft Windows 10 Professionnel', version: '10.0.19045' },
    });
    assert.equal(varrida.status, 201);

    const antes = await prisma.asset.findUniqueOrThrow({
      where: { id: varrida.corpo.assetId },
      select: { osProduct: true, osEdition: true },
    });

    // A função pura acerta o produto — "Windows 10" está lá em letra
    // clara — e erra a edição, que é a palavra que ela não conhece.
    assert.equal(antes.osProduct, 'Windows 10');
    assert.equal(antes.osEdition, 'Professionnel');

    const ensinado = await admin.post<RegraDeSistemaView[]>('/operating-systems/regras', {
      caption: 'Microsoft Windows 10 Professionnel',
      product: 'Windows 10',
      edition: 'Pro',
    });
    assert.equal(ensinado.status, 201, JSON.stringify(ensinado.corpo));

    // **A máquina já varrida muda junto.** Ensinar sem reclassificar
    // seria ensinar para nada: a próxima varredura pode demorar dias, ou
    // nunca vir se a máquina saiu de operação.
    const depois = await prisma.asset.findUniqueOrThrow({
      where: { id: varrida.corpo.assetId },
      select: { osProduct: true, osEdition: true },
    });

    assert.equal(depois.osEdition, 'Pro', 'a regra tinha de valer para quem já estava lá');
    assert.equal(depois.osProduct, 'Windows 10');
  });

  it('a regra da casa vence a função, e não o contrário', async () => {
    // O caso que prova a ordem: um caption que a função classifica bem,
    // reescrito de propósito. Se a função vencesse, a casa não teria
    // como corrigir nada.
    const varrida = await varrer({
      os: { name: 'Microsoft Windows Server 2019 Standard', version: '10.0.17763' },
    });
    assert.equal(varrida.status, 201);

    const ensinado = await admin.post<RegraDeSistemaView[]>('/operating-systems/regras', {
      caption: 'Microsoft Windows Server 2019 Standard',
      product: 'Windows Server 2019',
      edition: 'Standard (contrato Acme)',
    });
    assert.equal(ensinado.status, 201, JSON.stringify(ensinado.corpo));

    const ativo = await prisma.asset.findUniqueOrThrow({
      where: { id: varrida.corpo.assetId },
      select: { osEdition: true },
    });

    assert.equal(ativo.osEdition, 'Standard (contrato Acme)');

    // E a varredura seguinte também obedece à regra, não à função.
    const outra = await varrer({
      os: { name: 'Microsoft Windows Server 2019 Standard', version: '10.0.17763' },
    });
    assert.equal(outra.status, 201);

    const nova = await prisma.asset.findUniqueOrThrow({
      where: { id: outra.corpo.assetId },
      select: { osEdition: true },
    });

    assert.equal(nova.osEdition, 'Standard (contrato Acme)');
  });

  it('conta quantas máquinas cada regra está classificando', async () => {
    const regras = await admin.get<RegraDeSistemaView[]>('/operating-systems/regras');
    assert.equal(regras.status, 200);

    const francesa = regras.corpo.find((r) => r.alias.includes('professionnel'));
    assert.ok(francesa, JSON.stringify(regras.corpo.map((r) => r.alias)));
    assert.equal(francesa.assetCount, 1);
    assert.equal(francesa.edition, 'Pro');
  });

  it('apagar a regra devolve o parque ao que a função diz', async () => {
    const regras = await admin.get<RegraDeSistemaView[]>('/operating-systems/regras');
    const francesa = regras.corpo.find((r) => r.alias.includes('professionnel'));
    assert.ok(francesa);

    const apagada = await admin.del<RegraDeSistemaView[]>(
      `/operating-systems/regras/${francesa.id}`,
    );
    assert.equal(apagada.status, 200, JSON.stringify(apagada.corpo));

    // Sem reclassificar, o parque ficaria com o resultado de uma regra
    // que não existe mais — pior que estar errado, porque não há de onde
    // vir a explicação.
    const ativo = await prisma.asset.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, osName: 'Microsoft Windows 10 Professionnel' },
      select: { osEdition: true },
    });

    assert.equal(ativo.osEdition, 'Professionnel');
  });
});

describe('reclassificar o parque', () => {
  it('preenche o que a migração deixou nulo', async () => {
    // A migração criou as colunas vazias de propósito: reduzir caption a
    // produto é função de `packages/shared`, e fazê-lo em SQL daria uma
    // segunda verdade. Quem preenche é esta porta.
    await prisma.asset.updateMany({
      where: { organizationId: f.organizacao.id },
      data: { osProduct: null, osEdition: null },
    });

    const rodado = await admin.post<ReclassificacaoView>('/operating-systems/reclassificar', {});
    assert.equal(rodado.status, 201, JSON.stringify(rodado.corpo));
    assert.ok(rodado.corpo.mudados > 0, 'tinha o que preencher');
    assert.equal(rodado.corpo.lidos >= rodado.corpo.mudados, true);

    const semClassificacao = await prisma.asset.count({
      where: { organizationId: f.organizacao.id, osName: { not: null }, osProduct: null },
    });

    assert.equal(semClassificacao, 0);
  });

  it('não reescreve linha que já está certa', async () => {
    // A varredura é do parque todo. Reescrever linha idêntica é
    // `UPDATE` que o Postgres paga sem ninguém ganhar nada.
    const segunda = await admin.post<ReclassificacaoView>('/operating-systems/reclassificar', {});

    assert.equal(segunda.status, 201);
    assert.equal(segunda.corpo.mudados, 0, 'nada mudou entre as duas chamadas');
    assert.ok(segunda.corpo.lidos > 0, 'mas leu o parque');
  });
});

describe('quem pode mexer no dicionário', () => {
  it('não é quem só lê o inventário', async () => {
    const agente = new Cliente(api.url);
    assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

    // Ler o parque é leitura de inventário, e o agente lê.
    const leitura = await agente.get<SistemasDoParqueView>('/operating-systems');
    assert.equal(leitura.status, 200);

    // Escrever regra é configurar catálogo, e isso ele não faz. Esconder
    // o botão é conveniência; o guard é a proteção.
    const escrita = await agente.post('/operating-systems/regras', {
      caption: 'Qualquer coisa',
      product: 'Qualquer',
    });
    assert.equal(escrita.status, 403, JSON.stringify(escrita.corpo));

    const reclassificar = await agente.post('/operating-systems/reclassificar', {});
    assert.equal(reclassificar.status, 403);
  });
});

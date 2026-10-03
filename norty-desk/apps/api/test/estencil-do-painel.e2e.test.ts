import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, ModeloDeAtivoView, PainelDoAtivo, PainelDoModeloView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O estêncil: onde cada porta fica no painel do equipamento.
 *
 * É o `Stencil` do GLPI 11. O desenho em si é função pura, e tem teste
 * de unidade em `packages/shared/src/painel.test.ts` — grade, zona,
 * numeração e a leitura do número no nome da porta.
 *
 * O que se prova aqui, e em nenhum outro lugar:
 *
 * - **o painel mora no modelo e o equipamento o empresta.** É o que faz
 *   trinta switches iguais terem um desenho só;
 * - **as portas do equipamento caem nas posições certas**, pelo nome que
 *   o próprio equipamento dá a elas;
 * - **a porta que não tem lugar aparece de lado**, em vez de sumir — um
 *   desenho incompleto que parece completo é pior que nenhum;
 * - **o banco recusa painel impossível**, e não só o DTO.
 */

let f: Fixtura;
let api: Api;
let catalogo: Cliente;
let plantao: Cliente;

/** O modelo de switch sobre o qual os painéis são desenhados. */
let modeloId = '';

before(async () => {
  await limparBanco();
  f = await semear();

  api = await subirApi();

  catalogo = new Cliente(api.url);
  plantao = new Cliente(api.url);
  // Supervisora tem `ativo:gerenciar`, que implica `ativo:catalogo`;
  // o agente só tem `ativo:ler` — é o plantão que consulta o desenho.
  assert.equal((await catalogo.entrar('supervisor@teste.dev')).status, 200);
  assert.equal((await plantao.entrar('agente@teste.dev')).status, 200);

  const modelo = await catalogo.post<ModeloDeAtivoView[]>('/asset-models', {
    name: 'Catalyst 2960-24TC',
    kind: 'REDE',
  });
  assert.equal(modelo.status, 201, JSON.stringify(modelo.corpo));
  modeloId = modelo.corpo.find((m) => m.name === 'Catalyst 2960-24TC')!.id;
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

/** A grade de um switch de 24 portas em duas fileiras. */
const SWITCH_24 = { columns: 12, rows: 2, numbering: 'COLUNA', startAt: 1 };

const paineis = async () => {
  const r = await catalogo.get<PainelDoModeloView[]>(`/asset-models/${modeloId}/paineis`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo;
};

const escrever = (face: string, grade: Record<string, unknown>) =>
  catalogo.put<PainelDoModeloView[]>(`/asset-models/${modeloId}/paineis/${face}`, grade);

const zonar = (face: string, zona: Record<string, unknown>) =>
  catalogo.post<PainelDoModeloView[]>(`/asset-models/${modeloId}/paineis/${face}/zonas`, zona);

describe('o painel do modelo', () => {
  it('nasce vazio, é escrito por face e conta as portas que desenha', async () => {
    assert.deepEqual(await paineis(), []);

    const criado = await escrever('FRENTE', SWITCH_24);
    assert.equal(criado.status, 200, JSON.stringify(criado.corpo));
    assert.equal(criado.corpo.length, 1);

    const frente = criado.corpo[0]!;
    assert.equal(frente.face, 'FRENTE');
    assert.equal(frente.columns, 12);
    assert.equal(frente.rows, 2);
    // A conferência de quem cadastra: tem de bater com o que está
    // escrito na frente do equipamento.
    assert.equal(frente.portCount, 24);
  });

  it('escrever de novo a mesma face substitui, e não duplica', async () => {
    const outra = await escrever('FRENTE', { ...SWITCH_24, numbering: 'LINHA', notes: 'HP numera assim' });
    assert.equal(outra.status, 200);
    assert.equal(outra.corpo.length, 1);
    assert.equal(outra.corpo[0]?.numbering, 'LINHA');
    assert.equal(outra.corpo[0]?.notes, 'HP numera assim');

    // E volta ao painel de verdade deste modelo.
    assert.equal((await escrever('FRENTE', SWITCH_24)).corpo[0]?.numbering, 'COLUNA');
  });

  it('as duas faces convivem, com grades diferentes — frente antes de trás', async () => {
    const tras = await escrever('TRAS', { columns: 2, rows: 1, startAt: 1 });
    assert.equal(tras.status, 200);
    assert.deepEqual(
      tras.corpo.map((p) => p.face),
      ['FRENTE', 'TRAS'],
    );
    assert.equal(tras.corpo[1]?.portCount, 2);

    assert.equal((await catalogo.del(`/asset-models/${modeloId}/paineis/TRAS`)).status, 200);
    assert.deepEqual(
      (await paineis()).map((p) => p.face),
      ['FRENTE'],
    );
  });

  it('face que não existe é recusada antes de qualquer gravação', async () => {
    const r = await escrever('LADO', SWITCH_24);
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.corpo), /Face desconhecida/);
  });

  it('grade impossível é recusada pelo DTO', async () => {
    assert.equal((await escrever('FRENTE', { columns: 0, rows: 2 })).status, 400);
    assert.equal((await escrever('FRENTE', { columns: 12, rows: 99 })).status, 400);
    // E o painel de verdade continua lá, intacto.
    assert.equal((await paineis())[0]?.portCount, 24);
  });

  /**
   * Regra 4 do CLAUDE.md: a regra que não pode ser burlada vive no
   * banco. Painel com zero coluna não desenha nada, e validar só no DTO
   * deixaria a porta aberta para quem grava por SQL — e um painel
   * inválido não dá erro, dá desenho errado.
   */
  it('e também pelo banco, para quem não passa pelo DTO', async () => {
    await assert.rejects(
      () =>
        prisma.$executeRaw`
          INSERT INTO "model_panels" ("id", "organizationId", "assetModelId", "face", "columns", "rows", "numbering", "startAt", "updatedAt")
          VALUES (gen_random_uuid(), ${f.organizacao.id}::uuid, ${modeloId}::uuid, 'TRAS', 0, 1, 'COLUNA', 1, now())`,
      /model_panels_grade_check/,
    );

    const painel = (await paineis())[0]!;
    await assert.rejects(
      () =>
        prisma.$executeRaw`
          INSERT INTO "panel_zones" ("id", "panelId", "column", "row", "kind")
          VALUES (gen_random_uuid(), ${painel.id}::uuid, 0, 1, 'CONSOLE')`,
      /panel_zones_celula_check/,
    );
  });

  it('modelo de outra organização não existe para quem pergunta', async () => {
    const alheio = await prisma.assetModel.create({
      data: { organizationId: f.outra.id, name: 'Switch da outra', kind: 'REDE' },
      select: { id: true },
    });

    assert.equal((await catalogo.get(`/asset-models/${alheio.id}/paineis`)).status, 404);
    assert.equal(
      (await catalogo.put(`/asset-models/${alheio.id}/paineis/FRENTE`, SWITCH_24)).status,
      404,
    );
  });

  it('desenhar o painel é curadoria de catálogo: o agente lê, não escreve', async () => {
    assert.equal((await plantao.get(`/asset-models/${modeloId}/paineis`)).status, 200);
    assert.equal((await plantao.put(`/asset-models/${modeloId}/paineis/FRENTE`, SWITCH_24)).status, 403);
    assert.equal(
      (await plantao.post(`/asset-models/${modeloId}/paineis/FRENTE/zonas`, { column: 1, row: 1 }))
        .status,
      403,
    );
  });
});

describe('a zona, que é a exceção do painel', () => {
  it('ocupa a posição e tira uma porta da conta', async () => {
    const criada = await zonar('FRENTE', {
      column: 12,
      row: 2,
      kind: 'CONSOLE',
      label: 'Console',
    });

    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
    const frente = criada.corpo[0]!;
    assert.equal(frente.zones.length, 1);
    assert.equal(frente.portCount, 23);
  });

  it('duas zonas na mesma posição seriam dois desenhos no mesmo lugar', async () => {
    const repetida = await zonar('FRENTE', { column: 12, row: 2, kind: 'ENERGIA' });
    assert.equal(repetida.status, 400);
    assert.match(JSON.stringify(repetida.corpo), /Já há uma zona/);
  });

  it('fora da grade é recusada: a tela não saberia onde mostrá-la', async () => {
    const fora = await zonar('FRENTE', { column: 13, row: 1, kind: 'CONSOLE' });
    assert.equal(fora.status, 400);
    assert.match(JSON.stringify(fora.corpo), /fora da grade de 12×2/);
  });

  it('edita e apaga, sempre dentro do painel que é dela', async () => {
    const zona = (await paineis())[0]!.zones[0]!;

    const movida = await catalogo.patch<PainelDoModeloView[]>(
      `/asset-models/${modeloId}/paineis/FRENTE/zonas/${zona.id}`,
      { column: 1, row: 1, kind: 'PORTA', label: 'SFP+ 1', portNumber: 49 },
    );
    assert.equal(movida.status, 200, JSON.stringify(movida.corpo));
    assert.deepEqual(
      movida.corpo[0]?.zones.map((z) => ({ column: z.column, row: z.row, portNumber: z.portNumber })),
      [{ column: 1, row: 1, portNumber: 49 }],
    );
    // A zona que é porta volta a contar: 23 da grade mais a dela.
    assert.equal(movida.corpo[0]?.portCount, 24);

    const apagada = await catalogo.del<PainelDoModeloView[]>(
      `/asset-models/${modeloId}/paineis/FRENTE/zonas/${zona.id}`,
    );
    assert.equal(apagada.status, 200);
    assert.deepEqual(apagada.corpo[0]?.zones, []);
  });

  it('encolher a grade não apaga zona em silêncio: recusa e diz qual', async () => {
    assert.equal((await zonar('FRENTE', { column: 12, row: 2, kind: 'CONSOLE' })).status, 201);

    const encolhida = await escrever('FRENTE', { columns: 6, rows: 2 });
    assert.equal(encolhida.status, 400);
    assert.match(JSON.stringify(encolhida.corpo), /coluna 12, linha 2/);

    // A grade continua a de antes, e a zona também.
    const frente = (await paineis())[0]!;
    assert.equal(frente.columns, 12);
    assert.equal(frente.zones.length, 1);
  });
});

/** O switch com painel, criado no bloco abaixo e usado também no rack. */
let switchId = '';

describe('o painel do equipamento', () => {

  /** Uma porta de rede no switch, como o agente ou a tela a cadastraria. */
  const porta = (name: string) =>
    prisma.networkPort.create({
      data: { organizationId: f.organizacao.id, assetId: switchId, name },
      select: { id: true, name: true },
    });

  const doAtivo = async (id = switchId) => {
    const r = await plantao.get<PainelDoAtivo>(`/assets/${id}/painel`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    return r.corpo;
  };

  before(async () => {
    const criado = await catalogo.post<AssetView>('/assets', {
      name: 'SW-RACK-B',
      kind: 'REDE',
      assetModelId: modeloId,
    });
    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    switchId = criado.corpo.id;

    // Sem a zona do teste anterior: aqui o switch é o de 24 portas
    // inteiras, e a zona volta no fim, que é onde ela prova algo.
    const zona = (await paineis())[0]!.zones[0]!;
    assert.equal(
      (await catalogo.del(`/asset-models/${modeloId}/paineis/FRENTE/zonas/${zona.id}`)).status,
      200,
    );

    await porta('GigabitEthernet1/0/1');
    await porta('GigabitEthernet1/0/13');
    await porta('GigabitEthernet1/0/24');
  });

  it('sem modelo não há painel — e isso é nulo, não erro', async () => {
    const solto = await catalogo.post<AssetView>('/assets', { name: 'Switch sem modelo', kind: 'REDE' });
    assert.equal(solto.status, 201);
    assert.equal(await doAtivo(solto.corpo.id), null);
  });

  it('empresta o desenho do modelo e põe cada porta na posição dela', async () => {
    const painel = await doAtivo();
    assert.ok(painel);
    assert.equal(painel.model.id, modeloId);
    assert.equal(painel.faces.length, 1);

    const frente = painel.faces[0]!;
    assert.equal(frente.cells.length, 24);

    const onde = (nome: string) => {
      const celula = frente.cells.find((c) => c.ports.some((p) => p.name === nome));
      return celula && { column: celula.column, row: celula.row, numero: celula.numero };
    };

    // Numeração por coluna: a 1 em cima na primeira coluna, a 13 em cima
    // na sétima, a 24 embaixo na décima segunda — que é onde elas estão
    // no equipamento de verdade.
    assert.deepEqual(onde('GigabitEthernet1/0/1'), { column: 1, row: 1, numero: 1 });
    assert.deepEqual(onde('GigabitEthernet1/0/13'), { column: 7, row: 1, numero: 13 });
    assert.deepEqual(onde('GigabitEthernet1/0/24'), { column: 12, row: 2, numero: 24 });

    assert.deepEqual(painel.outside, []);
  });

  it('mostra o cabo do outro lado na própria posição', async () => {
    const roteador = await catalogo.post<AssetView>('/assets', { name: 'RT-BORDA', kind: 'REDE' });
    const uplink = await prisma.networkPort.create({
      data: { organizationId: f.organizacao.id, assetId: roteador.corpo.id, name: 'ether1' },
      select: { id: true },
    });

    const vinte = await porta('GigabitEthernet1/0/20');
    assert.equal(
      (await catalogo.post(`/ports/${vinte.id}/connection`, { portId: uplink.id })).status,
      201,
    );

    const painel = await doAtivo();
    const celula = painel!.faces[0]!.cells.find((c) => c.numero === 20)!;

    assert.equal(celula.ports[0]?.connectedTo?.asset.name, 'RT-BORDA');
    assert.equal(celula.ports[0]?.connectedTo?.name, 'ether1');
  });

  /**
   * O aviso de que o painel e o equipamento discordam. Sem esta lista a
   * porta sumiria do desenho sem deixar rastro, e o desenho incompleto
   * pareceria completo — que é o único jeito de um estêncil mentir.
   */
  it('a porta que não tem lugar no desenho aparece de lado', async () => {
    await porta('GigabitEthernet1/0/25');
    await porta('Ethernet');

    const painel = await doAtivo();
    assert.deepEqual(
      painel!.outside.map((p) => p.name).sort(),
      ['Ethernet', 'GigabitEthernet1/0/25'],
    );
  });

  it('duas portas com o mesmo número aparecem as duas, em vez de uma escolhida em silêncio', async () => {
    await porta('TenGigabitEthernet1/0/1');

    const painel = await doAtivo();
    const primeira = painel!.faces[0]!.cells.find((c) => c.numero === 1)!;

    assert.deepEqual(
      primeira.ports.map((p) => p.name).sort(),
      ['GigabitEthernet1/0/1', 'TenGigabitEthernet1/0/1'],
    );
  });

  /**
   * A outra metade da regra "a zona não consome número", vista do lado
   * do equipamento: pôr um console na última posição faz o painel
   * numerar até 23, e a porta 24 do switch deixa de ter lugar. É o
   * desenho dizendo que a descrição do painel e o equipamento
   * discordam — e é melhor que ele diga do que desenhe por aproximação.
   */
  it('a zona no fim encolhe a numeração, e a porta 24 passa a sobrar', async () => {
    assert.equal((await zonar('FRENTE', { column: 12, row: 2, kind: 'CONSOLE' })).status, 201);

    const painel = await doAtivo();
    const frente = painel!.faces[0]!;

    assert.equal(frente.cells.filter((c) => c.numero !== null).length, 23);
    assert.ok(painel!.outside.some((p) => p.name === 'GigabitEthernet1/0/24'));

    const console = frente.cells.find((c) => c.kind === 'CONSOLE')!;
    assert.deepEqual({ numero: console.numero, ports: console.ports }, { numero: null, ports: [] });

    // E sai de novo: os testes seguintes falam do switch inteiro.
    const zona = (await paineis())[0]!.zones[0]!;
    assert.equal(
      (await catalogo.del(`/asset-models/${modeloId}/paineis/FRENTE/zonas/${zona.id}`)).status,
      200,
    );
  });

  it('a mesma porta não aparece em duas faces: a resposta é uma só', async () => {
    assert.equal((await escrever('TRAS', { columns: 4, rows: 1, startAt: 1 })).status, 200);

    const painel = await doAtivo();
    assert.deepEqual(
      painel!.faces.map((x) => x.face),
      ['FRENTE', 'TRAS'],
    );

    const vezes = new Map<string, number>();
    for (const face of painel!.faces) {
      for (const celula of face.cells) {
        for (const p of celula.ports) vezes.set(p.id, (vezes.get(p.id) ?? 0) + 1);
      }
    }

    assert.deepEqual([...vezes.values()].filter((n) => n > 1), []);
    // E a traseira, que repetiria os números de 1 a 4, ficou vazia.
    assert.deepEqual(
      painel!.faces[1]!.cells.flatMap((c) => c.ports),
      [],
    );
  });
});

/**
 * O painel na elevação do rack.
 *
 * A elevação responde "em que U está o equipamento"; o painel responde
 * "qual das portas dele". Juntos, respondem a pergunta inteira de quem
 * está com o rack aberto na frente — e é por isso que o desenho vai
 * junto, numa consulta só, em vez de uma por equipamento.
 */
describe('o painel na vista do rack', () => {
  let rackId = '';

  type NoRack = {
    itemId: string;
    assetId: string;
    painel: { model: { name: string }; faces: { face: string; cells: { numero: number | null; ports: { name: string }[] }[] }[] };
  };

  const doRack = async (id = rackId) => {
    const r = await plantao.get<NoRack[]>(`/racks/${id}/paineis`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    return r.corpo;
  };

  before(async () => {
    const rack = await catalogo.post<{ id: string }>('/racks', { name: 'Rack B', units: 42 });
    assert.equal(rack.status, 201, JSON.stringify(rack.corpo));
    rackId = rack.corpo.id;

    assert.equal(
      (await catalogo.post(`/racks/${rackId}/items`, {
        assetId: switchId,
        positionU: 21,
        heightU: 1,
        face: 'FRENTE',
      })).status,
      201,
    );
  });

  it('traz o desenho de cada item do rack, com as portas no lugar', async () => {
    const lista = await doRack();
    assert.equal(lista.length, 1);

    const [item] = lista;
    assert.equal(item!.assetId, switchId);
    assert.equal(item!.painel.model.name, 'Catalyst 2960-24TC');

    const frente = item!.painel.faces.find((f) => f.face === 'FRENTE')!;
    const treze = frente.cells.find((c) => c.numero === 13)!;
    assert.deepEqual(
      treze.ports.map((p) => p.name),
      ['GigabitEthernet1/0/13'],
    );
  });

  it('equipamento sem painel não entra na lista — o rack continua desenhando o retângulo dele', async () => {
    // Os dois casos, que são diferentes: sem modelo nenhum, e com modelo
    // que ninguém desenhou. O segundo é o que passaria batido num filtro
    // que só perguntasse pelo modelo.
    const semModelo = await catalogo.post<AssetView>('/assets', { name: 'Nobreak do rack', kind: 'OUTRO' });

    const modeloSemPainel = await catalogo.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'Patch panel 24p',
      kind: 'OUTRO',
    });
    const patch = modeloSemPainel.corpo.find((m) => m.name === 'Patch panel 24p')!;
    const comModelo = await catalogo.post<AssetView>('/assets', {
      name: 'PP-RACK-B',
      kind: 'OUTRO',
      assetModelId: patch.id,
    });

    for (const [ativo, u] of [
      [semModelo.corpo.id, 1],
      [comModelo.corpo.id, 3],
    ] as const) {
      assert.equal(
        (await catalogo.post(`/racks/${rackId}/items`, { assetId: ativo, positionU: u, heightU: 2 })).status,
        201,
      );
    }

    const lista = await doRack();
    assert.deepEqual(
      lista.map((x) => x.assetId),
      [switchId],
    );
  });

  it('cada item recebe o painel do modelo dele, e não o do vizinho', async () => {
    const outroModelo = await catalogo.post<ModeloDeAtivoView[]>('/asset-models', {
      name: 'MikroTik CRS305',
      kind: 'REDE',
    });
    const mikrotik = outroModelo.corpo.find((m) => m.name === 'MikroTik CRS305')!;
    assert.equal(
      (await catalogo.put(`/asset-models/${mikrotik.id}/paineis/FRENTE`, {
        columns: 4,
        rows: 1,
        startAt: 1,
      })).status,
      200,
    );

    const pequeno = await catalogo.post<AssetView>('/assets', {
      name: 'SW-SFP-01',
      kind: 'REDE',
      assetModelId: mikrotik.id,
    });
    assert.equal(
      (await catalogo.post(`/racks/${rackId}/items`, { assetId: pequeno.corpo.id, positionU: 30 }))
        .status,
      201,
    );

    const lista = await doRack();
    const porAtivo = new Map(lista.map((x) => [x.assetId, x]));

    assert.equal(porAtivo.get(switchId)?.painel.faces[0]?.cells.length, 24);
    assert.equal(porAtivo.get(pequeno.corpo.id)?.painel.faces[0]?.cells.length, 4);
    assert.equal(porAtivo.get(pequeno.corpo.id)?.painel.model.name, 'MikroTik CRS305');
  });

  it('rack vazio de painéis responde lista vazia, e não erro', async () => {
    const outro = await catalogo.post<{ id: string }>('/racks', { name: 'Rack C', units: 12 });
    assert.deepEqual(await doRack(outro.corpo.id), []);
  });

  it('rack de outra organização não existe para quem pergunta', async () => {
    const alheio = await prisma.rack.create({
      data: { organizationId: f.outra.id, name: 'Rack da outra', units: 42 },
      select: { id: true },
    });

    assert.equal((await plantao.get(`/racks/${alheio.id}/paineis`)).status, 404);
  });
});

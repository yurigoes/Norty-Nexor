import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type {
  AssetDetail,
  AssetView,
  ClienteDetail,
  InventarioRequest,
  InventarioResponse,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * A máquina se cadastra sozinha.
 *
 * O agente lê o hardware e manda; toda decisão é do servidor. A razão é
 * que código rodando em duzentas máquinas de cliente não se corrige
 * numa tarde — a regra que muda tem de ficar do lado que se testa, e é
 * este.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **Varrer duas vezes não cria duas máquinas.** O UUID do SMBIOS é a
 *    identidade, e ele sobrevive à troca de disco e à reinstalação.
 * 2. **Série de fábrica não casa máquinas diferentes.** "To Be Filled By
 *    O.E.M." está em metade do parque de máquina branca.
 * 3. **O agente não pisa no que a pessoa digitou** — nome, patrimônio,
 *    situação, local, empresa.
 * 4. **Peça que sumiu sai; peça que alguém digitou fica.** O agente
 *    enxerga três tipos, e só apaga esses.
 * 5. **A empresa vem da chave, nunca do corpo.**
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;

/** A chave do agente, e a de um cliente, para o teste de carteira. */
let chaveDaCasa = '';
let chaveDoJoao = '';
let joao: ClienteDetail;

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

  const daCasa = await admin.post<{ chave: string }>('/api-keys', {
    name: 'Agente de inventário',
    scopes: ['inventario:enviar'],
  });
  assert.equal(daCasa.status, 201, JSON.stringify(daCasa.corpo));
  chaveDaCasa = daCasa.corpo.chave;

  const empresa = await admin.post<ClienteDetail>('/clients', {
    name: 'Empresa do João',
    emailDomain: 'empresadojoao.com.br',
  });
  assert.equal(empresa.status, 201, JSON.stringify(empresa.corpo));
  joao = empresa.corpo;

  const doJoao = await admin.post<{ chave: string }>('/api-keys', {
    name: 'Agente da empresa do João',
    scopes: ['inventario:enviar'],
    clientId: joao.id,
  });
  assert.equal(doJoao.status, 201, JSON.stringify(doJoao.corpo));
  chaveDoJoao = doJoao.corpo.chave;
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function varrer(
  corpo: InventarioRequest,
  token = chaveDaCasa,
): Promise<{ status: number; corpo: InventarioResponse & { detail?: string } }> {
  const resposta = await fetch(`${api.url}/intake/inventario`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

let sequencia = 0;

/** Uma varredura plausível de notebook corporativo. */
function varredura(extra: Partial<InventarioRequest> = {}): InventarioRequest {
  sequencia += 1;
  return {
    uuid: `4c4c4544-0000-0000-0000-${String(sequencia).padStart(12, '0')}`,
    hostname: `NB-TESTE-${sequencia}`,
    serialNumber: `BR9XK${sequencia}`,
    manufacturer: 'Dell Inc.',
    model: 'Latitude 5420',
    kind: 'COMPUTADOR',
    os: { name: 'Windows 11 Pro', version: '10.0.22631' },
    agente: { versao: '1.0.0' },
    processadores: [
      { name: 'Intel Core i5-1135G7', nucleos: 4, threads: 8, frequencia: 2400, arquitetura: 'x86_64' },
    ],
    memorias: [
      { name: 'Kingston KVR26', serialNumber: `MEM-A-${sequencia}`, capacidade: 8192, tecnologia: 'DDR4', slot: 'DIMM A' },
    ],
    discos: [
      { name: 'Samsung 980', serialNumber: `DSK-${sequencia}`, capacidade: 512, tecnologia: 'NVMe' },
    ],
    ...extra,
  };
}

// ---------------------------------------------------------------------

describe('a primeira varredura', () => {
  it('cadastra a máquina com o que o hardware disse', async () => {
    const dados = varredura();
    const r = await varrer(dados);

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.criado, true);
    assert.equal(r.corpo.reconhecidoPor, 'NOVO');
    assert.equal(r.corpo.componentes.criados, 3);

    const ativo = await prisma.asset.findUniqueOrThrow({
      where: { id: r.corpo.assetId },
      include: { manufacturer: true, assetModel: true, components: true },
    });

    assert.equal(ativo.name, dados.hostname, 'o nome sai do hostname no cadastro inicial');
    assert.equal(ativo.hostname, dados.hostname);
    assert.equal(ativo.deviceUuid, dados.uuid);
    assert.equal(ativo.serialNumber, dados.serialNumber);
    assert.equal(ativo.osName, 'Windows 11 Pro');
    assert.equal(ativo.osVersion, '10.0.22631');
    assert.equal(ativo.agentVersion, '1.0.0');
    assert.ok(ativo.lastSeenAt, 'sem isto o parque só cresce');
    assert.equal(ativo.status, 'EM_USO');
    assert.equal(ativo.manufacturer?.name, 'Dell Inc.');
    assert.equal(ativo.assetModel?.name, 'Latitude 5420');

    // A ficha do componente é a mesma do cadastro à mão.
    const memoria = ativo.components.find((c) => c.kind === 'MEMORIA')!;
    assert.deepEqual(memoria.attributes, { capacidade: 8192, tecnologia: 'DDR4', slot: 'DIMM A' });
  });

  it('a empresa vem da chave, e o corpo não tem como dizer outra', async () => {
    const r = await varrer(varredura(), chaveDoJoao);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const ativo = await prisma.asset.findUniqueOrThrow({ where: { id: r.corpo.assetId } });
    assert.equal(ativo.clientId, joao.id);

    // E o campo nem existe no corpo: `forbidNonWhitelisted` recusa.
    const tentativa = await varrer(
      { ...varredura(), clientId: f.organizacao.id } as unknown as InventarioRequest,
      chaveDaCasa,
    );
    assert.equal(tentativa.status, 400);
  });

  it('chave sem o escopo não varre nada', async () => {
    const semEscopo = await admin.post<{ chave: string }>('/api-keys', {
      name: 'Só abre chamado',
      scopes: ['chamado:criar'],
    });

    const r = await varrer(varredura(), semEscopo.corpo.chave);
    assert.equal(r.status, 403, JSON.stringify(r.corpo));
  });
});

describe('a segunda varredura', () => {
  it('reconhece pelo UUID e não cria uma segunda máquina', async () => {
    const dados = varredura();
    const primeira = await varrer(dados);

    // Trocaram o disco e reinstalaram: série e hostname mudam, o UUID
    // do SMBIOS não.
    const segunda = await varrer({
      ...dados,
      hostname: 'NB-RENOMEADO',
      serialNumber: 'OUTRA-SERIE',
      os: { name: 'Windows 11 Pro', version: '10.0.26100' },
    });

    assert.equal(segunda.status, 201, JSON.stringify(segunda.corpo));
    assert.equal(segunda.corpo.assetId, primeira.corpo.assetId, 'criou uma segunda linha');
    assert.equal(segunda.corpo.criado, false);
    assert.equal(segunda.corpo.reconhecidoPor, 'UUID');

    const ativo = await prisma.asset.findUniqueOrThrow({ where: { id: primeira.corpo.assetId } });
    assert.equal(ativo.hostname, 'NB-RENOMEADO', 'o hostname acompanha a máquina');
    assert.equal(ativo.osVersion, '10.0.26100');
    assert.equal(
      ativo.serialNumber,
      dados.serialNumber,
      'a série já preenchida não é sobrescrita pela varredura',
    );
  });

  it('não pisa no que a pessoa digitou', async () => {
    const dados = varredura();
    const r = await varrer(dados);

    // O técnico passou, deu nome, patrimônio, local e mandou para
    // manutenção.
    const editado = await admin.patch<AssetView>(`/assets/${r.corpo.assetId}`, {
      name: 'Notebook da Ana',
      tag: 'PAT-INV-1',
      status: 'EM_MANUTENCAO',
      notes: 'Bateria viciada.',
    });
    assert.equal(editado.status, 200, JSON.stringify(editado.corpo));

    await varrer({ ...dados, hostname: 'NB-OUTRO-NOME' });

    const depois = await prisma.asset.findUniqueOrThrow({ where: { id: r.corpo.assetId } });
    assert.equal(depois.name, 'Notebook da Ana', 'o agente renomeou o que a casa nomeou');
    assert.equal(depois.tag, 'PAT-INV-1');
    assert.equal(depois.status, 'EM_MANUTENCAO');
    assert.equal(depois.notes, 'Bateria viciada.');
    assert.equal(depois.hostname, 'NB-OUTRO-NOME', 'mas o hostname é da máquina');
  });

  it('adota a máquina que já estava cadastrada à mão, pela série', async () => {
    const aMao = await admin.post<AssetView>('/assets', {
      name: 'Notebook do financeiro',
      kind: 'COMPUTADOR',
      tag: 'PAT-A-MAO',
      serialNumber: 'SERIE-DIGITADA',
    });
    assert.equal(aMao.status, 201, JSON.stringify(aMao.corpo));

    const r = await varrer({ ...varredura(), serialNumber: 'SERIE-DIGITADA' });

    assert.equal(r.corpo.assetId, aMao.corpo.id, 'criou uma linha nova para a mesma máquina');
    assert.equal(r.corpo.reconhecidoPor, 'SERIE');

    const ativo = await prisma.asset.findUniqueOrThrow({ where: { id: aMao.corpo.id } });
    assert.equal(ativo.tag, 'PAT-A-MAO', 'o patrimônio digitado sobreviveu à adoção');
    assert.ok(ativo.deviceUuid, 'e agora ela tem UUID, para a próxima varredura');
  });

  it('série de fábrica não casa duas máquinas diferentes', async () => {
    const lixo = 'To Be Filled By O.E.M.';

    const uma = await varrer({ ...varredura(), serialNumber: lixo });
    const outra = await varrer({ ...varredura(), serialNumber: lixo });

    assert.equal(uma.status, 201);
    assert.equal(outra.status, 201, JSON.stringify(outra.corpo));
    assert.notEqual(uma.corpo.assetId, outra.corpo.assetId, 'duas máquinas viraram uma');

    for (const id of [uma.corpo.assetId, outra.corpo.assetId]) {
      const ativo = await prisma.asset.findUniqueOrThrow({ where: { id } });
      assert.equal(ativo.serialNumber, null, 'texto de fábrica não é série');
    }
  });

  it('cada chave escreve no parque que ela representa, e em nenhum outro', async () => {
    // O agente foi instalado com a chave errada. Os dois sentidos são
    // recusados: a chave da casa não mexe no parque do cliente, e a do
    // cliente não mexe no da casa. Aqui "da casa" não é coringa — é uma
    // credencial dizendo onde pode escrever.
    const doCliente = varredura();
    assert.equal((await varrer(doCliente, chaveDoJoao)).status, 201);

    const pelaCasa = await varrer(doCliente, chaveDaCasa);
    assert.equal(pelaCasa.status, 409, JSON.stringify(pelaCasa.corpo));
    assert.match(pelaCasa.corpo.detail ?? '', /outra empresa/);

    const daCasa = varredura();
    assert.equal((await varrer(daCasa, chaveDaCasa)).status, 201);

    const peloCliente = await varrer(daCasa, chaveDoJoao);
    assert.equal(peloCliente.status, 409, JSON.stringify(peloCliente.corpo));
  });
});

describe('as peças', () => {
  it('pente retirado sai do inventário; pente novo entra', async () => {
    const dados = varredura();
    const r = await varrer({
      ...dados,
      memorias: [
        { name: 'Kingston', serialNumber: 'MEM-1', capacidade: 8192, slot: 'DIMM A' },
        { name: 'Kingston', serialNumber: 'MEM-2', capacidade: 8192, slot: 'DIMM B' },
      ],
    });
    assert.equal(r.corpo.componentes.criados, 4);

    // Tiraram um pente e puseram outro maior.
    const segunda = await varrer({
      ...dados,
      memorias: [
        { name: 'Kingston', serialNumber: 'MEM-1', capacidade: 8192, slot: 'DIMM A' },
        { name: 'Crucial', serialNumber: 'MEM-3', capacidade: 16384, slot: 'DIMM B' },
      ],
    });

    assert.equal(segunda.corpo.componentes.criados, 1);
    assert.equal(segunda.corpo.componentes.removidos, 1);

    const memorias = await prisma.assetComponent.findMany({
      where: { assetId: r.corpo.assetId, kind: 'MEMORIA' },
      orderBy: { serialNumber: 'asc' },
    });
    assert.deepEqual(
      memorias.map((m) => m.serialNumber),
      ['MEM-1', 'MEM-3'],
    );
  });

  it('não apaga a peça que o agente não enxerga', async () => {
    const dados = varredura();
    const r = await varrer(dados);

    // Alguém cadastrou a fonte à mão. O agente não a lê — e "não li"
    // não é "não existe".
    const fonte = await admin.post(`/assets/${r.corpo.assetId}/components`, {
      kind: 'FONTE',
      name: 'Fonte 65W',
    });
    assert.equal(fonte.status, 201, JSON.stringify(fonte.corpo));

    await varrer(dados);

    const sobrou = await prisma.assetComponent.count({
      where: { assetId: r.corpo.assetId, kind: 'FONTE' },
    });
    assert.equal(sobrou, 1, 'o agente apagou o que não era dele');
  });

  it('dois pentes iguais sem série são duas peças, pelo slot', async () => {
    const dados = varredura();
    const r = await varrer({
      ...dados,
      memorias: [
        { name: 'Genérica', capacidade: 4096, slot: 'DIMM A' },
        { name: 'Genérica', capacidade: 4096, slot: 'DIMM B' },
      ],
    });

    assert.equal(r.corpo.componentes.criados, 4);

    // E a segunda varredura não acha que uma sumiu e a outra nasceu.
    const segunda = await varrer({
      ...dados,
      memorias: [
        { name: 'Genérica', capacidade: 4096, slot: 'DIMM A' },
        { name: 'Genérica', capacidade: 4096, slot: 'DIMM B' },
      ],
    });
    assert.equal(segunda.corpo.componentes.criados, 0);
    assert.equal(segunda.corpo.componentes.removidos, 0);
  });

  it('o disco que mudou de máquina muda de dono, e não duplica', async () => {
    const velha = varredura();
    const nova = varredura();

    const primeira = await varrer({
      ...velha,
      discos: [{ name: 'Samsung 980', serialNumber: 'DISCO-VIAJANTE', capacidade: 512 }],
    });

    const segunda = await varrer({
      ...nova,
      discos: [{ name: 'Samsung 980', serialNumber: 'DISCO-VIAJANTE', capacidade: 512 }],
    });
    assert.equal(segunda.status, 201, JSON.stringify(segunda.corpo));

    const discos = await prisma.assetComponent.findMany({
      where: { serialNumber: 'DISCO-VIAJANTE' },
    });

    assert.equal(discos.length, 1, 'o mesmo disco foi contado duas vezes');
    assert.equal(discos[0]!.assetId, segunda.corpo.assetId, 'ele ficou na máquina velha');
    assert.notEqual(primeira.corpo.assetId, segunda.corpo.assetId);
  });
});

describe('o catálogo não incha', () => {
  it('"Dell Inc." e "DELL INC." são um fabricante só', async () => {
    await varrer({ ...varredura(), manufacturer: 'Acme Computadores' });
    await varrer({ ...varredura(), manufacturer: 'ACME COMPUTADORES' });
    await varrer({ ...varredura(), manufacturer: '  acme computadores  ' });

    const fabricantes = await prisma.manufacturer.findMany({
      where: { organizationId: f.organizacao.id, name: { contains: 'cme', mode: 'insensitive' } },
    });

    assert.equal(fabricantes.length, 1, `o catálogo inchou: ${JSON.stringify(fabricantes)}`);
  });

  it('o fabricante que a casa curou não é trocado pelo da varredura', async () => {
    const curado = await prisma.manufacturer.create({
      data: { organizationId: f.organizacao.id, name: 'HP' },
    });

    const dados = varredura();
    const r = await varrer(dados);

    await admin.patch(`/assets/${r.corpo.assetId}`, {
      name: 'Máquina curada',
      manufacturerId: curado.id,
    });

    await varrer({ ...dados, manufacturer: 'Hewlett-Packard' });

    const ativo = await prisma.asset.findUniqueOrThrow({ where: { id: r.corpo.assetId } });
    assert.equal(ativo.manufacturerId, curado.id, 'a varredura desfez a curadoria do catálogo');
  });
});

/**
 * A varredura que o **próprio agente** produz, com hardware de mentira
 * (`agente/teste/GerarVarredura.ps1`).
 *
 * Os dois lados não compartilham código — um é PowerShell, o outro é
 * TypeScript —, e esta amostra é o único lugar onde eles se encontram.
 * Sem ela, o agente passa a emitir outra coisa e ninguém descobre até a
 * primeira máquina do cliente.
 *
 * Lido aqui, no topo, e não dentro do `describe`: caminho errado lá
 * dentro vira suíte **vazia** que passa em silêncio, que é o pior lugar
 * para um teste falhar.
 */
const amostraDoAgente = JSON.parse(
  readFileSync(join(__dirname, '../../test/amostras/varredura-windows.json'), 'utf8'),
) as InventarioRequest;

describe('o que o agente de verdade manda', () => {
  const amostra = amostraDoAgente;

  it('a varredura de uma máquina real é aceita como está', async () => {
    const r = await varrer(amostra);

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.criado, true);

    const ativo = await prisma.asset.findUniqueOrThrow({
      where: { id: r.corpo.assetId },
      include: { components: true, manufacturer: true },
    });

    assert.equal(ativo.hostname, 'NB-FIN-03');
    assert.equal(ativo.osName, 'Microsoft Windows 11 Pro');
    assert.equal(ativo.manufacturer?.name, 'Dell Inc.');
    assert.equal(ativo.serialNumber, '9SR0123');

    // Dois pentes, um processador, um disco — e o pendrive de fora,
    // porque o agente não manda mídia removível.
    assert.equal(ativo.components.filter((c) => c.kind === 'MEMORIA').length, 2);
    assert.equal(ativo.components.filter((c) => c.kind === 'DISCO').length, 1);
    assert.equal(ativo.components.filter((c) => c.kind === 'PROCESSADOR').length, 1);

    // O pente com série de fábrica entrou sem série, e é reconhecido
    // pelo slot daqui em diante.
    const semSerie = ativo.components.find(
      (c) => c.kind === 'MEMORIA' && c.serialNumber === null,
    );
    assert.ok(semSerie, 'a série de fábrica virou série de verdade no banco');
    assert.deepEqual(
      (semSerie.attributes as Record<string, unknown>).slot,
      'DIMM B',
      'sem o slot, a segunda varredura acharia que este pente sumiu',
    );
  });

  it('varrer a mesma amostra de novo não muda nada', async () => {
    // É a garantia de que a tarefa agendada rodando todo dia não faz o
    // inventário oscilar: uma peça que "some" e "nasce" a cada noite
    // inventaria troca de hardware que não houve.
    const primeira = await varrer(amostra);
    const segunda = await varrer(amostra);

    assert.equal(segunda.corpo.assetId, primeira.corpo.assetId);
    assert.deepEqual(segunda.corpo.componentes, {
      criados: 0,
      atualizados: 4,
      removidos: 0,
    });
  });
});

describe('o que a tela mostra', () => {
  it('o detalhe do ativo traz o que o agente preencheu', async () => {
    const r = await varrer(varredura());

    const detalhe = await admin.get<AssetDetail>(`/assets/${r.corpo.assetId}`);
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.corpo.hostname, detalhe.corpo.name);
    assert.equal(detalhe.corpo.osName, 'Windows 11 Pro');
    assert.ok(detalhe.corpo.lastSeenAt);
  });
});

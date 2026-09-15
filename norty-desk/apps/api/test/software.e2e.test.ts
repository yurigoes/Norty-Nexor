import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, ProblemDetails, SoftwareDetail, SoftwareView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Software, versões e licenças.
 *
 * O que se prova aqui e em nenhum outro lugar: a conformidade é por
 * software e vale pela **pessoa** também — uma instalação está coberta
 * se o equipamento ou quem o usa ocupa um assento, que é a leitura que
 * o GLPI faz na prática e a que faz o número bater na auditoria do
 * fabricante. E a chave da licença sai cifrada do banco, visível só
 * para quem gerencia ativos.
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

async function criarAtivo(c: Cliente, name: string, userId?: string): Promise<AssetView> {
  const r = await c.post<AssetView>('/assets', { name, kind: 'COMPUTADOR', ...(userId ? { userId } : {}) });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function criarSoftware(c: Cliente, name: string): Promise<SoftwareDetail> {
  const r = await c.post<SoftwareDetail>('/software', { name });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('versões e instalação', () => {
  it('instala uma versão num equipamento e conta o parque', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Planilha Pro');

    const maquina = await criarAtivo(supervisor, 'Estação da contabilidade');
    // A versão nasce da instalação quando ainda não existe — é assim
    // que um agente de inventário reporta o que achou na máquina.
    const instalado = await supervisor.post(`/assets/${maquina.id}/software`, {
      softwareId: s.id,
      version: '2026.1',
    });
    assert.equal(instalado.status, 201, JSON.stringify(instalado.corpo));

    const lista = await supervisor.get<SoftwareView[]>('/software');
    const naLista = lista.corpo.find((x) => x.id === s.id);
    assert.equal(naLista?.installCount, 1);
    // Sem licença nenhuma, a instalação está descoberta.
    assert.equal(naLista?.unlicensedInstalls, 1);
  });

  it('o mesmo equipamento não instala a mesma versão duas vezes', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Editor Duplicado');
    const maquina = await criarAtivo(supervisor, 'Estação repetida');
    const instalar = { softwareId: s.id, version: '1.0' };

    assert.equal((await supervisor.post(`/assets/${maquina.id}/software`, instalar)).status, 201);
    const repetido = await supervisor.post<ProblemDetails>(`/assets/${maquina.id}/software`, instalar);
    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
  });
});

describe('conformidade', () => {
  it('o assento da pessoa cobre a instalação na máquina dela', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Suíte por Pessoa');

    // A máquina é do agente, e o assento vai para o agente — não para
    // a máquina. É a regra que o GLPI aplica na prática.
    const maquina = await criarAtivo(supervisor, 'Notebook do agente', f.agente.id);
    assert.equal(
      (await supervisor.post(`/assets/${maquina.id}/software`, { softwareId: s.id, version: '3.0' })).status,
      201,
    );

    const antes = await supervisor.get<SoftwareView[]>('/software');
    assert.equal(antes.corpo.find((x) => x.id === s.id)?.unlicensedInstalls, 1);

    const comLicenca = await supervisor.post<SoftwareDetail>(`/software/${s.id}/licenses`, {
      name: 'Assinatura nominal',
      seats: 5,
    });
    const licenca = comLicenca.corpo.licenses[0];
    assert.equal(
      (await supervisor.post(`/licenses/${licenca.id}/assignments`, { userId: f.agente.id })).status,
      201,
    );

    const depois = await supervisor.get<SoftwareView[]>('/software');
    const resumo = depois.corpo.find((x) => x.id === s.id);
    assert.equal(resumo?.unlicensedInstalls, 0, 'o assento da pessoa deveria cobrir a máquina dela');
    assert.equal(resumo?.seats, 5);
    assert.equal(resumo?.seatsUsed, 1);
  });

  it('assentos somam entre licenças, e uma ilimitada torna o total ilimitado', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Somatório');

    await supervisor.post(`/software/${s.id}/licenses`, { name: 'Lote A', seats: 10 });
    await supervisor.post(`/software/${s.id}/licenses`, { name: 'Lote B', seats: 5 });

    let lista = await supervisor.get<SoftwareView[]>('/software');
    assert.equal(lista.corpo.find((x) => x.id === s.id)?.seats, 15);

    // `null` é ilimitado: somar com número não faz sentido, e o total
    // inteiro passa a ser ilimitado.
    await supervisor.post(`/software/${s.id}/licenses`, { name: 'Corporativa', seats: null });
    lista = await supervisor.get<SoftwareView[]>('/software');
    assert.equal(lista.corpo.find((x) => x.id === s.id)?.seats, null);
  });
});

describe('situação da licença', () => {
  it('vencida, vencendo e em dia se distinguem pela validade', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Validades');
    const dia = 24 * 3600 * 1000;

    const emDia = new Date(Date.now() + 365 * dia).toISOString();
    const perto = new Date(Date.now() + 5 * dia).toISOString();
    const passada = new Date(Date.now() - dia).toISOString();

    for (const [nome, validade] of [['Em dia', emDia], ['Perto', perto], ['Passada', passada]] as const) {
      const r = await supervisor.post(`/software/${s.id}/licenses`, { name: nome, seats: 1, expiresAt: validade });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
    }

    const detalhe = await supervisor.get<SoftwareDetail>(`/software/${s.id}`);
    const por = (nome: string) => detalhe.corpo.licenses.find((l) => l.name === nome)?.situacao;
    assert.equal(por('Em dia'), 'ok');
    assert.equal(por('Perto'), 'vencendo');
    assert.equal(por('Passada'), 'vencida');
  });
});

describe('a chave da licença', () => {
  it('sai cifrada do banco e só aparece para quem gerencia ativos', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Com Chave');

    const CHAVE = 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE';
    const criada = await supervisor.post<SoftwareDetail>(`/software/${s.id}/licenses`, {
      name: 'Volume',
      seats: 50,
      licenseKey: CHAVE,
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
    const licenca = criada.corpo.licenses[0];

    // No banco, não é a chave.
    const naBase = await prisma.softwareLicense.findUniqueOrThrow({ where: { id: licenca.id } });
    assert.ok(naBase.licenseKey);
    assert.ok(!naBase.licenseKey.includes(CHAVE), 'a chave está em texto puro no banco');

    // Para quem gerencia ativos, decifra.
    const doSupervisor = await supervisor.get<SoftwareDetail>(`/software/${s.id}`);
    const vista = doSupervisor.corpo.licenses.find((l) => l.id === licenca.id);
    assert.equal(vista?.hasKey, true);
    assert.equal(vista?.licenseKey, CHAVE);

    // Para o agente, que só lê ativos, nem o campo existe.
    const agente = await entrar('agente@teste.dev');
    const doAgente = await agente.get<SoftwareDetail>(`/software/${s.id}`);
    assert.equal(doAgente.status, 200);
    const paraOAgente = doAgente.corpo.licenses.find((l) => l.id === licenca.id);
    assert.equal(paraOAgente?.hasKey, true, 'saber que existe chave é útil');
    assert.equal(paraOAgente?.licenseKey, undefined, 'a chave vazou para quem não gerencia ativos');
  });
});

describe('atribuição de assento', () => {
  it('é para o equipamento ou para a pessoa, nunca os dois nem nenhum', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Um ou Outro');
    const comLicenca = await supervisor.post<SoftwareDetail>(`/software/${s.id}/licenses`, {
      name: 'Licença', seats: 3,
    });
    const licenca = comLicenca.corpo.licenses[0];
    const maquina = await criarAtivo(supervisor, 'Estação do um-ou-outro');

    const nenhum = await supervisor.post<ProblemDetails>(`/licenses/${licenca.id}/assignments`, {});
    assert.equal(nenhum.status, 400);

    const ambos = await supervisor.post<ProblemDetails>(`/licenses/${licenca.id}/assignments`, {
      assetId: maquina.id,
      userId: f.agente.id,
    });
    assert.equal(ambos.status, 400);
  });

  it('liberar o assento devolve a vaga', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const s = await criarSoftware(supervisor, 'Vai e Volta');
    const comLicenca = await supervisor.post<SoftwareDetail>(`/software/${s.id}/licenses`, {
      name: 'Um assento', seats: 1,
    });
    const licenca = comLicenca.corpo.licenses[0];
    const um = await criarAtivo(supervisor, 'Primeira máquina');
    const dois = await criarAtivo(supervisor, 'Segunda máquina');

    const ocupado = await supervisor.post<SoftwareDetail>(`/licenses/${licenca.id}/assignments`, {
      assetId: um.id,
    });
    assert.equal(ocupado.status, 201);
    const atribuicao = ocupado.corpo.licenses
      .find((l) => l.id === licenca.id)!
      .assignments.find((a) => a.asset?.id === um.id)!;

    const cheio = await supervisor.post<ProblemDetails>(`/licenses/${licenca.id}/assignments`, {
      assetId: dois.id,
    });
    assert.equal(cheio.status, 409);

    assert.equal(
      (await supervisor.del(`/licenses/${licenca.id}/assignments/${atribuicao.id}`)).status,
      200,
    );
    assert.equal(
      (await supervisor.post(`/licenses/${licenca.id}/assignments`, { assetId: dois.id })).status,
      201,
    );
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, ProblemDetails, SoftwareDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Defeitos encontrados na revisão das fases 6 a 8.
 *
 * Os módulos de software, consumíveis, rede, datacenter, projetos e
 * agenda chegaram sem teste de ponta a ponta — só três testes de
 * unidade para funções auxiliares. Foi por isso que estes cinco
 * passaram. Cada bloco aqui falha contra o código de antes da revisão.
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

async function criarAtivo(c: Cliente, name: string): Promise<AssetView> {
  const r = await c.post<AssetView>('/assets', { name, kind: 'COMPUTADOR' });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

describe('rack: encolher olha o topo, não o U inicial', () => {
  it('recusa encolher quando um equipamento mais baixo é mais alto', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const rack = await supervisor.post<{ id: string }>('/racks', { name: 'Rack da revisão', units: 42 });
    assert.equal(rack.status, 201, JSON.stringify(rack.corpo));

    // B começa embaixo e é alto: vai do U38 ao U41.
    const alto = await criarAtivo(supervisor, 'Servidor 4U');
    assert.equal(
      (await supervisor.post(`/racks/${rack.corpo.id}/items`, {
        assetId: alto.id, positionU: 38, heightU: 4, face: 'FRENTE',
      })).status,
      201,
    );

    // A começa mais acima e é baixo: ocupa só o U40. Ordenar por
    // `positionU` escolhia este, e ele cabe em 40U — o outro não.
    const baixo = await criarAtivo(supervisor, 'Switch 1U');
    assert.equal(
      (await supervisor.post(`/racks/${rack.corpo.id}/items`, {
        assetId: baixo.id, positionU: 40, heightU: 1, face: 'TRAS',
      })).status,
      201,
    );

    const r = await supervisor.patch<ProblemDetails>(`/racks/${rack.corpo.id}`, { units: 40 });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /41/);
  });
});

describe('licença: o assento é contado com a linha travada', () => {
  it('duas atribuições simultâneas não estouram a licença de um assento', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const software = await supervisor.post<SoftwareDetail>('/software', { name: 'Editor Caro' });
    assert.equal(software.status, 201, JSON.stringify(software.corpo));

    const comLicenca = await supervisor.post<SoftwareDetail>(`/software/${software.corpo.id}/licenses`, {
      name: 'Assinatura de um assento',
      seats: 1,
    });
    assert.equal(comLicenca.status, 201, JSON.stringify(comLicenca.corpo));
    const licenca = comLicenca.corpo.licenses[0];

    const um = await criarAtivo(supervisor, 'Máquina A');
    const dois = await criarAtivo(supervisor, 'Máquina B');

    // Ao mesmo tempo, de propósito: antes da trava as duas liam
    // "0 de 1 ocupados" e as duas gravavam.
    const [a, b] = await Promise.all([
      supervisor.post(`/licenses/${licenca.id}/assignments`, { assetId: um.id }),
      supervisor.post(`/licenses/${licenca.id}/assignments`, { assetId: dois.id }),
    ]);

    const situacoes = [a.status, b.status].sort();
    assert.deepEqual(situacoes, [201, 409], `esperava uma passar e uma ser recusada: ${JSON.stringify(situacoes)}`);

    const ocupados = await prisma.licenseAssignment.count({ where: { licenseId: licenca.id } });
    assert.equal(ocupados, 1, 'a licença de um assento terminou com mais de um ocupado');
  });
});

describe('rede: porta livre disputada vira 409, não 500', () => {
  it('duas ligações à mesma porta não estouram o índice único', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const central = await criarAtivo(supervisor, 'Switch central');
    const pcA = await criarAtivo(supervisor, 'PC A');
    const pcB = await criarAtivo(supervisor, 'PC B');

    const porta = async (assetId: string, name: string) => {
      const r = await supervisor.post<{ ports: { id: string; name: string }[] }>(
        `/assets/${assetId}/ports`,
        { name },
      );
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const criada = r.corpo.ports.find((porta) => porta.name === name);
      assert.ok(criada, `porta ${name} não veio na resposta`);
      return criada.id;
    };

    const alvo = await porta(central.id, 'Gi0/1');
    const deA = await porta(pcA.id, 'eth0');
    const deB = await porta(pcB.id, 'eth0');

    const [x, y] = await Promise.all([
      supervisor.post(`/ports/${deA}/connection`, { portId: alvo }),
      supervisor.post(`/ports/${deB}/connection`, { portId: alvo }),
    ]);

    // O que importa: nenhuma das duas pode ser 500.
    for (const r of [x, y]) {
      assert.ok(r.status < 500, `resposta ${r.status} — erro interno em vez de conflito`);
    }
    assert.ok([x.status, y.status].includes(201), 'nenhuma das duas ligou');
  });
});

describe('conta do diretório: o administrador não apaga o login do AD', () => {
  it('recusa mexer no nome de usuário de quem vem do AD', async () => {
    // A fixtura não semeia administrador, e só ele tem
    // `pessoa:gerenciar` — que é a permissão da rota em questão.
    const senha = await import('argon2').then((a) =>
      a.hash('123456', { type: a.argon2id }),
    );
    const chefe = await prisma.user.create({
      data: { email: 'admin@teste.dev', name: 'Administrador', passwordHash: senha, isActive: true },
    });
    await prisma.membership.create({
      data: { userId: chefe.id, organizationId: f.organizacao.id, role: 'ADMINISTRADOR' },
    });

    const admin = await entrar('admin@teste.dev');

    const fonte = await prisma.authSource.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'AD da revisão',
        kind: 'LDAP',
        host: 'exemplo.invalido',
        baseDn: 'dc=exemplo,dc=invalido',
      },
    });

    const pessoa = await prisma.user.findUniqueOrThrow({ where: { email: 'agente@teste.dev' } });
    await prisma.user.update({ where: { id: pessoa.id }, data: { authSourceId: fonte.id } });
    const vinculo = await prisma.membership.findFirstOrThrow({ where: { userId: pessoa.id } });
    await prisma.membership.update({ where: { id: vinculo.id }, data: { username: 'agente.ad' } });

    // Limpar aqui deixava a pessoa sem entrar nem pelo e-mail, com a
    // senha do AD correta — `entrarPeloDiretorio` usa este campo.
    const r = await admin.patch<ProblemDetails>(`/users/${pessoa.id}`, { username: null });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(
      `${r.corpo.detail ?? ''} ${r.corpo.title ?? ''}`,
      /diret[óo]rio/i,
      JSON.stringify(r.corpo),
    );

    const depois = await prisma.membership.findUniqueOrThrow({ where: { id: vinculo.id } });
    assert.equal(depois.username, 'agente.ad');
  });
});

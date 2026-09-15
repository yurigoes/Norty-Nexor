import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AssetView,
  ProblemDetails,
  RedeDoAtivo,
  SubRedeDetail,
  VlanView,
} from '@norty-desk/shared';

import { Cliente, type Api, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Rede: sub-redes, IPs, VLANs e portas.
 *
 * O que se prova aqui e em nenhum outro lugar: o IP duplicado é barrado
 * pelo **banco**, não pela aplicação — duas requisições simultâneas não
 * cadastram o mesmo endereço, e a mensagem diz de quem ele já é, que é
 * a pergunta seguinte de quem tomou o erro. E o cabo fica gravado dos
 * dois lados: desligar de um lado desliga do outro.
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

async function criarPorta(c: Cliente, assetId: string, name: string, extra: Record<string, unknown> = {}) {
  const r = await c.post<RedeDoAtivo>(`/assets/${assetId}/ports`, { name, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const porta = r.corpo.ports.find((p) => p.name === name);
  assert.ok(porta, `porta ${name} não veio na resposta`);
  return porta;
}

describe('sub-rede', () => {
  it('normaliza o CIDR e conta os hosts utilizáveis', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    // Bits de host ligados: o Postgres normaliza para o endereço de rede.
    const r = await supervisor.post<SubRedeDetail>('/ip-networks', {
      name: 'Escritório',
      cidr: '192.168.15.37/24',
      gateway: '192.168.15.1',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal(r.corpo.cidr, '192.168.15.0/24');
    // 256 menos rede e broadcast.
    assert.equal(r.corpo.total, 254);
  });

  it('recusa CIDR inválido e gateway fora da faixa', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const torto = await supervisor.post<ProblemDetails>('/ip-networks', {
      name: 'Torta', cidr: '192.168.15.0',
    });
    assert.equal(torto.status, 400, JSON.stringify(torto.corpo));

    const foraDaFaixa = await supervisor.post<ProblemDetails>('/ip-networks', {
      name: 'Gateway alheio', cidr: '10.0.0.0/24', gateway: '192.168.1.1',
    });
    assert.equal(foraDaFaixa.status, 400, JSON.stringify(foraDaFaixa.corpo));
    assert.match(foraDaFaixa.corpo.detail ?? '', /10\.0\.0\.0\/24/);
  });

  it('oferece o próximo IP livre, pulando rede, broadcast e gateway', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const criada = await supervisor.post<SubRedeDetail>('/ip-networks', {
      name: 'Pequena', cidr: '10.10.10.0/29', gateway: '10.10.10.1',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
    const sub = criada.corpo;

    assert.equal(sub.nextFree, '10.10.10.2', 'deveria pular a rede (.0) e o gateway (.1)');

    assert.equal((await supervisor.post('/ip-addresses', { address: '10.10.10.2' })).status, 201);
    const depois = await supervisor.get<SubRedeDetail>(`/ip-networks/${sub.id}`);
    assert.equal(depois.corpo.nextFree, '10.10.10.3');
    assert.equal(depois.corpo.used, 1);
  });
});

describe('endereço IP', () => {
  it('o mesmo IP não entra duas vezes, e a mensagem diz de quem ele é', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const switchDoAndar = await criarAtivo(supervisor, 'Switch do 3º andar');

    assert.equal(
      (await supervisor.post('/ip-addresses', { address: '172.20.0.10', assetId: switchDoAndar.id })).status,
      201,
    );

    const repetido = await supervisor.post<ProblemDetails>('/ip-addresses', { address: '172.20.0.10' });
    assert.equal(repetido.status, 409, JSON.stringify(repetido.corpo));
    assert.match(
      repetido.corpo.detail ?? '',
      /Switch do 3º andar/,
      'a mensagem precisa dizer de quem é o IP — é a pergunta seguinte',
    );
  });

  it('duas requisições simultâneas com o mesmo IP: uma passa, uma é recusada', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const [a, b] = await Promise.all([
      supervisor.post('/ip-addresses', { address: '172.20.9.9' }),
      supervisor.post('/ip-addresses', { address: '172.20.9.9' }),
    ]);

    assert.deepEqual([a.status, b.status].sort(), [201, 409], 'o índice do banco é quem garante');
    const quantos = await prisma.ipAddress.count({ where: { address: '172.20.9.9' } });
    assert.equal(quantos, 1);
  });

  it('recusa endereço que não é endereço', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.post<ProblemDetails>('/ip-addresses', { address: '999.1.1.1' });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });
});

describe('porta', () => {
  it('normaliza o MAC e recusa o que não é MAC', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const equipamento = await criarAtivo(supervisor, 'Servidor com placa');

    const porta = await criarPorta(supervisor, equipamento.id, 'eth0', { mac: 'AA-BB-CC-DD-EE-FF' });
    assert.equal(porta.mac, 'aa:bb:cc:dd:ee:ff', 'o MAC deveria sair numa forma só');

    const torto = await supervisor.post<ProblemDetails>(`/assets/${equipamento.id}/ports`, {
      name: 'eth9', mac: 'nao-e-um-mac',
    });
    assert.equal(torto.status, 400, JSON.stringify(torto.corpo));
  });

  it('o cabo fica gravado dos dois lados, e desligar de um lado desliga do outro', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const central = await criarAtivo(supervisor, 'Switch central');
    const pc = await criarAtivo(supervisor, 'PC da sala');

    const doSwitch = await criarPorta(supervisor, central.id, 'Gi0/24');
    const doPc = await criarPorta(supervisor, pc.id, 'eth0');

    const ligado = await supervisor.post<RedeDoAtivo>(`/ports/${doPc.id}/connection`, {
      portId: doSwitch.id,
    });
    assert.equal(ligado.status, 201, JSON.stringify(ligado.corpo));

    // De um lado.
    const ladoPc = ligado.corpo.ports.find((p) => p.id === doPc.id);
    assert.equal(ladoPc?.connectedTo?.id, doSwitch.id);
    assert.equal(ladoPc?.connectedTo?.asset.name, 'Switch central');

    // E do outro, sem ninguém ter gravado duas vezes.
    const ladoSwitch = await supervisor.get<RedeDoAtivo>(`/assets/${central.id}/network`);
    assert.equal(
      ladoSwitch.corpo.ports.find((p) => p.id === doSwitch.id)?.connectedTo?.id,
      doPc.id,
      'o outro lado do cabo não ficou gravado',
    );

    assert.equal((await supervisor.del(`/ports/${doPc.id}/connection`)).status, 200);
    const depois = await supervisor.get<RedeDoAtivo>(`/assets/${central.id}/network`);
    assert.equal(
      depois.corpo.ports.find((p) => p.id === doSwitch.id)?.connectedTo,
      null,
      'desligar de um lado tem de desligar do outro',
    );
  });

  it('recusa ligar a porta nela mesma ou a outra do mesmo equipamento', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const equipamento = await criarAtivo(supervisor, 'Equipamento sozinho');
    const uma = await criarPorta(supervisor, equipamento.id, 'p1');
    const outra = await criarPorta(supervisor, equipamento.id, 'p2');

    const nelaMesma = await supervisor.post<ProblemDetails>(`/ports/${uma.id}/connection`, {
      portId: uma.id,
    });
    assert.equal(nelaMesma.status, 400, JSON.stringify(nelaMesma.corpo));

    const mesmoEquipamento = await supervisor.post<ProblemDetails>(`/ports/${uma.id}/connection`, {
      portId: outra.id,
    });
    assert.equal(mesmoEquipamento.status, 400, JSON.stringify(mesmoEquipamento.corpo));
  });

  it('porta já ligada recusa novo cabo antes de desligar', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const a = await criarAtivo(supervisor, 'Ponta A');
    const b = await criarAtivo(supervisor, 'Ponta B');
    const c = await criarAtivo(supervisor, 'Ponta C');

    const pa = await criarPorta(supervisor, a.id, 'eth0');
    const pb = await criarPorta(supervisor, b.id, 'eth0');
    const pc = await criarPorta(supervisor, c.id, 'eth0');

    assert.equal((await supervisor.post(`/ports/${pa.id}/connection`, { portId: pb.id })).status, 201);
    const ocupada = await supervisor.post<ProblemDetails>(`/ports/${pc.id}/connection`, { portId: pa.id });
    assert.equal(ocupada.status, 409, JSON.stringify(ocupada.corpo));
    assert.match(ocupada.corpo.detail ?? '', /desligue antes/i);
  });
});

describe('VLAN', () => {
  it('a etiqueta não se repete na organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const criada = await supervisor.post<VlanView[]>('/vlans', { tag: 100, name: 'Servidores' });
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));

    const repetida = await supervisor.post<ProblemDetails>('/vlans', { tag: 100, name: 'Outra' });
    assert.equal(repetida.status, 409, JSON.stringify(repetida.corpo));
  });
});

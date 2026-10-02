import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { InvalidCredentialsError } from 'ldapts';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { DiretorioService } from '../src/modules/diretorio/diretorio.service';
import type { ConexaoLdap, Entrada, FonteLdap } from '../src/modules/diretorio/ldap';
import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/** O que `GET /auth-sources/:id/replicas` devolve. */
type ReplicaView = {
  id: string;
  host: string;
  port: number;
  position: number;
  isActive: boolean;
  lastUsedAt: string | null;
};

/**
 * Réplica de diretório: o mesmo AD noutro servidor.
 *
 * É o `glpi_authldapreplicates`. Com dois controladores de domínio, o
 * login da empresa não deve cair porque um deles reiniciou para
 * atualizar.
 *
 * O que estes testes cercam é a parte que o teste de unidade do cliente
 * LDAP não alcança: que o endereço cadastrado pela tela **chegue** ao
 * login. Esquecer o `include` das réplicas compila, passa em tudo, e
 * aparece um ano depois, no dia em que o servidor principal cai — por
 * isso a lista que o login monta é conferida aqui, com banco de verdade.
 *
 * O que o diretório responde é falso, como no resto da suíte: subir um
 * Active Directory na suíte seria testar o `ldapts`.
 */

let f: Fixtura;
let api: Api;
let admin: Cliente;
let agente: Cliente;
let diretorio: DiretorioService;
let fonteId = '';

/** O servidor principal da fonte: porta fechada, para o teste de verdade falhar rápido. */
const PRINCIPAL = { host: '127.0.0.1', port: 5699 };

const MARIA: Entrada = {
  dn: 'CN=Maria Souza,OU=Pessoas,DC=teste,DC=dev',
  sAMAccountName: 'msouza',
  mail: 'maria.souza@teste.dev',
  displayName: 'Maria Souza',
};

/**
 * Diretório falso que atende em alguns endereços e não em outros.
 *
 * `aberturas` é o que prova a ordem: é a lista dos endereços que o login
 * tentou, na ordem em que tentou.
 */
function diretorioFalso(dePe: string[]) {
  const aberturas: string[] = [];

  const conexao: ConexaoLdap = {
    async bind(dn, senha) {
      // O bind anônimo da prova de vida passa; o da pessoa exige a senha.
      if (dn === '') return;
      if (dn !== MARIA.dn || senha !== 'certa') {
        throw new InvalidCredentialsError('credenciais inválidas');
      }
    },
    async buscar() {
      return [MARIA];
    },
    async fechar() {},
  };

  return {
    aberturas,
    abrir: async (fonte: FonteLdap) => {
      const endereco = `${fonte.host}:${fonte.port}`;
      aberturas.push(endereco);
      if (!dePe.includes(endereco)) throw new Error('ECONNREFUSED');
      return conexao;
    },
  };
}

async function fonte() {
  const carregada = await diretorio.fonte(fonteId);
  assert.ok(carregada);
  return carregada;
}

/** As réplicas como a tela as vê, em ordem. */
async function replicas() {
  const r = await admin.get<ReplicaView[]>(`/auth-sources/${fonteId}/replicas`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo;
}

async function criarReplica(dados: { host: string; port?: number; position?: number }) {
  return admin.post<ReplicaView[]>(`/auth-sources/${fonteId}/replicas`, dados);
}

before(async () => {
  await limparBanco();
  f = await semear();

  diretorio = new DiretorioService(prisma as unknown as PrismaService);

  const criada = await prisma.authSource.create({
    data: {
      organizationId: f.organizacao.id,
      name: 'AD da matriz',
      host: PRINCIPAL.host,
      port: PRINCIPAL.port,
      baseDn: 'DC=teste,DC=dev',
      // Sem conta de serviço: o que está em teste é a escolha do
      // servidor, e busca anônima tira a cifragem do caminho.
      bindDn: null,
      // Sem TLS: o que falha com a porta fechada passa a ser o bind
      // anônimo da prova de vida, que é o caminho da fonte anônima.
      security: 'NONE',
      timeoutMs: 1000,
      defaultRole: 'SOLICITANTE',
    },
    select: { id: true },
  });
  fonteId = criada.id;

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();
  admin = new Cliente(api.url);
  agente = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

describe('cadastro da réplica', () => {
  it('cadastra, lista na ordem da posição e remove', async () => {
    const segunda = await criarReplica({ host: 'dc2.teste.dev', position: 1 });
    assert.equal(segunda.status, 201, JSON.stringify(segunda.corpo));

    const primeira = await criarReplica({ host: 'dc3.teste.dev', port: 636, position: 0 });
    assert.equal(primeira.status, 201);

    // A posição manda, não a ordem de cadastro: é ela que diz quem o
    // login tenta antes.
    assert.deepEqual(
      (await replicas()).map((r) => `${r.host}:${r.port}`),
      ['dc3.teste.dev:636', 'dc2.teste.dev:389'],
    );

    const dc3 = (await replicas())[0]!;
    const apagada = await admin.del<ReplicaView[]>(`/auth-sources/${fonteId}/replicas/${dc3.id}`);
    assert.equal(apagada.status, 200);
    assert.deepEqual(
      apagada.corpo.map((r) => r.host),
      ['dc2.teste.dev'],
    );
  });

  it('recusa o endereço do próprio servidor principal', async () => {
    const igual = await criarReplica({ host: PRINCIPAL.host, port: PRINCIPAL.port });
    assert.equal(igual.status, 400);
    assert.match(JSON.stringify(igual.corpo), /servidor principal/);

    // Outra porta no mesmo endereço é outro servidor, e isso passa.
    const outraPorta = await criarReplica({ host: PRINCIPAL.host, port: 5698 });
    assert.equal(outraPorta.status, 201);
  });

  it('o mesmo endereço duas vezes é conflito, não duas tentativas', async () => {
    assert.equal((await criarReplica({ host: 'dc2.teste.dev' })).status, 409);
  });

  it('a lista de fontes já traz as réplicas — a tela não precisa de outra volta', async () => {
    const r = await admin.get<{ id: string; replicas: ReplicaView[] }[]>('/auth-sources');
    const a = r.corpo.find((x) => x.id === fonteId);
    assert.ok(a);
    assert.ok(a.replicas.length >= 2);
  });

  it('quem não administra autenticação não vê nem cadastra', async () => {
    assert.equal((await agente.get(`/auth-sources/${fonteId}/replicas`)).status, 403);
    const tentou = await agente.post(`/auth-sources/${fonteId}/replicas`, { host: 'dc9.teste.dev' });
    assert.equal(tentou.status, 403);
  });

  it('réplica de outra fonte não é desta: 404, e não some do lugar errado', async () => {
    const outra = await prisma.authSource.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'AD da filial',
        host: 'filial.teste.dev',
        baseDn: 'DC=filial,DC=dev',
      },
      select: { id: true },
    });

    const minha = (await replicas())[0]!;
    const r = await admin.del(`/auth-sources/${outra.id}/replicas/${minha.id}`);
    assert.equal(r.status, 404);
    assert.ok((await replicas()).some((x) => x.id === minha.id));
  });
});

describe('o que o login enxerga', () => {
  it('as réplicas ativas, na ordem, depois do principal — e a desativada fora', async () => {
    await prisma.authSourceReplica.deleteMany({ where: { authSourceId: fonteId } });
    await prisma.authSourceReplica.createMany({
      data: [
        { authSourceId: fonteId, host: 'dc2.teste.dev', port: 389, position: 1 },
        { authSourceId: fonteId, host: 'dc3.teste.dev', port: 389, position: 0 },
        { authSourceId: fonteId, host: 'desligada.teste.dev', port: 389, position: 2, isActive: false },
      ],
    });

    assert.deepEqual(DiretorioService.paraFonte(await fonte()).replicas, [
      { host: 'dc3.teste.dev', port: 389 },
      { host: 'dc2.teste.dev', port: 389 },
    ]);
  });
});

describe('o login quando o principal cai', () => {
  it('a réplica atende, e fica anotado que foi ela', async () => {
    const d = diretorioFalso(['dc2.teste.dev:389']);
    const r = await diretorio.autenticar(await fonte(), 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.equal(r.pessoa.email, 'maria.souza@teste.dev');
    assert.deepEqual(r.servidor, { host: 'dc2.teste.dev', port: 389 });
    // O principal e a réplica da frente foram tentados antes, na ordem.
    assert.deepEqual(d.aberturas, ['127.0.0.1:5699', 'dc3.teste.dev:389', 'dc2.teste.dev:389']);

    const anotada = await prisma.authSourceReplica.findFirstOrThrow({
      where: { authSourceId: fonteId, host: 'dc2.teste.dev' },
    });
    assert.ok(anotada.lastUsedAt, 'a réplica que atendeu tem de ficar anotada');

    // A que não atendeu continua sem data: a anotação diz quem está
    // carregando o login, não quem está cadastrado.
    const outra = await prisma.authSourceReplica.findFirstOrThrow({
      where: { authSourceId: fonteId, host: 'dc3.teste.dev' },
    });
    assert.equal(outra.lastUsedAt, null);
  });

  it('com o principal de pé, nenhuma réplica é tentada nem anotada', async () => {
    await prisma.authSourceReplica.updateMany({
      where: { authSourceId: fonteId },
      data: { lastUsedAt: null },
    });

    const d = diretorioFalso(['127.0.0.1:5699']);
    const r = await diretorio.autenticar(await fonte(), 'msouza', 'certa', d.abrir);

    assert.ok(r.ok);
    assert.deepEqual(r.servidor, PRINCIPAL);
    assert.deepEqual(d.aberturas, ['127.0.0.1:5699']);
    assert.equal(
      await prisma.authSourceReplica.count({ where: { authSourceId: fonteId, lastUsedAt: { not: null } } }),
      0,
    );
  });

  /**
   * A anotação tem intervalo: gravar a cada login seria um UPDATE por
   * autenticação durante toda a queda do principal, e a tela não fica
   * melhor por saber o segundo exato.
   */
  it('anotação recente não é regravada a cada login', async () => {
    const dezSegundosAtras = new Date(Date.now() - 10_000);
    await prisma.authSourceReplica.updateMany({
      where: { authSourceId: fonteId, host: 'dc2.teste.dev' },
      data: { lastUsedAt: dezSegundosAtras },
    });

    const d = diretorioFalso(['dc2.teste.dev:389']);
    assert.ok((await diretorio.autenticar(await fonte(), 'msouza', 'certa', d.abrir)).ok);

    const depois = await prisma.authSourceReplica.findFirstOrThrow({
      where: { authSourceId: fonteId, host: 'dc2.teste.dev' },
    });
    assert.equal(depois.lastUsedAt?.getTime(), dezSegundosAtras.getTime());
  });

  it('senha errada não vira pergunta na réplica seguinte', async () => {
    const d = diretorioFalso(['127.0.0.1:5699', 'dc2.teste.dev:389']);
    const r = await diretorio.autenticar(await fonte(), 'msouza', 'errada', d.abrir);

    assert.equal(r.ok, false);
    assert.deepEqual(d.aberturas, ['127.0.0.1:5699']);
  });

  it('nenhum servidor de pé: a mensagem do teste nomeia cada um', async () => {
    // Aqui a conexão é a de verdade, contra portas fechadas: é o que
    // prova que o endereço cadastrado pela tela chega ao cliente LDAP.
    await prisma.authSourceReplica.deleteMany({ where: { authSourceId: fonteId } });
    await prisma.authSourceReplica.create({
      data: { authSourceId: fonteId, host: '127.0.0.1', port: 5698 },
    });

    const r = await admin.post<{ ok: boolean; mensagem: string }>(
      `/auth-sources/${fonteId}/testar`,
      {},
    );

    assert.equal(r.status, 200);
    assert.equal(r.corpo.ok, false);
    assert.match(r.corpo.mensagem, /Nenhum dos 2 servidores atendeu/);
    assert.match(r.corpo.mensagem, /127\.0\.0\.1:5699 — O bind anônimo .* falhou/);
    assert.match(r.corpo.mensagem, /127\.0\.0\.1:5698 — O bind anônimo .* falhou/);
    assert.match(r.corpo.mensagem, /ECONNREFUSED/);
  });
});

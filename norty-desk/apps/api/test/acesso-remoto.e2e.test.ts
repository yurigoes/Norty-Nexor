import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AcessoRemotoView, AssetView, SenhaRevelada } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Como se chega na máquina — e quem pode saber.
 *
 * A senha de acesso remoto é a informação mais perigosa que este
 * sistema guarda: com ela, quem a tiver entra na máquina de alguém.
 * Três coisas a protegem, e esta suíte existe para que nenhuma delas
 * seja desfeita por engano:
 *
 * 1. **Cifrada em repouso** — o banco não guarda o texto.
 * 2. **Fora de toda carga** — nem listagem, nem detalhe, nem chamado.
 * 3. **Revelar fica na auditoria** — com quem, qual máquina e quando.
 */

let api: Api;
let f: Fixtura;
let ativo: { id: string };

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  ativo = await prisma.asset.create({
    data: {
      organizationId: f.organizacao.id,
      name: 'Notebook do financeiro',
      tag: 'PAT-4721',
      serialNumber: 'SN-0099',
    },
    select: { id: true },
  });
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  assert.equal((await c.entrar(email)).status, 200, `login de ${email} falhou`);
  return c;
}

const SENHA = 'S3nh@-do-AnyDesk';

async function gravarAcesso(c: Cliente) {
  return c.patch<AcessoRemotoView>(`/assets/${ativo.id}/acesso-remoto`, {
    tailscaleIp: '100.101.102.103',
    vpnNotes: 'WireGuard da matriz, usuário financeiro01.',
    remoteAccessKind: 'ANYDESK',
    remoteAccessId: '123 456 789',
    remoteAccessSecret: SENHA,
  });
}

describe('guardar o acesso', () => {
  it('grava, e devolve tudo menos a senha', async () => {
    const agente = await entrar('agente@teste.dev');
    const r = await gravarAcesso(agente);

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.tailscaleIp, '100.101.102.103');
    assert.equal(r.corpo.remoteAccessKind, 'ANYDESK');
    assert.equal(r.corpo.remoteAccessId, '123 456 789');
    assert.equal(r.corpo.temSenha, true, 'a tela precisa saber que existe senha');

    // A carga diz que **há** senha, nunca qual é — nem em claro, nem
    // cifrada. Comparar a lista de chaves, e não procurar a senha por
    // substring: um campo novo que carregue o texto cifrado passaria
    // batido numa busca por substring, e é assim que um vazamento
    // entra sem ninguém ver.
    assert.deepEqual(
      Object.keys(r.corpo).sort(),
      ['remoteAccessId', 'remoteAccessKind', 'tailscaleIp', 'temSenha', 'vpnNotes'],
      'a carga do acesso remoto ganhou um campo que não devia estar lá',
    );
    assert.ok(!JSON.stringify(r.corpo).includes(SENHA), 'a senha voltou na resposta');
    assert.ok(!JSON.stringify(r.corpo).includes('v1:'), 'o texto cifrado voltou na resposta');
  });

  it('a leitura do acesso remoto tem as mesmas chaves, e só elas', async () => {
    const agente = await entrar('agente@teste.dev');
    const r = await agente.get<AcessoRemotoView>(`/assets/${ativo.id}/acesso-remoto`);

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(
      Object.keys(r.corpo).sort(),
      ['remoteAccessId', 'remoteAccessKind', 'tailscaleIp', 'temSenha', 'vpnNotes'],
    );
    assert.ok(!JSON.stringify(r.corpo).includes('v1:'));
  });

  it('o banco não guarda a senha em texto claro', async () => {
    const guardado = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id },
      select: { remoteAccessSecret: true },
    });

    assert.ok(guardado.remoteAccessSecret);
    assert.notEqual(guardado.remoteAccessSecret, SENHA, 'senha em texto claro no banco');
    // `v1:` é o prefixo do formato cifrado (AES-256-GCM).
    assert.match(guardado.remoteAccessSecret, /^v1:/);
  });

  it('recusa IP que não é da faixa do Tailscale', async () => {
    const agente = await entrar('agente@teste.dev');

    // O engano comum é colar o IP da rede local, que não alcança a
    // máquina de fora e ainda faz o técnico perder a viagem.
    const r = await agente.patch(`/assets/${ativo.id}/acesso-remoto`, {
      tailscaleIp: '192.168.0.15',
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(JSON.stringify(r.corpo), /100\.64/);
  });

  it('editar outro campo não apaga a senha', async () => {
    const agente = await entrar('agente@teste.dev');

    // A tela não mostra a senha, então não tem como reenviá-la: se
    // omitir significasse apagar, trocar o IP derrubaria o acesso.
    const r = await agente.patch<AcessoRemotoView>(`/assets/${ativo.id}/acesso-remoto`, {
      remoteAccessId: '987 654 321',
    });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.temSenha, true, 'a senha sumiu ao editar outro campo');
    assert.equal(r.corpo.remoteAccessId, '987 654 321');
  });

  it('mandar nulo apaga a senha de propósito', async () => {
    const agente = await entrar('agente@teste.dev');

    const r = await agente.patch<AcessoRemotoView>(`/assets/${ativo.id}/acesso-remoto`, {
      remoteAccessSecret: null,
    });
    assert.equal(r.corpo.temSenha, false);

    // E volta, para os casos seguintes.
    await gravarAcesso(agente);
  });
});

describe('revelar a senha', () => {
  it('devolve a senha decifrada', async () => {
    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<SenhaRevelada>(`/assets/${ativo.id}/acesso-remoto/revelar`);

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.secret, SENHA, 'o ciclo cifrar/decifrar não fechou');
  });

  it('cada revelação fica na auditoria, com quem e qual máquina', async () => {
    const antes = await prisma.auditLog.count({
      where: { action: 'ativo.acesso-remoto.revelado' },
    });

    const agente = await entrar('agente@teste.dev');
    await agente.post(`/assets/${ativo.id}/acesso-remoto/revelar`);

    const registros = await prisma.auditLog.findMany({
      where: { action: 'ativo.acesso-remoto.revelado' },
      orderBy: { createdAt: 'desc' },
    });

    assert.equal(registros.length, antes + 1, 'revelar tem de deixar rastro');
    assert.equal(registros[0]?.entityId, ativo.id);
    assert.equal(registros[0]?.actorId, f.agente.id);
  });

  it('a trilha não guarda a senha — seria um segundo lugar de onde ela vaza', async () => {
    const registros = await prisma.auditLog.findMany({
      where: { entity: 'Asset', entityId: ativo.id },
    });

    assert.ok(registros.length > 0);
    for (const r of registros) {
      assert.ok(
        !JSON.stringify(r.diff ?? {}).includes(SENHA),
        `a senha apareceu na auditoria: ${JSON.stringify(r.diff)}`,
      );
    }
  });

  it('equipamento sem senha guardada diz isso, em vez de devolver vazio', async () => {
    const semSenha = await prisma.asset.create({
      data: { organizationId: f.organizacao.id, name: 'Monitor da recepção' },
      select: { id: true },
    });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post(`/assets/${semSenha.id}/acesso-remoto/revelar`);
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });
});

describe('quem não pode ver', () => {
  it('o solicitante não alcança os dados de acesso', async () => {
    const solicitante = await entrar('solicitante@teste.dev');

    for (const chamada of [
      solicitante.get(`/assets/${ativo.id}/acesso-remoto`),
      solicitante.post(`/assets/${ativo.id}/acesso-remoto/revelar`),
      solicitante.patch(`/assets/${ativo.id}/acesso-remoto`, { remoteAccessId: 'x' }),
    ]) {
      const r = await chamada;
      assert.equal(r.status, 403, JSON.stringify(r.corpo));
    }
  });

  it('o gestor lê o inventário, mas não a chave de casa', async () => {
    const gestor = await entrar('gestor@teste.dev');

    // Ele tem `ativo:ler` — o equipamento aparece para ele.
    const inventario = await gestor.get<AssetView[]>('/assets');
    assert.equal(inventario.status, 200);

    // E não tem `ativo:acesso-remoto`: "que máquina é essa" e "como eu
    // entro nela" são perguntas diferentes.
    const r = await gestor.post(`/assets/${ativo.id}/acesso-remoto/revelar`);
    assert.equal(r.status, 403, JSON.stringify(r.corpo));
  });

  it('a senha não vaza pelo detalhe nem pela listagem do ativo', async () => {
    const agente = await entrar('agente@teste.dev');

    const detalhe = await agente.get(`/assets/${ativo.id}`);
    const listagem = await agente.get('/assets?q=Notebook');

    for (const [onde, r] of [
      ['detalhe', detalhe],
      ['listagem', listagem],
    ] as const) {
      const texto = JSON.stringify(r.corpo);
      assert.ok(!texto.includes(SENHA), `a senha vazou pelo ${onde}`);
      assert.ok(!texto.includes('v1:'), `o texto cifrado vazou pelo ${onde}`);
    }
  });

  it('a senha não vaza pelos ativos do chamado', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await agente.post<{ id: string }>('/tickets', {
      subject: 'Notebook não conecta',
      description: 'Não entra na VPN desde ontem.',
      categoryId: f.categoria.id,
    });

    assert.equal(
      (await agente.post(`/tickets/${chamado.corpo.id}/ativos`, { assetId: ativo.id })).status,
      201,
    );

    const doChamado = await agente.get(`/tickets/${chamado.corpo.id}/ativos`);
    const texto = JSON.stringify(doChamado.corpo);
    assert.ok(!texto.includes(SENHA));
    assert.ok(!texto.includes('v1:'));
  });
});

describe('achar o equipamento', () => {
  it('acha pelo nome, pelo patrimônio e pela série', async () => {
    const agente = await entrar('agente@teste.dev');

    for (const termo of ['Notebook do financeiro', 'financeiro', 'PAT-4721', '4721', 'SN-0099']) {
      const r = await agente.get<AssetView[]>(`/assets?q=${encodeURIComponent(termo)}`);
      assert.ok(
        r.corpo.some((a) => a.id === ativo.id),
        `"${termo}" não achou o equipamento`,
      );
    }
  });

  it('acha pelo uuid colado', async () => {
    const agente = await entrar('agente@teste.dev');

    // É o pedido: "só pelo nome do dispositivo, ou o uuid já acha".
    const r = await agente.get<AssetView[]>(`/assets?q=${ativo.id}`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.ok(r.corpo.some((a) => a.id === ativo.id), 'o uuid não achou');
  });

  it('acha pelo IP do Tailscale', async () => {
    const agente = await entrar('agente@teste.dev');

    // Quem tem o IP na mão e quer saber de que máquina ele é faz
    // exatamente esta pergunta.
    const r = await agente.get<AssetView[]>('/assets?q=100.101.102.103');
    assert.ok(r.corpo.some((a) => a.id === ativo.id));
  });

  it('termo que parece uuid mas não é não derruba a consulta', async () => {
    const agente = await entrar('agente@teste.dev');

    // `contains` sobre coluna `uuid` o Postgres recusa: o tipo não é
    // texto. Por isso o id só entra quando a forma bate exatamente.
    for (const termo of ['abc-def', '123e4567-e89b', 'nao-e-uuid-nenhum']) {
      const r = await agente.get(`/assets?q=${encodeURIComponent(termo)}`);
      assert.equal(r.status, 200, `"${termo}" derrubou a busca: ${JSON.stringify(r.corpo)}`);
    }
  });
});

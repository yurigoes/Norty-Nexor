import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, ImpactoView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O que cai junto com este equipamento.
 *
 * A pergunta é a de antes da manutenção: "posso desligar isto agora?".
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **Periférico cai com a máquina, e a máquina não cai com o
 *    periférico.** A aresta tem sentido, e inverter encheria a análise
 *    do teclado com o desktop inteiro.
 * 2. **O cabo vale nos dois sentidos**, porque o inventário não sabe
 *    qual ponta é a de cima. Dizer que sabe tiraria o switch da análise
 *    do desktop — e é o switch que derruba o andar.
 * 3. **Mesmo rack não é dependência.** Proximidade não derruba nada, e
 *    tratá-la como se derrubasse faria a lista virar ruído.
 * 4. **A consequência vem junto**: chamado aberto, reserva, quem avisar.
 * 5. **O teto corta e avisa que cortou**, e corta pelo fim — a busca é
 *    em largura para o vizinho imediato nunca ficar de fora.
 */

let api: Api;
let f: Fixtura;
let supervisor: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

let sequencia = 0;

async function criarAtivo(nome?: string, extra: Record<string, unknown> = {}): Promise<AssetView> {
  sequencia += 1;
  const r = await supervisor.post<AssetView>('/assets', {
    name: nome ?? `Equipamento ${sequencia}`,
    kind: 'COMPUTADOR',
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** Liga dois equipamentos por cabo, gravando os dois lados. */
async function cabear(a: string, b: string, nomeA = 'porta-a', nomeB = 'porta-b') {
  const portaA = await prisma.networkPort.create({
    data: { organizationId: f.organizacao.id, assetId: a, name: `${nomeA}-${sequencia}` },
  });
  const portaB = await prisma.networkPort.create({
    data: { organizationId: f.organizacao.id, assetId: b, name: `${nomeB}-${sequencia}` },
  });

  await prisma.networkPort.update({
    where: { id: portaA.id },
    data: { connectedToId: portaB.id },
  });

  return { portaA, portaB };
}

const impacto = (id: string, query = '') =>
  supervisor.get<ImpactoView>(`/assets/${id}/impacto${query}`);

// ---------------------------------------------------------------------

describe('o que cai junto', () => {
  it('o periférico cai com a máquina; a máquina não cai com o periférico', async () => {
    const desktop = await criarAtivo('Desktop da recepção');
    const teclado = await criarAtivo('Teclado da recepção', {
      kind: 'PERIFERICO',
      parentAssetId: desktop.id,
    });

    const daMaquina = await impacto(desktop.id);
    assert.equal(daMaquina.status, 200, JSON.stringify(daMaquina.corpo));
    assert.deepEqual(
      daMaquina.corpo.nos.map((n) => n.asset.name),
      ['Teclado da recepção'],
    );
    assert.equal(daMaquina.corpo.nos[0]!.motivo, 'PERIFERICO');
    // O caminho é o "por quê" da linha.
    assert.deepEqual(daMaquina.corpo.nos[0]!.caminho, [
      'Desktop da recepção',
      'Teclado da recepção',
    ]);

    // A aresta tem sentido: desligar o teclado não derruba o desktop.
    const doTeclado = await impacto(teclado.id);
    assert.equal(doTeclado.corpo.nos.length, 0, 'a análise do periférico puxou a máquina inteira');
  });

  it('o cabo vale nos dois sentidos: o switch aparece na análise do desktop', async () => {
    const switchDoAndar = await criarAtivo('Switch do 3º andar', { kind: 'REDE' });
    const desktop = await criarAtivo('Desktop do 3º andar');
    await cabear(switchDoAndar.id, desktop.id);

    // Do switch para baixo: o óbvio.
    const doSwitch = await impacto(switchDoAndar.id);
    assert.ok(doSwitch.corpo.nos.some((n) => n.asset.id === desktop.id));

    // E do desktop para cima. O banco não sabe qual ponta é uplink, e
    // fingir que sabe tiraria da análise justamente quem derruba o
    // andar.
    const doDesktop = await impacto(desktop.id);
    assert.ok(
      doDesktop.corpo.nos.some((n) => n.asset.id === switchDoAndar.id),
      'o switch sumiu da análise do desktop',
    );
    assert.equal(doDesktop.corpo.nos[0]!.motivo, 'CABO');
  });

  it('alcança o periférico da máquina cabeada, e para na profundidade pedida', async () => {
    const switchDoAndar = await criarAtivo('Switch do 4º andar', { kind: 'REDE' });
    const desktop = await criarAtivo('Desktop do 4º andar');
    const monitor = await criarAtivo('Monitor do 4º andar', {
      kind: 'PERIFERICO',
      parentAssetId: desktop.id,
    });
    await cabear(switchDoAndar.id, desktop.id);

    const fundo = await impacto(switchDoAndar.id, '?profundidade=2');
    const nomes = fundo.corpo.nos.map((n) => n.asset.id);
    assert.ok(nomes.includes(desktop.id));
    assert.ok(nomes.includes(monitor.id), 'o periférico da máquina cabeada ficou de fora');

    const raso = await impacto(switchDoAndar.id, '?profundidade=1');
    assert.ok(raso.corpo.nos.some((n) => n.asset.id === desktop.id));
    assert.ok(
      !raso.corpo.nos.some((n) => n.asset.id === monitor.id),
      'profundidade 1 trouxe o segundo salto',
    );
  });

  it('estar no mesmo rack não entra: proximidade não é dependência', async () => {
    const rack = await prisma.rack.create({
      data: { organizationId: f.organizacao.id, name: `Rack ${Date.now()}`, units: 42 },
    });

    const servidor = await criarAtivo('Servidor A', { kind: 'OUTRO' });
    const vizinho = await criarAtivo('Servidor B', { kind: 'OUTRO' });

    await prisma.rackItem.create({
      data: { rackId: rack.id, assetId: servidor.id, positionU: 10, heightU: 1 },
    });
    await prisma.rackItem.create({
      data: { rackId: rack.id, assetId: vizinho.id, positionU: 12, heightU: 1 },
    });

    const r = await impacto(servidor.id);
    assert.ok(
      !r.corpo.nos.some((n) => n.asset.id === vizinho.id),
      'o vizinho de rack continua de pé quando este cai — incluí-lo é ruído',
    );
  });

  it('a consequência vem junto: chamado aberto, reserva e quem avisar', async () => {
    const desktop = await criarAtivo('Desktop com chamado');
    const monitor = await criarAtivo('Monitor pendurado', {
      kind: 'PERIFERICO',
      parentAssetId: desktop.id,
    });

    // Chamado aberto no periférico, não na raiz: o que interessa é o que
    // está pegando fogo em qualquer equipamento atingido.
    const chamado = await supervisor.post<{ id: string; number: number }>('/tickets', {
      subject: 'Monitor piscando',
      description: 'x',
      categoryId: f.categoria.id,
      requester: { kind: 'USER', id: f.solicitante.id },
    });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));
    await prisma.ticketAsset.create({
      data: { ticketId: chamado.corpo.id, assetId: monitor.id },
    });

    // Reserva vigente na raiz: derrubar agora atropela alguém.
    await prisma.assetReservation.create({
      data: {
        organizationId: f.organizacao.id,
        assetId: desktop.id,
        userId: f.agente.id,
        createdById: f.supervisor.id,
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 7_200_000),
        purpose: 'Treinamento',
      },
    });

    // E alguém está com o periférico: é quem avisar.
    await prisma.asset.update({
      where: { id: monitor.id },
      data: { userId: f.solicitante.id },
    });

    const r = await impacto(desktop.id);

    assert.equal(r.corpo.chamadosAbertos.length, 1, JSON.stringify(r.corpo.chamadosAbertos));
    assert.equal(r.corpo.chamadosAbertos[0]!.asset.id, monitor.id);

    assert.equal(r.corpo.reservas.length, 1);
    assert.equal(r.corpo.reservas[0]!.user.id, f.agente.id);

    assert.ok(
      r.corpo.pessoas.some((p) => p.id === f.solicitante.id),
      'quem está com o equipamento atingido tem de aparecer para ser avisado',
    );
  });

  it('o chamado fechado não entra: ele não está pegando fogo', async () => {
    const maquina = await criarAtivo('Máquina do chamado fechado');

    const chamado = await supervisor.post<{ id: string }>('/tickets', {
      subject: 'Já resolvido',
      description: 'x',
      categoryId: f.categoria.id,
      requester: { kind: 'USER', id: f.solicitante.id },
    });
    await prisma.ticketAsset.create({
      data: { ticketId: chamado.corpo.id, assetId: maquina.id },
    });
    await prisma.ticket.update({
      where: { id: chamado.corpo.id },
      data: { status: 'FECHADO' },
    });

    const r = await impacto(maquina.id);
    assert.equal(r.corpo.chamadosAbertos.length, 0);
  });

  it('o teto corta e diz que cortou', async () => {
    const central = await criarAtivo('Switch central', { kind: 'REDE' });

    for (let i = 0; i < 6; i += 1) {
      sequencia += 1;
      const maquina = await criarAtivo(`Ponta ${i}`);
      await cabear(central.id, maquina.id, `c${i}`, `p${i}`);
    }

    const r = await impacto(central.id, '?limite=3');
    assert.equal(r.corpo.nos.length, 3);
    assert.equal(r.corpo.truncado, true, 'cortar em silêncio faz a análise mentir por omissão');

    const inteiro = await impacto(central.id, '?limite=50');
    assert.equal(inteiro.corpo.truncado, false);
    assert.ok(inteiro.corpo.nos.length >= 6);
  });

  it('não atravessa a fronteira da organização', async () => {
    const outraOrg = await prisma.organization.create({
      data: { name: 'Casa vizinha', slug: `vizinha-${Date.now()}` },
    });
    const alheio = await prisma.asset.create({
      data: { organizationId: outraOrg.id, name: 'Máquina alheia', kind: 'COMPUTADOR' },
    });

    const r = await impacto(alheio.id);
    assert.equal(r.status, 404);
  });
});

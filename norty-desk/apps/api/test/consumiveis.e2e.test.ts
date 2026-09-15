import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AssetView,
  ConsumivelDetail,
  ConsumivelView,
  ProblemDetails,
  SuprimentosDoAtivo,
} from '@norty-desk/shared';

import { Cliente, type Api, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Consumíveis e cartuchos.
 *
 * O que se prova aqui e em nenhum outro lugar: o saldo **não é campo**,
 * é a soma das movimentações — quem quiser saber por que há três toners
 * lê o histórico, em vez de acreditar num número que alguém digitou. E
 * a saída não deixa o saldo negativo nem quando duas pessoas pegam o
 * último ao mesmo tempo.
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

async function criarItem(c: Cliente, name: string, extra: Record<string, unknown> = {}) {
  const r = await c.post<ConsumivelDetail>('/consumables', { name, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

const mover = (c: Cliente, id: string, corpo: Record<string, unknown>) =>
  c.post<ConsumivelDetail>(`/consumables/${id}/movements`, corpo);

describe('o saldo é a soma das movimentações', () => {
  it('entrada soma, saída subtrai e ajuste corrige com sinal', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Toner CF258A', { kind: 'TONER', unit: 'un' });

    assert.equal((await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 10 })).status, 201);
    assert.equal((await mover(supervisor, item.id, { kind: 'SAIDA', quantity: 3 })).status, 201);
    // O inventário físico achou um a menos: ajuste negativo, auditado.
    const ajustado = await mover(supervisor, item.id, { kind: 'AJUSTE', quantity: -1, note: 'Inventário' });
    assert.equal(ajustado.status, 201, JSON.stringify(ajustado.corpo));

    assert.equal(ajustado.corpo.stock, 6);

    // E o saldo não vem de coluna nenhuma: some da tabela e recalcule.
    const somado = await prisma.consumableMovement.groupBy({
      by: ['kind'],
      where: { itemId: item.id },
      _sum: { quantity: true },
    });
    const por = (k: string) => somado.find((g) => g.kind === k)?._sum?.quantity ?? 0;
    assert.equal(por('ENTRADA') - por('SAIDA') + por('AJUSTE'), 6);
  });

  it('a saída não deixa o saldo negativo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Toner escasso', { kind: 'TONER' });
    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 2 });

    const demais = await mover(supervisor, item.id, { kind: 'SAIDA', quantity: 3 });
    assert.equal(demais.status, 409, JSON.stringify(demais.corpo));

    const depois = await supervisor.get<ConsumivelDetail>(`/consumables/${item.id}`);
    assert.equal(depois.corpo.stock, 2, 'a saída recusada mexeu no saldo');
  });

  it('duas saídas simultâneas do último item não viram saldo −1', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Último toner');
    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 1 });

    const [a, b] = await Promise.all([
      mover(supervisor, item.id, { kind: 'SAIDA', quantity: 1 }),
      mover(supervisor, item.id, { kind: 'SAIDA', quantity: 1 }),
    ]);

    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    const depois = await supervisor.get<ConsumivelDetail>(`/consumables/${item.id}`);
    assert.equal(depois.corpo.stock, 0);
  });
});

describe('o aviso de mínimo', () => {
  it('acende quando o saldo encosta no mínimo, e apaga ao repor', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Toner com mínimo', { minStock: 2 });
    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 5 });

    const listar = async () => {
      const r = await supervisor.get<ConsumivelView[]>('/consumables');
      return r.corpo.find((x) => x.id === item.id)!;
    };

    assert.equal((await listar()).belowMin, false);

    await mover(supervisor, item.id, { kind: 'SAIDA', quantity: 3 });
    assert.equal((await listar()).belowMin, true, 'saldo 2 com mínimo 2 é hora de comprar');

    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 4 });
    assert.equal((await listar()).belowMin, false);
  });
});

describe('para quem foi', () => {
  it('equipamento e pessoa só valem na saída', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Toner destinado');
    const impressora = await supervisor.post<AssetView>('/assets', {
      name: 'Impressora do andar', kind: 'IMPRESSORA',
    });
    assert.equal(impressora.status, 201);

    // Entrada não tem destino: ninguém recebe o que chegou no estoque.
    const entradaComDestino = await mover(supervisor, item.id, {
      kind: 'ENTRADA', quantity: 5, assetId: impressora.corpo.id,
    });
    assert.equal(entradaComDestino.status, 400, JSON.stringify(entradaComDestino.corpo));

    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 5 });
    const saida = await mover(supervisor, item.id, {
      kind: 'SAIDA', quantity: 1, assetId: impressora.corpo.id,
    });
    assert.equal(saida.status, 201, JSON.stringify(saida.corpo));

    // E aparece no histórico da impressora: é a troca de toner vista
    // do lado do equipamento.
    const doAtivo = await supervisor.get<SuprimentosDoAtivo>(
      `/assets/${impressora.corpo.id}/consumables`,
    );
    assert.equal(doAtivo.status, 200);
    assert.ok(
      doAtivo.corpo.recent.some((m) => m.item.id === item.id),
      'a saída não apareceu no histórico do equipamento',
    );
  });
});

describe('excluir', () => {
  it('item com movimentação não se exclui — desativa', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Toner com histórico');
    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 1 });

    const recusa = await supervisor.del<ProblemDetails>(`/consumables/${item.id}`);
    assert.equal(recusa.status, 409, JSON.stringify(recusa.corpo));

    // O caminho que existe é desativar, e o histórico fica de pé.
    assert.equal((await supervisor.patch(`/consumables/${item.id}`, { isActive: false })).status, 200);
    const depois = await supervisor.get<ConsumivelDetail>(`/consumables/${item.id}`);
    assert.equal(depois.corpo.isActive, false);
    assert.equal(depois.corpo.stock, 1);
  });

  it('item sem movimentação nenhuma se exclui', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Cadastrado por engano');
    assert.equal((await supervisor.del(`/consumables/${item.id}`)).status, 204);
    assert.equal((await supervisor.get(`/consumables/${item.id}`)).status, 404);
  });
});

describe('permissão', () => {
  it('o agente registra saída mas não cadastra consumível', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const item = await criarItem(supervisor, 'Toner do agente');
    await mover(supervisor, item.id, { kind: 'ENTRADA', quantity: 3 });

    const agente = await entrar('agente@teste.dev');
    // Quem troca o toner é quem atende — e registrar na hora é a
    // diferença entre ter o número e reconstruí-lo no fim do mês.
    assert.equal((await mover(agente, item.id, { kind: 'SAIDA', quantity: 1 })).status, 201);
    assert.equal((await agente.post('/consumables', { name: 'Inventado pelo agente' })).status, 403);
  });
});

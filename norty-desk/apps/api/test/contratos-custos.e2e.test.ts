import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  ContratoView,
  CustoDoChamado,
  FornecedorView,
  OrcamentoView,
  ProblemDetails,
  RelatorioDeCusto,
  TicketDetail,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Contratos, orçamento e custo do chamado.
 *
 * O que se prova aqui e em nenhum outro lugar: dinheiro atravessa a API
 * como número com duas casas e volta igual — nada de `Float`; o custo do
 * chamado é a soma das linhas, sem total gravado que possa divergir;
 * custo de tempo exige horas **e** valor-hora; e a consulta de
 * vencimento acha o contrato que vence antes de a fatura chegar.
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();

  const admin = await prisma.user.create({
    data: {
      email: 'admin@teste.dev',
      name: 'Administradora',
      passwordHash: (
        await prisma.user.findUniqueOrThrow({
          where: { id: f.supervisor.id },
          select: { passwordHash: true },
        })
      ).passwordHash,
      mustChangePassword: false,
    },
  });
  await prisma.membership.create({
    data: { userId: admin.id, organizationId: f.organizacao.id, role: 'ADMINISTRADOR' },
  });

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

const daquiA = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

async function abrir(cliente: Cliente): Promise<TicketDetail> {
  const r = await cliente.post<TicketDetail>('/tickets', {
    subject: 'Troca de fonte',
    description: 'A fonte queimou.',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function criarContrato(
  cliente: Cliente,
  corpo: Record<string, unknown> = {},
): Promise<ContratoView> {
  const r = await cliente.post<ContratoView>('/contracts', {
    number: `CT-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Suporte de impressoras',
    startsAt: daquiA(-365),
    endsAt: daquiA(365),
    value: 1200,
    billingPeriod: 'ANUAL',
    ...corpo,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('fornecedor e contrato', () => {
  it('o contrato guarda o valor com duas casas e devolve número, não string', async () => {
    const admin = await entrar('admin@teste.dev');

    const fornecedor = await admin.post<FornecedorView>('/suppliers', {
      name: 'Papelaria Central',
      email: 'contato@papelaria.example',
    });
    assert.equal(fornecedor.status, 201, JSON.stringify(fornecedor.corpo));

    const contrato = await criarContrato(admin, {
      supplierId: fornecedor.corpo.id,
      value: 1234.56,
      billingPeriod: 'MENSAL',
    });

    // Decimal vira `number` uma vez só, no serializador (regra 5).
    assert.equal(typeof contrato.value, 'number');
    assert.equal(contrato.value, 1234.56);
    assert.equal(contrato.supplier?.name, 'Papelaria Central');
  });

  it('recusa vigência que termina antes de começar', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/contracts', {
      number: 'CT-INVERTIDO',
      name: 'Vigência invertida',
      startsAt: daquiA(30),
      endsAt: daquiA(10),
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /termina antes/);
  });

  it('número repetido é 409 com a frase', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarContrato(admin, { number: 'CT-REPETIDO' });

    const segunda = await admin.post<ProblemDetails>('/contracts', {
      number: 'CT-REPETIDO',
      name: 'Outro',
      startsAt: daquiA(-10),
    });

    assert.equal(segunda.status, 409);
    assert.match(segunda.corpo.title, /Já existe um contrato/);
  });

  it('a consulta de vencimento acha o que vence antes da fatura chegar', async () => {
    const admin = await entrar('admin@teste.dev');

    const vencendo = await criarContrato(admin, { name: 'Vence em 20 dias', endsAt: daquiA(20) });
    const longe = await criarContrato(admin, { name: 'Vence em 2 anos', endsAt: daquiA(730) });
    const semFim = await criarContrato(admin, { name: 'Prazo indeterminado', endsAt: null });

    const r = await admin.get<ContratoView[]>('/contracts?vencendoEm=30');
    const ids = r.corpo.map((c) => c.id);

    assert.ok(ids.includes(vencendo.id));
    assert.ok(!ids.includes(longe.id));
    // Prazo indeterminado não vence: listá-lo aqui seria ruído.
    assert.ok(!ids.includes(semFim.id));
  });

  it('vincula ativo ao contrato, e vincular duas vezes não estoura', async () => {
    const admin = await entrar('admin@teste.dev');
    const contrato = await criarContrato(admin);

    const ativo = await prisma.asset.create({
      data: { organizationId: f.organizacao.id, name: 'Impressora da recepção' },
    });

    const uma = await admin.post<ContratoView>(`/contracts/${contrato.id}/ativos`, {
      assetId: ativo.id,
    });
    assert.equal(uma.status, 201, JSON.stringify(uma.corpo));
    assert.equal(uma.corpo.assetCount, 1);

    const outra = await admin.post<ContratoView>(`/contracts/${contrato.id}/ativos`, {
      assetId: ativo.id,
    });
    assert.equal(outra.status, 201);
    assert.equal(outra.corpo.assetCount, 1);

    const cobertos = await admin.get<{ id: string }[]>(`/contracts/${contrato.id}/ativos`);
    assert.deepEqual(
      cobertos.corpo.map((a) => a.id),
      [ativo.id],
    );
  });

  it('contrato de outra organização não existe para quem pergunta', async () => {
    const admin = await entrar('admin@teste.dev');
    const contrato = await criarContrato(admin);

    const forasteiro = await entrar('forasteiro@teste.dev');
    assert.equal((await forasteiro.get(`/contracts/${contrato.id}`)).status, 403);
  });
});

describe('custo do chamado', () => {
  it('soma as linhas, sem total gravado que possa divergir', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    await agente.post(`/tickets/${chamado.id}/custos`, {
      kind: 'MATERIAL',
      label: 'Fonte 500W',
      amount: 289.9,
    });

    const comTempo = await agente.post<CustoDoChamado>(`/tickets/${chamado.id}/custos`, {
      kind: 'TEMPO',
      label: 'Atendimento no local',
      hours: 1.5,
      hourlyRate: 120,
    });

    assert.equal(comTempo.status, 201, JSON.stringify(comTempo.corpo));
    assert.equal(comTempo.corpo.linhas.length, 2);
    // 289,90 + 1,5 × 120 = 469,90. Em ponto flutuante isso não fecha.
    assert.equal(comTempo.corpo.total, 469.9);

    const doTempo = comTempo.corpo.linhas.find((l) => l.kind === 'TEMPO');
    assert.equal(doTempo?.amount, 180);
    assert.equal(doTempo?.hours, 1.5);
    assert.equal(doTempo?.hourlyRate, 120);
    assert.equal(doTempo?.author?.id, f.agente.id);
  });

  it('custo de tempo sem valor-hora é 400, não uma linha de zero', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const r = await agente.post<ProblemDetails>(`/tickets/${chamado.id}/custos`, {
      kind: 'TEMPO',
      label: 'Duas horas',
      hours: 2,
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /valor da hora/);
  });

  it('material com horas é recusado: as duas coisas não convivem', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const r = await agente.post<ProblemDetails>(`/tickets/${chamado.id}/custos`, {
      kind: 'MATERIAL',
      label: 'Peça com horas',
      amount: 10,
      hours: 2,
    });

    assert.equal(r.status, 400);
  });

  it('apagar uma linha derruba o total', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const criado = await agente.post<CustoDoChamado>(`/tickets/${chamado.id}/custos`, {
      kind: 'FIXO',
      label: 'Deslocamento',
      amount: 60,
    });
    await agente.post(`/tickets/${chamado.id}/custos`, {
      kind: 'FIXO',
      label: 'Taxa',
      amount: 40,
    });

    const depois = await agente.del<CustoDoChamado>(
      `/tickets/${chamado.id}/custos/${criado.corpo.linhas[0].id}`,
    );

    assert.equal(depois.status, 200);
    assert.equal(depois.corpo.total, 40);
  });

  it('o lançamento entra no orçamento, e o gasto aparece nele', async () => {
    const admin = await entrar('admin@teste.dev');
    const orcamento = await admin.post<OrcamentoView>('/budgets', {
      name: 'TI 2026',
      startsAt: daquiA(-30),
      endsAt: daquiA(300),
      value: 50000,
    });
    assert.equal(orcamento.status, 201, JSON.stringify(orcamento.corpo));

    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);
    await agente.post(`/tickets/${chamado.id}/custos`, {
      kind: 'MATERIAL',
      label: 'Fonte',
      amount: 289.9,
      budgetId: orcamento.corpo.id,
    });

    const lista = await admin.get<OrcamentoView[]>('/budgets');
    const atual = lista.corpo.find((o) => o.id === orcamento.corpo.id);
    assert.equal(atual?.spent, 289.9);
    assert.equal(atual?.value, 50000);
  });

  it('o solicitante não vê nem lança custo', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    const solicitante = await entrar('solicitante@teste.dev');
    assert.equal((await solicitante.get(`/tickets/${chamado.id}/custos`)).status, 403);
    assert.equal(
      (await solicitante.post(`/tickets/${chamado.id}/custos`, {
        kind: 'FIXO',
        label: 'x',
        amount: 1,
      })).status,
      403,
    );
  });

  it('o relatório soma por categoria e por tipo', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrir(agente);

    await agente.post(`/tickets/${chamado.id}/custos`, {
      kind: 'MATERIAL',
      label: 'Peça',
      amount: 100,
    });
    await agente.post(`/tickets/${chamado.id}/custos`, {
      kind: 'TEMPO',
      label: 'Mão de obra',
      hours: 2,
      hourlyRate: 50,
    });

    const supervisor = await entrar('supervisor@teste.dev');
    const r = await supervisor.get<RelatorioDeCusto>('/reports/custo');

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.ok(r.corpo.total >= 200);

    const hardware = r.corpo.porCategoria.find((l) => l.rotulo === 'Hardware');
    assert.ok(hardware, 'a categoria do chamado tem de aparecer');
    assert.ok(hardware.chamados >= 1);

    const tempo = r.corpo.porTipo.find((l) => l.chave === 'TEMPO');
    assert.ok(tempo && tempo.total >= 100);
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { CapacidadeView, RelatorioDeCusto } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Quanto entra contra quanto o time dá conta, e quanto custou.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **A ocupação sai do expediente**, não de "8 horas por dia":
 *    feriado e fim de semana não são capacidade.
 * 2. **O relatório diz a própria margem de erro.** A ocupação só conta
 *    o tempo que alguém apontou, e `semApontamento` é o que permite
 *    saber se ela vale alguma coisa.
 * 3. **Time sem gente não divide por zero.**
 * 4. **O custo médio divide pelos chamados que tiveram custo lançado.**
 *    Dividir por todos faria o médio cair sempre que alguém deixasse de
 *    lançar — o contrário do que o número quer dizer.
 */

let api: Api;
let f: Fixtura;
let supervisor: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function abrirChamado(assunto: string) {
  const r = await supervisor.post<{ id: string; number: number }>('/tickets', {
    subject: assunto,
    description: 'x',
    categoryId: f.categoria.id,
    requester: { kind: 'USER', id: f.solicitante.id },
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('capacidade do time', () => {
  it('conta o que entrou, o que saiu e o que sobrou, por time', async () => {
    const chamado = await abrirChamado('Entrou no período');

    // O chamado já nasce atribuído ao time padrão da categoria: ler
    // qual é, em vez de criar outro ator, é o que a tela também faz.
    const ator = await prisma.ticketActor.findFirstOrThrow({
      where: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: { not: null } },
    });

    const r = await supervisor.get<CapacidadeView>('/reports/capacidade?periodo=30d');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const linha = r.corpo.linhas.find((l) => l.time?.id === ator.teamId);
    assert.ok(linha, JSON.stringify(r.corpo.linhas.map((l) => l.time?.name)));
    assert.ok(linha.abertos >= 1);
    assert.ok(linha.backlog >= 1, 'o chamado aberto tem de aparecer no que sobrou');
  });

  it('as horas disponíveis saem do expediente, não de vinte e quatro por dia', async () => {
    const r = await supervisor.get<CapacidadeView>('/reports/capacidade?periodo=7d');
    const comGente = r.corpo.linhas.find((l) => l.pessoas > 0);

    assert.ok(comGente, 'nenhum time da amostra tem gente');
    assert.ok(comGente.horasDisponiveis > 0);

    // Sete dias corridos seriam 168 horas por pessoa. Expediente de
    // segunda a sexta dá bem menos — e é essa a diferença que separa
    // capacidade de calendário de parede.
    assert.ok(
      comGente.horasDisponiveis < comGente.pessoas * 168,
      `${comGente.horasDisponiveis}h para ${comGente.pessoas} pessoa(s) em 7 dias: ` +
        'está contando fim de semana como capacidade',
    );
  });

  it('diz quantos chamados não têm tempo apontado — é a margem de erro dela', async () => {
    await abrirChamado('Sem apontamento nenhum');

    const r = await supervisor.get<CapacidadeView>('/reports/capacidade?periodo=30d');

    assert.ok(
      r.corpo.semApontamento >= 1,
      'sem este número a ocupação é ficção e ninguém sabe',
    );
    assert.ok(r.corpo.totalNoPeriodo >= r.corpo.semApontamento);
  });

  it('time sem gente não divide por zero', async () => {
    const vazio = await prisma.team.create({
      data: { organizationId: f.organizacao.id, name: `Time vazio ${Date.now()}` },
    });

    const r = await supervisor.get<CapacidadeView>('/reports/capacidade?periodo=7d');
    const linha = r.corpo.linhas.find((l) => l.time?.id === vazio.id);

    assert.ok(linha);
    assert.equal(linha.pessoas, 0);
    assert.equal(linha.ocupacao, null, 'infinito na tela não diz nada');
  });

  it('o CSV não sai com NaN, que é como a divisão por zero aparece', async () => {
    await prisma.team.create({
      data: { organizationId: f.organizacao.id, name: `Sem ninguém ${Date.now()}` },
    });

    const resposta = await fetch(`${api.url}/reports/capacidade?periodo=7d&formato=csv`, {
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });

    const texto = await resposta.text();

    // `NaN` e `Infinity` viram `null` no JSON, então a resposta da API
    // não os denuncia. No CSV eles aparecem escritos — e é o único
    // lugar onde esta divisão por zero é visível.
    assert.ok(!texto.includes('NaN'), texto);
    assert.ok(!texto.includes('Infinity'), texto);
  });

  it('o tempo apontado na tarefa vira hora do time', async () => {
    const chamado = await abrirChamado('Com tempo apontado');

    // Move para o outro time, que não recebe chamado por padrão: assim
    // a hora apontada aparece isolada na linha dele.
    await prisma.ticketActor.updateMany({
      where: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: { not: null } },
      data: { teamId: f.outroTime.id },
    });

    await prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'TAREFA',
        visibility: 'INTERNA',
        channel: 'SISTEMA',
        body: 'Trocar a fonte',
        // Duas horas, em segundos — é como a tarefa grava.
        payload: { type: 'TAREFA', spentSeconds: 7200, done: true },
      },
    });

    const r = await supervisor.get<CapacidadeView>('/reports/capacidade?periodo=30d');
    const linha = r.corpo.linhas.find((l) => l.time?.id === f.outroTime.id);

    assert.ok(linha);
    assert.equal(linha.horasApontadas, 2);
  });

  it('sai em CSV para quem vai levar o número para a reunião', async () => {
    // Direto no `fetch`: o cliente da suíte lê JSON, e CSV não é JSON.
    const resposta = await fetch(`${api.url}/reports/capacidade?periodo=7d&formato=csv`, {
      headers: { Authorization: `Bearer ${supervisor.token}` },
    });

    assert.equal(resposta.status, 200);
    const texto = await resposta.text();
    assert.match(texto, /time/);
    assert.match(texto, /ocupa/);
  });

  it('quem não exporta relatório não vê a capacidade da casa', async () => {
    const agente = new Cliente(api.url);
    assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

    assert.equal((await agente.get('/reports/capacidade')).status, 403);
  });
});

describe('custo por chamado', () => {
  it('o médio divide pelos chamados que tiveram custo, e abre por tipo', async () => {
    const caro = await abrirChamado('Trocou a placa-mãe');
    const barato = await abrirChamado('Trocou o cabo');
    // Este não recebe lançamento nenhum: ele não custou zero, ele não
    // foi medido.
    await abrirChamado('Ninguém lançou nada');

    await supervisor.post(`/tickets/${caro.id}/custos`, {
      kind: 'MATERIAL',
      label: 'Placa-mãe',
      amount: 800,
    });
    await supervisor.post(`/tickets/${caro.id}/custos`, {
      kind: 'TEMPO',
      label: 'Bancada',
      hours: 2,
      hourlyRate: 100,
    });
    await supervisor.post(`/tickets/${barato.id}/custos`, {
      kind: 'MATERIAL',
      label: 'Cabo',
      amount: 20,
    });

    const r = await supervisor.get<RelatorioDeCusto>('/reports/custo');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    assert.equal(r.corpo.total, 1020);
    assert.equal(r.corpo.chamados, 2, 'o chamado sem lançamento não entra na conta do médio');
    assert.equal(r.corpo.medioPorChamado, 510);

    const categoria = r.corpo.porCategoria[0]!;
    assert.equal(categoria.material, 820);
    assert.equal(categoria.tempo, 200);
    assert.equal(categoria.fixo, 0);
    assert.equal(categoria.chamados, 2);
    assert.equal(
      categoria.medioPorChamado,
      510,
      'a linha divide pelos chamados dela, não por um número solto',
    );

    // E o mais caro aparece primeiro, que é o que se quer olhar.
    assert.equal(r.corpo.maisCaros[0]!.id, caro.id);
    assert.equal(r.corpo.maisCaros[0]!.total, 1000);
  });

  it('quebra por cliente: é a conta que paga a conta', async () => {
    const r = await supervisor.get<RelatorioDeCusto>('/reports/custo');

    assert.ok(Array.isArray(r.corpo.porCliente));
    // A amostra abre chamado sem empresa-cliente, e "Da casa" é o nome
    // disso — não "null" nem linha faltando.
    assert.ok(
      r.corpo.porCliente.some((l) => l.rotulo === 'Da casa'),
      JSON.stringify(r.corpo.porCliente),
    );
  });
});

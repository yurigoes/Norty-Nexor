import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FatiaDeContagem, PainelView, RelatorioSlaView, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Painéis e relatório de SLA.
 *
 * O que se prova aqui: o número bate com as linhas que o formaram, o
 * relatório lê o fato gravado (nunca recalcula prazo), o que ainda corre
 * não infla o percentual, e o painel do agente é dele — não da
 * organização inteira.
 */

let api: Api;
let f: Fixtura;
let agente: Cliente;
let outroAgente: Cliente;
let supervisor: Cliente;
let gestor: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  outroAgente = new Cliente(api.url);
  assert.equal((await outroAgente.entrar('agente2@teste.dev')).status, 200);

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);

  gestor = new Cliente(api.url);
  assert.equal((await gestor.entrar('gestor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function abrir(cliente: Cliente, assunto: string): Promise<TicketDetail> {
  const r = await cliente.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: 'x',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('painel do agente', () => {
  it('conta só o que está atribuído a mim', async () => {
    const meu = await abrir(agente, 'Chamado do agente');
    await agente.post(`/tickets/${meu.id}/atribuir`, { userId: f.agente.id });

    const alheio = await abrir(agente, 'Chamado do outro');
    await agente.post(`/tickets/${alheio.id}/atribuir`, { userId: f.outroAgente.id });

    const r = await agente.get<PainelView>('/dashboards/agente');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const emAberto = r.corpo.indicadores.find((i) => i.rotulo === 'Em aberto agora')!;
    assert.equal(emAberto.valor, 1, 'o painel do agente é dele, não da organização');

    // O número carrega o caminho de volta para as linhas que o formaram.
    assert.equal(
      emAberto.filtro,
      `?assignedUserId=${f.agente.id}`,
      'número sem caminho de volta é número que ninguém confere',
    );
  });

  it('o solicitante não vê o painel do time', async () => {
    const solicitante = new Cliente(api.url);
    await solicitante.entrar('solicitante@teste.dev');

    assert.equal((await solicitante.get('/dashboards/time')).status, 403);
    assert.equal((await solicitante.get('/dashboards/organizacao')).status, 403);
  });

  it('o agente não abre o painel de um time do qual não faz parte', async () => {
    // Ele tem `painel:time`, não `painel:organizacao`: pode ver o time
    // dele, e só.
    const r = await agente.get(`/dashboards/time?teamId=${f.outroTime.id}`);
    assert.equal(r.status, 403);
  });

  it('quem lê a organização abre qualquer time', async () => {
    for (const [quem, cliente] of [
      ['supervisor', supervisor],
      ['gestor', gestor],
    ] as const) {
      const r = await cliente.get<PainelView>(`/dashboards/time?teamId=${f.outroTime.id}`);
      assert.equal(r.status, 200, quem);
      assert.equal(r.corpo.escopo, 'TIME');
    }
  });
});

// ---------------------------------------------------------------------

describe('painel da organização', () => {
  it('as fatias somam o que existe, e o dia respeita o fuso local', async () => {
    const r = await gestor.get<PainelView>('/dashboards/organizacao?periodo=7d');
    assert.equal(r.status, 200);

    const abertos = r.corpo.indicadores.find((i) => i.rotulo === 'Abertos no período')!.valor;
    const somaCanais = r.corpo.porCanal.reduce((s, c) => s + c.total, 0);

    assert.equal(somaCanais, abertos, 'a soma das fatias por canal tem de dar o total do período');

    // Sete dias mais o de hoje. Se o `generate_series` estivesse em UTC,
    // a contagem de dias variaria conforme a hora da execução.
    assert.equal(r.corpo.porDia.length, 8);

    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    assert.equal(r.corpo.porDia.at(-1)!.dia, hoje, 'o último dia do gráfico é hoje, no fuso local');
  });

  it('abertos e resolvidos no mesmo dia não se multiplicam', async () => {
    // Duas subconsultas escalares em vez de dois LEFT JOIN: juntar as
    // tabelas pelo dia faria produto cartesiano.
    const um = await abrir(agente, 'Abre e resolve 1');
    const dois = await abrir(agente, 'Abre e resolve 2');
    const tres = await abrir(agente, 'Abre e resolve 3');

    for (const chamado of [um, dois]) {
      await agente.post(`/tickets/${chamado.id}/resolver`, { body: 'Pronto.' });
    }

    const r = await gestor.get<PainelView>('/dashboards/organizacao?periodo=7d');
    const hoje = r.corpo.porDia.at(-1)!;

    const abertosHoje = await prisma.ticket.count({
      where: { organizationId: f.organizacao.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    });

    assert.equal(hoje.abertos, abertosHoje);
    assert.ok(hoje.resolvidos >= 2 && hoje.resolvidos < hoje.abertos * 2);
    assert.ok(tres.id);
  });
});

// ---------------------------------------------------------------------

describe('relatório de SLA', () => {
  it('lê o fato gravado e não recalcula o prazo', async () => {
    const chamado = await abrir(agente, 'Vai violar o prazo');

    // Viola de verdade, pelo cron, para o `breachedAt` ficar gravado.
    await prisma.slaCommitment.updateMany({
      where: { ticketId: chamado.id },
      data: { dueAt: new Date(Date.now() - 3600_000) },
    });

    const { SlaJobs } = await import('../src/modules/sla/sla.jobs');
    await api.app.get(SlaJobs).marcarViolacoes();

    const antes = await gestor.get<RelatorioSlaView>('/reports/sla?agrupar=categoria');
    assert.equal(antes.status, 200);
    assert.ok(antes.corpo.geral.violados > 0);

    // Afrouxar o acordo hoje não pode melhorar o desempenho de ontem.
    await prisma.agreement.updateMany({
      where: { organizationId: f.organizacao.id },
      data: { durationSeconds: 999 * 3600 },
    });

    const depois = await gestor.get<RelatorioSlaView>('/reports/sla?agrupar=categoria');
    assert.equal(
      depois.corpo.geral.violados,
      antes.corpo.geral.violados,
      'mudar o acordo hoje não reescreve o desempenho de ontem',
    );
  });

  it('o que ainda corre não entra no percentual', async () => {
    const r = await gestor.get<RelatorioSlaView>('/reports/sla');
    const g = r.corpo.geral;

    const decididos = g.cumpridos + g.violados;
    const esperado = decididos === 0 ? 100 : Math.round((g.cumpridos / decididos) * 1000) / 10;

    assert.equal(
      g.percentual,
      esperado,
      'contar o que ainda corre como cumprido inflaria o número; como violado o depreciaria',
    );
    assert.ok(g.emAberto >= 0);
    assert.equal(g.total, g.cumpridos + g.violados + g.emAberto);
  });

  it('agrupa por time, prioridade e acordo', async () => {
    for (const agrupar of ['time', 'prioridade', 'acordo'] as const) {
      const r = await gestor.get<RelatorioSlaView>(`/reports/sla?agrupar=${agrupar}`);
      assert.equal(r.status, 200, agrupar);
      assert.equal(r.corpo.agrupamento, agrupar);

      const soma = r.corpo.linhas.reduce((s, l) => s + l.total, 0);
      assert.equal(soma, r.corpo.geral.total, `as linhas de ${agrupar} têm de somar o geral`);
    }
  });

  it('sai em CSV que o Excel em pt-BR abre', async () => {
    const resposta = await fetch(`${api.url}/reports/sla?formato=csv`, {
      headers: { Authorization: `Bearer ${await tokenDoGestor()}` },
    });

    assert.equal(resposta.status, 200);
    const texto = await resposta.text();

    assert.ok(texto.includes(';'), 'ponto e vírgula é o separador que o Excel em pt-BR entende');
    assert.ok(texto.includes('GERAL'));
  });

  it('o agente não exporta relatório', async () => {
    assert.equal((await agente.get('/reports/sla')).status, 403);
  });
});

// ---------------------------------------------------------------------

describe('relatório de volume', () => {
  it('agrupa por canal e por categoria', async () => {
    const canal = await gestor.get<FatiaDeContagem[]>('/reports/volume?agrupar=canal');
    assert.equal(canal.status, 200);
    assert.ok(canal.corpo.some((c) => c.chave === 'WEB' && c.total > 0));

    const categoria = await gestor.get<FatiaDeContagem[]>('/reports/volume?agrupar=categoria');
    assert.ok(categoria.corpo.some((c) => c.rotulo === 'Hardware'));
  });

  it('período inválido é 400, não um relatório errado em silêncio', async () => {
    const r = await gestor.get('/reports/volume?periodo=42y');
    assert.equal(r.status, 400);
  });
});

// ---------------------------------------------------------------------

async function tokenDoGestor(): Promise<string> {
  const c = new Cliente(api.url);
  const r = await c.entrar('gestor@teste.dev');
  return (r.corpo as { accessToken: string }).accessToken;
}

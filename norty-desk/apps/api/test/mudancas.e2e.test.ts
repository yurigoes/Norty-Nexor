import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  ApprovalView,
  ProblemDetails,
  MudancaDetalhe,
  MudancaResumo,
  TicketDetail,
  TicketEventView,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Mudança: janela, plano de recuo e aprovação.
 *
 * O GLPI tem a tabela e a tela; o que ele não tem é a regra. O que se
 * prova aqui e em nenhum outro lugar: sem plano de recuo a mudança não
 * sai do rascunho, mudança normal não executa sem aval, a padrão executa
 * direto, a emergencial executa antes e aprova depois, agendar exige
 * janela, e a aprovação da mudança usa a mesma máquina de quórum do
 * chamado — inclusive na lista de "minhas aprovações".
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

const PLANO = {
  implementationPlan: 'Parar o serviço, aplicar o pacote, subir de novo.',
  rollbackPlan: 'Restaurar o pacote anterior do repositório interno e reiniciar.',
};

async function criar(cliente: Cliente, corpo: Record<string, unknown>): Promise<MudancaDetalhe> {
  const r = await cliente.post<MudancaDetalhe>('/changes', {
    title: 'Atualizar o servidor de arquivos',
    description: 'Subir a versão do sistema operacional para a linha com suporte.',
    ...corpo,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** Leva a mudança até APROVADA pelo caminho de verdade: pedir e decidir. */
async function aprovar(supervisor: Cliente, id: string): Promise<void> {
  const pedido = await supervisor.post<ApprovalView[]>(`/changes/${id}/aprovacoes`, {
    approverIds: [f.gestor.id],
  });
  assert.equal(pedido.status, 201, JSON.stringify(pedido.corpo));

  const gestor = await entrar('gestor@teste.dev');
  const r = await gestor.post(`/aprovacoes/${daPessoa(pedido.corpo, f.gestor.id)}/decidir`, {
    decision: 'APROVADO',
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
}

/**
 * A linha de quem vai decidir.
 *
 * As linhas de uma etapa nascem no mesmo `createMany`: pegar a primeira
 * dá a de outra pessoa metade das vezes, e o 403 que vem depois não tem
 * nada a ver com o que o teste queria provar.
 */
function daPessoa(linhas: ApprovalView[], userId: string): string {
  const linha = linhas.find((l) => l.approver.id === userId);
  assert.ok(linha, 'aprovação da pessoa não encontrada');
  return linha.id;
}

const daquiA = (horas: number) => new Date(Date.now() + horas * 3600_000).toISOString();

// ---------------------------------------------------------------------

describe('abertura da mudança', () => {
  it('nasce em rascunho, numerada por organização', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const primeira = await criar(supervisor, {});
    const segunda = await criar(supervisor, { title: 'Trocar o switch do térreo' });

    assert.equal(primeira.status, 'RASCUNHO');
    assert.equal(primeira.kind, 'NORMAL');
    assert.equal(primeira.risk, 'MEDIO');
    assert.equal(segunda.number, primeira.number + 1);
  });

  it('recusa janela que termina antes de começar', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const r = await supervisor.post<ProblemDetails>('/changes', {
      title: 'Janela invertida',
      description: 'Não deve passar.',
      windowStart: daquiA(48),
      windowEnd: daquiA(24),
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /termina antes/);
  });
});

describe('plano de recuo', () => {
  it('sem plano, a mudança não sai do rascunho', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, {});

    const semPlano = await supervisor.patch<ProblemDetails>(`/changes/${mudanca.id}`, {
      status: 'EM_APROVACAO',
    });
    assert.equal(semPlano.status, 400);
    assert.match(semPlano.corpo.title, /plano de recuo/);

    // Só o de implementação também não basta: recuar é a outra metade.
    const meioPlano = await supervisor.patch(`/changes/${mudanca.id}`, {
      status: 'EM_APROVACAO',
      implementationPlan: PLANO.implementationPlan,
    });
    assert.equal(meioPlano.status, 400);

    const completo = await supervisor.patch<MudancaDetalhe>(`/changes/${mudanca.id}`, {
      status: 'EM_APROVACAO',
      ...PLANO,
    });
    assert.equal(completo.status, 200, JSON.stringify(completo.corpo));
    assert.equal(completo.corpo.status, 'EM_APROVACAO');
  });

  it('cancelar um rascunho sem plano continua possível', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, {});

    const r = await supervisor.patch<MudancaDetalhe>(`/changes/${mudanca.id}`, {
      status: 'CANCELADA',
    });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.status, 'CANCELADA');
  });

  it('pedir aprovação sem plano é 400, não um comitê olhando rascunho vazio', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, {});

    const r = await supervisor.post(`/changes/${mudanca.id}/aprovacoes`, {
      approverIds: [f.gestor.id],
    });
    assert.equal(r.status, 400);
  });
});

describe('aprovação da mudança', () => {
  it('usa a mesma máquina de quórum do chamado e leva a mudança para APROVADA', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, PLANO);

    const pedido = await supervisor.post<ApprovalView[]>(`/changes/${mudanca.id}/aprovacoes`, {
      approverIds: [f.gestor.id, f.supervisor.id],
      quorum: 1,
    });
    assert.equal(pedido.status, 201, JSON.stringify(pedido.corpo));
    assert.equal(pedido.corpo.length, 2);
    assert.deepEqual(pedido.corpo[0].alvo, {
      kind: 'MUDANCA',
      id: mudanca.id,
      number: mudanca.number,
      title: mudanca.title,
    });

    const emAprovacao = await supervisor.get<MudancaDetalhe>(`/changes/${mudanca.id}`);
    assert.equal(emAprovacao.corpo.status, 'EM_APROVACAO');

    const gestor = await entrar('gestor@teste.dev');
    const decisao = await gestor.post(
      `/aprovacoes/${daPessoa(pedido.corpo, f.gestor.id)}/decidir`,
      { decision: 'APROVADO' },
    );
    assert.equal(decisao.status, 201, JSON.stringify(decisao.corpo));

    const depois = await supervisor.get<MudancaDetalhe>(`/changes/${mudanca.id}`);
    assert.equal(depois.corpo.status, 'APROVADA');
    assert.equal(depois.corpo.approvals.length, 2);
  });

  it('a recusa para a mudança, e ela volta ao rascunho por decisão de quem a conduz', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, PLANO);

    const pedido = await supervisor.post<ApprovalView[]>(`/changes/${mudanca.id}/aprovacoes`, {
      approverIds: [f.gestor.id],
    });

    const gestor = await entrar('gestor@teste.dev');
    await gestor.post(`/aprovacoes/${daPessoa(pedido.corpo, f.gestor.id)}/decidir`, {
      decision: 'RECUSADO',
      comment: 'A janela cai no fechamento do mês.',
    });

    const recusada = await supervisor.get<MudancaDetalhe>(`/changes/${mudanca.id}`);
    assert.equal(recusada.corpo.status, 'RECUSADA');

    const refazendo = await supervisor.patch<MudancaDetalhe>(`/changes/${mudanca.id}`, {
      status: 'RASCUNHO',
    });
    assert.equal(refazendo.status, 200);
    assert.equal(refazendo.corpo.status, 'RASCUNHO');
  });

  it('a mudança aparece em "minhas aprovações" junto dos chamados', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, PLANO);

    await supervisor.post(`/changes/${mudanca.id}/aprovacoes`, { approverIds: [f.gestor.id] });

    const gestor = await entrar('gestor@teste.dev');
    const minhas = await gestor.get<ApprovalView[]>('/aprovacoes/minhas');

    assert.equal(minhas.status, 200, JSON.stringify(minhas.corpo));
    const daMudanca = minhas.corpo.filter((a) => a.alvo.kind === 'MUDANCA');
    assert.ok(daMudanca.some((a) => a.alvo.id === mudanca.id));
  });
});

describe('execução', () => {
  it('mudança normal não executa sem aval', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, PLANO);

    const r = await agente.post<ProblemDetails>(`/changes/${mudanca.id}/executar`, {
      acao: 'INICIAR',
    });
    assert.equal(r.status, 409);
    assert.match(r.corpo.title, /precisa de aprovação/);
  });

  it('mudança padrão é pré-aprovada e executa direto', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, { ...PLANO, kind: 'PADRAO' });

    const inicio = await agente.post<MudancaDetalhe>(`/changes/${mudanca.id}/executar`, {
      acao: 'INICIAR',
    });
    assert.equal(inicio.status, 201, JSON.stringify(inicio.corpo));
    assert.equal(inicio.corpo.status, 'EM_EXECUCAO');
    assert.ok(inicio.corpo.startedAt);
  });

  it('a emergencial executa antes e o aval vem depois, registrado', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, { ...PLANO, kind: 'EMERGENCIAL' });

    const inicio = await agente.post<MudancaDetalhe>(`/changes/${mudanca.id}/executar`, {
      acao: 'INICIAR',
    });
    assert.equal(inicio.status, 201, JSON.stringify(inicio.corpo));

    const fim = await agente.post<MudancaDetalhe>(`/changes/${mudanca.id}/executar`, {
      acao: 'CONCLUIR',
      outcome: 'Aplicado às 3h; o serviço voltou em quatro minutos.',
    });
    assert.equal(fim.status, 201, JSON.stringify(fim.corpo));
    assert.equal(fim.corpo.status, 'CONCLUIDA');
    assert.ok(fim.corpo.finishedAt);

    // O aval atrasado continua sendo possível — é o que impede
    // "emergencial" de virar o caminho de fuga sem registro.
    const pedido = await supervisor.post<ApprovalView[]>(`/changes/${mudanca.id}/aprovacoes`, {
      approverIds: [f.gestor.id],
    });
    assert.equal(pedido.status, 409);
  });

  it('concluir sem escrever o que aconteceu é 400', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, { ...PLANO, kind: 'PADRAO' });

    await agente.post(`/changes/${mudanca.id}/executar`, { acao: 'INICIAR' });

    const r = await agente.post(`/changes/${mudanca.id}/executar`, { acao: 'CONCLUIR' });
    assert.equal(r.status, 400);
  });

  it('reverter depois de concluída é possível, e carimba o fim', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, { ...PLANO, kind: 'PADRAO' });

    await agente.post(`/changes/${mudanca.id}/executar`, { acao: 'INICIAR' });
    await agente.post(`/changes/${mudanca.id}/executar`, {
      acao: 'CONCLUIR',
      outcome: 'Aplicado sem incidente.',
    });

    // O recuo quase sempre acontece depois de alguém declarar sucesso:
    // é de madrugada, no dia seguinte, quando o efeito aparece.
    const recuo = await agente.post<MudancaDetalhe>(`/changes/${mudanca.id}/executar`, {
      acao: 'REVERTER',
      outcome: 'Dois sistemas pararam de autenticar. Pacote anterior restaurado.',
    });

    assert.equal(recuo.status, 201, JSON.stringify(recuo.corpo));
    assert.equal(recuo.corpo.status, 'REVERTIDA');
    assert.ok(recuo.corpo.finishedAt);

    const eventos = await supervisor.get<TicketEventView[]>(`/changes/${mudanca.id}/eventos`);
    const mudancasDeStatus = eventos.corpo.filter((e) => e.type === 'MUDANCA_STATUS_MUDANCA');
    assert.deepEqual(mudancasDeStatus.at(-1)?.payload, {
      type: 'MUDANCA_STATUS_MUDANCA',
      from: 'CONCLUIDA',
      to: 'REVERTIDA',
    });
  });

  it('o agente executa mas não aprova nem edita o plano', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, PLANO);

    const edicao = await agente.patch(`/changes/${mudanca.id}`, { rollbackPlan: 'Sei lá.' });
    assert.equal(edicao.status, 403);
  });
});

describe('agenda', () => {
  it('agendar exige a janela', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const mudanca = await criar(supervisor, PLANO);
    await aprovar(supervisor, mudanca.id);

    const semJanela = await supervisor.patch<ProblemDetails>(`/changes/${mudanca.id}`, {
      status: 'AGENDADA',
    });
    assert.equal(semJanela.status, 400);
    assert.match(semJanela.corpo.title, /janela/);

    const comJanela = await supervisor.patch<MudancaDetalhe>(`/changes/${mudanca.id}`, {
      status: 'AGENDADA',
      windowStart: daquiA(24),
      windowEnd: daquiA(26),
    });
    assert.equal(comJanela.status, 200, JSON.stringify(comJanela.corpo));
    assert.equal(comJanela.corpo.status, 'AGENDADA');
  });

  it('a agenda filtra pela janela e ordena por ela', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const tarde = await criar(supervisor, { ...PLANO, title: 'Manutenção da semana que vem' });
    const cedo = await criar(supervisor, { ...PLANO, title: 'Manutenção de amanhã' });

    await supervisor.patch(`/changes/${tarde.id}`, {
      windowStart: daquiA(24 * 7),
      windowEnd: daquiA(24 * 7 + 2),
    });
    await supervisor.patch(`/changes/${cedo.id}`, {
      windowStart: daquiA(24),
      windowEnd: daquiA(26),
    });

    const semana = await supervisor.get<MudancaResumo[]>(
      `/changes?de=${encodeURIComponent(new Date().toISOString())}` +
        `&ate=${encodeURIComponent(daquiA(72))}`,
    );

    assert.equal(semana.status, 200, JSON.stringify(semana.corpo));
    const ids = semana.corpo.map((m) => m.id);
    assert.ok(ids.includes(cedo.id));
    assert.ok(!ids.includes(tarde.id));
  });
});

describe('vínculo e escopo', () => {
  it('o chamado carrega a mudança que o resolve', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const abertura = await agente.post<TicketDetail>('/tickets', {
      subject: 'Servidor de arquivos lento',
      description: 'Demora para abrir pasta.',
      categoryId: f.categoria.id,
    });
    assert.equal(abertura.status, 201);

    const mudanca = await criar(supervisor, PLANO);
    const vinculo = await agente.post<MudancaDetalhe>(`/changes/${mudanca.id}/tickets`, {
      ticketId: abertura.corpo.id,
    });

    assert.equal(vinculo.status, 201, JSON.stringify(vinculo.corpo));
    assert.equal(vinculo.corpo.ticketCount, 1);

    // O chamado passa a carregar a mudança e a janela dela: é o que
    // responde "quando isso vai ser resolvido?" sem sair da tela.
    const comMudanca = await agente.get<TicketDetail>(`/tickets/${abertura.corpo.id}`);
    assert.equal(comMudanca.corpo.change?.number, mudanca.number);
    assert.equal(comMudanca.corpo.change?.status, 'RASCUNHO');

    const desvinculo = await agente.del<MudancaDetalhe>(
      `/changes/${mudanca.id}/tickets/${abertura.corpo.id}`,
    );
    assert.equal(desvinculo.status, 200);
    assert.equal(desvinculo.corpo.ticketCount, 0);
  });

  it('mudança de outra organização não existe para quem pergunta', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const forasteiro = await entrar('forasteiro@teste.dev');

    const mudanca = await criar(supervisor, PLANO);
    const r = await forasteiro.get(`/changes/${mudanca.id}`);
    assert.equal(r.status, 404);
  });

  it('o solicitante não alcança a rota de mudanças', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const r = await solicitante.get('/changes');
    assert.equal(r.status, 403);
  });
});

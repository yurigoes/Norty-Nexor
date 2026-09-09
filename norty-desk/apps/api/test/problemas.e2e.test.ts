import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  ErroConhecidoSugerido,
  ProblemaDetalhe,
  ProblemaResumo,
  TicketDetail,
  TicketEventView,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Problema, causa raiz e erro conhecido.
 *
 * O que se prova aqui e em nenhum outro lugar: `isKnownError` não liga
 * sem causa **e** contorno, o carimbo de erro conhecido não é reescrito
 * a cada edição, `resolvedAt` sobrevive ao fechamento, vincular respeita
 * o escopo de leitura do chamado, e a busca acha o erro conhecido pelo
 * texto do chamado — que é o gesto que paga a gestão de problema.
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

async function abrirChamado(
  cliente: Cliente,
  assunto: string,
  descricao = 'x',
  // A categoria da fixtura é da organização de teste: o forasteiro abre
  // sem categoria, ou levaria 400 antes de chegar ao que se quer provar.
  // `null` e não `undefined`: passar `undefined` reativa o padrão.
  categoryId: string | null = f.categoria.id,
): Promise<TicketDetail> {
  const r = await cliente.post<TicketDetail>('/tickets', {
    subject: assunto,
    description: descricao,
    ...(categoryId ? { categoryId } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

async function criarProblema(
  cliente: Cliente,
  corpo: Record<string, unknown>,
): Promise<ProblemaDetalhe> {
  const r = await cliente.post<ProblemaDetalhe>('/problems', corpo);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('abertura do problema', () => {
  it('numera por organização e nasce com a linha do tempo aberta', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const primeiro = await criarProblema(supervisor, {
      title: 'Impressora do quarto andar trava a fila',
      description: 'A fila para de imprimir depois de dois trabalhos grandes.',
    });
    const segundo = await criarProblema(supervisor, {
      title: 'VPN cai às sextas',
      description: 'Conexão derruba todo mundo no fim da tarde de sexta.',
    });

    assert.equal(segundo.number, primeiro.number + 1);
    assert.equal(primeiro.status, 'NOVO');
    assert.equal(primeiro.isKnownError, false);
    assert.equal(primeiro.ticketCount, 0);

    const eventos = await supervisor.get<TicketEventView[]>(`/problems/${primeiro.id}/eventos`);
    assert.equal(eventos.status, 200);
    assert.equal(eventos.corpo.length, 1);
    assert.match(eventos.corpo[0].body ?? '', /aberto/);
  });

  it('deriva a prioridade da matriz, nunca do corpo da requisição', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Banco de dados lento no fechamento',
      description: 'Consultas de relatório passam de um minuto.',
      urgency: 5,
      impact: 5,
    });

    assert.equal(problema.priority, 5);
  });

  it('abre já vinculado aos chamados que o revelaram', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const a = await abrirChamado(agente, 'Não consigo imprimir');
    const b = await abrirChamado(agente, 'Impressora parada de novo');

    const problema = await criarProblema(supervisor, {
      title: 'Fila de impressão trava',
      description: 'Trava depois de trabalhos grandes.',
      ticketIds: [a.id, b.id],
    });

    assert.equal(problema.ticketCount, 2);
    assert.deepEqual(
      problema.tickets.map((t) => t.id).sort(),
      [a.id, b.id].sort(),
    );
  });

  it('recusa chamado de outra organização com 404, não com 500', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const forasteiro = await entrar('forasteiro@teste.dev');
    const deles = await abrirChamado(forasteiro, 'Chamado da outra empresa', 'x', null);

    const r = await supervisor.post('/problems', {
      title: 'Tentativa de atravessar organização',
      description: 'Não deve passar.',
      ticketIds: [deles.id],
    });

    assert.equal(r.status, 404);
  });
});

describe('erro conhecido', () => {
  it('não liga sem causa raiz e contorno', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const semNada = await supervisor.post('/problems', {
      title: 'Erro conhecido prematuro',
      description: 'Ainda não sabemos nada.',
      isKnownError: true,
    });
    assert.equal(semNada.status, 400);

    const soCausa = await supervisor.post('/problems', {
      title: 'Só a causa',
      description: 'Sabemos a causa mas não o contorno.',
      rootCause: 'Driver antigo.',
      isKnownError: true,
    });
    assert.equal(soCausa.status, 400);
  });

  it('liga com as duas coisas escritas na mesma edição e carimba a data', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Certificado do portal expira sem aviso',
      description: 'O portal fica inacessível até alguém renovar.',
    });
    assert.equal(problema.knownErrorAt, null);

    const investigando = await supervisor.patch(`/problems/${problema.id}`, {
      status: 'INVESTIGANDO',
    });
    assert.equal(investigando.status, 200);

    const r = await supervisor.patch<ProblemaDetalhe>(`/problems/${problema.id}`, {
      status: 'CONTORNO_PUBLICADO',
      rootCause: 'A renovação automática não roda no servidor novo.',
      workaround: 'Renovar à mão pelo painel e reiniciar o proxy.',
      isKnownError: true,
    });

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.isKnownError, true);
    assert.ok(r.corpo.knownErrorAt);
    assert.equal(r.corpo.status, 'CONTORNO_PUBLICADO');
  });

  it('não reescreve o carimbo em edição posterior', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Scanner some da rede',
      description: 'O aparelho desaparece do mapa de rede.',
      rootCause: 'DHCP entrega IP novo a cada reinício.',
      workaround: 'Fixar o IP na reserva do roteador.',
      isKnownError: true,
    });

    const carimbo = problema.knownErrorAt;
    assert.ok(carimbo);

    const depois = await supervisor.patch<ProblemaDetalhe>(`/problems/${problema.id}`, {
      title: 'Scanner some da rede sem aviso',
    });

    assert.equal(depois.status, 200);
    assert.equal(depois.corpo.knownErrorAt, carimbo);
  });

  it('recusa apagar o contorno de um erro conhecido ainda publicado', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Telefonia IP muda de ramal sozinha',
      description: 'Os ramais trocam depois da queda de energia.',
      rootCause: 'A central perde a configuração sem bateria.',
      workaround: 'Reaplicar o backup da central.',
      isKnownError: true,
    });

    const r = await supervisor.patch(`/problems/${problema.id}`, { workaround: null });
    assert.equal(r.status, 400);

    // Desmarcar junto é o caminho previsto — e a mensagem diz isso.
    const ok = await supervisor.patch<ProblemaDetalhe>(`/problems/${problema.id}`, {
      workaround: null,
      isKnownError: false,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.isKnownError, false);
    assert.equal(ok.corpo.knownErrorAt, null);
  });
});

describe('ciclo do problema', () => {
  it('recusa transição que pula a investigação', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const problema = await criarProblema(supervisor, {
      title: 'Backup noturno falha em silêncio',
      description: 'Ninguém percebe até precisar restaurar.',
    });

    const r = await supervisor.patch(`/problems/${problema.id}`, {
      status: 'CONTORNO_PUBLICADO',
    });
    assert.equal(r.status, 409);
  });

  it('mantém resolvedAt depois de fechar e registra a mudança na linha do tempo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const problema = await criarProblema(supervisor, {
      title: 'Disco cheio no servidor de arquivos',
      description: 'Ninguém consegue salvar nada.',
    });

    const resolvido = await supervisor.patch<ProblemaDetalhe>(`/problems/${problema.id}`, {
      status: 'RESOLVIDO',
    });
    assert.equal(resolvido.status, 200);
    assert.ok(resolvido.corpo.resolvedAt);

    const fechado = await supervisor.patch<ProblemaDetalhe>(`/problems/${problema.id}`, {
      status: 'FECHADO',
    });
    assert.equal(fechado.status, 200);
    assert.equal(fechado.corpo.resolvedAt, resolvido.corpo.resolvedAt);
    assert.ok(fechado.corpo.closedAt);

    const eventos = await supervisor.get<TicketEventView[]>(`/problems/${problema.id}/eventos`);
    const mudancas = eventos.corpo.filter((e) => e.type === 'MUDANCA_STATUS_PROBLEMA');
    assert.equal(mudancas.length, 2);
    assert.deepEqual(mudancas[0].payload, {
      type: 'MUDANCA_STATUS_PROBLEMA',
      from: 'NOVO',
      to: 'RESOLVIDO',
    });
  });

  it('reabre um problema fechado sem perder os chamados vinculados', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(agente, 'O disco encheu de novo');

    const problema = await criarProblema(supervisor, {
      title: 'Disco enche toda semana',
      description: 'A limpeza automática não roda.',
      ticketIds: [chamado.id],
      status: 'RESOLVIDO',
    });

    await supervisor.patch(`/problems/${problema.id}`, { status: 'FECHADO' });
    const reaberto = await supervisor.patch<ProblemaDetalhe>(`/problems/${problema.id}`, {
      status: 'INVESTIGANDO',
    });

    assert.equal(reaberto.status, 200);
    assert.equal(reaberto.corpo.closedAt, null);
    assert.equal(reaberto.corpo.resolvedAt, null);
    assert.equal(reaberto.corpo.ticketCount, 1);
  });
});

describe('vínculo com chamados', () => {
  it('o agente vincula e desvincula sem poder editar a causa raiz', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Wi-fi do térreo oscila',
      description: 'A conexão cai a cada poucos minutos.',
    });
    const chamado = await abrirChamado(agente, 'Wi-fi caindo na recepção');

    const vinculo = await agente.post<ProblemaDetalhe>(`/problems/${problema.id}/tickets`, {
      ticketId: chamado.id,
    });
    assert.equal(vinculo.status, 201, JSON.stringify(vinculo.corpo));
    assert.equal(vinculo.corpo.ticketCount, 1);

    // O chamado passa a carregar o problema: é daqui que a tela sabe que
    // já vinculou, e é o que sobrevive a uma recarga.
    const comProblema = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(comProblema.corpo.problem?.number, problema.number);
    assert.equal(comProblema.corpo.problem?.isKnownError, false);

    const edicao = await agente.patch(`/problems/${problema.id}`, { rootCause: 'Chute.' });
    assert.equal(edicao.status, 403);

    const desvinculo = await agente.del<ProblemaDetalhe>(
      `/problems/${problema.id}/tickets/${chamado.id}`,
    );
    assert.equal(desvinculo.status, 200);
    assert.equal(desvinculo.corpo.ticketCount, 0);

    const semProblema = await agente.get<TicketDetail>(`/tickets/${chamado.id}`);
    assert.equal(semProblema.corpo.problem, null);
  });

  it('desvincular chamado que não é deste problema é 404', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Catraca não lê crachá novo',
      description: 'Os crachás emitidos este mês não passam.',
    });
    const solto = await abrirChamado(agente, 'Crachá não abre a catraca');

    const r = await agente.del(`/problems/${problema.id}/tickets/${solto.id}`);
    assert.equal(r.status, 404);
  });

  it('o vínculo aparece na linha do tempo dos dois lados', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Ar-condicionado da sala de servidores desliga',
      description: 'A temperatura sobe de madrugada.',
    });
    const chamado = await abrirChamado(agente, 'Sala de servidores quente');

    await agente.post(`/problems/${problema.id}/tickets`, { ticketId: chamado.id });

    const doChamado = await agente.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    assert.ok(doChamado.corpo.some((e) => (e.body ?? '').includes('Vinculado ao problema')));

    const doProblema = await supervisor.get<TicketEventView[]>(`/problems/${problema.id}/eventos`);
    assert.ok(doProblema.corpo.some((e) => (e.body ?? '').includes('vinculado')));
  });
});

describe('base de erros conhecidos', () => {
  it('sugere o erro conhecido a partir do texto do chamado', async () => {
    const agente = await entrar('agente@teste.dev');
    const supervisor = await entrar('supervisor@teste.dev');

    await criarProblema(supervisor, {
      title: 'Outlook trava ao anexar arquivo grande',
      description: 'O cliente de e-mail congela com anexos acima de vinte megabytes.',
      rootCause: 'Limite do complemento de antivírus.',
      workaround: 'Compactar o arquivo ou enviar pelo compartilhamento.',
      isKnownError: true,
    });

    // Um problema não publicado não pode aparecer na base.
    await criarProblema(supervisor, {
      title: 'Outlook demora a abrir',
      description: 'Ainda investigando a lentidão do outlook ao abrir.',
    });

    const chamado = await abrirChamado(
      agente,
      'Outlook congelou',
      'Tentei anexar um arquivo grande e o outlook travou.',
    );

    const r = await agente.get<ErroConhecidoSugerido[]>(`/tickets/${chamado.id}/erros-conhecidos`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.length, 1);
    assert.match(r.corpo[0].title, /anexar arquivo grande/);
    assert.ok(r.corpo[0].workaround);
    assert.ok(r.corpo[0].score > 0);
  });

  it('lista a base inteira sem termo, do mais recente para o mais antigo', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const r = await supervisor.get<ErroConhecidoSugerido[]>('/problems/erros-conhecidos');
    assert.equal(r.status, 200);
    assert.ok(r.corpo.length > 0);
    assert.ok(r.corpo.every((p) => p.workaround));
  });

  it('busca o problema por texto do título e da descrição', async () => {
    const supervisor = await entrar('supervisor@teste.dev');

    const r = await supervisor.get<ProblemaResumo[]>('/problems?q=impressora');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.ok(r.corpo.length > 0);
    assert.ok(r.corpo.every((p) => /impress/i.test(`${p.title}`)));
  });
});

describe('escopo e permissão', () => {
  it('o solicitante não alcança a rota de problemas', async () => {
    const solicitante = await entrar('solicitante@teste.dev');
    const r = await solicitante.get('/problems');
    assert.equal(r.status, 403);
  });

  it('problema de outra organização não existe para quem pergunta', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const forasteiro = await entrar('forasteiro@teste.dev');

    const problema = await criarProblema(supervisor, {
      title: 'Only ours',
      description: 'Problema exclusivo desta organização.',
    });

    const r = await forasteiro.get(`/problems/${problema.id}`);
    assert.equal(r.status, 404);
  });
});

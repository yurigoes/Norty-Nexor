import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { ConviteDeSenha, FormularioView, TicketDetail, TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * A troca de senha que o sistema resolve sozinho.
 *
 * O que se prova aqui são as cercas, porque é o que separa um recurso
 * útil de uma porta dos fundos:
 *
 * 1. **O sistema não manda senha.** Manda um link, e o link vale uma
 *    vez, por quinze minutos.
 * 2. **Só corre com identidade provada.** Chamado aberto por e-mail ou
 *    WhatsApp não executa: a mensagem prova o endereço, não a pessoa.
 * 3. **Só a senha de quem pediu**, e nunca a de conta de diretório.
 * 4. **Recusa é registrada**, em português, para quem for atender.
 *
 * O que sai é lido na **fila de saída** (`OutboundMessage`), e não no
 * transporte: a fila é onde a mensagem existe assim que o chamado abre,
 * e é ali que se vê o que ela carrega — e, principalmente, o que ela
 * não carrega.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;
let solicitante: Cliente;

/** O modelo de chamado que dispara a troca de senha. */
let modelo: FormularioView;

before(async () => {
  await limparBanco();
  f = await semear();

  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);

  solicitante = new Cliente(api.url);
  assert.equal((await solicitante.entrar('solicitante@teste.dev')).status, 200);

  // O modelo nasce pela API, e não pelo Prisma: é o caminho que a tela
  // usa, e é onde um campo esquecido no DTO some em silêncio.
  const r = await admin.post<FormularioView>('/forms', {
    name: 'Trocar minha senha',
    schema: { fields: [] },
    isModel: true,
    acaoAutomatica: 'RESET_DE_SENHA',
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(r.corpo.acaoAutomatica, 'RESET_DE_SENHA', 'o DTO engoliu a ação');
  modelo = r.corpo;

  // O solicitante precisa de WhatsApp para o teste dos dois canais.
  await prisma.user.update({
    where: { id: f.solicitante.id },
    data: { phone: '5511999990000' },
  });
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.outboundMessage.deleteMany({});
  // Os cenários daqui são independentes, mas compartilham o IP da
  // suíte: sem limpar, a escada de bloqueio de um teste barra o
  // seguinte, e a falha aparece longe da causa. Quem prova a escada é a
  // carteira e a consulta por protocolo.
  await prisma.loginThrottle.deleteMany({});
});

/** O que está na fila de saída agora. */
async function naFila(): Promise<{ para: string; corpo: string }[]> {
  const linhas = await prisma.outboundMessage.findMany({
    select: { toAddress: true, body: true },
  });
  return linhas.map((l) => ({ para: l.toAddress, corpo: l.body }));
}

async function pedirTroca(quem: Cliente = solicitante): Promise<TicketDetail> {
  const r = await quem.post<TicketDetail>('/tickets', {
    subject: 'Esqueci minha senha',
    description: 'Não consigo entrar no sistema.',
    formId: modelo.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** O link que saiu na mensagem, se saiu algum. */
async function linkEnviado(): Promise<string | null> {
  for (const mensagem of await naFila()) {
    const achado = /\/definir-senha\/([A-Za-z0-9_-]+)/.exec(mensagem.corpo);
    if (achado) return achado[1];
  }
  return null;
}

async function notasInternas(ticketId: string): Promise<string[]> {
  const eventos = await prisma.ticketEvent.findMany({
    where: { ticketId, visibility: 'INTERNA' },
    select: { body: true },
  });
  return eventos.map((e) => e.body ?? '');
}

// ---------------------------------------------------------------------

describe('o caminho feliz', () => {
  it('manda o link pelos dois canais, resolve o chamado, e não manda senha nenhuma', async () => {
    const chamado = await pedirTroca();

    const fila = await naFila();
    assert.equal(fila.filter((m) => m.para === 'solicitante@teste.dev').length, 1, JSON.stringify(fila));
    assert.equal(fila.filter((m) => m.para === '5511999990000').length, 1, JSON.stringify(fila));

    const token = await linkEnviado();
    assert.ok(token, `nenhum link na mensagem: ${JSON.stringify(fila)}`);

    // O que a mensagem **não** carrega. Se algum dia alguém trocar o
    // link por uma senha sorteada, é aqui que isso aparece.
    for (const mensagem of fila) {
      assert.equal(
        /senha (provis[óo]ria|tempor[áa]ria|nova)[:\s]+\S{6,}/i.test(mensagem.corpo),
        false,
        `a mensagem parece carregar uma senha: ${mensagem.corpo}`,
      );
    }

    // O banco guarda o hash, não o token.
    const linha = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: f.solicitante.id },
    });
    assert.notEqual(linha.tokenHash, token);
    assert.equal(linha.tokenHash.length, 64, 'o hash deveria ser SHA-256 em hexadecimal');
    assert.equal(linha.ticketId, chamado.id, 'o link deveria apontar para o chamado que o pediu');

    // Quinze minutos, não um dia.
    const minutos = (linha.expiresAt.getTime() - linha.createdAt.getTime()) / 60_000;
    assert.ok(minutos > 10 && minutos <= 20, `validade fora do esperado: ${minutos} min`);

    const depois = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.equal(depois.status, 'SOLUCIONADO');
    assert.ok(depois.solvedAt);

    // E a linha do tempo conta o que aconteceu — sem repetir o link,
    // que quem atende também lê.
    const publicos = await prisma.ticketEvent.findMany({
      where: { ticketId: chamado.id, visibility: 'PUBLICA' },
      select: { body: true },
    });
    const texto = publicos.map((e) => e.body ?? '').join('\n');
    assert.ok(texto.includes('Link de troca de senha enviado'), texto);
    assert.equal(texto.includes(token), false, 'o link vazou na linha do tempo');
  });

  it('o link troca a senha, vale uma vez só e derruba as sessões abertas', async () => {
    await pedirTroca();
    const token = await linkEnviado();
    assert.ok(token);

    // A tela pergunta antes de pedir a senha nova.
    const convite = await new Cliente(api.url).get<ConviteDeSenha>(`/publico/definir-senha/${token}`);
    assert.equal(convite.status, 200, JSON.stringify(convite.corpo));
    assert.equal(convite.corpo.valido, true);
    assert.equal(convite.corpo.nome, 'Solicitante');

    // Havia sessão aberta (o `solicitante` está logado desde o começo).
    const antes = await prisma.refreshToken.count({
      where: { userId: f.solicitante.id, revokedAt: null },
    });
    assert.ok(antes > 0, 'o teste precisa de uma sessão aberta para provar a derrubada');

    const anonimo = new Cliente(api.url);
    const trocou = await anonimo.post('/publico/definir-senha', {
      token,
      nova: 'senha-nova-do-solicitante',
    });
    assert.equal(trocou.status, 201, JSON.stringify(trocou.corpo));

    // Toda sessão aberta caiu: se a troca aconteceu porque alguém
    // entrou na conta, deixar a sessão dele viva anularia a troca.
    // Conferido **antes** de entrar de novo — entrar cria sessão nova.
    assert.equal(
      await prisma.refreshToken.count({ where: { userId: f.solicitante.id, revokedAt: null } }),
      0,
    );

    // A senha nova entra.
    const novo = new Cliente(api.url);
    assert.equal(
      (await novo.entrar('solicitante@teste.dev', 'senha-nova-do-solicitante')).status,
      200,
    );

    // A velha, não.
    assert.equal((await new Cliente(api.url).entrar('solicitante@teste.dev', '123456')).status, 401);

    // Uma vez só.
    const denovo = await new Cliente(api.url).post('/publico/definir-senha', {
      token,
      nova: 'outra-senha-qualquer',
    });
    assert.equal(denovo.status, 400, JSON.stringify(denovo.corpo));

    // E o convite deixa de valer, sem dizer por quê.
    const morto = await new Cliente(api.url).get<ConviteDeSenha>(`/publico/definir-senha/${token}`);
    assert.equal(morto.corpo.valido, false);
    assert.equal(morto.corpo.nome, null);

    // Devolve a senha da fixtura para os testes seguintes.
    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
    solicitante = new Cliente(api.url);
    assert.equal(
      (await solicitante.entrar('solicitante@teste.dev', 'senha-nova-do-solicitante')).status,
      200,
    );
  });

  it('pedir de novo queima o link anterior', async () => {
    await pedirTroca();
    const primeiro = await linkEnviado();
    assert.ok(primeiro);

    await prisma.outboundMessage.deleteMany({});
    await pedirTroca();
    const segundo = await linkEnviado();
    assert.ok(segundo);
    assert.notEqual(primeiro, segundo);

    // O antigo esquecido numa caixa de e-mail não continua valendo.
    const velho = await new Cliente(api.url).get<ConviteDeSenha>(
      `/publico/definir-senha/${primeiro}`,
    );
    assert.equal(velho.corpo.valido, false);

    const novo = await new Cliente(api.url).get<ConviteDeSenha>(`/publico/definir-senha/${segundo}`);
    assert.equal(novo.corpo.valido, true);

    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
  });
});

describe('as cercas', () => {
  it('chamado por e-mail não troca senha — a mensagem prova o endereço, não a pessoa', async () => {
    const { TicketsService } = await import('../src/modules/tickets/tickets.service');
    const tickets = api.app.get(TicketsService);

    const contato = await prisma.contact.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Solicitante',
        email: 'solicitante@teste.dev',
      },
    });

    // O requerente é o usuário de verdade: assim o **único** motivo
    // para a ação não correr é o canal. Sem isso, o teste passaria
    // porque faltou usuário, e a cerca do canal ficaria por provar.
    const chamado = await tickets.abrirPorCanal({
      organizationId: f.organizacao.id,
      contactId: contato.id,
      requesterUserId: f.solicitante.id,
      subject: 'Esqueci minha senha',
      description: 'Não entro mais.',
      channel: 'EMAIL',
      formId: modelo.id,
    });

    assert.equal((await linkEnviado()), null, `saiu link por canal externo: ${JSON.stringify(await naFila())}`);
    assert.equal(
      await prisma.passwordResetToken.count({ where: { ticketId: chamado.id } }),
      0,
    );

    const notas = (await notasInternas(chamado.id)).join('\n');
    assert.ok(notas.includes('Ação automática não executada'), notas);
    assert.ok(notas.includes('logado ou pelo integrador'), notas);

    // E o chamado continua vivo, para uma pessoa atender.
    const depois = await prisma.ticket.findUniqueOrThrow({ where: { id: chamado.id } });
    assert.notEqual(depois.status, 'SOLUCIONADO');
  });

  it('conta de diretório não troca senha aqui — a senha é do AD', async () => {
    const fonte = await prisma.authSource.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'AD da matriz',
        host: 'dc01.teste.local',
        port: 389,
        security: 'STARTTLS',
        baseDn: 'dc=teste,dc=local',
        loginField: 'sAMAccountName',
        syncField: 'objectGUID',
        emailField: 'mail',
        nameField: 'displayName',
      },
    });

    await prisma.user.update({
      where: { id: f.solicitante.id },
      data: { authSourceId: fonte.id, externalId: 'guid-de-teste' },
    });

    const chamado = await pedirTroca();

    assert.equal((await linkEnviado()), null, JSON.stringify(await naFila()));
    const notas = (await notasInternas(chamado.id)).join('\n');
    assert.ok(notas.includes('AD da matriz'), notas);

    await prisma.user.update({
      where: { id: f.solicitante.id },
      data: { authSourceId: null, externalId: null },
    });
  });

  it('o limite por hora corta o envio em série', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });

    for (let i = 0; i < 3; i += 1) {
      await prisma.outboundMessage.deleteMany({});
      await pedirTroca();
      assert.ok((await linkEnviado()), `o envio ${i + 1} deveria ter passado`);
    }

    await prisma.outboundMessage.deleteMany({});
    const quarto = await pedirTroca();

    assert.equal((await linkEnviado()), null, 'o quarto pedido na mesma hora deveria ter sido barrado');
    const notas = (await notasInternas(quarto.id)).join('\n');
    assert.ok(notas.includes('links de troca de senha na última hora'), notas);

    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
  });

  it('modelo sem ação não executa nada', async () => {
    const simples = await admin.post<FormularioView>('/forms', {
      name: 'Chamado comum',
      schema: { fields: [] },
      isModel: true,
    });
    assert.equal(simples.status, 201, JSON.stringify(simples.corpo));
    assert.equal(simples.corpo.acaoAutomatica, null);

    const r = await solicitante.post<TicketDetail>('/tickets', {
      subject: 'Impressora não imprime',
      description: 'Não sai nada.',
      formId: simples.corpo.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    assert.equal((await linkEnviado()), null);
    assert.equal(r.corpo.status, 'NOVO');
  });

  it('a categoria que exige aval segura a ação, e o aval a solta', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });

    const categoria = await prisma.category.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Acesso com aval',
        requiresApproval: true,
      },
    });

    const comAval = await admin.post<FormularioView>('/forms', {
      name: 'Trocar senha com aval',
      schema: { fields: [] },
      isModel: true,
      categoryId: categoria.id,
      acaoAutomatica: 'RESET_DE_SENHA',
    });
    assert.equal(comAval.status, 201, JSON.stringify(comAval.corpo));

    const r = await solicitante.post<TicketDetail>('/tickets', {
      subject: 'Preciso de acesso novo',
      description: 'Com aval do gestor.',
      formId: comAval.corpo.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    // Segurou. O chamado **não** vai para `EM_APROVACAO`: o aval da
    // categoria corre ao lado, e o chamado segue o curso normal
    // (`docs/13`, seção 10). O que segura a ação é o aval em aberto, e
    // é isso que se confere aqui.
    assert.equal(r.corpo.status, 'NOVO', JSON.stringify(r.corpo));
    assert.equal(
      await prisma.approval.count({ where: { ticketId: r.corpo.id, status: 'AGUARDANDO' } }),
      1,
      'o aval da categoria não foi pedido — o teste não provaria a espera',
    );
    assert.equal((await linkEnviado()), null, JSON.stringify(await naFila()));

    // O administrador aprova, e aí a ação corre.
    const pendentes = await admin.get<{ id: string }[]>('/aprovacoes/minhas');
    assert.equal(pendentes.status, 200, JSON.stringify(pendentes.corpo));
    const aval = pendentes.corpo[0];
    assert.ok(aval, JSON.stringify(pendentes.corpo));

    await prisma.outboundMessage.deleteMany({});
    const decidiu = await admin.post(`/aprovacoes/${aval.id}/decidir`, {
      decision: 'APROVADO',
    });
    assert.equal(decidiu.status, 201, JSON.stringify(decidiu.corpo));

    assert.ok((await linkEnviado()), `o aval passou e o link não saiu: ${JSON.stringify(await naFila())}`);

    const depois = await prisma.ticket.findUniqueOrThrow({ where: { id: r.corpo.id } });
    assert.equal(depois.status, 'SOLUCIONADO');

    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
  });
});

describe('a porta sem sessão', () => {
  it('token inventado é recusado sem contar o que houve', async () => {
    const r = await new Cliente(api.url).get<ConviteDeSenha>(
      '/publico/definir-senha/token-que-nunca-existiu-mas-tem-tamanho',
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { valido: false, nome: null });

    const post = await new Cliente(api.url).post('/publico/definir-senha', {
      token: 'token-que-nunca-existiu-mas-tem-tamanho',
      nova: 'uma-senha-qualquer',
    });
    assert.equal(post.status, 400);
  });

  it('link expirado não vale mais', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
    await pedirTroca();
    const token = await linkEnviado();
    assert.ok(token);

    await prisma.passwordResetToken.updateMany({
      where: { userId: f.solicitante.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const r = await new Cliente(api.url).get<ConviteDeSenha>(`/publico/definir-senha/${token}`);
    assert.equal(r.corpo.valido, false);

    const post = await new Cliente(api.url).post('/publico/definir-senha', {
      token,
      nova: 'uma-senha-qualquer',
    });
    assert.equal(post.status, 400);

    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
  });

  it('senha curta é recusada — a mesma regra da troca pela tela de conta', async () => {
    await pedirTroca();
    const token = await linkEnviado();
    assert.ok(token);

    const r = await new Cliente(api.url).post('/publico/definir-senha', { token, nova: 'curta' });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));

    // E o link continua valendo: recusar a senha não pode queimar o
    // convite, ou a pessoa fica de fora por ter errado a digitação.
    const ainda = await new Cliente(api.url).get<ConviteDeSenha>(`/publico/definir-senha/${token}`);
    assert.equal(ainda.corpo.valido, true);

    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
  });

  it('a lista de eventos do chamado não devolve o link', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
    const chamado = await pedirTroca();
    const token = await linkEnviado();
    assert.ok(token);

    // Quem lê é o administrador: ele enxerga todo chamado da
    // organização, e é justamente de quem o link precisa ficar
    // escondido. O agente não serviria — sem time no chamado, ele nem o
    // enxerga, e o teste passaria por falta de acesso.
    const eventos = await admin.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    assert.equal(eventos.status, 200, JSON.stringify(eventos.corpo));
    assert.equal(
      JSON.stringify(eventos.corpo).includes(token),
      false,
      'o link apareceu para quem atende',
    );

    await prisma.passwordResetToken.deleteMany({ where: { userId: f.solicitante.id } });
  });
});

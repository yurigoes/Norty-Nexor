import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FormularioView, ModeloDeChamado, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Destino do modelo e aprovação exigida pela categoria.
 *
 * Duas configurações que só aparecem quando discordam de outra. O que
 * se prova aqui é a ordem — modelo escolhido vence categoria, pessoa
 * vence time — e quem recebe o pedido de aval: o gestor **daquela
 * empresa**, mais o administrador, nunca o gestor de outro cliente.
 */

let api: Api;
let f: Fixtura;
let admin: { id: string };
let clienteA: { id: string };
let clienteB: { id: string };
let gestorA: { id: string };
let gestorB: { id: string };

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  const criar = async (email: string, name: string, role: 'GESTOR' | 'ADMINISTRADOR' | 'SOLICITANTE', clientId: string | null) => {
    const argon2 = await import('argon2');
    const u = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await argon2.hash('123456', { type: argon2.argon2id }),
        mustChangePassword: false,
      },
    });
    await prisma.membership.create({
      data: { userId: u.id, organizationId: f.organizacao.id, role, clientId },
    });
    return u;
  };

  clienteA = await prisma.client.create({
    data: { organizationId: f.organizacao.id, name: 'Alfa LTDA', emailDomain: 'alfa.com.br' },
  });
  clienteB = await prisma.client.create({
    data: { organizationId: f.organizacao.id, name: 'Beta LTDA', emailDomain: 'beta.com.br' },
  });

  admin = await criar('admin@teste.dev', 'Administradora', 'ADMINISTRADOR', null);
  gestorA = await criar('gestor@alfa.com.br', 'Gestor da Alfa', 'GESTOR', clienteA.id);
  gestorB = await criar('gestor@beta.com.br', 'Gestor da Beta', 'GESTOR', clienteB.id);
  await criar('pessoa@alfa.com.br', 'Pessoa da Alfa', 'SOLICITANTE', clienteA.id);
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

const atribuido = (chamado: TicketDetail) => ({
  pessoa: chamado.assignedUser?.id ?? null,
  time: chamado.assignedTeam?.id ?? null,
});

describe('destino do modelo escolhido', () => {
  it('vence o destino da categoria', async () => {
    // A categoria manda para o time "Suporte"…
    await prisma.category.update({
      where: { id: f.categoria.id },
      data: { defaultTeamId: f.time.id, defaultAssigneeId: null },
    });
    // …e o modelo manda para "Sustentação".
    const modelo = await prisma.ticketForm.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Troca de toner',
        schema: { fields: [] },
        isModel: true,
        defaultTeamId: f.outroTime.id,
      },
    });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Toner acabou',
      description: 'A impressora do quinto andar.',
      categoryId: f.categoria.id,
      formId: modelo.id,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(atribuido(r.corpo), { pessoa: null, time: f.outroTime.id });
    assert.equal(r.corpo.status, 'ATRIBUIDO');
  });

  it('sem modelo escolhido, vale o da categoria', async () => {
    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Impressora não liga',
      description: 'Sem nenhum modelo escolhido.',
      categoryId: f.categoria.id,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(atribuido(r.corpo), { pessoa: null, time: f.time.id });
  });

  it('a pessoa do modelo vence o time do modelo', async () => {
    const modelo = await prisma.ticketForm.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Acesso nominal',
        schema: { fields: [] },
        isModel: true,
        defaultTeamId: f.time.id,
        defaultAssigneeId: f.outroAgente.id,
      },
    });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Preciso de acesso',
      description: 'Deve cair na pessoa, não no time.',
      categoryId: f.categoria.id,
      formId: modelo.id,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(atribuido(r.corpo), { pessoa: f.outroAgente.id, time: null });
  });

  it('ficha que não é modelo não pode ser escolhida', async () => {
    const soHeranca = await prisma.ticketForm.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Só para herdar',
        schema: { fields: [] },
        isModel: false,
        defaultTeamId: f.outroTime.id,
      },
    });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post('/tickets', {
      subject: 'Tentando escolher uma ficha que não é modelo',
      description: 'A API tem de recusar isto.',
      formId: soHeranca.id,
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });
});

describe('painel rápido: o modelo escolhido carrega e grava', () => {
  it('a lista de modelos chega a quem abre chamado, com os campos junto', async () => {
    const admin = await entrar('admin@teste.dev');
    const criado = await admin.post<FormularioView>('/forms', {
      name: 'Impressora do painel',
      description: 'Não imprime, atola, sai borrado.',
      schema: {
        fields: [{ key: 'patrimonio', label: 'Patrimônio', type: 'TEXTO', required: true }],
      },
      isModel: true,
      position: 1,
    });
    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    // Quem abre chamado é um agente, não quem configura: o painel
    // precisa aparecer para ele, e é por isso que a rota não exige
    // `config:formularios`.
    const agente = await entrar('agente@teste.dev');
    const r = await agente.get<ModeloDeChamado[]>('/forms/modelos');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const escolhido = (r.corpo ?? []).find((m) => m.name === 'Impressora do painel');
    assert.ok(escolhido, 'o modelo aparece no painel');
    assert.equal(escolhido.description, 'Não imprime, atola, sai borrado.');
    assert.equal(
      escolhido.schema.fields[0]?.key,
      'patrimonio',
      'os campos vêm junto: clicar e ver é um gesto só',
    );
  });

  it('o chamado aberto pelo modelo grava as respostas contra o schema dele', async () => {
    const agente = await entrar('agente@teste.dev');
    const modelos = await agente.get<ModeloDeChamado[]>('/forms/modelos');
    const escolhido = (modelos.corpo ?? []).find((m) => m.name === 'Impressora do painel');
    assert.ok(escolhido);

    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Impressora do quinto andar não imprime',
      description: 'Desde hoje de manhã, sem mensagem de erro.',
      formId: escolhido.id,
      customFields: { patrimonio: 'PAT-9090' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.form?.id, escolhido.id, 'o chamado guarda qual modelo respondeu');
    assert.deepEqual(r.corpo.customFields, { patrimonio: 'PAT-9090' });
  });

  it('campo obrigatório do modelo em branco é recusado', async () => {
    const agente = await entrar('agente@teste.dev');
    const modelos = await agente.get<ModeloDeChamado[]>('/forms/modelos');
    const escolhido = (modelos.corpo ?? []).find((m) => m.name === 'Impressora do painel');
    assert.ok(escolhido);

    const r = await agente.post('/tickets', {
      subject: 'Impressora sem o patrimônio',
      description: 'O obrigatório do modelo ficou em branco.',
      formId: escolhido.id,
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(JSON.stringify(r.corpo), /Patrimônio/);
  });
});

describe('gravar o destino pela tela', () => {
  /**
   * O buraco que este teste tapa: os outros criam o modelo direto no
   * Prisma, e por isso a suíte ficou verde enquanto o `defaultTeamId`
   * era descartado no caminho — o contrato e a tela tinham o campo, o
   * DTO da API não. Configurar pela tela não gravava nada, e nenhum
   * teste percebia.
   */
  it('o destino escolhido na tela chega ao banco e volta na leitura', async () => {
    const admin = await entrar('admin@teste.dev');

    const criado = await admin.post<FormularioView>('/forms', {
      name: 'Modelo com destino',
      schema: { fields: [] },
      isModel: true,
      defaultTeamId: f.outroTime.id,
    });
    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.equal(criado.corpo.defaultTeam?.id, f.outroTime.id);

    // E a troca para uma pessoa também grava.
    const editado = await admin.patch<FormularioView>(`/forms/${criado.corpo.id}`, {
      defaultTeamId: null,
      defaultAssigneeId: f.agente.id,
    });
    assert.equal(editado.status, 200, JSON.stringify(editado.corpo));
    assert.equal(editado.corpo.defaultAssignee?.id, f.agente.id);
    assert.equal(editado.corpo.defaultTeam, null);

    // E o chamado aberto com ele cai onde a tela prometeu.
    const agente = await entrar('agente@teste.dev');
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Chamado do modelo configurado pela tela',
      description: 'Tem de cair na pessoa escolhida lá.',
      formId: criado.corpo.id,
    });
    assert.equal(chamado.status, 201, JSON.stringify(chamado.corpo));
    assert.deepEqual(atribuido(chamado.corpo), { pessoa: f.agente.id, time: null });
  });
});

describe('aprovação exigida pela categoria', () => {
  it('o chamado abre normalmente e o pedido nasce junto', async () => {
    const compras = await prisma.category.create({
      data: { organizationId: f.organizacao.id, name: 'Compras', requiresApproval: true },
    });

    const pessoa = await entrar('pessoa@alfa.com.br');
    const r = await pessoa.post<TicketDetail>('/tickets', {
      subject: 'Comprar um monitor',
      description: 'O meu está com uma faixa preta.',
      categoryId: compras.id,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    // "O chamado é aberto normalmente": nada de antessala.
    assert.notEqual(r.corpo.status, 'EM_APROVACAO');

    const pedidos = await prisma.approval.findMany({ where: { ticketId: r.corpo.id } });
    assert.ok(pedidos.length > 0, 'nasceu pedido de aprovação');
    assert.ok(
      pedidos.every((p) => p.quorum === 1),
      'quórum 1: o primeiro que decidir resolve',
    );
  });

  it('quem decide é o gestor daquela empresa e o administrador — não o gestor de outra', async () => {
    const compras = await prisma.category.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Compras' },
    });

    const pessoa = await entrar('pessoa@alfa.com.br');
    const r = await pessoa.post<TicketDetail>('/tickets', {
      subject: 'Comprar uma cadeira',
      description: 'A minha quebrou o apoio de braço.',
      categoryId: compras.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const pedidos = await prisma.approval.findMany({
      where: { ticketId: r.corpo.id },
      select: { approverId: true },
    });
    const quem = new Set(pedidos.map((p) => p.approverId));

    assert.ok(quem.has(gestorA.id), 'o gestor da Alfa decide');
    assert.ok(quem.has(admin.id), 'o administrador sempre pode');
    assert.ok(!quem.has(gestorB.id), 'o gestor da Beta NÃO vê o pedido da Alfa');
    assert.ok(!quem.has(f.gestor.id), 'gestor sem empresa não entra pela porta da empresa');
  });

  /**
   * O requerente sai da lista, e quando isso a esvazia o chamado segue
   * sem aval — com a razão escrita na linha do tempo.
   *
   * Quem abre aqui é a administradora, que é a única da organização:
   * tirada de si mesma, não sobra aprovador. É o caso extremo, e ele
   * prova as duas regras de uma vez — a auto-aprovação não acontece, e
   * a ausência de aprovador não trava o chamado num pedido que ninguém
   * pode decidir.
   *
   * (O gestor seria o exemplo mais natural, mas `GESTOR` não tem
   * `chamado:criar` na matriz: quem lê indicador não abre chamado.)
   */
  it('o requerente não aprova o próprio pedido', async () => {
    const compras = await prisma.category.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Compras' },
    });

    const administradora = await entrar('admin@teste.dev');
    const r = await administradora.post<TicketDetail>('/tickets', {
      subject: 'Comprar um teclado',
      description: 'Pedido feito pela própria administradora.',
      categoryId: compras.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const pedidos = await prisma.approval.findMany({
      where: { ticketId: r.corpo.id },
      select: { approverId: true },
    });
    assert.ok(
      !pedidos.some((p) => p.approverId === admin.id),
      'ela não aprova o próprio pedido',
    );
    assert.equal(pedidos.length, 0, 'sem mais ninguém, não nasce pedido algum');

    const notas = await prisma.ticketEvent.findMany({
      where: { ticketId: r.corpo.id, type: 'APROVACAO' },
      select: { body: true, visibility: true },
    });
    assert.equal(notas.length, 1, 'a razão fica registrada');
    assert.match(notas[0]!.body ?? '', /não há gestor desta empresa nem administrador/);
    assert.equal(notas[0]!.visibility, 'INTERNA', 'é conversa da casa');
  });

  it('a exigência herda pela árvore de categorias', async () => {
    const compras = await prisma.category.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Compras' },
    });
    const filha = await prisma.category.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Licenças',
        parentId: compras.id,
        // Sem a marca: ela tem de herdar da mãe.
        requiresApproval: false,
      },
    });

    const pessoa = await entrar('pessoa@alfa.com.br');
    const r = await pessoa.post<TicketDetail>('/tickets', {
      subject: 'Comprar uma licença do Office',
      description: 'Para a máquina nova do financeiro.',
      categoryId: filha.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const pedidos = await prisma.approval.findMany({ where: { ticketId: r.corpo.id } });
    assert.ok(pedidos.length > 0, 'a filha herdou a exigência da mãe');
  });

  it('categoria sem a marca não cria pedido nenhum', async () => {
    const pessoa = await entrar('pessoa@alfa.com.br');
    const r = await pessoa.post<TicketDetail>('/tickets', {
      subject: 'Impressora atolou',
      description: 'Categoria comum, sem exigência de aval.',
      categoryId: f.categoria.id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const pedidos = await prisma.approval.findMany({ where: { ticketId: r.corpo.id } });
    assert.equal(pedidos.length, 0);
  });
});

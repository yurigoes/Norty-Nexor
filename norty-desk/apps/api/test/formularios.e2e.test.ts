import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FormularioResolvido, FormularioView, ProblemDetails, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Formulário dinâmico por categoria.
 *
 * O que se prova aqui e em nenhum outro lugar: a resposta é conferida
 * contra o schema **na API**, não só na tela; o formulário é herdado da
 * categoria acima antes de cair no padrão da organização; campo interno
 * não é aceito de quem abre pelo portal; e apagar formulário já
 * respondido é recusado, porque levaria junto o significado das
 * respostas gravadas.
 */

let api: Api;
let f: Fixtura;
let adminId: string;

const SCHEMA = {
  fields: [
    { key: 'patrimonio', label: 'Patrimônio', type: 'TEXTO', required: true },
    { key: 'ramal', label: 'Ramal', type: 'NUMERO', required: false },
    {
      key: 'andar',
      label: 'Andar',
      type: 'SELECAO',
      required: true,
      options: [
        { value: 'terreo', label: 'Térreo' },
        { value: 'primeiro', label: '1º andar' },
      ],
    },
    { key: 'diagnostico', label: 'Diagnóstico do agente', type: 'TEXTO', required: false, internal: true },
  ],
};

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
  adminId = admin.id;

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

async function criarFormulario(
  cliente: Cliente,
  corpo: Record<string, unknown> = {},
): Promise<FormularioView> {
  const r = await cliente.post<FormularioView>('/forms', {
    name: `Formulário ${Math.random().toString(36).slice(2, 8)}`,
    schema: SCHEMA,
    categoryId: f.categoria.id,
    ...corpo,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** Apaga os formulários entre casos: a resolução olha a organização inteira. */
async function limparFormularios(): Promise<void> {
  await prisma.ticket.updateMany({ data: { formId: null } });
  await prisma.ticketForm.deleteMany({});
}

// ---------------------------------------------------------------------

describe('cadastro do formulário', () => {
  it('recusa um schema mal montado, com um erro por campo', async () => {
    const admin = await entrar('admin@teste.dev');

    const r = await admin.post<ProblemDetails>('/forms', {
      name: 'Formulário torto',
      schema: {
        fields: [
          { key: 'ramal', label: 'Ramal', type: 'TEXTO', required: false },
          { key: 'ramal', label: 'Outro ramal', type: 'TEXTO', required: false },
          { key: 'andar', label: 'Andar', type: 'SELECAO', required: true, options: [] },
        ],
      },
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    const mensagens = r.corpo.errors?.corpo ?? [];
    assert.ok(mensagens.some((m) => m.includes('repetida')), JSON.stringify(mensagens));
    assert.ok(mensagens.some((m) => m.includes('ao menos uma opção')), JSON.stringify(mensagens));
  });

  it('nome repetido é 409 com a frase', async () => {
    const admin = await entrar('admin@teste.dev');
    const nome = 'Formulário de hardware';

    await criarFormulario(admin, { name: nome });
    const segunda = await admin.post<ProblemDetails>('/forms', {
      name: nome,
      schema: SCHEMA,
    });

    assert.equal(segunda.status, 409);
    assert.match(segunda.corpo.title, /Já existe um formulário/);
    await limparFormularios();
  });

  it('só um formulário padrão por organização', async () => {
    const admin = await entrar('admin@teste.dev');

    const primeiro = await criarFormulario(admin, { categoryId: null, isDefault: true });
    const segundo = await criarFormulario(admin, { categoryId: null, isDefault: true });

    const lista = await admin.get<FormularioView[]>('/forms');
    const padroes = lista.corpo.filter((x) => x.isDefault);

    assert.equal(padroes.length, 1);
    assert.equal(padroes[0].id, segundo.id);
    assert.notEqual(padroes[0].id, primeiro.id);
    await limparFormularios();
  });
});

describe('resolução por categoria', () => {
  it('a categoria filha herda o formulário da categoria acima', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: f.categoria.id });

    const filha = await prisma.category.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Impressora',
        parentId: f.categoria.id,
      },
    });

    const r = await admin.get<FormularioResolvido>(`/forms/resolver?categoryId=${filha.id}`);

    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.origem, 'CATEGORIA_ACIMA');
    assert.ok(r.corpo.form);
    await limparFormularios();
  });

  it('sem formulário na árvore, cai no padrão da organização', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: null, isDefault: true });

    const r = await admin.get<FormularioResolvido>(`/forms/resolver?categoryId=${f.semTime.id}`);

    assert.equal(r.corpo.origem, 'PADRAO');
    assert.ok(r.corpo.form);
    await limparFormularios();
  });

  it('sem nada configurado, a categoria não tem formulário', async () => {
    const admin = await entrar('admin@teste.dev');
    const r = await admin.get<FormularioResolvido>(`/forms/resolver?categoryId=${f.categoria.id}`);

    assert.equal(r.corpo.origem, 'NENHUM');
    assert.equal(r.corpo.form, null);
  });

  it('quem abre chamado resolve o formulário sem poder configurá-lo', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: f.categoria.id });

    const agente = await entrar('agente@teste.dev');
    assert.equal(
      (await agente.get(`/forms/resolver?categoryId=${f.categoria.id}`)).status,
      200,
    );
    assert.equal((await agente.get('/forms')).status, 403);
    await limparFormularios();
  });
});

describe('respostas na abertura', () => {
  it('grava as respostas e devolve o schema junto do chamado', async () => {
    const admin = await entrar('admin@teste.dev');
    const formulario = await criarFormulario(admin, { categoryId: f.categoria.id });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Computador não liga',
      description: 'Nada acontece ao apertar o botão.',
      categoryId: f.categoria.id,
      customFields: { patrimonio: 'PAT-4721', andar: 'terreo', ramal: 2210 },
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo.customFields, {
      patrimonio: 'PAT-4721',
      andar: 'terreo',
      ramal: 2210,
    });
    assert.equal(r.corpo.form?.id, formulario.id);
    assert.equal(r.corpo.form?.schema.fields.length, 4);
    await limparFormularios();
  });

  it('cobra o obrigatório em branco — na API, não só na tela', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: f.categoria.id });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<ProblemDetails>('/tickets', {
      subject: 'Computador não liga',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { andar: 'terreo' },
    });

    assert.equal(r.status, 400);
    assert.ok((r.corpo.errors?.corpo ?? []).some((m) => m.includes('patrimonio')));
    await limparFormularios();
  });

  it('recusa valor fora das opções e chave desconhecida', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: f.categoria.id });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<ProblemDetails>('/tickets', {
      subject: 'Computador não liga',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { patrimonio: 'PAT-1', andar: 'cobertura', inventado: 'oi' },
    });

    assert.equal(r.status, 400);
    const mensagens = r.corpo.errors?.corpo ?? [];
    assert.ok(mensagens.some((m) => m.includes('cobertura')), JSON.stringify(mensagens));
    assert.ok(mensagens.some((m) => m.includes('inventado')), JSON.stringify(mensagens));
    await limparFormularios();
  });

  it('resposta sem formulário na categoria é recusada em vez de virar JSON solto', async () => {
    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<ProblemDetails>('/tickets', {
      subject: 'Sem formulário',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { qualquer: 'coisa' },
    });

    assert.equal(r.status, 400);
    assert.match(r.corpo.title, /não tem formulário/);
  });

  it('o campo interno não é aceito de quem abre pelo portal', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: f.categoria.id });

    const solicitante = await entrar('solicitante@teste.dev');
    const r = await solicitante.post<ProblemDetails>('/tickets', {
      subject: 'Computador não liga',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { patrimonio: 'PAT-1', andar: 'terreo', diagnostico: 'tentei responder' },
    });

    assert.equal(r.status, 400);
    assert.ok((r.corpo.errors?.corpo ?? []).some((m) => m.includes('diagnostico')));

    // Sem o campo interno, o mesmo chamado passa.
    const ok = await solicitante.post<TicketDetail>('/tickets', {
      subject: 'Computador não liga',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { patrimonio: 'PAT-1', andar: 'terreo' },
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
    await limparFormularios();
  });

  it('o agente responde o campo interno normalmente', async () => {
    const admin = await entrar('admin@teste.dev');
    await criarFormulario(admin, { categoryId: f.categoria.id });

    const agente = await entrar('agente@teste.dev');
    const r = await agente.post<TicketDetail>('/tickets', {
      subject: 'Computador não liga',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { patrimonio: 'PAT-1', andar: 'terreo', diagnostico: 'Fonte queimada.' },
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal((r.corpo.customFields as Record<string, unknown>).diagnostico, 'Fonte queimada.');
    await limparFormularios();
  });
});

describe('ciclo de vida', () => {
  it('recusa apagar formulário já respondido, e explica o que fazer', async () => {
    const admin = await entrar('admin@teste.dev');
    const formulario = await criarFormulario(admin, { categoryId: f.categoria.id });

    const agente = await entrar('agente@teste.dev');
    await agente.post('/tickets', {
      subject: 'Computador não liga',
      description: 'x',
      categoryId: f.categoria.id,
      customFields: { patrimonio: 'PAT-1', andar: 'terreo' },
    });

    const r = await admin.del<ProblemDetails>(`/forms/${formulario.id}`);
    assert.equal(r.status, 409);
    assert.match(r.corpo.title, /Desvincule-o da categoria/);

    await limparFormularios();
  });

  it('apagar formulário sem uso funciona', async () => {
    const admin = await entrar('admin@teste.dev');
    const formulario = await criarFormulario(admin, { categoryId: f.categoria.id });

    assert.equal((await admin.del(`/forms/${formulario.id}`)).status, 204);
    assert.equal((await admin.get(`/forms/${formulario.id}`)).status, 404);
  });

  it('formulário de outra organização não existe para quem pergunta', async () => {
    const admin = await entrar('admin@teste.dev');
    const formulario = await criarFormulario(admin, { categoryId: f.categoria.id });

    const forasteiro = await entrar('forasteiro@teste.dev');
    assert.equal((await forasteiro.get(`/forms/${formulario.id}`)).status, 403);

    assert.ok(adminId);
    await limparFormularios();
  });
});

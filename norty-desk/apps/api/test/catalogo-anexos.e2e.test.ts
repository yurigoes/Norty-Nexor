import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AttachmentView, TicketDetail, TicketEventView } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();
  // O catálogo precisa de quem administre; a semeadura base não tem.
  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });
  api = await subirApi();
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function entrar(email: string): Promise<Cliente> {
  const c = new Cliente(api.url);
  const r = await c.entrar(email);
  assert.equal(r.status, 200, `login de ${email} falhou`);
  return c;
}

async function abrirChamado(c: Cliente) {
  const r = await c.post<TicketDetail>('/tickets', {
    subject: 'Chamado para anexo',
    description: 'x',
    categoryId: f.categoria.id,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

/** `fetch` com multipart, que o cliente da suíte não cobre. */
async function enviarArquivo(
  base: string,
  token: string,
  ticketId: string,
  nome: string,
  conteudo: string,
  tipo = 'text/plain',
) {
  const form = new FormData();
  form.append('file', new Blob([conteudo], { type: tipo }), nome);

  const resposta = await fetch(`${base}/tickets/${ticketId}/anexos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

async function tokenDe(email: string): Promise<string> {
  const r = await new Cliente(api.url).entrar(email);
  return (r.corpo as { accessToken: string }).accessToken;
}

// ---------------------------------------------------------------------

describe('anexos', () => {
  it('anexa, calcula o checksum e registra evento na conversa', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);
    const token = await tokenDe('agente@teste.dev');

    const enviado = await enviarArquivo(api.url, token, chamado.id, 'erro.txt', 'linha de log');
    assert.equal(enviado.status, 201, JSON.stringify(enviado.corpo));

    const anexo = enviado.corpo as AttachmentView;
    assert.equal(anexo.filename, 'erro.txt');
    assert.equal(anexo.sizeBytes, Buffer.byteLength('linha de log'));
    assert.match(anexo.checksum, /^sha256:[0-9a-f]{64}$/);
    assert.ok(anexo.eventId, 'o anexo deveria ter criado um evento');

    const eventos = await c.get<TicketEventView[]>(`/tickets/${chamado.id}/eventos`);
    const doAnexo = eventos.corpo.find((e) => e.id === anexo.eventId);
    assert.equal(doAnexo?.type, 'ANEXO');
    assert.equal(doAnexo?.attachments.length, 1);
  });

  it('sane­ia o nome do arquivo antes de usá-lo na chave', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);
    const token = await tokenDe('agente@teste.dev');

    // Um nome com travessia de diretório escaparia da pasta do chamado.
    const enviado = await enviarArquivo(
      api.url,
      token,
      chamado.id,
      '../../../etc/passwd',
      'conteúdo',
    );
    assert.equal(enviado.status, 201);

    const anexo = enviado.corpo as AttachmentView;
    assert.ok(!anexo.filename.includes('..'), `nome não saneado: ${anexo.filename}`);
    assert.ok(!anexo.filename.includes('/'), `nome não saneado: ${anexo.filename}`);

    const guardado = await prisma.attachment.findUniqueOrThrow({ where: { id: anexo.id } });
    assert.ok(guardado.storageKey.startsWith(`${f.organizacao.id}/${chamado.id}/`));
  });

  it('devolve o conteúdo como download, nunca inline', async () => {
    const c = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(c);
    const token = await tokenDe('agente@teste.dev');

    const enviado = await enviarArquivo(api.url, token, chamado.id, 'nota.txt', 'conteúdo do anexo');
    const anexo = enviado.corpo as AttachmentView;

    const resposta = await fetch(`${api.url}/anexos/${anexo.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(resposta.status, 200);
    assert.match(resposta.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await resposta.text(), 'conteúdo do anexo');
  });

  it('não entrega anexo de chamado fora do escopo', async () => {
    const agente = await entrar('agente@teste.dev');
    const chamado = await abrirChamado(agente);
    const token = await tokenDe('agente@teste.dev');

    const enviado = await enviarArquivo(api.url, token, chamado.id, 'sigilo.txt', 'x');
    const anexo = enviado.corpo as AttachmentView;

    const solicitante = await entrar('solicitante@teste.dev');
    const r = await solicitante.get(`/anexos/${anexo.id}`);
    assert.equal(r.status, 404);
  });

  it('recusa anexo em chamado fechado', async () => {
    const supervisor = await entrar('supervisor@teste.dev');
    const chamado = await abrirChamado(supervisor);
    await supervisor.post(`/tickets/${chamado.id}/fechar`);

    const token = await tokenDe('supervisor@teste.dev');
    const r = await enviarArquivo(api.url, token, chamado.id, 'tarde.txt', 'x');
    assert.equal(r.status, 400);
  });
});

describe('catálogo', () => {
  it('monta o caminho completo da categoria', async () => {
    const admin = await entrar('supervisor@teste.dev');

    const pai = await admin.post<{ id: string; name: string }>('/categories', {
      name: 'Software',
    });
    assert.equal(pai.status, 201);

    const filha = await admin.post<{ id: string; name: string }>('/categories', {
      name: 'Sistema de ponto',
      parentId: pai.corpo.id,
    });

    assert.equal(filha.corpo.name, 'Software > Sistema de ponto');
  });

  it('limita a profundidade da árvore', async () => {
    const admin = await entrar('supervisor@teste.dev');

    const n1 = await admin.post<{ id: string }>('/categories', { name: 'Nível 1' });
    const n2 = await admin.post<{ id: string }>('/categories', {
      name: 'Nível 2',
      parentId: n1.corpo.id,
    });
    const n3 = await admin.post<{ id: string }>('/categories', {
      name: 'Nível 3',
      parentId: n2.corpo.id,
    });

    const n4 = await admin.post('/categories', { name: 'Nível 4', parentId: n3.corpo.id });
    assert.equal(n4.status, 400, 'a árvore deveria parar em três níveis');
  });

  it('recusa nome repetido no mesmo nível', async () => {
    const admin = await entrar('supervisor@teste.dev');
    await admin.post('/categories', { name: 'Rede' });
    const repetida = await admin.post('/categories', { name: 'Rede' });
    assert.equal(repetida.status, 409);
  });

  it('desativa em vez de excluir, para não quebrar chamado antigo', async () => {
    const admin = await entrar('supervisor@teste.dev');
    const criada = await admin.post<{ id: string }>('/categories', { name: 'Temporária' });

    const chamado = await admin.post<TicketDetail>('/tickets', {
      subject: 'usa a categoria',
      description: 'x',
      categoryId: criada.corpo.id,
    });

    assert.equal((await admin.chamar('DELETE', `/categories/${criada.corpo.id}`)).status, 204);

    const ativas = await admin.get<{ id: string }[]>('/categories');
    assert.ok(!ativas.corpo.some((c) => c.id === criada.corpo.id));

    // O chamado continua sabendo de onde veio.
    const ainda = await admin.get<TicketDetail>(`/tickets/${chamado.corpo.id}`);
    assert.equal(ainda.corpo.category?.id, criada.corpo.id);
  });

  it('cria pessoa com senha provisória e troca obrigatória', async () => {
    const admin = await entrar('supervisor@teste.dev');

    const criada = await admin.post<{
      id: string;
      senhaProvisoria: string | null;
    }>('/users', { email: 'nova@teste.dev', name: 'Pessoa Nova', role: 'AGENTE' });

    assert.equal(criada.status, 201);
    assert.ok(criada.corpo.senhaProvisoria, 'deveria devolver a senha provisória');

    const nova = new Cliente(api.url);
    const login = await nova.entrar('nova@teste.dev', criada.corpo.senhaProvisoria!);
    assert.equal(login.status, 200);

    const perfil = await nova.get<{ user: { name: string } }>('/auth/me');
    assert.equal(perfil.corpo.user.name, 'Pessoa Nova');

    const guardado = await prisma.user.findUniqueOrThrow({ where: { email: 'nova@teste.dev' } });
    assert.equal(guardado.mustChangePassword, true);
    assert.ok(guardado.passwordHash.startsWith('$argon2id$'));
  });

  it('nunca devolve o hash da senha', async () => {
    const admin = await entrar('supervisor@teste.dev');
    const lista = await admin.get<unknown>('/users');
    assert.ok(!JSON.stringify(lista.corpo).includes('argon2'), 'o hash vazou na listagem');
  });

  it('impede a organização ficar sem quem administre', async () => {
    const admin = await entrar('supervisor@teste.dev');

    // Rebaixar a si mesmo é recusado antes de qualquer contagem.
    const proprio = await admin.chamar('PATCH', `/users/${f.supervisor.id}`, { role: 'AGENTE' });
    assert.equal(proprio.status, 400);

    // E desativar a única pessoa administradora também.
    const outroAdmin = await admin.post<{ id: string }>('/users', {
      email: 'admin2@teste.dev',
      name: 'Segundo Admin',
      role: 'ADMINISTRADOR',
    });

    const desativar = await admin.chamar('PATCH', `/users/${outroAdmin.corpo.id}`, {
      isActive: false,
    });
    // Há outro administrador ativo (o supervisor promovido), então passa.
    assert.equal(desativar.status, 200);
  });

  it('o agente lê o catálogo mas não o edita', async () => {
    const agente = await entrar('agente@teste.dev');

    assert.equal((await agente.get('/categories')).status, 200);
    assert.equal((await agente.get('/teams')).status, 200);
    assert.equal((await agente.post('/categories', { name: 'Proibida' })).status, 403);
    assert.equal(
      (await agente.post('/users', { email: 'x@y.dev', name: 'X', role: 'AGENTE' })).status,
      403,
    );
  });

  it('gerencia membros de time', async () => {
    const admin = await entrar('supervisor@teste.dev');

    const times = await admin.post<{ id: string; name: string; members: unknown[] }[]>('/teams', {
      name: 'Plantão',
    });
    const plantao = times.corpo.find((t) => t.name === 'Plantão')!;

    const comMembro = await admin.post<{ id: string; members: { id: string }[] }[]>(
      `/teams/${plantao.id}/membros`,
      { userId: f.agente.id },
    );
    assert.ok(
      comMembro.corpo.find((t) => t.id === plantao.id)!.members.some((m) => m.id === f.agente.id),
    );

    const semMembro = await admin.chamar<{ id: string; members: { id: string }[] }[]>(
      'DELETE',
      `/teams/${plantao.id}/membros/${f.agente.id}`,
    );
    assert.equal(
      semMembro.corpo.find((t) => t.id === plantao.id)!.members.length,
      0,
    );
  });

  it('não enxerga catálogo de outra organização', async () => {
    const forasteiro = await entrar('forasteiro@teste.dev');
    const categorias = await forasteiro.get<unknown[]>('/categories');
    assert.equal(categorias.corpo.length, 0);
  });
});

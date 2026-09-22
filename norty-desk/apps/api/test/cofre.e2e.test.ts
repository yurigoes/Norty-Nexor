import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  ConcessaoView,
  LeituraDoSegredoView,
  SegredoRevelado,
  SegredoView,
} from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O cofre de senhas.
 *
 * O que se prova aqui é **quem abre o quê**, porque é a única coisa que
 * separa um cofre de uma planilha compartilhada com nome bonito:
 *
 * 1. **A senha nunca sai em listagem.** Sai por uma rota só, e cada
 *    chamada fica registrada.
 * 2. **Só o dono e quem ele deixou.** Nem o administrador lê — ele
 *    assume, o que é outra coisa e fica na trilha.
 * 3. **A concessão vence sozinha**, e a revogação corta na hora.
 * 4. **O texto cifrado é amarrado à linha**: copiá-lo para outra não o
 *    torna legível.
 */

let api: Api;
let f: Fixtura;

let dono: Cliente;
let colega: Cliente;
let estranho: Cliente;
let admin: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();

  // O supervisor vira administrador: é quem tem `cofre:administrar`.
  await prisma.membership.updateMany({
    where: { userId: f.supervisor.id, organizationId: f.organizacao.id },
    data: { role: 'ADMINISTRADOR' },
  });

  api = await subirApi();

  dono = new Cliente(api.url);
  assert.equal((await dono.entrar('agente@teste.dev')).status, 200);

  colega = new Cliente(api.url);
  assert.equal((await colega.entrar('agente2@teste.dev')).status, 200);

  // Solicitante não tem `cofre:usar`: o cofre é de quem atende.
  estranho = new Cliente(api.url);
  assert.equal((await estranho.entrar('solicitante@teste.dev')).status, 200);

  admin = new Cliente(api.url);
  assert.equal((await admin.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

async function guardar(
  quem: Cliente = dono,
  dados: Record<string, unknown> = {},
): Promise<SegredoView> {
  const r = await quem.post<SegredoView>('/cofre', {
    kind: 'SISTEMA',
    name: 'Painel do cliente Acme',
    login: 'suporte@acme',
    senha: 'SenhaDoClienteAcme#2026',
    sistema: 'Painel Acme',
    ...dados,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

// ---------------------------------------------------------------------

describe('guardar e abrir', () => {
  it('a senha não volta em nenhuma carga — só na rota que a revela', async () => {
    const segredo = await guardar();

    // Nem na resposta de criar.
    assert.equal(JSON.stringify(segredo).includes('SenhaDoClienteAcme'), false);

    const lista = await dono.get<SegredoView[]>('/cofre');
    assert.equal(lista.status, 200);
    assert.equal(JSON.stringify(lista.corpo).includes('SenhaDoClienteAcme'), false);

    // Nem o texto cifrado, nem o sal. Procurar só a senha em claro
    // deixaria passar a vista que devolve o `senhaCifrada` — que não é
    // legível hoje, mas é metade do trabalho de quem um dia tiver a
    // chave mestra, e é uma cópia do segredo fora do cofre.
    for (const carga of [JSON.stringify(segredo), JSON.stringify(lista.corpo)]) {
      assert.equal(carga.includes('senhaCifrada'), false, carga);
      assert.equal(carga.includes('"sal"'), false, carga);
    }

    // E no banco ela está cifrada, com sal próprio.
    const linha = await prisma.secret.findUniqueOrThrow({ where: { id: segredo.id } });
    assert.ok(linha.senhaCifrada.startsWith('v1:'));
    assert.equal(linha.senhaCifrada.includes('SenhaDoClienteAcme'), false);
    assert.ok(linha.sal.length >= 16, 'o sal deveria ter tamanho de sal');

    // A rota que revela devolve a senha certa.
    const aberta = await dono.post<SegredoRevelado>(`/cofre/${segredo.id}/revelar`);
    assert.equal(aberta.status, 201, JSON.stringify(aberta.corpo));
    assert.equal(aberta.corpo.senha, 'SenhaDoClienteAcme#2026');
  });

  it('dois segredos com a mesma senha não têm o mesmo texto cifrado', async () => {
    const a = await guardar(dono, { name: 'Um', senha: 'a-mesma-senha' });
    const b = await guardar(dono, { name: 'Outro', senha: 'a-mesma-senha' });

    const [la, lb] = await Promise.all([
      prisma.secret.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.secret.findUniqueOrThrow({ where: { id: b.id } }),
    ]);

    assert.notEqual(la.senhaCifrada, lb.senhaCifrada);
    assert.notEqual(la.sal, lb.sal, 'cada segredo tem o próprio sal');
  });

  it('texto cifrado copiado de outra linha não abre', async () => {
    const meu = await guardar(dono, { name: 'Meu', senha: 'a-senha-do-meu' });
    const outro = await guardar(dono, { name: 'Outro', senha: 'a-senha-do-outro' });

    const doOutro = await prisma.secret.findUniqueOrThrow({ where: { id: outro.id } });

    // Quem tem escrita no banco copia o texto cifrado **e o sal** da
    // linha do vizinho. Sem a amarra ao id, isto bastaria para ler.
    await prisma.secret.update({
      where: { id: meu.id },
      data: { senhaCifrada: doOutro.senhaCifrada, sal: doOutro.sal },
    });

    const r = await dono.post(`/cofre/${meu.id}/revelar`);
    assert.notEqual(r.status, 201, `o texto cifrado alheio abriu: ${JSON.stringify(r.corpo)}`);

    await prisma.secret.delete({ where: { id: meu.id } });
    await prisma.secret.delete({ where: { id: outro.id } });
  });

  it('cada tipo exige o campo que só ele tem', async () => {
    const semUrl = await dono.post('/cofre', {
      kind: 'SITE',
      name: 'Portal',
      login: 'admin',
      senha: 'x',
    });
    assert.equal(semUrl.status, 400, JSON.stringify(semUrl.corpo));

    const semAtivo = await dono.post('/cofre', {
      kind: 'COMPUTADOR',
      name: 'Servidor',
      login: 'admin',
      senha: 'x',
    });
    assert.equal(semAtivo.status, 400, JSON.stringify(semAtivo.corpo));

    const semSistema = await dono.post('/cofre', {
      kind: 'SISTEMA',
      name: 'ERP',
      login: 'admin',
      senha: 'x',
    });
    assert.equal(semSistema.status, 400, JSON.stringify(semSistema.corpo));
  });

  it('editar sem mandar a senha mantém a guardada', async () => {
    const segredo = await guardar(dono, { name: 'Antes', senha: 'a-senha-original' });

    const editado = await dono.patch<SegredoView>(`/cofre/${segredo.id}`, {
      kind: 'SISTEMA',
      name: 'Depois',
      login: 'outro-login',
      sistema: 'Painel Acme',
    });
    assert.equal(editado.status, 200, JSON.stringify(editado.corpo));
    assert.equal(editado.corpo.name, 'Depois');

    const aberta = await dono.post<SegredoRevelado>(`/cofre/${segredo.id}/revelar`);
    assert.equal(aberta.corpo.senha, 'a-senha-original');
  });
});

describe('quem abre o quê', () => {
  it('quem não recebeu não abre, e nem vê que existe', async () => {
    const segredo = await guardar();

    const lista = await colega.get<SegredoView[]>('/cofre');
    assert.equal(lista.status, 200);
    assert.equal(lista.corpo.some((s) => s.id === segredo.id), false);

    const tentativa = await colega.post(`/cofre/${segredo.id}/revelar`);
    assert.equal(tentativa.status, 404, JSON.stringify(tentativa.corpo));
  });

  it('o administrador vê que existe e NÃO abre — assumir é outra coisa', async () => {
    const segredo = await guardar(dono, { name: 'Senha que o admin não lê' });

    // Ele enxerga o metadado.
    const todos = await admin.get<SegredoView[]>('/cofre/todos');
    assert.equal(todos.status, 200, JSON.stringify(todos.corpo));
    const visto = todos.corpo.find((s) => s.id === segredo.id);
    assert.ok(visto, 'o administrador deveria ver que o segredo existe');
    assert.equal(visto.owner.id, f.agente.id);
    // E a tela não pode chamar isto de "compartilhada": ninguém
    // compartilhou nada com ele.
    assert.equal(visto.via, 'ADMINISTRACAO');
    assert.equal(JSON.stringify(todos.corpo).includes('SenhaDoClienteAcme'), false);

    // **Este é o ponto do cofre.**
    const tentativa = await admin.post(`/cofre/${segredo.id}/revelar`);
    assert.equal(
      tentativa.status,
      404,
      `o administrador abriu segredo alheio: ${JSON.stringify(tentativa.corpo)}`,
    );

    // Assumir é permitido, e é alto: fica na trilha.
    const assumido = await admin.post<SegredoView>(`/cofre/${segredo.id}/assumir`);
    assert.equal(assumido.status, 201, JSON.stringify(assumido.corpo));
    assert.equal(assumido.corpo.owner.id, f.supervisor.id);

    const trilha = await prisma.auditLog.findFirst({
      where: { entityId: segredo.id, action: 'cofre.segredo.assumido' },
    });
    assert.ok(trilha, 'assumir deveria ficar na trilha de auditoria');

    // E o dono anterior não fica de fora do que era dele.
    const doAntigo = await dono.get<SegredoView[]>('/cofre');
    const ainda = doAntigo.corpo.find((s) => s.id === segredo.id);
    assert.ok(ainda, 'o dono anterior perdeu o acesso ao ser substituído');
    assert.equal(ainda.via, 'COMPARTILHADO');
    assert.equal(ainda.souDono, false);

    const abre = await dono.post<SegredoRevelado>(`/cofre/${segredo.id}/revelar`);
    assert.equal(abre.status, 201, JSON.stringify(abre.corpo));
  });

  it('quem não tem a permissão nem entra no cofre', async () => {
    assert.equal((await estranho.get('/cofre')).status, 403);
    assert.equal((await estranho.post('/cofre', { kind: 'SISTEMA', name: 'x', login: 'y', senha: 'z', sistema: 's' })).status, 403);
  });

  it('só o administrador vê a lista da organização inteira', async () => {
    assert.equal((await dono.get('/cofre/todos')).status, 403);
  });
});

describe('compartilhar por tempo, ou para sempre', () => {
  it('compartilhado sem prazo, o colega abre; revogado, para de abrir', async () => {
    const segredo = await guardar(dono, { name: 'Dividida com o colega', senha: 'senha-dividida' });

    const concedido = await dono.post<ConcessaoView[]>(
      `/cofre/${segredo.id}/compartilhamentos`,
      { userId: f.outroAgente.id },
    );
    assert.equal(concedido.status, 201, JSON.stringify(concedido.corpo));
    assert.equal(concedido.corpo.length, 1);
    assert.equal(concedido.corpo[0].expiresAt, null, 'sem prazo é para sempre');

    const aberta = await colega.post<SegredoRevelado>(`/cofre/${segredo.id}/revelar`);
    assert.equal(aberta.status, 201, JSON.stringify(aberta.corpo));
    assert.equal(aberta.corpo.senha, 'senha-dividida');

    // E ele vê de onde veio.
    const lista = await colega.get<SegredoView[]>('/cofre');
    const dele = lista.corpo.find((s) => s.id === segredo.id);
    assert.equal(dele?.via, 'COMPARTILHADO');
    assert.equal(dele?.souDono, false);

    const revogado = await dono.del<ConcessaoView[]>(
      `/cofre/${segredo.id}/compartilhamentos/${concedido.corpo[0].id}`,
    );
    assert.equal(revogado.status, 200, JSON.stringify(revogado.corpo));
    assert.equal(revogado.corpo.length, 0);

    const depois = await colega.post(`/cofre/${segredo.id}/revelar`);
    assert.equal(depois.status, 404, 'a revogação não cortou o acesso');
  });

  it('a concessão com prazo vence sozinha', async () => {
    const segredo = await guardar(dono, { name: 'Emprestada por um dia', senha: 'senha-por-tempo' });

    const amanha = new Date(Date.now() + 86_400_000).toISOString();
    const concedido = await dono.post<ConcessaoView[]>(
      `/cofre/${segredo.id}/compartilhamentos`,
      { userId: f.outroAgente.id, expiresAt: amanha },
    );
    assert.equal(concedido.status, 201, JSON.stringify(concedido.corpo));
    assert.ok(concedido.corpo[0].expiresAt);

    assert.equal((await colega.post(`/cofre/${segredo.id}/revelar`)).status, 201);

    // O tempo passa. Ninguém precisa revogar: o prazo é a revogação.
    await prisma.secretGrant.updateMany({
      where: { secretId: segredo.id, userId: f.outroAgente.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const depois = await colega.post(`/cofre/${segredo.id}/revelar`);
    assert.equal(depois.status, 404, 'a concessão vencida ainda abria');

    // E some da lista dele, em vez de ficar lá sem funcionar.
    const lista = await colega.get<SegredoView[]>('/cofre');
    assert.equal(lista.corpo.some((s) => s.id === segredo.id), false);
  });

  it('compartilhar de novo estende o prazo em vez de criar outra linha', async () => {
    const segredo = await guardar(dono, { name: 'Estendida', senha: 'x' });

    await dono.post(`/cofre/${segredo.id}/compartilhamentos`, {
      userId: f.outroAgente.id,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const segunda = await dono.post<ConcessaoView[]>(`/cofre/${segredo.id}/compartilhamentos`, {
      userId: f.outroAgente.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    assert.equal(segunda.status, 201, JSON.stringify(segunda.corpo));
    assert.equal(
      segunda.corpo.length,
      1,
      'duas linhas para a mesma pessoa: revogar uma não revogaria a outra',
    );

    const linhas = await prisma.secretGrant.count({
      where: { secretId: segredo.id, userId: f.outroAgente.id },
    });
    assert.equal(linhas, 1);
  });

  it('quem recebeu não reparte, não edita e não apaga', async () => {
    const segredo = await guardar(dono, { name: 'Não é do colega', senha: 'x' });
    await dono.post(`/cofre/${segredo.id}/compartilhamentos`, { userId: f.outroAgente.id });

    // Ele abre...
    assert.equal((await colega.post(`/cofre/${segredo.id}/revelar`)).status, 201);

    // ...e só. Repartir o que não é seu é como uma concessão com prazo
    // vira acesso para sempre pelas costas de quem a deu.
    assert.equal(
      (await colega.post(`/cofre/${segredo.id}/compartilhamentos`, { userId: f.supervisor.id }))
        .status,
      403,
    );
    assert.equal(
      (await colega.patch(`/cofre/${segredo.id}`, {
        kind: 'SISTEMA',
        name: 'sequestrado',
        login: 'x',
        sistema: 's',
      })).status,
      403,
    );
    assert.equal((await colega.del(`/cofre/${segredo.id}`)).status, 403);
    assert.equal((await colega.get(`/cofre/${segredo.id}/leituras`)).status, 403);
  });

  it('não se compartilha com quem é de outra organização', async () => {
    const segredo = await guardar(dono, { name: 'Não sai de casa', senha: 'x' });

    const r = await dono.post(`/cofre/${segredo.id}/compartilhamentos`, {
      userId: f.forasteiro.id,
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('a revogação de um segredo não mexe na concessão de outro', async () => {
    const meu = await guardar(dono, { name: 'Segredo A', senha: 'x' });
    const outro = await guardar(dono, { name: 'Segredo B', senha: 'y' });

    const noOutro = await dono.post<ConcessaoView[]>(`/cofre/${outro.id}/compartilhamentos`, {
      userId: f.outroAgente.id,
    });
    const grantId = noOutro.corpo[0].id;

    // O id da concessão do segredo B, passado na rota do segredo A.
    const r = await dono.del<ConcessaoView[]>(`/cofre/${meu.id}/compartilhamentos/${grantId}`);
    assert.equal(r.status, 200);

    const viva = await prisma.secretGrant.findUniqueOrThrow({ where: { id: grantId } });
    assert.equal(viva.revokedAt, null, 'revogou a concessão de outro segredo');
  });
});

describe('o registro de leitura', () => {
  it('o dono vê quem abriu a senha dele, e quando', async () => {
    const segredo = await guardar(dono, { name: 'Com plateia', senha: 'x' });
    await dono.post(`/cofre/${segredo.id}/compartilhamentos`, { userId: f.outroAgente.id });

    await colega.post(`/cofre/${segredo.id}/revelar`);
    await dono.post(`/cofre/${segredo.id}/revelar`);

    const leituras = await dono.get<LeituraDoSegredoView[]>(`/cofre/${segredo.id}/leituras`);
    assert.equal(leituras.status, 200, JSON.stringify(leituras.corpo));
    assert.equal(leituras.corpo.length, 2);

    const quem = leituras.corpo.map((l) => l.user.id);
    assert.ok(quem.includes(f.outroAgente.id), JSON.stringify(leituras.corpo));
    assert.ok(quem.includes(f.agente.id));
  });

  it('a tentativa que falha não vira leitura registrada', async () => {
    const segredo = await guardar(dono, { name: 'Sem plateia', senha: 'x' });

    assert.equal((await colega.post(`/cofre/${segredo.id}/revelar`)).status, 404);

    const leituras = await dono.get<LeituraDoSegredoView[]>(`/cofre/${segredo.id}/leituras`);
    assert.equal(leituras.corpo.length, 0, JSON.stringify(leituras.corpo));
  });

  it('a trilha de auditoria registra a revelação sem guardar a senha', async () => {
    const segredo = await guardar(dono, { name: 'Auditada', senha: 'SenhaQueNaoPodeVazar#1' });
    await dono.post(`/cofre/${segredo.id}/revelar`);

    const trilha = await prisma.auditLog.findMany({ where: { entityId: segredo.id } });
    assert.ok(trilha.some((t) => t.action === 'cofre.senha.revelada'), JSON.stringify(trilha));
    assert.equal(
      JSON.stringify(trilha).includes('SenhaQueNaoPodeVazar'),
      false,
      'a senha foi parar na trilha de auditoria, que não é cifrada',
    );
  });
});

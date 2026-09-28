import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BuscaSalvaView, TicketListItem } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Busca salva por pessoa.
 *
 * O filtro da fila já morava na URL, o que resolve mandar a visão para o
 * colega. O que não existia era guardá-la: as cinco visões eram lista
 * fixa no código, e "chamados do cliente X, prioridade alta, do time de
 * campo" só se montava editando a barra de endereços.
 *
 * O que se prova aqui:
 *
 * 1. **O filtro salvo é validado na entrada**, pelo mesmo DTO da fila.
 *    Status inventado e prioridade fora da escala são 400 ao salvar, não
 *    uma aba que abre vazia meses depois.
 * 2. **A paginação não entra.** `cursor` guardado apontaria para uma
 *    página que na semana seguinte não existe.
 * 3. **A busca de uma pessoa é dela.** Nem listar, nem renomear, nem
 *    apagar a de outra — e o id de outra organização não serve.
 * 4. **Uma padrão por pessoa**, que o banco não garante e o serviço sim.
 * 5. **`me` é gravado literal**, e é o que torna a busca portátil: a
 *    mesma busca aponta para quem a está usando.
 */

let api: Api;
let f: Fixtura;
let agente: Cliente;
let outro: Cliente;
let idDoAgente = '';

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);
  idDoAgente = f.agente.id;

  outro = new Cliente(api.url);
  assert.equal((await outro.entrar('supervisor@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

/** Salva uma busca e devolve a lista que a API responde. */
async function salvar(
  cliente: Cliente,
  name: string,
  filtro: Record<string, unknown>,
  isDefault?: boolean,
) {
  return cliente.post<BuscaSalvaView[]>('/saved-searches', {
    name,
    filtro,
    ...(isDefault === undefined ? {} : { isDefault }),
  });
}

// ---------------------------------------------------------------------

describe('salvar o filtro da fila', () => {
  it('guarda o filtro como objeto, do jeito que a fila o entende', async () => {
    const salva = await salvar(agente, 'Alta do meu time', {
      status: ['NOVO', 'ATRIBUIDO'],
      priority: [4, 5],
      assignedUserId: 'me',
    });

    assert.equal(salva.status, 201, JSON.stringify(salva.corpo));

    const minha = salva.corpo.find((b) => b.name === 'Alta do meu time');
    assert.ok(minha);

    // Volta igual — lista como lista, número como número. Se voltasse
    // `["4"]`, a fila recusaria o filtro que ela mesma gravou.
    assert.deepEqual(minha.filtro, {
      status: ['NOVO', 'ATRIBUIDO'],
      priority: [4, 5],
      assignedUserId: 'me',
    });
  });

  it('aceita o filtro vazio, que é a fila inteira', async () => {
    // A visão fixa "Do meu time" é exatamente isto. Recusar obrigaria a
    // inventar um campo só para poder nomear "tudo".
    const salva = await salvar(agente, 'Tudo', {});

    assert.equal(salva.status, 201, JSON.stringify(salva.corpo));
    assert.deepEqual(salva.corpo.find((b) => b.name === 'Tudo')?.filtro, {});
  });

  it('colapsa o espaço do nome, para não haver duas quase iguais', async () => {
    const salva = await salvar(agente, '  Fila   de   terça  ', { q: 'x' });

    assert.equal(salva.status, 201);
    assert.ok(salva.corpo.some((b) => b.name === 'Fila de terça'));
  });

  it('recusa duas com o mesmo nome, dizendo qual', async () => {
    const repetida = await salvar(agente, 'Alta do meu time', { q: 'outro' });

    assert.equal(repetida.status, 409, JSON.stringify(repetida.corpo));
    assert.match((repetida.corpo as unknown as { detail?: string }).detail ?? '', /Alta do meu time/);
  });
});

describe('o filtro é validado na entrada', () => {
  it('recusa status que não existe', async () => {
    const ruim = await salvar(agente, 'Inventada', { status: ['QUASE_FECHADO'] });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa prioridade fora da escala', async () => {
    // `priority=99` passava por `@IsInt` e ia para o `where` casar com
    // nada: uma aba que nunca mostra nada e ninguém sabe por quê.
    const ruim = await salvar(agente, 'Prioridade 99', { priority: [99] });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa id que não é uuid', async () => {
    const ruim = await salvar(agente, 'Categoria torta', { categoryId: 'nao-e-uuid' });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa campo que o filtro não tem', async () => {
    // `forbidNonWhitelisted`: uma tela nova que mande campo que a API
    // ainda não conhece falha alto, em vez de gravar algo que a fila
    // ignora em silêncio.
    const ruim = await salvar(agente, 'Campo novo', { corDoChamado: 'azul' });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa o cursor, que é onde salvar a página erraria', async () => {
    // A pessoa salva estando na terceira página. `FiltroFilaDto` estende
    // `FiltroSalvavelDto`, e é o segundo que o corpo aceita — então o
    // cursor não tem por onde entrar.
    const ruim = await salvar(agente, 'Com cursor', { status: ['NOVO'], cursor: 'abc' });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa o limite, que é preferência de tela', async () => {
    const ruim = await salvar(agente, 'Com limite', { status: ['NOVO'], limit: 10 });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });
});

describe('o filtro salvo roda na fila', () => {
  it('devolve os mesmos chamados que o filtro digitado à mão', async () => {
    const buscas = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const alta = buscas.corpo.find((b) => b.name === 'Alta do meu time');
    assert.ok(alta);

    // O filtro gravado, transformado em query string do mesmo jeito que a
    // tela o faz.
    const parametros = new URLSearchParams();
    for (const [chave, valor] of Object.entries(alta.filtro)) {
      parametros.set(chave, Array.isArray(valor) ? valor.join(',') : String(valor));
    }

    const pelaBusca = await agente.get<{ data: TicketListItem[] }>(`/tickets?${parametros}`);

    assert.equal(pelaBusca.status, 200, JSON.stringify(pelaBusca.corpo));

    const naMao = await agente.get<{ data: TicketListItem[] }>(
      '/tickets?status=NOVO,ATRIBUIDO&priority=4,5&assignedUserId=me',
    );

    assert.equal(naMao.status, 200);
    assert.deepEqual(
      pelaBusca.corpo.data.map((c) => c.id),
      naMao.corpo.data.map((c) => c.id),
    );
  });

  it('guarda "me" literal, e é o que torna a busca portátil', async () => {
    // Gravar o id de quem salvou faria a busca apontar para essa pessoa
    // para sempre — inclusive para quem a copiasse.
    const linha = await prisma.savedSearch.findFirstOrThrow({
      where: { userId: idDoAgente, name: 'Alta do meu time' },
      select: { query: true },
    });

    const filtro = linha.query as { assignedUserId?: string };

    assert.equal(filtro.assignedUserId, 'me');
    assert.notEqual(filtro.assignedUserId, idDoAgente);
  });
});

describe('a busca de uma pessoa é dela', () => {
  it('não aparece na lista de outra', async () => {
    const minhas = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const dele = await outro.get<BuscaSalvaView[]>('/saved-searches');

    assert.ok(minhas.corpo.length > 0);
    assert.deepEqual(dele.corpo, []);
  });

  it('não é alcançada pelo id quando é de outra organização', async () => {
    // A mesma pessoa pode ter vínculo em duas organizações, e a busca
    // salva de uma não é da outra. Sem o par (organização, pessoa) no
    // `where`, um id vazado abriria a busca do outro vínculo.
    const deOutraOrg = await prisma.savedSearch.create({
      data: {
        organizationId: f.outra.id,
        userId: idDoAgente,
        name: 'Da outra organização',
        query: { status: ['NOVO'] },
      },
      select: { id: true },
    });

    const renomear = await agente.patch(`/saved-searches/${deOutraOrg.id}`, { name: 'Puxada' });
    assert.equal(renomear.status, 404, JSON.stringify(renomear.corpo));

    const apagar = await agente.del(`/saved-searches/${deOutraOrg.id}`);
    assert.equal(apagar.status, 404);

    // E não entra na lista do vínculo em que a pessoa está.
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    assert.ok(!lista.corpo.some((b) => b.id === deOutraOrg.id));
  });

  it('não se renomeia nem se apaga de fora', async () => {
    const minhas = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const alvo = minhas.corpo[0];
    assert.ok(alvo);

    const renomear = await outro.patch(`/saved-searches/${alvo.id}`, { name: 'Roubada' });
    assert.equal(renomear.status, 404, JSON.stringify(renomear.corpo));

    const apagar = await outro.del(`/saved-searches/${alvo.id}`);
    assert.equal(apagar.status, 404);

    // E continua intacta.
    const depois = await agente.get<BuscaSalvaView[]>('/saved-searches');
    assert.ok(depois.corpo.some((b) => b.id === alvo.id && b.name === alvo.name));
  });
});

describe('a que abre por padrão', () => {
  it('é uma só, mesmo marcando outra', async () => {
    const primeira = await salvar(agente, 'Padrão A', { status: ['NOVO'] }, true);
    assert.equal(primeira.status, 201, JSON.stringify(primeira.corpo));
    assert.equal(primeira.corpo.filter((b) => b.isDefault).length, 1);

    const segunda = await salvar(agente, 'Padrão B', { status: ['PENDENTE'] }, true);
    assert.equal(segunda.status, 201);

    // A regra que o banco não garante e o serviço sim: marcar a segunda
    // desmarca a primeira, na mesma transação.
    const padroes = segunda.corpo.filter((b) => b.isDefault);
    assert.equal(padroes.length, 1, JSON.stringify(padroes.map((b) => b.name)));
    assert.equal(padroes[0]?.name, 'Padrão B');
  });

  it('também troca por PATCH', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const a = lista.corpo.find((b) => b.name === 'Padrão A');
    assert.ok(a);

    const marcada = await agente.patch<BuscaSalvaView[]>(`/saved-searches/${a.id}`, {
      isDefault: true,
    });

    assert.equal(marcada.status, 200, JSON.stringify(marcada.corpo));
    assert.deepEqual(
      marcada.corpo.filter((b) => b.isDefault).map((b) => b.name),
      ['Padrão A'],
    );
  });

  it('pode não haver nenhuma', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const a = lista.corpo.find((b) => b.name === 'Padrão A');
    assert.ok(a);

    const limpa = await agente.patch<BuscaSalvaView[]>(`/saved-searches/${a.id}`, {
      isDefault: false,
    });

    assert.equal(limpa.status, 200);
    assert.equal(limpa.corpo.filter((b) => b.isDefault).length, 0);
  });
});

describe('renomear e refiltrar', () => {
  it('renomeia sem remandar o filtro', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const alvo = lista.corpo.find((b) => b.name === 'Fila de terça');
    assert.ok(alvo);

    const renomeada = await agente.patch<BuscaSalvaView[]>(`/saved-searches/${alvo.id}`, {
      name: 'Fila de quinta',
    });

    assert.equal(renomeada.status, 200, JSON.stringify(renomeada.corpo));

    const depois = renomeada.corpo.find((b) => b.id === alvo.id);
    assert.equal(depois?.name, 'Fila de quinta');
    // O filtro tinha de ficar: PATCH sem `filtro` não é PATCH com filtro
    // vazio, e confundir os dois apagaria o filtro de quem só renomeou.
    assert.deepEqual(depois?.filtro, alvo.filtro);
  });

  it('troca o filtro sem renomear', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const alvo = lista.corpo.find((b) => b.name === 'Fila de quinta');
    assert.ok(alvo);

    const refiltrada = await agente.patch<BuscaSalvaView[]>(`/saved-searches/${alvo.id}`, {
      filtro: { slaBreached: true },
    });

    assert.equal(refiltrada.status, 200);

    const depois = refiltrada.corpo.find((b) => b.id === alvo.id);
    assert.equal(depois?.name, 'Fila de quinta');
    assert.deepEqual(depois?.filtro, { slaBreached: true });
  });

  it('valida o filtro novo como valida o primeiro', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const alvo = lista.corpo[0];
    assert.ok(alvo);

    const ruim = await agente.patch(`/saved-searches/${alvo.id}`, {
      filtro: { priority: [0] },
    });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });
});

describe('a ordem das abas', () => {
  it('é gravada pela lista inteira', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const invertida = [...lista.corpo].reverse().map((b) => b.id);

    const ordenada = await agente.put<BuscaSalvaView[]>('/saved-searches/ordem', {
      ids: invertida,
    });

    assert.equal(ordenada.status, 200, JSON.stringify(ordenada.corpo));
    assert.deepEqual(
      ordenada.corpo.map((b) => b.id),
      invertida,
    );
    assert.deepEqual(
      ordenada.corpo.map((b) => b.position),
      invertida.map((_, i) => i),
    );
  });

  it('recusa lista incompleta', async () => {
    // Faltando uma, ela ficaria com a posição antiga embaralhada entre as
    // novas — e a aba apareceria num lugar que ninguém pediu.
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const faltando = lista.corpo.slice(1).map((b) => b.id);

    const ruim = await agente.put('/saved-searches/ordem', { ids: faltando });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa id repetido', async () => {
    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const primeiro = lista.corpo[0]!.id;

    const ruim = await agente.put('/saved-searches/ordem', {
      ids: [primeiro, ...lista.corpo.slice(1).map((b) => b.id), primeiro],
    });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });

  it('recusa a busca de outra pessoa na ordem', async () => {
    const dela = await salvar(outro, 'Dele', { status: ['NOVO'] });
    assert.equal(dela.status, 201);

    const lista = await agente.get<BuscaSalvaView[]>('/saved-searches');

    const ruim = await agente.put('/saved-searches/ordem', {
      ids: [...lista.corpo.map((b) => b.id), dela.corpo[0]!.id],
    });

    assert.equal(ruim.status, 400, JSON.stringify(ruim.corpo));
  });
});

describe('apagar', () => {
  it('tira da lista e devolve o resto', async () => {
    const antes = await agente.get<BuscaSalvaView[]>('/saved-searches');
    const alvo = antes.corpo.find((b) => b.name === 'Tudo');
    assert.ok(alvo);

    const depois = await agente.del<BuscaSalvaView[]>(`/saved-searches/${alvo.id}`);

    assert.equal(depois.status, 200, JSON.stringify(depois.corpo));
    assert.equal(depois.corpo.length, antes.corpo.length - 1);
    assert.ok(!depois.corpo.some((b) => b.id === alvo.id));
  });

  it('some com a pessoa, que é o que a cascata faz', async () => {
    // Uma preferência de tela não sobrevive a quem a tinha: sem a
    // cascata, apagar o usuário deixaria linha órfã apontando para
    // ninguém.
    const usuario = await prisma.user.create({
      data: { email: 'passageiro@teste.dev', name: 'Passageiro', passwordHash: 'x' },
      select: { id: true },
    });

    await prisma.savedSearch.create({
      data: {
        organizationId: f.organizacao.id,
        userId: usuario.id,
        name: 'Vai com ele',
        query: {},
      },
    });

    await prisma.user.delete({ where: { id: usuario.id } });

    const sobrou = await prisma.savedSearch.count({ where: { userId: usuario.id } });
    assert.equal(sobrou, 0);
  });
});

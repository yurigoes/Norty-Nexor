import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ArticleDetail, ArticleListItem, ArticleRevisionView, TicketDetail } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Base de conhecimento.
 *
 * O que se prova aqui: a busca acha em português (radical, acento e
 * plural), o artigo interno não vaza para o portal, publicar exige mais
 * do que escrever, e a sugestão encontra o artigo pelo assunto do
 * chamado — que é a razão de a base existir.
 */

let api: Api;
let f: Fixtura;
let agente: Cliente;
let supervisor: Cliente;
let solicitante: Cliente;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  agente = new Cliente(api.url);
  assert.equal((await agente.entrar('agente@teste.dev')).status, 200);

  supervisor = new Cliente(api.url);
  assert.equal((await supervisor.entrar('supervisor@teste.dev')).status, 200);

  solicitante = new Cliente(api.url);
  assert.equal((await solicitante.entrar('solicitante@teste.dev')).status, 200);
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------

describe('escrever e revisar', () => {
  it('a criação já nasce com a versão 1', async () => {
    const r = await agente.post<ArticleDetail>('/articles', {
      title: 'Como trocar o toner da impressora',
      body: 'Abra a tampa frontal, puxe o cartucho e encaixe o novo até ouvir o clique.',
      categoryId: f.categoria.id,
      keywords: ['Toner', 'toner', 'IMPRESSORA'],
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.version, 1, 'sem a versão inicial o histórico começaria na primeira edição');
    assert.deepEqual(
      r.corpo.keywords,
      ['toner', 'impressora'],
      'a etiqueta é busca exata: precisa ser normalizada, e sem repetir',
    );

    const revisoes = await agente.get<ArticleRevisionView[]>(`/articles/${r.corpo.id}/revisoes`);
    assert.equal(revisoes.corpo.length, 1);
    assert.equal(revisoes.corpo[0]!.note, 'Versão inicial.');
  });

  it('editar o texto cria revisão; mudar só a etiqueta, não', async () => {
    const criado = await agente.post<ArticleDetail>('/articles', {
      title: 'Configurar VPN no notebook',
      body: 'Instale o cliente e importe o perfil que o time de redes enviou.',
    });

    const id = criado.corpo.id;

    await agente.patch(`/articles/${id}`, {
      body: 'Instale o cliente, importe o perfil e reinicie a máquina.',
      note: 'Faltava o reinício.',
    });

    let revisoes = await agente.get<ArticleRevisionView[]>(`/articles/${id}/revisoes`);
    assert.equal(revisoes.corpo.length, 2);
    assert.equal(revisoes.corpo[0]!.version, 2);
    assert.equal(revisoes.corpo[0]!.note, 'Faltava o reinício.');

    await agente.patch(`/articles/${id}`, { keywords: ['vpn'] });

    revisoes = await agente.get<ArticleRevisionView[]>(`/articles/${id}/revisoes`);
    assert.equal(
      revisoes.corpo.length,
      2,
      'trocar a etiqueta não é versão nova do texto e encheria o histórico de linhas iguais',
    );
  });
});

// ---------------------------------------------------------------------

describe('publicar é mais do que escrever', () => {
  it('o agente escreve mas não publica', async () => {
    const r = await agente.post('/articles', {
      title: 'Procedimento que o cliente não deve ver',
      body: 'Senha de serviço do fornecedor.',
      isPublic: true,
    });

    assert.equal(r.status, 403);
  });

  it('o supervisor publica', async () => {
    const r = await supervisor.post<ArticleDetail>('/articles', {
      title: 'Como abrir um chamado pelo WhatsApp',
      body: 'Mande uma mensagem para o número do suporte descrevendo o problema.',
      isPublic: true,
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.isPublic, true);
  });

  it('despublicar também exige a permissão', async () => {
    const publicado = await supervisor.post<ArticleDetail>('/articles', {
      title: 'Horário de atendimento',
      body: 'Segunda a sexta, das 9h às 18h.',
      isPublic: true,
    });

    const r = await agente.patch(`/articles/${publicado.corpo.id}`, { isPublic: false });
    assert.equal(r.status, 403, 'tirar do ar o que a organização decidiu mostrar é a mesma decisão');
  });
});

// ---------------------------------------------------------------------

describe('o interno não vaza para o portal', () => {
  it('o solicitante só enxerga o publicado', async () => {
    const interno = await agente.post<ArticleDetail>('/articles', {
      title: 'Credenciais do servidor de impressão',
      body: 'Usuário admin, senha no cofre da equipe.',
    });

    const lista = await solicitante.get<ArticleListItem[]>('/articles');
    assert.equal(lista.status, 200);
    assert.ok(
      !lista.corpo.some((a) => a.id === interno.corpo.id),
      'artigo interno não pode aparecer na lista do portal',
    );

    const direto = await solicitante.get(`/articles/${interno.corpo.id}`);
    assert.equal(direto.status, 404, 'nem pela URL direta');
  });

  it('e a busca do solicitante também não o encontra', async () => {
    const r = await solicitante.get<ArticleListItem[]>('/articles?q=credenciais');
    assert.ok(!r.corpo.some((a) => a.title.includes('Credenciais')));
  });
});

// ---------------------------------------------------------------------

describe('busca em português', () => {
  before(async () => {
    await supervisor.post('/articles', {
      title: 'Impressoras não imprimem após atualização',
      body:
        'Quando a fila de impressão trava depois de uma atualização do Windows, ' +
        'reinicie o serviço de spooler e limpe os trabalhos pendentes.',
      isPublic: true,
      keywords: ['spooler', '0x0000011b'],
    });
  });

  it('acha pelo radical: "impressora" encontra "Impressoras"', async () => {
    const r = await agente.get<ArticleListItem[]>('/articles?q=impressora');
    assert.ok(
      r.corpo.some((a) => a.title.startsWith('Impressoras')),
      'sem radical em português a busca não serve para nada',
    );
  });

  it('acha com um assunto inteiro, não só com o termo exato', async () => {
    // `plainto_tsquery` exigiria todos os termos e não acharia nada.
    const r = await agente.get<ArticleListItem[]>(
      '/articles?q=' + encodeURIComponent('a impressora do terceiro andar parou de imprimir'),
    );

    assert.ok(r.corpo.length > 0, 'um assunto de chamado inteiro tem de encontrar o artigo');
    assert.ok(r.corpo[0]!.excerpt, 'a busca devolve o trecho que casou');
  });

  it('acha pela etiqueta, que é busca exata', async () => {
    const r = await agente.get<ArticleListItem[]>('/articles?q=0x0000011b');
    assert.ok(
      r.corpo.some((a) => a.keywords.includes('0x0000011b')),
      'código de erro não aparece no texto e é como a pessoa procura',
    );
  });

  it('texto que não casa com nada devolve lista vazia, não erro', async () => {
    const r = await agente.get<ArticleListItem[]>('/articles?q=' + encodeURIComponent('xyzzy plugh'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, []);
  });

  it('pontuação e aspas não derrubam a consulta', async () => {
    // O lexema entra citado no `to_tsquery`; texto cru quebraria a
    // sintaxe e derrubaria a busca com 500.
    const r = await agente.get(
      '/articles?q=' + encodeURIComponent(`impressora ' | ! & ( ) :* "aspas"`),
    );
    assert.equal(r.status, 200);
  });

  it('o arquivado sai da lista sem sumir do banco', async () => {
    const artigo = await supervisor.post<ArticleDetail>('/articles', {
      title: 'Procedimento aposentado do fax',
      body: 'Não usamos mais fax desde 2019.',
    });

    await supervisor.patch(`/articles/${artigo.corpo.id}`, { isArchived: true });

    const normal = await agente.get<ArticleListItem[]>('/articles?q=fax');
    assert.ok(!normal.corpo.some((a) => a.id === artigo.corpo.id));

    const comArquivados = await agente.get<ArticleListItem[]>('/articles?q=fax&arquivados=true');
    assert.ok(comArquivados.corpo.some((a) => a.id === artigo.corpo.id));
  });
});

// ---------------------------------------------------------------------

describe('sugestão a partir do chamado', () => {
  it('encontra o artigo pelo assunto do chamado', async () => {
    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Impressora do 3º andar parou de imprimir',
      description: 'Depois da atualização do Windows a fila travou.',
      categoryId: f.categoria.id,
    });

    const r = await agente.get<ArticleListItem[]>(
      `/tickets/${chamado.corpo.id}/artigos-sugeridos`,
    );

    assert.equal(r.status, 200);
    assert.ok(
      r.corpo.some((a) => a.title.startsWith('Impressoras')),
      'encontrar o artigo depois de fechar o chamado não ajuda ninguém',
    );
  });

  it('sem casamento de texto, cai nos artigos da categoria', async () => {
    const daCategoria = await agente.post<ArticleDetail>('/articles', {
      title: 'Notas gerais de hardware',
      body: 'Procedimentos diversos do parque de equipamentos.',
      categoryId: f.categoria.id,
    });

    const chamado = await agente.post<TicketDetail>('/tickets', {
      subject: 'Zzzz qqqq wwww',
      description: 'Vvvv bbbb nnnn.',
      categoryId: f.categoria.id,
    });

    const r = await agente.get<ArticleListItem[]>(
      `/tickets/${chamado.corpo.id}/artigos-sugeridos`,
    );

    assert.ok(
      r.corpo.some((a) => a.id === daCategoria.corpo.id),
      'os artigos da categoria são melhor palpite do que devolver nada',
    );
  });

  it('chamado fora do meu escopo não sugere nada — nem confirma que existe', async () => {
    const outro = await prisma.ticket.create({
      data: {
        organizationId: f.outra.id,
        number: 9001,
        subject: 'De outra empresa',
        description: 'x',
        type: 'INCIDENTE',
        urgency: 3,
        impact: 3,
        priority: 3,
      },
    });

    const r = await agente.get(`/tickets/${outro.id}/artigos-sugeridos`);
    assert.equal(r.status, 404);
  });
});

// ---------------------------------------------------------------------

describe('contagem de leitura', () => {
  it('abrir o artigo conta uma leitura', async () => {
    const artigo = await agente.post<ArticleDetail>('/articles', {
      title: 'Artigo que será lido',
      body: 'Conteúdo qualquer.',
    });

    assert.equal(artigo.corpo.views, 0);

    await agente.get(`/articles/${artigo.corpo.id}`);
    const segunda = await agente.get<ArticleDetail>(`/articles/${artigo.corpo.id}`);

    assert.equal(segunda.corpo.views, 2, '"os mais lidos" só significa algo se a leitura contar');
  });
});

// ---------------------------------------------------------------------

describe('o índice de busca existe', () => {
  it('a coluna gerada e os dois índices GIN estão no banco', async () => {
    // Esta asserção existe porque uma migração gerada com
    // `prisma migrate diff --from-schema-datasource` apagou a coluna
    // `busca` e os dois índices sem ninguém pedir: o Prisma lê o banco
    // vivo e "corrige" tudo que não está no `schema.prisma`. Sem ela, a
    // próxima vez só apareceria como 500 na tela de busca.
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'articles' AND column_name = 'busca'
    `;
    assert.equal(colunas.length, 1, 'a coluna gerada "busca" sumiu do banco');

    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'articles' AND indexname IN ('articles_busca', 'articles_keywords')
    `;
    assert.equal(indices.length, 2, 'os índices GIN da base de conhecimento sumiram');
  });
});

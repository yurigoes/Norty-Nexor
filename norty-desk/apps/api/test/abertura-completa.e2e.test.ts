import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AberturaPublicaResposta,
  AttachmentView,
  CategoriaPublica,
  ModeloDeChamado,
} from '@norty-desk/shared';

import { type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O que a abertura sem login ganhou: tipo, modelo, anexo e observador.
 *
 * O fio que amarra os quatro é o mesmo: **nada é público por omissão**.
 * Categoria e modelo só aparecem — e só são aceitos — quando alguém os
 * marcou; o anexo tem teto próprio; o observador entra como contato e
 * nunca vira usuário.
 */

let api: Api;
let f: Fixtura;
let cliente: { id: string };

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();

  cliente = await prisma.client.create({
    data: {
      organizationId: f.organizacao.id,
      name: 'Empresa Aberta',
      emailDomain: 'aberta.com.br',
    },
    select: { id: true },
  });
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

const liberar = () => prisma.loginThrottle.deleteMany({});

async function pegar<T>(caminho: string) {
  const r = await fetch(`${api.url}${caminho}`);
  const texto = await r.text();
  return { status: r.status, corpo: texto ? (JSON.parse(texto) as T) : null };
}

async function abrir(corpo: Record<string, unknown>) {
  const r = await fetch(`${api.url}/publico/chamados`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: cliente.id,
      requesterName: 'Yuri Souza Goes',
      requesterEmail: 'yuri@aberta.com.br',
      subject: 'Assunto do chamado',
      description: 'Descrição com tamanho suficiente para passar.',
      ...corpo,
    }),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

describe('tipo de chamado na tela sem login', () => {
  it('só aparece o que foi marcado como público', async () => {
    const publica = await prisma.category.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Impressora',
        isPublic: true,
        defaultTeamId: f.time.id,
      },
    });
    await prisma.category.create({
      data: { organizationId: f.organizacao.id, name: 'Jurídico', isPublic: false },
    });

    const r = await pegar<CategoriaPublica[]>(`/publico/empresas/${cliente.id}/tipos`);
    assert.equal(r.status, 200);

    const nomes = (r.corpo ?? []).map((c) => c.name);
    assert.ok(nomes.includes('Impressora'));
    assert.ok(!nomes.includes('Jurídico'), 'categoria interna não pode vazar para a tela pública');
    assert.ok(!nomes.includes('Hardware'), 'a categoria da fixtura não foi marcada como pública');
    assert.ok(publica.id);
  });

  it('o tipo escolhido roteia o chamado, como na abertura com login', async () => {
    await liberar();
    const tipo = await prisma.category.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Rede parada',
        isPublic: true,
        defaultTeamId: f.time.id,
      },
    });

    const r = await abrir({ categoryId: tipo.id });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: (r.corpo as AberturaPublicaResposta).protocol },
      include: { actors: true },
    });
    assert.equal(chamado.categoryId, tipo.id);
    assert.equal(chamado.status, 'ATRIBUIDO', 'o tipo com time faz o chamado nascer atribuído');
    assert.ok(chamado.actors.some((a) => a.role === 'ATRIBUIDO' && a.teamId === f.time.id));
  });

  it('recusa tipo que não é público, mesmo sabendo o id', async () => {
    await liberar();
    const interna = await prisma.category.create({
      data: { organizationId: f.organizacao.id, name: 'Rescisão', isPublic: false },
    });

    const r = await abrir({ categoryId: interna.id });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });
});

describe('modelo de chamado', () => {
  const schema = {
    fields: [
      { key: 'patrimonio', label: 'Patrimônio', type: 'TEXTO', required: true },
      {
        key: 'andar',
        label: 'Andar',
        type: 'SELECAO',
        required: false,
        options: [
          { value: 'terreo', label: 'Térreo' },
          { value: 'primeiro', label: '1º andar' },
        ],
      },
      { key: 'diagnostico', label: 'Diagnóstico', type: 'TEXTO', required: false },
    ],
  };

  it('a tela sem login só recebe os modelos marcados como públicos', async () => {
    await prisma.ticketForm.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Impressora',
        description: 'Não imprime, atola, sai borrado.',
        schema,
        isModel: true,
        isPublic: true,
        position: 1,
      },
    });
    await prisma.ticketForm.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Abertura de contrato',
        schema,
        isModel: true,
        isPublic: false,
      },
    });
    await prisma.ticketForm.create({
      data: { organizationId: f.organizacao.id, name: 'Só herança', schema, isModel: false },
    });

    const r = await pegar<ModeloDeChamado[]>(`/publico/empresas/${cliente.id}/modelos`);
    const nomes = (r.corpo ?? []).map((m) => m.name);

    assert.deepEqual(nomes, ['Impressora'], `veio ${JSON.stringify(nomes)}`);
  });

  it('o modelo vem com os campos junto, para a tela não piscar vazia', async () => {
    const r = await pegar<ModeloDeChamado[]>(`/publico/empresas/${cliente.id}/modelos`);
    const modelo = (r.corpo ?? [])[0];

    assert.ok(modelo);
    assert.equal(modelo.description, 'Não imprime, atola, sai borrado.');
    assert.equal(modelo.schema.fields.length, 3);
    assert.equal(modelo.schema.fields[0]?.key, 'patrimonio');
  });

  it('as respostas são gravadas no chamado', async () => {
    await liberar();
    const modelo = await prisma.ticketForm.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Impressora' },
    });

    const r = await abrir({
      formId: modelo.id,
      customFields: { patrimonio: 'PAT-4721', andar: 'terreo' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: (r.corpo as AberturaPublicaResposta).protocol },
    });
    assert.equal(chamado.formId, modelo.id);
    assert.deepEqual(chamado.customFields, { patrimonio: 'PAT-4721', andar: 'terreo' });
  });

  it('campo obrigatório em branco é recusado — o mesmo validador de dentro', async () => {
    await liberar();
    const modelo = await prisma.ticketForm.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Impressora' },
    });

    const r = await abrir({ formId: modelo.id, customFields: { andar: 'terreo' } });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(JSON.stringify(r.corpo), /Patrimônio/);
  });

  it('opção fora da lista é recusada', async () => {
    await liberar();
    const modelo = await prisma.ticketForm.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Impressora' },
    });

    const r = await abrir({
      formId: modelo.id,
      customFields: { patrimonio: 'PAT-1', andar: 'cobertura' },
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('recusa modelo interno, mesmo sabendo o id', async () => {
    await liberar();
    const interno = await prisma.ticketForm.findFirstOrThrow({
      where: { organizationId: f.organizacao.id, name: 'Abertura de contrato' },
    });

    const r = await abrir({ formId: interno.id, customFields: { patrimonio: 'x' } });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });
});

describe('observador na abertura sem login', () => {
  it('entra como contato, e o chamado fica visível para ele', async () => {
    await liberar();
    const r = await abrir({ observerEmails: ['chefe@aberta.com.br', 'ti@aberta.com.br'] });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: (r.corpo as AberturaPublicaResposta).protocol },
      include: { actors: { include: { contact: true } } },
    });

    const observadores = chamado.actors.filter((a) => a.role === 'OBSERVADOR');
    assert.equal(observadores.length, 2);
    assert.deepEqual(
      observadores.map((o) => o.contact?.email).sort(),
      ['chefe@aberta.com.br', 'ti@aberta.com.br'],
    );
    // Contato, não usuário: virar usuário por indicação de um estranho
    // deixaria qualquer um inscrever qualquer pessoa.
    assert.ok(observadores.every((o) => o.userId === null));
  });

  it('não duplica quem já é o requerente', async () => {
    await liberar();
    const r = await abrir({ observerEmails: ['yuri@aberta.com.br'] });
    assert.equal(r.status, 201);

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: (r.corpo as AberturaPublicaResposta).protocol },
      include: { actors: true },
    });
    assert.equal(chamado.actors.filter((a) => a.role === 'OBSERVADOR').length, 0);
  });

  it('não vira lista de distribuição', async () => {
    await liberar();
    const muitos = ['a@aberta.com.br', 'b@aberta.com.br', 'c@aberta.com.br', 'd@aberta.com.br'];

    const r = await abrir({ observerEmails: muitos });
    assert.equal(r.status, 201);

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: (r.corpo as AberturaPublicaResposta).protocol },
      include: { actors: true },
    });
    assert.equal(
      chamado.actors.filter((a) => a.role === 'OBSERVADOR').length,
      3,
      'o teto de observadores é o que impede o Desk de virar disparador',
    );
  });
});

describe('anexo na abertura sem login', () => {
  async function anexar(protocolo: string, nome: string, conteudo = 'conteúdo') {
    const forma = new FormData();
    forma.append('file', new Blob([conteudo], { type: 'text/plain' }), nome);

    const r = await fetch(`${api.url}/publico/chamados/${protocolo}/anexos`, {
      method: 'POST',
      body: forma,
    });
    const texto = await r.text();
    return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
  }

  it('anexa pelo protocolo, sem sessão nenhuma', async () => {
    await liberar();
    const aberto = await abrir({});
    const { protocol } = aberto.corpo as AberturaPublicaResposta;

    await liberar();
    const r = await anexar(protocol, 'foto-do-painel.txt');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const anexo = r.corpo as AttachmentView;
    assert.equal(anexo.filename, 'foto-do-painel.txt');
    // Sem login não há quem anexou: o campo fica nulo, e é o que
    // distingue o arquivo que veio de fora.
    assert.equal(anexo.uploadedById, null);
  });

  it('o nome do arquivo é saneado — o mesmo código de dentro', async () => {
    await liberar();
    const aberto = await abrir({});
    const { protocol } = aberto.corpo as AberturaPublicaResposta;

    await liberar();
    const r = await anexar(protocol, '../../../etc/passwd');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const anexo = r.corpo as AttachmentView;
    assert.ok(!anexo.filename.includes('..'), `nome não saneado: ${anexo.filename}`);
    assert.ok(!anexo.filename.includes('/'), `nome não saneado: ${anexo.filename}`);
  });

  it('protocolo que não existe não recebe arquivo', async () => {
    await liberar();
    const r = await anexar('CDFGHJKM', 'qualquer.txt');
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });

  it('há teto de arquivos: protocolo não é disco de graça', async () => {
    await liberar();
    const aberto = await abrir({});
    const { protocol } = aberto.corpo as AberturaPublicaResposta;

    for (let i = 0; i < 5; i += 1) {
      await liberar();
      assert.equal((await anexar(protocol, `arquivo${i}.txt`)).status, 201, `anexo ${i + 1}`);
    }

    await liberar();
    const sexto = await anexar(protocol, 'sexto.txt');
    assert.equal(sexto.status, 400, JSON.stringify(sexto.corpo));
  });
});

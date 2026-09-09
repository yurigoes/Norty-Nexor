import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();
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

async function tokenDe(email: string): Promise<string> {
  const r = await new Cliente(api.url).entrar(email);
  return (r.corpo as { accessToken: string }).accessToken;
}

async function enviar(token: string, qual: string, nome: string, conteudo: string, tipo: string) {
  const forma = new FormData();
  forma.append('file', new Blob([conteudo], { type: tipo }), nome);

  const resposta = await fetch(`${api.url}/brand/${qual}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: forma,
  });

  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

const SVG_LIMPO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#005CA9"/></svg>';

describe('marca', () => {
  it('é legível sem autenticação — a tela de entrada precisa dela antes do login', async () => {
    const resposta = await fetch(`${api.url}/brand`);
    assert.equal(resposta.status, 200);

    const marca = (await resposta.json()) as { productName: string; logoUrl: string | null };
    assert.equal(marca.productName, 'Norty Desk');
    assert.equal(marca.logoUrl, null, 'sem upload, o aplicativo usa a marca embutida');
  });

  it('aceita uma logo e passa a servi-la, com versão na URL', async () => {
    const token = await tokenDe('supervisor@teste.dev');

    const enviada = await enviar(token, 'logo', 'marca.svg', SVG_LIMPO, 'image/svg+xml');
    assert.equal(enviada.status, 201, JSON.stringify(enviada.corpo));

    const marca = enviada.corpo as { logoUrl: string; version: number };
    assert.ok(marca.logoUrl?.includes(`v=${marca.version}`), 'a URL deveria carregar a versão');

    // Sem autenticação: a logo aparece na tela de entrada.
    const imagem = await fetch(`${api.url}/brand/logo`);
    assert.equal(imagem.status, 200);
    assert.equal(imagem.headers.get('content-type'), 'image/svg+xml');
    assert.equal(imagem.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await imagem.text(), SVG_LIMPO);
  });

  it('a versão sobe a cada troca, para o cache não servir a logo antiga', async () => {
    const token = await tokenDe('supervisor@teste.dev');

    const antes = (await (await fetch(`${api.url}/brand`)).json()) as { version: number };
    await enviar(token, 'logo', 'nova.svg', SVG_LIMPO, 'image/svg+xml');
    const depois = (await (await fetch(`${api.url}/brand`)).json()) as { version: number };

    assert.ok(depois.version > antes.version);
  });

  it('recusa SVG com script, evento ou referência externa', async () => {
    const token = await tokenDe('supervisor@teste.dev');

    const hostis: [string, string][] = [
      ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      ['evento', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>'],
      [
        'javascript:',
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
      ],
      [
        'entidade',
        '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
      ],
      [
        'externo',
        '<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="http://mau.exemplo/x.png"/></svg>',
      ],
      [
        'foreignObject',
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body/></foreignObject></svg>',
      ],
    ];

    for (const [nome, conteudo] of hostis) {
      const r = await enviar(token, 'logo', 'mau.svg', conteudo, 'image/svg+xml');
      assert.equal(r.status, 400, `SVG com ${nome} deveria ter sido recusado`);
    }
  });

  it('recusa formato que não é imagem', async () => {
    const token = await tokenDe('supervisor@teste.dev');
    const r = await enviar(token, 'logo', 'planilha.csv', 'a,b,c', 'text/csv');
    assert.equal(r.status, 400);
  });

  it('só quem administra troca a marca', async () => {
    const token = await tokenDe('agente@teste.dev');

    const upload = await enviar(token, 'logo', 'marca.svg', SVG_LIMPO, 'image/svg+xml');
    assert.equal(upload.status, 403);

    const edicao = await new Cliente(api.url).chamar('PATCH', '/brand', { productName: 'Outro' });
    assert.equal(edicao.status, 401, 'sem token, nem chega ao guard de permissão');
  });

  it('remover a logo devolve o aplicativo à marca embutida', async () => {
    const token = await tokenDe('supervisor@teste.dev');
    await enviar(token, 'logo', 'marca.svg', SVG_LIMPO, 'image/svg+xml');

    const cliente = new Cliente(api.url);
    await cliente.entrar('supervisor@teste.dev');
    const removida = await cliente.chamar<{ logoUrl: string | null }>('DELETE', '/brand/logo');

    assert.equal(removida.status, 200);
    assert.equal(removida.corpo.logoUrl, null);
    assert.equal((await fetch(`${api.url}/brand/logo`)).status, 404);
  });

  it('guarda nome e frase da tela de entrada', async () => {
    const cliente = new Cliente(api.url);
    await cliente.entrar('supervisor@teste.dev');

    const r = await cliente.chamar<{ productName: string; tagline: string }>('PATCH', '/brand', {
      productName: 'Central Norty',
      tagline: 'Atendimento que não perde chamado.',
    });

    assert.equal(r.corpo.productName, 'Central Norty');
    assert.equal(r.corpo.tagline, 'Atendimento que não perde chamado.');
  });
});

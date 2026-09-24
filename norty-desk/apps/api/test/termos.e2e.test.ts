import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, ModeloDeTermoView, PosseView } from '@norty-desk/shared';
import { TEXTO_PADRAO_DO_TERMO } from '@norty-desk/shared';

import { Cliente, type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * O texto dos termos.
 *
 * Um termo sem texto é uma assinatura solta, e assinatura solta não
 * prova nada: o que vale é o que estava escrito embaixo dela.
 *
 * O que se prova aqui e em nenhum outro lugar:
 *
 * 1. **O texto é congelado na assinatura.** Editar o modelo depois vale
 *    para o próximo termo e não reescreve o que alguém já assinou —
 *    senão o histórico deixa de valer como prova.
 * 2. **Marcador inventado é recusado ao salvar**, e não no papel
 *    impresso com a pessoa esperando para assinar.
 * 3. **A quebra é assunto próprio**, separada do destino: nem todo
 *    descarte é quebra, e nem toda quebra vira descarte.
 * 4. **O papel sai em PDF**, com o texto e o traço.
 */

let api: Api;
let f: Fixtura;
let admin: Cliente;

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
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

/** Um PNG de 1x1, que é o bastante para o formato passar. */
const PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let sequencia = 0;

async function criarAtivo(): Promise<AssetView> {
  sequencia += 1;
  const r = await admin.post<AssetView>('/assets', {
    name: `Notebook ${sequencia}`,
    kind: 'COMPUTADOR',
    tag: `PAT-TERMO-${sequencia}`,
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo;
}

const entregar = (assetId: string, corpo: Record<string, unknown>) =>
  admin.post<PosseView[] & { detail?: string }>(`/assets/${assetId}/posse`, corpo);

const devolver = (assetId: string, corpo: Record<string, unknown>) =>
  admin.post<PosseView[] & { detail?: string }>(`/assets/${assetId}/devolver`, corpo);

// ---------------------------------------------------------------------

describe('a redação que a casa usa', () => {
  it('começa com o texto de fábrica, marcado como tal', async () => {
    const r = await admin.get<ModeloDeTermoView[]>('/config/termos');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.length, 2);

    for (const modelo of r.corpo) {
      assert.equal(modelo.padrao, true);
      assert.equal(modelo.updatedAt, null);
      assert.equal(modelo.body, TEXTO_PADRAO_DO_TERMO[modelo.kind]);
    }
  });

  it('recusa marcador que não existe, na hora de salvar', async () => {
    const r = await admin.put<{ detail?: string }>('/config/termos/COMPROMISSO', {
      body:
        'Eu, {{pessoa.nome}}, recebi o {{equipamento.nome}} e concordo com ' +
        'tudo que {{fulano.ciclano}} determinar, de hoje até sempre, amém.',
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /fulano\.ciclano/);
  });

  it('salva, marca como editado, e volta ao de fábrica quando pedido', async () => {
    const texto =
      'TERMO DA CASA\n\nEu, {{pessoa.nome}}, recebi o {{equipamento.nome}} ' +
      'de {{empresa.nome}} em {{termo.data}} e me comprometo a guardá-lo.';

    const salvo = await admin.put<ModeloDeTermoView[]>('/config/termos/COMPROMISSO', {
      body: texto,
    });
    assert.equal(salvo.status, 200, JSON.stringify(salvo.corpo));

    const compromisso = salvo.corpo.find((m) => m.kind === 'COMPROMISSO')!;
    assert.equal(compromisso.padrao, false);
    assert.equal(compromisso.body, texto);
    assert.ok(compromisso.updatedAt);

    // A quebra não se mexe: são duas políticas separadas.
    assert.equal(salvo.corpo.find((m) => m.kind === 'QUEBRA')!.padrao, true);

    const restaurado = await admin.chamar<ModeloDeTermoView[]>(
      'DELETE',
      '/config/termos/COMPROMISSO',
    );
    assert.equal(restaurado.status, 200);
    assert.equal(restaurado.corpo.find((m) => m.kind === 'COMPROMISSO')!.padrao, true);
  });

  it('tipo de termo desconhecido na URL é recusado', async () => {
    const r = await admin.put('/config/termos/QUALQUER_COISA', { body: 'x'.repeat(60) });
    assert.equal(r.status, 400);
  });
});

describe('o texto congela na assinatura', () => {
  it('editar o modelo depois não reescreve o que já foi assinado', async () => {
    await admin.put('/config/termos/COMPROMISSO', {
      body: 'PRIMEIRA REDAÇÃO. Eu, {{pessoa.nome}}, recebi o {{equipamento.nome}}.',
    });

    const ativo = await criarAtivo();
    const entrega = await entregar(ativo.id, { userId: f.solicitante.id, signature: PNG });
    assert.equal(entrega.status, 201, JSON.stringify(entrega.corpo));

    const assinado = entrega.corpo[0]!.terms[0]!;
    assert.match(assinado.body, /PRIMEIRA REDAÇÃO/);

    // O jurídico pede outra cláusula. O papel de ontem não muda.
    await admin.put('/config/termos/COMPROMISSO', {
      body: 'SEGUNDA REDAÇÃO, bem diferente. Eu, {{pessoa.nome}}, recebi o {{equipamento.nome}}.',
    });

    const depois = await admin.get<PosseView[]>(`/assets/${ativo.id}/posses`);
    assert.equal(depois.status, 200);
    assert.match(
      depois.corpo[0]!.terms[0]!.body,
      /PRIMEIRA REDAÇÃO/,
      'o termo assinado mudou de texto — deixou de valer como prova',
    );

    // E o próximo já nasce com a redação nova.
    const outro = await criarAtivo();
    const nova = await entregar(outro.id, { userId: f.solicitante.id, signature: PNG });
    assert.match(nova.corpo[0]!.terms[0]!.body, /SEGUNDA REDAÇÃO/);

    await admin.chamar('DELETE', '/config/termos/COMPROMISSO');
  });

  it('o equipamento sem patrimônio sai com travessão, não com lacuna', async () => {
    const semEtiqueta = await admin.post<AssetView>('/assets', {
      name: 'Monitor sem nada',
      kind: 'MONITOR',
    });
    assert.equal(semEtiqueta.status, 201);

    const r = await entregar(semEtiqueta.corpo.id, { userId: f.solicitante.id, signature: PNG });
    const corpo = r.corpo[0]!.terms[0]!.body;

    assert.ok(corpo.includes('Patrimônio: —'), corpo);
    assert.ok(!corpo.includes('{{'), 'sobrou marcador sem trocar');
  });
});

describe('o termo de quebra', () => {
  it('nasce da devolução com dano, e carrega o que aconteceu', async () => {
    const ativo = await criarAtivo();
    assert.equal((await entregar(ativo.id, { userId: f.solicitante.id })).status, 201);

    const r = await devolver(ativo.id, {
      returnedTo: 'BAIXADO',
      comQuebra: true,
      notes: 'Caiu da mesa e a tela trincou no canto direito.',
      signature: PNG,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const termo = r.corpo[0]!.terms.find((t) => t.kind === 'QUEBRA')!;
    assert.ok(termo, 'a quebra deveria ter gerado o termo de ocorrência');
    assert.ok(termo.body.includes('Caiu da mesa'), termo.body);
    assert.ok(termo.body.includes('Baixado'), 'o destino entra no papel');
    assert.equal(termo.signedByName, f.solicitante.name);
  });

  it('exige a descrição: termo de ocorrência sem ocorrência não serve', async () => {
    const ativo = await criarAtivo();
    assert.equal((await entregar(ativo.id, { userId: f.solicitante.id })).status, 201);

    const r = await devolver(ativo.id, {
      returnedTo: 'BAIXADO',
      comQuebra: true,
      signature: PNG,
    });

    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.detail ?? '', /Descreva/);
  });

  it('devolução comum não gera termo nenhum, mesmo indo para descarte', async () => {
    const ativo = await criarAtivo();
    assert.equal((await entregar(ativo.id, { userId: f.solicitante.id })).status, 201);

    // Equipamento velho sai do parque sem ter quebrado.
    const r = await devolver(ativo.id, { returnedTo: 'BAIXADO', notes: 'Fim de vida útil.' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo[0]!.terms, []);
  });

  it('quebra sem assinatura registra o dano e não inventa termo', async () => {
    const ativo = await criarAtivo();
    assert.equal((await entregar(ativo.id, { userId: f.solicitante.id })).status, 201);

    const r = await devolver(ativo.id, {
      returnedTo: 'EM_ESTOQUE',
      comQuebra: true,
      notes: 'Teclado com teclas soltas; foi para conserto.',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo[0]!.notes, 'Teclado com teclas soltas; foi para conserto.');
    assert.deepEqual(r.corpo[0]!.terms, [], 'sem quem assine, não há papel assinado');
  });
});

describe('o papel', () => {
  it('sai em PDF, com o texto e o traço', async () => {
    const ativo = await criarAtivo();
    const entrega = await entregar(ativo.id, { userId: f.solicitante.id, signature: PNG });
    const termo = entrega.corpo[0]!.terms[0]!;

    const r = await fetch(`${api.url}/termos/${termo.id}/pdf`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });

    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');

    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF', 'não veio um PDF');
    assert.ok(bytes.length > 1000, 'o PDF veio vazio demais para ter o termo dentro');
  });

  it('termo de outra organização não sai', async () => {
    const ativo = await criarAtivo();
    const entrega = await entregar(ativo.id, { userId: f.solicitante.id, signature: PNG });
    const termo = entrega.corpo[0]!.terms[0]!;

    await prisma.assetTerm.update({
      where: { id: termo.id },
      data: { organizationId: f.outra.id },
    });

    const r = await fetch(`${api.url}/termos/${termo.id}/pdf`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.equal(r.status, 404);
  });
});

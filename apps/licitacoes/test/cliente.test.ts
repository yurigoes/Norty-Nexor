import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClientePncp, ErroPncp } from '../src/pncp/cliente.ts';
import type { ContratacaoBruta } from '../src/pncp/tipos.ts';

/** Sobe uma resposta HTTP falsa sem tocar em rede. */
function resposta(corpo: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status: 204 });
  return new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function contratacao(sequencial: number): ContratacaoBruta {
  return {
    numeroControlePNCP: `11222333000141-1-${String(sequencial).padStart(6, '0')}/2026`,
    anoCompra: 2026,
    sequencialCompra: sequencial,
    objetoCompra: `Objeto ${sequencial}`,
    orgaoEntidade: { cnpj: '11222333000141', razaoSocial: 'Prefeitura' },
  };
}

/** Grava as URLs chamadas e devolve respostas de uma fila. */
function espiao(respostas: Response[]) {
  const urls: string[] = [];
  const fetchImpl = (async (url: URL | string) => {
    urls.push(String(url));
    const proxima = respostas.shift();
    if (!proxima) throw new Error('fetch chamado mais vezes que o previsto');
    return proxima;
  }) as typeof fetch;
  return { urls, fetchImpl };
}

const semEspera = async () => {};

describe('parâmetros da consulta', () => {
  test('monta a URL com os parâmetros obrigatórios do PNCP', async () => {
    const { urls, fetchImpl } = espiao([resposta({ data: [], paginasRestantes: 0 })]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'sp',
    });

    const url = new URL(urls[0]);
    assert.equal(url.pathname, '/api/consulta/v1/contratacoes/proposta');
    assert.equal(url.searchParams.get('dataFinal'), '20260930');
    assert.equal(url.searchParams.get('codigoModalidadeContratacao'), '8');
    assert.equal(url.searchParams.get('pagina'), '1');
    assert.equal(url.searchParams.get('uf'), 'SP', 'a UF deve ir em caixa alta');
  });

  test('consulta uma vez por modalidade — o endpoint só aceita uma', async () => {
    const { urls, fetchImpl } = espiao([
      resposta({ data: [contratacao(1)], paginasRestantes: 0 }),
      resposta({ data: [contratacao(2)], paginasRestantes: 0 }),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [6, 8],
      uf: 'SP',
    });

    assert.equal(urls.length, 2);
    assert.equal(contratacoes.length, 2);
    assert.deepEqual(
      urls.map((u) => new URL(u).searchParams.get('codigoModalidadeContratacao')),
      ['6', '8'],
    );
  });
});

describe('paginação', () => {
  test('segue as páginas enquanto restarem', async () => {
    const { urls, fetchImpl } = espiao([
      resposta({ data: [contratacao(1)], paginasRestantes: 1 }),
      resposta({ data: [contratacao(2)], paginasRestantes: 0 }),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(contratacoes.length, 2);
    assert.deepEqual(
      urls.map((u) => new URL(u).searchParams.get('pagina')),
      ['1', '2'],
    );
  });

  /**
   * Nem toda resposta traz `paginasRestantes`. Sem ele, página
   * incompleta é o sinal de fim — senão o cliente pediria a
   * página 2 de um resultado que já acabou.
   */
  test('para na página incompleta quando falta paginasRestantes', async () => {
    const { urls, fetchImpl } = espiao([resposta({ data: [contratacao(1)] })]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(urls.length, 1);
  });

  test('deduplica contratação repetida entre páginas', async () => {
    const { fetchImpl } = espiao([
      resposta({ data: [contratacao(1), contratacao(2)], paginasRestantes: 1 }),
      resposta({ data: [contratacao(2), contratacao(3)], paginasRestantes: 0 }),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(contratacoes.length, 3);
  });
});

describe('respostas vazias', () => {
  test('204 é ausência de resultado, não erro', async () => {
    const { fetchImpl } = espiao([resposta(null, 204)]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.deepEqual(contratacoes, []);
    assert.deepEqual(falhas, []);
  });

  test('corpo vazio com 200 também é ausência', async () => {
    const { fetchImpl } = espiao([resposta('   ')]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.deepEqual(contratacoes, []);
    assert.deepEqual(falhas, []);
  });
});

describe('resiliência', () => {
  test('repete em erro 5xx e aproveita a resposta boa', async () => {
    const { urls, fetchImpl } = espiao([
      resposta('erro interno', 500),
      resposta({ data: [contratacao(1)], paginasRestantes: 0 }),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(urls.length, 2);
    assert.equal(contratacoes.length, 1);
    assert.deepEqual(falhas, []);
  });

  /** 400 é parâmetro errado: repetir só gasta tempo e não conserta. */
  test('não repete em erro 4xx', async () => {
    const { urls, fetchImpl } = espiao([resposta('parâmetro inválido', 400)]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(urls.length, 1);
    assert.equal(falhas.length, 1);
    assert.match(falhas[0].erro, /400/);
  });

  test('429 é repetido — é limite de taxa, não erro de pedido', async () => {
    const { urls, fetchImpl } = espiao([
      resposta('devagar', 429),
      resposta({ data: [contratacao(1)], paginasRestantes: 0 }),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(urls.length, 2);
    assert.equal(contratacoes.length, 1);
  });

  test('desiste depois do número de tentativas configurado', async () => {
    const { urls, fetchImpl } = espiao([
      resposta('erro', 500),
      resposta('erro', 500),
      resposta('erro', 500),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera, tentativas: 3 });

    const { falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(urls.length, 3);
    assert.equal(falhas.length, 1);
  });

  /**
   * A garantia que sustenta o radar diário: uma modalidade fora do
   * ar não pode apagar o resultado das outras. O relatório mostra
   * o que veio e diz o que faltou.
   */
  test('falha em uma modalidade não derruba as demais', async () => {
    const { fetchImpl } = espiao([
      resposta('quebrou', 400),
      resposta({ data: [contratacao(9)], paginasRestantes: 0 }),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [6, 8],
      uf: 'SP',
    });

    assert.equal(contratacoes.length, 1);
    assert.equal(falhas.length, 1);
    assert.equal(falhas[0].modalidade, 6);
  });

  test('erro de rede vira falha registrada, não exceção', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera, tentativas: 2 });

    const { falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'SP',
    });

    assert.equal(falhas.length, 1);
    assert.match(falhas[0].erro, /fetch failed/);
  });
});

describe('ErroPncp', () => {
  test('carrega o status para quem quiser tratar', () => {
    const erro = new ErroPncp('falhou', 503);
    assert.equal(erro.status, 503);
    assert.equal(erro.name, 'ErroPncp');
  });
});

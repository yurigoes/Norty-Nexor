import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClientePncp, ErroPncp } from '../src/pncp-cliente.ts';
import type { ContratacaoBruta } from '../src/pncp-tipos.ts';

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

describe('limite de requisições do PNCP', () => {
  /** Registra cada espera pedida, para o teste ver o ritmo. */
  function relogio() {
    const esperas: number[] = [];
    return { esperas, aguardar: async (ms: number) => void esperas.push(ms) };
  }

  test('espaça os pedidos — sem ritmo o PNCP corta a varredura com 429', async () => {
    const { fetchImpl } = espiao([
      resposta({ data: [contratacao(1)], paginasRestantes: 0 }),
      resposta({ data: [contratacao(2)], paginasRestantes: 0 }),
      resposta({ data: [contratacao(3)], paginasRestantes: 0 }),
    ]);
    const { esperas, aguardar } = relogio();
    const cliente = new ClientePncp({ fetchImpl, aguardar, intervaloMs: 900 });

    await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [6, 8, 12],
      uf: 'BA',
    });

    // Três pedidos, duas pausas: o primeiro não espera por nada.
    assert.deepEqual(esperas, [900, 900]);
  });

  test('429 afrouxa o ritmo em vez de gastar a tentativa no mesmo passo', async () => {
    const { fetchImpl } = espiao([
      resposta('<html>Limite de requisições excedido</html>', 429),
      resposta({ data: [contratacao(1)], paginasRestantes: 0 }),
    ]);
    const { esperas, aguardar } = relogio();
    const cliente = new ClientePncp({ fetchImpl, aguardar, intervaloMs: 1000, tentativas: 3 });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'BA',
    });

    assert.equal(falhas.length, 0, 'a segunda tentativa deve trazer o dado');
    assert.equal(contratacoes.length, 1);
    assert.equal(cliente.intervaloAtual, 1800, 'o ritmo sobe 1,8× a cada 429');
    // Recuo do 429 (4× o ritmo já afrouxado), depois o ritmo normal.
    assert.deepEqual(esperas, [7200, 1800]);
  });

  test('obedece ao Retry-After quando o servidor diz quanto esperar', async () => {
    const trezeSegundos = new Response('devagar', {
      status: 429,
      headers: { 'Retry-After': '13' },
    });
    const { fetchImpl } = espiao([trezeSegundos, resposta({ data: [], paginasRestantes: 0 })]);
    const { esperas, aguardar } = relogio();
    const cliente = new ClientePncp({ fetchImpl, aguardar, intervaloMs: 1000 });

    await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'BA',
    });

    assert.equal(esperas[0], 13_000, 'o servidor sabe melhor que a curva de recuo');
  });

  test('429 na página 12 não descarta as onze anteriores', async () => {
    // Páginas cheias (50) mantêm a paginação andando; a terceira
    // é cortada pelo limite.
    const cheia = () => ({
      data: Array.from({ length: 50 }, (_, i) => contratacao(i + 1)),
      paginasRestantes: 5,
    });
    const { fetchImpl } = espiao([
      resposta(cheia()),
      resposta(cheia()),
      resposta('limite', 429),
      resposta('limite', 429),
      resposta('limite', 429),
    ]);
    const cliente = new ClientePncp({
      fetchImpl,
      aguardar: semEspera,
      tentativas: 3,
      intervaloMs: 0,
    });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [6],
      uf: 'BA',
    });

    // Deduplicadas por numeroControlePNCP: as duas páginas trazem
    // os mesmos 50 sequenciais. O que importa é não ser zero.
    assert.equal(contratacoes.length, 50, 'o que já veio tem de sobreviver à falha');
    assert.equal(falhas.length, 1);
    assert.match(falhas[0].erro, /página 3/);
    assert.match(falhas[0].erro, /100 registro\(s\) anteriores mantidos/);
  });

  test('4xx que não é 429 continua sem repetição — parâmetro errado não melhora', async () => {
    const { urls, fetchImpl } = espiao([resposta('{"message":"dataFinal inválida"}', 400)]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera, tentativas: 3 });

    const { falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: 'ontem',
      modalidades: [8],
      uf: 'BA',
    });

    assert.equal(urls.length, 1, 'repetir um 400 é desperdício');
    assert.match(falhas[0].erro, /dataFinal inválida/, 'o corpo diz qual parâmetro caiu');
  });
});

describe('PNCP sobrecarregado (5xx)', () => {
  function relogio() {
    const esperas: number[] = [];
    return { esperas, aguardar: async (ms: number) => void esperas.push(ms) };
  }

  test('503 recua a partir do ritmo, não em 500ms fixos', async () => {
    const { fetchImpl } = espiao([
      resposta('<h1>503 Service Unavailable</h1>', 503),
      resposta({ data: [contratacao(1)], paginasRestantes: 0 }),
    ]);
    const { esperas, aguardar } = relogio();
    const cliente = new ClientePncp({ fetchImpl, aguardar, intervaloMs: 900, tentativas: 3 });

    const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [8],
      uf: 'BA',
    });

    assert.equal(falhas.length, 0, '503 é transitório: a segunda tentativa vale');
    assert.equal(contratacoes.length, 1);
    // 900 × 2¹ na primeira tentativa; depois o ritmo normal.
    assert.deepEqual(esperas, [1800, 900]);
    assert.equal(cliente.intervaloAtual, 900, '5xx não é limite: o ritmo não muda');
  });

  test('502 esgota as tentativas e vira falha com o corpo do erro', async () => {
    const { urls, fetchImpl } = espiao([
      resposta('<h1>502 Bad Gateway</h1>', 502),
      resposta('<h1>502 Bad Gateway</h1>', 502),
    ]);
    const cliente = new ClientePncp({ fetchImpl, aguardar: semEspera, tentativas: 2 });

    const { falhas } = await cliente.contratacoesComPropostaAberta({
      dataFinal: '20260930',
      modalidades: [6],
      uf: 'BA',
    });

    assert.equal(urls.length, 2, 'as duas tentativas devem ser gastas');
    assert.match(falhas[0].erro, /502 Bad Gateway/);
  });
});

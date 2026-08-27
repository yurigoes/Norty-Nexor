import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarContratacao, normalizarLote } from '../src/pncp-normalizar.ts';
import type { ContratacaoBruta } from '../src/pncp-tipos.ts';

const COMPLETA: ContratacaoBruta = {
  numeroControlePNCP: '11222333000141-1-000012/2026',
  anoCompra: 2026,
  sequencialCompra: 12,
  objetoCompra: '  Aquisição de notebooks  ',
  informacaoComplementar: 'Entrega em 30 dias',
  modalidadeId: 8,
  modoDisputaId: 4,
  situacaoCompraId: 1,
  srp: false,
  valorTotalEstimado: 45_000,
  dataEncerramentoProposta: '2026-09-06T12:00:00.000Z',
  linkSistemaOrigem: 'https://www.gov.br/compras',
  orgaoEntidade: { cnpj: '11.222.333/0001-41', razaoSocial: 'Prefeitura Exemplo', esferaId: 'M' },
  unidadeOrgao: {
    nomeUnidade: 'Secretaria de Educação',
    municipioNome: 'São Paulo',
    codigoIbge: '3550308',
    ufSigla: 'sp',
  },
};

describe('normalização', () => {
  test('traduz o registro completo para o domínio', () => {
    const o = normalizarContratacao(COMPLETA)!;
    assert.equal(o.objeto, 'Aquisição de notebooks', 'deve aparar espaços');
    assert.equal(o.cnpjOrgao, '11222333000141', 'deve tirar a máscara do CNPJ');
    assert.equal(o.unidade.uf, 'SP', 'deve subir a caixa da UF');
    assert.equal(o.valorEstimado, 45_000);
    assert.equal(o.registroDePrecos, false);
  });

  test('monta o link do edital no PNCP', () => {
    const o = normalizarContratacao(COMPLETA)!;
    assert.equal(o.linkPncp, 'https://pncp.gov.br/app/editais/11222333000141/2026/12');
  });

  test('preserva o link da plataforma de envio', () => {
    assert.equal(normalizarContratacao(COMPLETA)!.linkSistemaOrigem, 'https://www.gov.br/compras');
  });
});

describe('campos ausentes', () => {
  /**
   * O PNCP usa 0 tanto para orçamento sigiloso quanto para "não
   * informado". Deixar passar como número faria a triagem tratar
   * a contratação como se fosse de graça.
   */
  test('valor zero, nulo ou ausente vira null', () => {
    for (const valor of [0, null, undefined, -1]) {
      const o = normalizarContratacao({ ...COMPLETA, valorTotalEstimado: valor })!;
      assert.equal(o.valorEstimado, null, `valor ${String(valor)} deveria virar null`);
    }
  });

  test('link de origem em branco vira null', () => {
    assert.equal(normalizarContratacao({ ...COMPLETA, linkSistemaOrigem: '  ' })!.linkSistemaOrigem, null);
  });

  test('unidade ausente não quebra e vira travessão', () => {
    const o = normalizarContratacao({ ...COMPLETA, unidadeOrgao: undefined })!;
    assert.equal(o.unidade.municipio, '—');
    assert.equal(o.unidade.municipioIbge, '');
    assert.equal(o.unidade.uf, '');
  });

  /** Só o endpoint de proposta aberta lista o que está de pé. */
  test('situação ausente assume divulgada', () => {
    assert.equal(normalizarContratacao({ ...COMPLETA, situacaoCompraId: undefined })!.situacaoCodigo, 1);
  });

  test('gera id quando numeroControlePNCP falta', () => {
    const o = normalizarContratacao({ ...COMPLETA, numeroControlePNCP: undefined })!;
    assert.equal(o.id, '11222333000141-1-000012/2026');
  });
});

describe('registros inaproveitáveis', () => {
  test('sem CNPJ é ignorado — não haveria link de edital', () => {
    assert.equal(normalizarContratacao({ ...COMPLETA, orgaoEntidade: undefined }), null);
  });

  test('sem objeto é ignorado — a triagem não teria o que ler', () => {
    assert.equal(normalizarContratacao({ ...COMPLETA, objetoCompra: '   ' }), null);
  });

  test('sem ano ou sequencial é ignorado', () => {
    assert.equal(normalizarContratacao({ ...COMPLETA, anoCompra: undefined }), null);
    assert.equal(normalizarContratacao({ ...COMPLETA, sequencialCompra: undefined }), null);
  });

  test('o lote descarta os inválidos e mantém os bons', () => {
    const lote = normalizarLote([COMPLETA, { objetoCompra: 'sem identificação' }, COMPLETA]);
    assert.equal(lote.length, 2);
  });

  test('lote vazio devolve lista vazia', () => {
    assert.deepEqual(normalizarLote([]), []);
  });
});

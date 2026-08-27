import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Oportunidade, PerfilEmpresa } from '../src/dominio.ts';
import { ordenarPorPrioridade, triar } from '../src/triagem.ts';

const AGORA = new Date('2026-08-27T12:00:00.000Z');
const DAQUI_10_DIAS = '2026-09-06T12:00:00.000Z';

const PERFIL: PerfilEmpresa = {
  razaoSocial: 'Fornecedora Exemplo LTDA',
  cnpj: '11222333000181',
  porte: 'me',
  uf: 'SP',
  municipioIbge: '3550308',
  municipiosRegiao: ['3548708', '3509502'],
  linhas: [
    {
      nome: 'Informática',
      palavrasChave: ['notebook', 'computador', 'informática', 'impressora'],
      palavrasExcluidas: ['locação'],
    },
    {
      nome: 'Material de escritório',
      palavrasChave: ['material de escritório', 'papel a4', 'caneta'],
    },
  ],
  valorMinimo: 5_000,
  valorMaximo: 80_000,
  modalidades: [6, 8],
  diasMinimosPreparo: 3,
};

function oportunidade(sobrescreve: Partial<Oportunidade> = {}): Oportunidade {
  return {
    id: '11222333000141-1-000012/2026',
    cnpjOrgao: '11222333000141',
    ano: 2026,
    sequencial: 12,
    objeto: 'Aquisição de notebook e computador para a secretaria de educação',
    modalidadeCodigo: 8,
    modoDisputaCodigo: 4,
    situacaoCodigo: 1,
    registroDePrecos: false,
    valorEstimado: 45_000,
    aberturaProposta: '2026-08-27T09:00:00.000Z',
    encerramentoProposta: DAQUI_10_DIAS,
    publicacao: '2026-08-26T09:00:00.000Z',
    orgao: { cnpj: '11222333000141', razaoSocial: 'Prefeitura Exemplo', esfera: 'M' },
    unidade: {
      nome: 'Secretaria de Educação',
      municipio: 'São Paulo',
      municipioIbge: '3550308',
      uf: 'SP',
    },
    linkPncp: 'https://pncp.gov.br/app/editais/11222333000141/2026/12',
    linkSistemaOrigem: 'https://www.gov.br/compras',
    ...sobrescreve,
  };
}

describe('cortes — o que nunca entra na lista', () => {
  test('contratação revogada é descartada', () => {
    const { aprovada, descarte } = triar(oportunidade({ situacaoCodigo: 2 }), PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /revogada/i);
  });

  test('prazo encerrado é descartado', () => {
    const vencida = oportunidade({ encerramentoProposta: '2026-08-01T12:00:00.000Z' });
    const { aprovada, descarte } = triar(vencida, PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /encerrado/i);
  });

  test('objeto de outro ramo é descartado', () => {
    const fora = oportunidade({ objeto: 'Contratação de serviços de dedetização predial' });
    const { aprovada, descarte } = triar(fora, PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /linha de fornecimento/i);
  });

  test('modalidade fora do perfil é descartada', () => {
    const { aprovada, descarte } = triar(oportunidade({ modalidadeCodigo: 7 }), PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /modalidade/i);
  });

  test('outro estado é descartado', () => {
    const longe = oportunidade({
      unidade: { nome: 'Sec.', municipio: 'Curitiba', municipioIbge: '4106902', uf: 'PR' },
    });
    const { aprovada, descarte } = triar(longe, PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /alcance/i);
  });

  test('valor muito acima da capacidade é descartado', () => {
    const cara = oportunidade({ valorEstimado: 500_000 });
    const { aprovada, descarte } = triar(cara, PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /capacidade/i);
  });

  /** Tolerância de 25%: um pouco acima do teto ainda merece ser avaliado. */
  test('valor pouco acima do teto sobrevive à tolerância', () => {
    const { aprovada } = triar(oportunidade({ valorEstimado: 90_000 }), PERFIL, AGORA);
    assert.ok(aprovada);
  });

  /**
   * A exclusão é global: mesmo casando em "computador", a palavra
   * "locação" derruba — é exatamente para isso que ela existe.
   */
  test('termo excluído derruba mesmo com aderência', () => {
    const locacao = oportunidade({ objeto: 'Locação de computador e impressora' });
    const { aprovada, descarte } = triar(locacao, PERFIL, AGORA);
    assert.equal(aprovada, null);
    assert.match(descarte!.motivo, /excluído/i);
  });
});

describe('pontuação', () => {
  test('oportunidade ideal fica com nota alta e explica cada ponto', () => {
    const { aprovada } = triar(oportunidade(), PERFIL, AGORA);
    assert.ok(aprovada);
    assert.ok(aprovada.nota >= 80, `esperava nota alta, veio ${aprovada.nota}`);
    assert.deepEqual(
      aprovada.motivos.map((m) => m.peso),
      ['aderencia', 'geografia', 'valor', 'modalidade', 'exclusividade'],
    );
    assert.ok(aprovada.motivos.every((m) => m.explicacao.length > 0));
  });

  test('a nota nunca escapa de 0 a 100', () => {
    const { aprovada } = triar(oportunidade(), PERFIL, AGORA);
    assert.ok(aprovada!.nota >= 0 && aprovada!.nota <= 100);
  });

  test('mesmo município pontua mais que região, que pontua mais que estado', () => {
    const geo = (municipioIbge: string, municipio: string) =>
      triar(
        oportunidade({ unidade: { nome: 'Sec.', municipio, municipioIbge, uf: 'SP' } }),
        PERFIL,
        AGORA,
      ).aprovada!.motivos.find((m) => m.peso === 'geografia')!.pontos;

    const cidade = geo('3550308', 'São Paulo');
    const regiao = geo('3548708', 'Santo André');
    const estado = geo('3543402', 'Ribeirão Preto');

    assert.ok(cidade > regiao, `${cidade} deveria superar ${regiao}`);
    assert.ok(regiao > estado, `${regiao} deveria superar ${estado}`);
  });

  test('casar em duas linhas pontua mais que casar em uma', () => {
    const aderencia = (objeto: string) =>
      triar(oportunidade({ objeto }), PERFIL, AGORA).aprovada!.motivos.find(
        (m) => m.peso === 'aderencia',
      )!.pontos;

    const uma = aderencia('Aquisição de notebook');
    const duas = aderencia('Aquisição de notebook e material de escritório');
    assert.ok(duas > uma, `${duas} deveria superar ${uma}`);
  });

  test('linhas atendidas aparecem nomeadas no resultado', () => {
    const ambas = oportunidade({ objeto: 'Compra de computador e papel A4' });
    const { aprovada } = triar(ambas, PERFIL, AGORA);
    assert.deepEqual(aprovada!.linhasAtendidas, ['Informática', 'Material de escritório']);
  });

  test('empresa de grande porte não pontua exclusividade ME/EPP', () => {
    const grande = { ...PERFIL, porte: 'demais' as const };
    const { aprovada } = triar(oportunidade(), grande, AGORA);
    assert.equal(aprovada!.motivos.find((m) => m.peso === 'exclusividade')!.pontos, 0);
  });

  test('valor até 80 mil pontua exclusividade cheia para ME', () => {
    const { aprovada } = triar(oportunidade({ valorEstimado: 40_000 }), PERFIL, AGORA);
    const exclusividade = aprovada!.motivos.find((m) => m.peso === 'exclusividade')!;
    assert.equal(exclusividade.pontos, 10);
  });

  test('dispensa pontua mais que concorrência eletrônica', () => {
    const perfilAmplo = { ...PERFIL, modalidades: [] };
    const pontos = (codigo: number) =>
      triar(oportunidade({ modalidadeCodigo: codigo }), perfilAmplo, AGORA).aprovada!.motivos.find(
        (m) => m.peso === 'modalidade',
      )!.pontos;

    assert.ok(pontos(8) > pontos(4));
  });
});

describe('alertas', () => {
  const mensagens = (o: Oportunidade, perfil = PERFIL) =>
    triar(o, perfil, AGORA).aprovada!.alertas.map((a) => a.mensagem).join(' | ');

  test('prazo curto vira alerta crítico', () => {
    const curta = oportunidade({ encerramentoProposta: '2026-08-28T00:00:00.000Z' });
    const alertas = triar(curta, PERFIL, AGORA).aprovada!.alertas;
    assert.ok(alertas.some((a) => a.gravidade === 'critico'));
  });

  test('registro de preços é sinalizado', () => {
    assert.match(mensagens(oportunidade({ registroDePrecos: true })), /Registro de preços/);
  });

  test('orçamento sigiloso é sinalizado', () => {
    assert.match(mensagens(oportunidade({ valorEstimado: null })), /sigiloso/i);
  });

  test('modalidade presencial vira alerta crítico', () => {
    const perfilAmplo = { ...PERFIL, modalidades: [] };
    const presencial = oportunidade({ modalidadeCodigo: 7 });
    const alertas = triar(presencial, perfilAmplo, AGORA).aprovada!.alertas;
    assert.ok(alertas.some((a) => a.gravidade === 'critico' && /presencial/i.test(a.mensagem)));
  });

  test('disputa aberta avisa que os lances são ao vivo', () => {
    assert.match(mensagens(oportunidade({ modoDisputaCodigo: 1 })), /ao vivo/i);
  });

  test('plataforma de envio ausente é sinalizada', () => {
    assert.match(mensagens(oportunidade({ linkSistemaOrigem: null })), /Plataforma de envio/i);
  });

  test('oportunidade ideal e folgada não gera alerta algum', () => {
    assert.equal(triar(oportunidade(), PERFIL, AGORA).aprovada!.alertas.length, 0);
  });
});

describe('ordenarPorPrioridade', () => {
  test('nota manda, prazo desempata', () => {
    const item = (nota: number, horasRestantes: number | null) =>
      ({ nota, horasRestantes }) as never;

    const ordenada = ordenarPorPrioridade([
      item(70, 10),
      item(90, 200),
      item(90, 20),
      item(50, 1),
    ]);

    assert.deepEqual(
      ordenada.map((i) => [i.nota, i.horasRestantes]),
      [
        [90, 20],
        [90, 200],
        [70, 10],
        [50, 1],
      ],
    );
  });

  test('não muta a lista recebida', () => {
    const original = [{ nota: 10, horasRestantes: 1 }, { nota: 90, horasRestantes: 2 }] as never[];
    ordenarPorPrioridade(original);
    assert.equal((original[0] as { nota: number }).nota, 10);
  });
});

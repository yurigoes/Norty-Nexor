/* =========================================================
   Nexor Licitações — Motor de triagem
   ---------------------------------------------------------
   O PNCP publica milhares de contratações por dia. Ler todas é
   impossível e ler nenhuma é o que acontece na prática. Este
   módulo é o que transforma o volume em uma lista curta e
   ordenada.

   Duas decisões de projeto sustentam o resto:

   1. **Descarte é separado de nota baixa.** Fora do alcance
      geográfico, sem aderência ou com prazo encerrado não é
      "nota 12" — é ruído, e sai da lista. Só o que sobra é
      pontuado. Misturar os dois faria a lista crescer sem parar.

   2. **Toda nota carrega o porquê.** `motivos` acompanha cada
      ponto atribuído. Quem discorda do critério consegue ver
      qual peso mudar, em vez de perder a confiança na lista.

   O motor é puro: recebe oportunidade, perfil e o instante de
   referência, devolve o veredito. Sem rede, sem relógio próprio,
   sem banco — o que torna cada regra testável isoladamente.
   ========================================================= */

import type {
  Alerta,
  Descarte,
  Motivo,
  Oportunidade,
  OportunidadeTriada,
  PerfilEmpresa,
} from './dominio.ts';
import { expressoesEncontradas } from './texto.ts';
import { horasAte, urgencia } from './prazos.ts';
import {
  SITUACAO_DIVULGADA,
  TETO_EXCLUSIVIDADE_ME_EPP,
  exigePresencaNaDisputa,
  modalidade,
  situacao,
} from './pncp-tabelas.ts';

/**
 * Pesos máximos por dimensão. Somam 100. Aderência domina porque
 * uma oportunidade perfeita em tudo, mas do ramo errado, vale
 * zero — enquanto o ramo certo longe de casa ainda vale uma
 * olhada.
 */
export const PESOS = {
  aderencia: 45,
  geografia: 20,
  valor: 15,
  modalidade: 10,
  exclusividade: 10,
} as const;

/** Margem acima do teto do perfil ainda considerada avaliável. */
const TOLERANCIA_VALOR = 0.25;

export interface VeredictoTriagem {
  aprovada: OportunidadeTriada | null;
  descarte: Descarte | null;
}

export function triar(
  oportunidade: Oportunidade,
  perfil: PerfilEmpresa,
  agora: Date,
): VeredictoTriagem {
  const descarte = (motivo: string): VeredictoTriagem => ({
    aprovada: null,
    descarte: { oportunidade, motivo },
  });

  /* ---------- Cortes ---------- */

  if (oportunidade.situacaoCodigo !== SITUACAO_DIVULGADA) {
    return descarte(`Contratação ${situacao(oportunidade.situacaoCodigo).toLowerCase()}`);
  }

  const horasRestantes = horasAte(oportunidade.encerramentoProposta, agora);
  if (horasRestantes !== null && horasRestantes <= 0) {
    return descarte('Prazo de propostas encerrado');
  }

  if (perfil.modalidades.length > 0 && !perfil.modalidades.includes(oportunidade.modalidadeCodigo)) {
    return descarte(`Modalidade fora do perfil: ${modalidade(oportunidade.modalidadeCodigo).nome}`);
  }

  const alcance = classificarAlcance(oportunidade, perfil);
  if (alcance === 'fora') {
    return descarte(`Fora do alcance: ${oportunidade.unidade.municipio}/${oportunidade.unidade.uf}`);
  }

  const textoObjeto = [oportunidade.objeto, oportunidade.informacaoComplementar ?? '']
    .join(' ')
    .trim();

  const excluida = primeiraExclusaoBatida(textoObjeto, perfil);
  if (excluida) {
    return descarte(`Contém termo excluído: "${excluida}"`);
  }

  const linhasAtendidas = casarLinhas(textoObjeto, perfil);
  if (linhasAtendidas.length === 0) {
    return descarte('Objeto não bate com nenhuma linha de fornecimento');
  }

  const valor = oportunidade.valorEstimado;
  if (valor !== null && valor > perfil.valorMaximo * (1 + TOLERANCIA_VALOR)) {
    return descarte(`Valor acima da capacidade: ${formatarReal(valor)}`);
  }

  /* ---------- Pontuação ---------- */

  const motivos: Motivo[] = [
    pontuarAderencia(linhasAtendidas, perfil),
    pontuarGeografia(alcance, oportunidade),
    pontuarValor(valor, perfil),
    pontuarModalidade(oportunidade),
    pontuarExclusividade(valor, perfil),
  ];

  const nota = Math.round(
    Math.max(0, Math.min(100, motivos.reduce((soma, m) => soma + m.pontos, 0))),
  );

  return {
    aprovada: {
      oportunidade,
      nota,
      motivos,
      alertas: levantarAlertas(oportunidade, perfil, horasRestantes, alcance),
      horasRestantes,
      linhasAtendidas: linhasAtendidas.map((l) => l.nome),
    },
    descarte: null,
  };
}

/* ---------- Alcance geográfico ---------- */

type Alcance = 'municipio' | 'regiao' | 'estado' | 'fora';

function classificarAlcance(oportunidade: Oportunidade, perfil: PerfilEmpresa): Alcance {
  const ibge = oportunidade.unidade.municipioIbge;
  if (ibge && ibge === perfil.municipioIbge) return 'municipio';
  if (ibge && perfil.municipiosRegiao.includes(ibge)) return 'regiao';
  if (oportunidade.unidade.uf?.toUpperCase() === perfil.uf.toUpperCase()) return 'estado';
  return 'fora';
}

/* ---------- Casamento de linhas ---------- */

interface LinhaCasada {
  nome: string;
  termos: string[];
}

function casarLinhas(texto: string, perfil: PerfilEmpresa): LinhaCasada[] {
  const casadas: LinhaCasada[] = [];
  for (const linha of perfil.linhas) {
    const termos = expressoesEncontradas(texto, linha.palavrasChave);
    if (termos.length > 0) casadas.push({ nome: linha.nome, termos });
  }
  return casadas;
}

/**
 * A exclusão é global de propósito: se qualquer linha do perfil
 * marca "locação" como veneno, uma contratação de locação não
 * interessa nem que outra linha tenha casado. Exclusão existe
 * para cortar o falso positivo recorrente, e ela só cumpre esse
 * papel se for a última palavra.
 */
function primeiraExclusaoBatida(texto: string, perfil: PerfilEmpresa): string | null {
  for (const linha of perfil.linhas) {
    const achadas = expressoesEncontradas(texto, linha.palavrasExcluidas ?? []);
    if (achadas.length > 0) return achadas[0];
  }
  return null;
}

/* ---------- Dimensões da nota ---------- */

/**
 * Cresce com o número de termos batidos, mas com retorno
 * decrescente: o segundo termo confirma o primeiro, o quinto
 * quase não acrescenta. Casar em duas linhas diferentes indica
 * um objeto amplo, que costuma ser boa notícia para quem revende.
 */
function pontuarAderencia(linhas: LinhaCasada[], perfil: PerfilEmpresa): Motivo {
  const totalTermos = linhas.reduce((soma, l) => soma + l.termos.length, 0);
  const saturacao = 1 - 1 / (1 + totalTermos);
  const bonusMultiplasLinhas = linhas.length > 1 ? 0.1 : 0;
  const fracao = Math.min(1, saturacao + bonusMultiplasLinhas);

  const detalhe = linhas.map((l) => `${l.nome} (${l.termos.join(', ')})`).join('; ');
  const cobertura = perfil.linhas.length > 1 ? ` de ${perfil.linhas.length} linhas` : '';

  return {
    peso: 'aderencia',
    pontos: PESOS.aderencia * fracao,
    explicacao: `Casou com ${linhas.length}${cobertura}: ${detalhe}`,
  };
}

function pontuarGeografia(alcance: Alcance, oportunidade: Oportunidade): Motivo {
  const escala: Record<Exclude<Alcance, 'fora'>, number> = {
    municipio: 1,
    regiao: 0.7,
    estado: 0.4,
  };
  const rotulo: Record<Exclude<Alcance, 'fora'>, string> = {
    municipio: 'no seu município',
    regiao: 'na sua região',
    estado: 'no seu estado',
  };
  const chave = alcance as Exclude<Alcance, 'fora'>;
  const local = `${oportunidade.unidade.municipio}/${oportunidade.unidade.uf}`;

  return {
    peso: 'geografia',
    pontos: PESOS.geografia * escala[chave],
    explicacao: `${local} — ${rotulo[chave]}`,
  };
}

/**
 * Orçamento sigiloso não é penalizado a fundo: é comum e não
 * diz nada sobre a qualidade da oportunidade. Recebe metade,
 * junto com um alerta para conferir o edital.
 */
function pontuarValor(valor: number | null, perfil: PerfilEmpresa): Motivo {
  if (valor === null) {
    return {
      peso: 'valor',
      pontos: PESOS.valor * 0.5,
      explicacao: 'Valor estimado não publicado (orçamento sigiloso)',
    };
  }

  if (valor < perfil.valorMinimo) {
    return {
      peso: 'valor',
      pontos: PESOS.valor * 0.3,
      explicacao: `${formatarReal(valor)} — abaixo do mínimo que compensa`,
    };
  }

  if (valor <= perfil.valorMaximo) {
    return {
      peso: 'valor',
      pontos: PESOS.valor,
      explicacao: `${formatarReal(valor)} — dentro da sua faixa`,
    };
  }

  return {
    peso: 'valor',
    pontos: PESOS.valor * 0.4,
    explicacao: `${formatarReal(valor)} — acima da faixa, exige fôlego de caixa`,
  };
}

function pontuarModalidade(oportunidade: Oportunidade): Motivo {
  const m = modalidade(oportunidade.modalidadeCodigo);
  const escala = { entrada: 1, intermediaria: 0.5, avancada: 0.2 } as const;

  return {
    peso: 'modalidade',
    pontos: PESOS.modalidade * escala[m.acessibilidade],
    explicacao: `${m.nome}${m.eletronica ? '' : ' — exige presença física'}`,
  };
}

/**
 * Indício, não certeza: a exclusividade da LC 123 vale por item
 * e o PNCP só expõe o total da contratação na consulta por
 * período. Vale pontuar porque, na prática, contratação pequena
 * quase sempre vira item exclusivo — mas o alerta manda conferir.
 */
function pontuarExclusividade(valor: number | null, perfil: PerfilEmpresa): Motivo {
  const elegivel = perfil.porte !== 'demais';

  if (!elegivel) {
    return {
      peso: 'exclusividade',
      pontos: 0,
      explicacao: 'Porte não elegível à cota exclusiva ME/EPP',
    };
  }

  if (valor !== null && valor <= TETO_EXCLUSIVIDADE_ME_EPP) {
    return {
      peso: 'exclusividade',
      pontos: PESOS.exclusividade,
      explicacao: `Provável exclusividade ME/EPP (até ${formatarReal(TETO_EXCLUSIVIDADE_ME_EPP)})`,
    };
  }

  return {
    peso: 'exclusividade',
    pontos: PESOS.exclusividade * 0.3,
    explicacao: 'Pode ter itens ou cota reservada a ME/EPP',
  };
}

/* ---------- Alertas ---------- */

function levantarAlertas(
  oportunidade: Oportunidade,
  perfil: PerfilEmpresa,
  horasRestantes: number | null,
  alcance: Alcance,
): Alerta[] {
  const alertas: Alerta[] = [];
  const m = modalidade(oportunidade.modalidadeCodigo);

  const nivel = urgencia(horasRestantes, perfil.diasMinimosPreparo);
  if (nivel === 'critico') {
    alertas.push({
      gravidade: 'critico',
      mensagem: `Prazo apertado: menos da metade dos ${perfil.diasMinimosPreparo} dias que você precisa para preparar`,
    });
  } else if (nivel === 'apertado') {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Prazo abaixo do seu tempo habitual de preparo — priorize hoje',
    });
  }

  if (oportunidade.encerramentoProposta === null) {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Prazo de propostas não publicado no PNCP — confira no edital',
    });
  }

  if (!m.eletronica) {
    alertas.push({
      gravidade: 'critico',
      mensagem: 'Modalidade presencial: exige representante no local, com procuração',
    });
  }

  if (exigePresencaNaDisputa(oportunidade.modoDisputaCodigo)) {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Disputa aberta: os lances são ao vivo e você precisa estar na sessão',
    });
  }

  if (oportunidade.registroDePrecos) {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Registro de preços: ganhar gera ata, não garante compra — não estoque por conta',
    });
  }

  if (oportunidade.valorEstimado === null) {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Orçamento sigiloso: o valor de referência só aparece durante a disputa',
    });
  }

  if (alcance === 'estado') {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Fora da sua região: confirme se o frete cabe no preço antes de ofertar',
    });
  }

  if (oportunidade.linkSistemaOrigem === null) {
    alertas.push({
      gravidade: 'atencao',
      mensagem: 'Plataforma de envio não informada — descubra no edital onde cadastrar',
    });
  }

  return alertas;
}

/* ---------- Apresentação ---------- */

export function formatarReal(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  });
}

/**
 * Ordena por nota, mas usa o prazo como desempate: entre duas
 * oportunidades igualmente boas, a que fecha antes é a que se
 * perde se ficar para amanhã.
 */
export function ordenarPorPrioridade(itens: OportunidadeTriada[]): OportunidadeTriada[] {
  return [...itens].sort((a, b) => {
    if (b.nota !== a.nota) return b.nota - a.nota;
    const ha = a.horasRestantes ?? Number.POSITIVE_INFINITY;
    const hb = b.horasRestantes ?? Number.POSITIVE_INFINITY;
    return ha - hb;
  });
}

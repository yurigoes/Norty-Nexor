/**
 * Pontuação de aderência do currículo à vaga.
 *
 * A nota é uma soma ponderada: cada critério vale o peso que a vaga deu a ele.
 * Critério marcado como obrigatório não some pontos quando falta — ele reprova
 * o candidato, para que "80 de nota sem a habilitação exigida" não suba na
 * lista à frente de quem realmente atende.
 */

import { normalizar, regexDeTermo, trecho } from './texto.mjs';

const MESES = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const ANO_MINIMO = 1960;
const MAXIMO_DE_ANOS_POR_INTERVALO = 50;

const TOKEN_DATA = String.raw`(?:\d{1,2}\s*[\/.\-]\s*\d{4}|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:de\s*)?[\/.\- ]?\s*\d{4}|\d{4})`;
const TOKEN_FIM = String.raw`(?:atualmente|atual|hoje|presente|o momento|momento|${TOKEN_DATA})`;
const INTERVALO = new RegExp(
  String.raw`(?<![\d\/])(${TOKEN_DATA})\s*(?:a|ate|-|–|—)\s*(${TOKEN_FIM})(?![\d\/])`,
  'g',
);
const ANOS_DECLARADOS =
  /(\d{1,2})\s*\+?\s*anos?\s+(?:de\s+)?(?:experiencia|atuacao|atuando|carreira|mercado)/g;

/** Converte a data em índice absoluto de mês; `null` quando não é data válida. */
function paraMes(fragmento, agora) {
  const texto = fragmento.trim();
  if (/^(atualmente|atual|hoje|presente|o momento|momento)$/.test(texto)) {
    return agora.getFullYear() * 12 + agora.getMonth();
  }

  const numerico = texto.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{4})$/);
  if (numerico) {
    const mes = Number(numerico[1]);
    if (mes < 1 || mes > 12) return null;
    return Number(numerico[2]) * 12 + (mes - 1);
  }

  const porExtenso = texto.match(/^([a-z]{3})[a-z]*\s*(?:de\s*)?[\/.\- ]?\s*(\d{4})$/);
  if (porExtenso && MESES[porExtenso[1]]) {
    return Number(porExtenso[2]) * 12 + (MESES[porExtenso[1]] - 1);
  }

  const soAno = texto.match(/^(\d{4})$/);
  // Ano solto entra como janeiro; o erro máximo é de meio ano por período.
  if (soAno) return Number(soAno[1]) * 12;

  return null;
}

/**
 * Estimativa de tempo de experiência, em anos.
 *
 * Soma os períodos de trabalho descritos, unindo os que se sobrepõem — quem
 * teve dois empregos simultâneos não acumula o dobro de tempo. Considera
 * também a menção direta ("6 anos de experiência") e fica com o maior valor.
 */
export function estimarAnosDeExperiencia(textoNormalizado, agora = new Date()) {
  const limiteSuperior = agora.getFullYear() * 12 + agora.getMonth();
  const intervalos = [];

  for (const achado of textoNormalizado.matchAll(INTERVALO)) {
    const inicio = paraMes(achado[1], agora);
    const fim = paraMes(achado[2], agora);
    if (inicio === null || fim === null) continue;
    if (inicio < ANO_MINIMO * 12 || inicio > limiteSuperior) continue;
    if (fim < inicio || fim > limiteSuperior) continue;
    if (fim - inicio > MAXIMO_DE_ANOS_POR_INTERVALO * 12) continue;
    intervalos.push([inicio, fim]);
  }

  intervalos.sort((a, b) => a[0] - b[0]);
  let meses = 0;
  let atualInicio = null;
  let atualFim = null;
  for (const [inicio, fim] of intervalos) {
    if (atualInicio === null) {
      [atualInicio, atualFim] = [inicio, fim];
    } else if (inicio <= atualFim) {
      atualFim = Math.max(atualFim, fim);
    } else {
      meses += atualFim - atualInicio;
      [atualInicio, atualFim] = [inicio, fim];
    }
  }
  if (atualInicio !== null) meses += atualFim - atualInicio;

  let declarado = 0;
  for (const achado of textoNormalizado.matchAll(ANOS_DECLARADOS)) {
    const anos = Number(achado[1]);
    if (anos > 0 && anos <= MAXIMO_DE_ANOS_POR_INTERVALO) declarado = Math.max(declarado, anos);
  }

  const porPeriodos = Math.round((meses / 12) * 10) / 10;
  return {
    anos: Math.max(porPeriodos, declarado),
    periodosEncontrados: intervalos.length,
    declarado: declarado || null,
  };
}

/** Procura o critério (termo + sinônimos) no texto e devolve a evidência. */
function avaliarCriterio(criterio, textoNormalizado) {
  const alternativas = [criterio.termo, ...(criterio.sinonimos ?? [])].filter(Boolean);
  let ocorrencias = 0;
  let evidencia = null;
  let expressaoQueCasou = null;

  for (const alternativa of alternativas) {
    const expressao = regexDeTermo(alternativa);
    if (!expressao) continue;
    for (const achado of textoNormalizado.matchAll(expressao)) {
      ocorrencias += 1;
      if (!evidencia) {
        evidencia = trecho(textoNormalizado, achado.index);
        expressaoQueCasou = alternativa;
      }
    }
  }

  return {
    termo: criterio.termo,
    peso: criterio.peso,
    obrigatorio: Boolean(criterio.obrigatorio),
    encontrado: ocorrencias > 0,
    ocorrencias,
    casouCom: expressaoQueCasou,
    evidencia,
  };
}

function classificar(nota, atendeObrigatorios) {
  if (!atendeObrigatorios) return 'reprovado';
  if (nota >= 75) return 'forte';
  if (nota >= 50) return 'medio';
  return 'fraco';
}

/**
 * Pontua um currículo contra a vaga.
 * `nota` vai de 0 a 100 e mede quanto do peso total da vaga o candidato cobre.
 */
export function pontuar(texto, vaga, agora = new Date()) {
  const textoNormalizado = normalizar(texto);
  const criterios = (vaga.criterios ?? []).map((criterio) =>
    avaliarCriterio(criterio, textoNormalizado),
  );

  let pontosPossiveis = criterios.reduce((total, c) => total + c.peso, 0);
  let pontosObtidos = criterios.reduce((total, c) => total + (c.encontrado ? c.peso : 0), 0);

  const anosMinimos = vaga.experiencia?.anosMinimos ?? 0;
  const pesoExperiencia = vaga.experiencia?.peso ?? 0;
  const estimativa = estimarAnosDeExperiencia(textoNormalizado, agora);
  let experiencia = null;

  if (anosMinimos > 0 && pesoExperiencia > 0) {
    // Quem chega perto do mínimo leva pontuação proporcional: barrar por dois
    // meses de diferença descartaria candidato bom por ruído de extração.
    const proporcao = Math.min(1, estimativa.anos / anosMinimos);
    const pontos = Math.round(pesoExperiencia * proporcao * 100) / 100;
    pontosPossiveis += pesoExperiencia;
    pontosObtidos += pontos;
    experiencia = {
      anosEstimados: estimativa.anos,
      anosMinimos,
      peso: pesoExperiencia,
      pontos,
      atende: estimativa.anos >= anosMinimos,
      detectado: estimativa.periodosEncontrados > 0 || estimativa.declarado !== null,
      declarado: estimativa.declarado,
    };
  }

  const faltandoObrigatorios = criterios.filter((c) => c.obrigatorio && !c.encontrado);
  const atendeObrigatorios = faltandoObrigatorios.length === 0;
  const nota = pontosPossiveis > 0 ? Math.round((pontosObtidos / pontosPossiveis) * 100) : 0;

  return {
    nota,
    status: classificar(nota, atendeObrigatorios),
    atendeObrigatorios,
    faltandoObrigatorios: faltandoObrigatorios.map((c) => c.termo),
    criterios,
    experiencia,
    pontosObtidos: Math.round(pontosObtidos * 100) / 100,
    pontosPossiveis,
  };
}

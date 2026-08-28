/**
 * Normalização de texto para comparação.
 *
 * Currículo vem de fonte suja: PDF com hífen de quebra de linha, DOCX com
 * espaços duros, acentuação inconsistente. Toda comparação de termo acontece
 * sobre a forma normalizada; o texto original só é guardado para exibir trecho.
 */

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Igual a `normalizar`, mas preserva as quebras de linha. */
export function normalizarLinhas(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[ \t]+/g, ' ');
}

/** Escapa um termo para uso dentro de expressão regular. */
export function escaparRegex(termo) {
  return termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Expressão que casa o termo como palavra inteira.
 *
 * Espaço no termo vira `\s+` para tolerar quebra de linha do PDF, e as
 * bordas usam lookaround de letra/número em vez de `\b` — `\b` não entende
 * acento, e "análise" depois de "pré-" deixaria de casar.
 */
export function regexDeTermo(termo) {
  const alvo = normalizar(termo);
  if (!alvo) return null;
  const corpo = escaparRegex(alvo).replace(/\\?\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${corpo}(?![\\p{L}\\p{N}])`, 'giu');
}

/** Recorta um trecho ao redor de uma posição, para servir de evidência. */
export function trecho(texto, indice, tamanho = 140) {
  const inicio = Math.max(0, indice - Math.floor(tamanho / 3));
  const fim = Math.min(texto.length, inicio + tamanho);
  const corte = texto.slice(inicio, fim).replace(/\s+/g, ' ').trim();
  return `${inicio > 0 ? '…' : ''}${corte}${fim < texto.length ? '…' : ''}`;
}

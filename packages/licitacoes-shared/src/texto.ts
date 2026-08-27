/* =========================================================
   Nexor Licitações — Casamento de texto do objeto
   ---------------------------------------------------------
   O objeto da contratação é escrito à mão por cada órgão, em
   caixa alta, com e sem acento, com abreviação improvisada. Um
   `includes()` simples erra dos dois lados: perde "AQUISIÇÃO DE
   MATERIAL DE INFORMATICA" quando a busca é "informática", e
   acha "TI" dentro de "partido", "gratificação" e "sentido".

   O segundo erro é o caro. Um falso positivo por dia treina o
   usuário a ignorar a lista inteira, e aí o radar não serve para
   nada. Por isso o casamento é por *token*, não por substring:
   normaliza acento e caixa, quebra em palavras e procura a
   sequência exata de palavras da expressão buscada.
   ========================================================= */

/**
 * Remove acento, baixa a caixa e troca qualquer coisa que não
 * seja letra ou número por espaço. Hífen e barra viram separador
 * de propósito: "micro-ondas" e "material/insumo" devem casar
 * com "micro ondas" e "material".
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenizar(texto: string): string[] {
  const limpo = normalizar(texto);
  return limpo.length === 0 ? [] : limpo.split(' ');
}

/**
 * Procura a sequência de tokens de `expressao` dentro de
 * `tokens`. Casamento é de palavra inteira, então "TI" só bate
 * com o token "ti" isolado — nunca dentro de "partido".
 */
export function contemExpressao(tokens: string[], expressao: string): boolean {
  const alvo = tokenizar(expressao);
  if (alvo.length === 0 || alvo.length > tokens.length) return false;

  for (let i = 0; i <= tokens.length - alvo.length; i += 1) {
    let bateu = true;
    for (let j = 0; j < alvo.length; j += 1) {
      if (tokens[i + j] !== alvo[j]) {
        bateu = false;
        break;
      }
    }
    if (bateu) return true;
  }
  return false;
}

/**
 * Devolve as expressões que aparecem no texto, sem repetir.
 * A lista importa tanto quanto o booleano: é o que a interface
 * mostra como "casou por causa de X e Y".
 */
export function expressoesEncontradas(texto: string, expressoes: string[]): string[] {
  const tokens = tokenizar(texto);
  const achadas: string[] = [];
  for (const expressao of expressoes) {
    if (contemExpressao(tokens, expressao) && !achadas.includes(expressao)) {
      achadas.push(expressao);
    }
  }
  return achadas;
}

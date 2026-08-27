/* =========================================================
   LICITA+ — Build da prévia em arquivo único
   ---------------------------------------------------------
   A aplicação vive em módulos separados, como manda a
   arquitetura. Mas a prévia publicada roda sob uma política
   de segurança que bloqueia qualquer host externo e não serve
   arquivos irmãos — então ela precisa de um HTML autocontido.

   Este script resolve o grafo de módulos, ordena por
   dependência e concatena tudo num escopo só. É um
   empacotador mínimo, e só funciona porque o código obedece a
   três regras verificadas em `verificar.mjs`:

     1. nenhum nome de topo se repete entre módulos;
     2. nenhum `import()` dinâmico;
     3. todo import relativo termina em `.js`.

   Se alguma dessas quebrar, o build falha alto em vez de
   gerar um arquivo silenciosamente quebrado.
   ========================================================= */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const ENTRADA = resolve(RAIZ, 'src/app.js');
const SAIDA = resolve(RAIZ, 'dist/licita-mais.html');

/** Nome de variável estável para o export default de um módulo. */
function apelido(caminho) {
  return `__mod_${relative(RAIZ, caminho).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

const RE_IMPORT = /import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]\s*;?/g;

/** Percorre o grafo em profundidade; dependências saem antes. */
async function ordenar(entrada) {
  const visitados = new Set();
  const ordem = [];

  async function visitar(caminho) {
    if (visitados.has(caminho)) return;
    visitados.add(caminho);

    const fonte = await readFile(caminho, 'utf8');
    const base = dirname(caminho);

    for (const [, , especificador] of fonte.matchAll(RE_IMPORT)) {
      if (!especificador.startsWith('.')) {
        throw new Error(`${relative(RAIZ, caminho)}: import externo não suportado — "${especificador}"`);
      }
      await visitar(resolve(base, especificador));
    }

    ordem.push({ caminho, fonte });
  }

  await visitar(entrada);
  return ordem;
}

/**
 * Remove a sintaxe de módulo mantendo o comportamento. Como
 * tudo passa a viver num escopo só, um import nomeado vira
 * simplesmente nada — o nome já está lá.
 */
function achatar(fonte, caminho) {
  let saida = fonte;

  saida = saida.replace(RE_IMPORT, (_todo, clausula, especificador) => {
    const alvo = apelido(resolve(dirname(caminho), especificador));
    const texto = clausula.trim();

    const linhas = [];

    // Default: `import X from './y.js'`  ou  `import X, { a } from …`
    const comDefault = texto.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*)?/);
    if (comDefault && !texto.startsWith('{')) {
      linhas.push(`const ${comDefault[1]} = ${alvo};`);
    }

    // Nomeados: só os apelidados precisam de uma ponte.
    const chaves = texto.match(/\{([\s\S]*)\}/);
    if (chaves) {
      for (const parte of chaves[1].split(',')) {
        const alias = parte.trim().match(/^([\w$]+)\s+as\s+([\w$]+)$/);
        if (alias) linhas.push(`const ${alias[2]} = ${alias[1]};`);
      }
    }

    return linhas.join('\n');
  });

  saida = saida.replace(/^export\s+default\s+/m, `const ${apelido(caminho)} = `);
  saida = saida.replace(/^export\s+(function|const|class|let|var|async)\b/gm, '$1');

  if (/^export\b/m.test(saida)) {
    throw new Error(`${relative(RAIZ, caminho)}: forma de export não suportada pelo empacotador`);
  }

  return saida;
}

async function principal() {
  const html = await readFile(resolve(RAIZ, 'index.html'), 'utf8');
  const modulos = await ordenar(ENTRADA);

  const codigo = modulos
    .map(({ caminho, fonte }) =>
      `\n/* ===== ${relative(RAIZ, caminho)} ===== */\n${achatar(fonte, caminho)}`)
    .join('\n');

  // Inlining do CSS local; a folha do Google Fonts continua
  // externa porque é o único host que a política permite.
  let corpo = html;
  const folhas = [...html.matchAll(/<link rel="stylesheet" href="(\.\/[^"]+\.css)">/g)];

  // As substituições abaixo usam função, não string. Numa string
  // de substituição do `replace`, `$$` vira um `$` literal — e o
  // código tem `$$` como helper de DOM, que virava `$` e colidia
  // com o outro helper dentro do bundle.
  for (const [tag, href] of folhas) {
    const css = await readFile(resolve(RAIZ, href), 'utf8');
    corpo = corpo.replace(tag, () => `<style>\n/* ===== ${href} ===== */\n${css}</style>`);
  }

  corpo = corpo.replace(
    /<script type="module" src="[^"]+"><\/script>/,
    () => `<script type="module">\n${codigo}\n</script>`,
  );

  await mkdir(dirname(SAIDA), { recursive: true });
  await writeFile(SAIDA, corpo, 'utf8');

  const kb = (Buffer.byteLength(corpo) / 1024).toFixed(1);
  console.log(`prévia gerada: ${relative(RAIZ, SAIDA)} — ${modulos.length} módulos, ${kb} KB`);
}

principal().catch((erro) => {
  console.error(`\n  ✖ ${erro.message}\n`);
  process.exitCode = 1;
});

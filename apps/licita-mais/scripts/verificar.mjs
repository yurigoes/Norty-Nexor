/* =========================================================
   LICITA+ — Verificação estática
   ---------------------------------------------------------
   Substitui o linter no que este projeto precisa garantir e
   nenhum linter genérico garantiria: as invariantes que fazem
   o empacotador da prévia funcionar, e a regra de que
   componente não escreve cor literal.

   Roda sem dependência: é `node scripts/verificar.mjs`.
   ========================================================= */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problemas = [];

async function arquivos(pasta, ext) {
  const saida = [];
  for (const entrada of await readdir(pasta, { withFileTypes: true })) {
    const caminho = resolve(pasta, entrada.name);
    if (entrada.isDirectory()) saida.push(...(await arquivos(caminho, ext)));
    else if (ext.includes(extname(entrada.name))) saida.push(caminho);
  }
  return saida;
}

const curto = (c) => relative(RAIZ, c);

/* ---------- 1. Nomes de topo únicos ----------
   O empacotador junta todos os módulos num escopo só. Dois
   `const` de mesmo nome viram SyntaxError em produção — e o
   erro apareceria só na prévia publicada, longe do commit. */

async function nomesUnicos(js) {
  const donos = new Map();

  for (const caminho of js) {
    const fonte = await readFile(caminho, 'utf8');
    for (const [, , nome] of fonte.matchAll(/^(export\s+)?(?:function|const|class|let|var)\s+([\w$]+)/gm)) {
      if (donos.has(nome)) {
        problemas.push(`nome duplicado no topo: "${nome}" em ${curto(donos.get(nome))} e ${curto(caminho)}`);
      } else {
        donos.set(nome, caminho);
      }
    }
  }
}

/* ---------- 2. Sem import dinâmico ----------
   `import()` não resolve dentro do arquivo único. */

async function semImportDinamico(js) {
  for (const caminho of js) {
    const fonte = await readFile(caminho, 'utf8');
    if (/[^.\w]import\s*\(/.test(fonte)) {
      problemas.push(`${curto(caminho)}: import() dinâmico não sobrevive ao build da prévia`);
    }
  }
}

/* ---------- 3. Import relativo com extensão ----------
   O navegador não completa extensão; sem `.js` o módulo
   simplesmente não carrega. */

async function importComExtensao(js) {
  for (const caminho of js) {
    const fonte = await readFile(caminho, 'utf8');
    for (const [, especificador] of fonte.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      if (!especificador.endsWith('.js')) {
        problemas.push(`${curto(caminho)}: import relativo sem .js — "${especificador}"`);
      }
    }
  }
}

/* ---------- 4. Cor literal fora dos tokens ----------
   Componente que escreve #hex quebra o modo escuro sem
   ninguém perceber, porque a cor deixa de acompanhar o tema. */

async function corSoEmTokens(css) {
  for (const caminho of css) {
    if (caminho.endsWith('tokens.css')) continue;
    const fonte = await readFile(caminho, 'utf8');

    fonte.split('\n').forEach((linha, i) => {
      const semComentario = linha.replace(/\/\*.*?\*\//g, '');
      if (/#[0-9a-fA-F]{3,8}\b/.test(semComentario)) {
        problemas.push(`${curto(caminho)}:${i + 1}: cor literal fora de tokens.css — use var(--…)`);
      }
    });
  }
}

/* ---------- 5. Ícone existe ---------- */

async function iconesExistem(js) {
  const fonteIcones = await readFile(resolve(RAIZ, 'src/lib/icons.js'), 'utf8');
  const bloco = fonteIcones.slice(fonteIcones.indexOf('const D = {'), fonteIcones.indexOf('};'));
  const definidos = new Set([...bloco.matchAll(/^\s{2}([\w$]+):/gm)].map((m) => m[1]));

  for (const caminho of js) {
    if (caminho.endsWith('icons.js')) continue;
    const fonte = await readFile(caminho, 'utf8');
    for (const [, nome] of fonte.matchAll(/\bicone\(\s*'([\w$]+)'/g)) {
      if (!definidos.has(nome)) problemas.push(`${curto(caminho)}: ícone inexistente — "${nome}"`);
    }
  }
}

const js = await arquivos(resolve(RAIZ, 'src'), ['.js']);
const css = await arquivos(resolve(RAIZ, 'src/styles'), ['.css']);

await nomesUnicos(js);
await semImportDinamico(js);
await importComExtensao(js);
await corSoEmTokens(css);
await iconesExistem(js);

if (problemas.length > 0) {
  console.error(`\n  ${problemas.length} problema(s):\n`);
  problemas.forEach((p) => console.error(`  ✖ ${p}`));
  console.error('');
  process.exitCode = 1;
} else {
  console.log(`verificação ok — ${js.length} módulos, ${css.length} folhas de estilo`);
}

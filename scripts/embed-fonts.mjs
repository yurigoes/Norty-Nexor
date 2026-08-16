/**
 * Gera `src/styles/fonts.embedded.css` com a tipografia da marca embutida
 * como data URI.
 *
 * O build para páginas hospedadas não pode depender de um CDN de fontes:
 * a política de segurança do host bloqueia requisições externas e a
 * aplicação cairia silenciosamente na pilha de fontes de sistema. Aqui as
 * faces são baixadas uma única vez e incorporadas ao CSS.
 *
 *   node scripts/embed-fonts.mjs
 */
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Apenas o subconjunto `latin`: ele cobre U+0000–00FF, ou seja, todos os
 * acentos do português (á à â ã ç é ê í ó ô õ ú ü). Incluir `latin-ext`
 * dobraria o peso sem acrescentar nenhum glifo que a interface use.
 */
const FAMILIES = [
  { css: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', subsets: ['latin'] },
  { css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap', subsets: ['latin'] },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ao buscar ${url}`);
  return res.text();
}

async function fetchDataUri(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ao buscar ${url}`);
  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  return `data:font/woff2;base64,${base64}`;
}

const out = [
  '/* =========================================================',
  '   NEXOR — tipografia embutida (gerado por scripts/embed-fonts.mjs)',
  '   Não edite à mão: rode o script novamente para atualizar.',
  '   ========================================================= */',
  '',
];

let total = 0;

for (const family of FAMILIES) {
  const css = await fetchText(family.css);
  const blocks = [...css.matchAll(/\/\* (\S+) \*\/\s*@font-face \{([^}]*)\}/g)];

  for (const [, subset, body] of blocks) {
    if (!family.subsets.includes(subset)) continue;
    const url = body.match(/src: url\((\S+)\)/)[1];
    const dataUri = await fetchDataUri(url);
    total += dataUri.length;
    out.push(`@font-face {${body.replace(/src: url\(\S+\)/, `src: url(${dataUri})`).replace(/\n\s+$/, '\n')}}`);
  }
}

writeFileSync('src/styles/fonts.embedded.css', out.join('\n'), 'utf8');
console.log(`fonts.embedded.css gerado · ${(total / 1024).toFixed(0)} KB embutidos`);

/**
 * Empacota o VEYRA em um único arquivo HTML autocontido.
 *
 * O build normal emite `index.html` + `assets/*.js` + `assets/*.css`.
 * Aqui esses arquivos são costurados num HTML só, sem referência externa
 * além da tipografia — o que permite abrir a demonstração de qualquer
 * lugar: uma página hospedada, um anexo, um arquivo local.
 *
 *   npm run build:standalone -w @veyra/app
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist-standalone';
const SAIDA = join(DIST, 'veyra.html');

execSync('vite build --mode standalone', { stdio: 'inherit' });

const ativos = readdirSync(join(DIST, 'assets'));
const js = ativos.filter((f) => f.endsWith('.js'));
const css = ativos.filter((f) => f.endsWith('.css'));

/* `inlineDynamicImports` deve ter colapsado tudo num bundle. Se sobrou
   mais de um, alguma rota escapou da inlining e o arquivo final abriria
   quebrado — melhor falhar aqui do que publicar assim. */
if (js.length !== 1) {
  throw new Error(`Esperado exatamente um bundle JS, encontrados ${js.length}: ${js.join(', ')}`);
}

const estilos = css.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n');
const script = readFileSync(join(DIST, 'assets', js[0]), 'utf8');

/**
 * A página é hospedada dentro do <body> de um documento montado pelo
 * host, então o arquivo carrega apenas conteúdo: título, tipografia,
 * estilos, raiz e bundle. O <title> vem primeiro porque o host o procura
 * no início do arquivo.
 */
const html = `<title>VEYRA</title>
<meta name="theme-color" content="#07111F" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
/>

<style>
${estilos}
</style>

<div id="root"></div>

<script type="module">
${script}
</script>
`;

mkdirSync(DIST, { recursive: true });
writeFileSync(SAIDA, html, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\n${SAIDA}`);
console.log(`  estilos ${kb(estilos.length)} · bundle ${kb(script.length)} · total ${kb(html.length)}`);

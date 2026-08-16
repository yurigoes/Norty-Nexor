/**
 * Empacota a aplicação em um único arquivo HTML autocontido.
 *
 * O build normal do Vite emite `index.html` + `assets/*.js` + `assets/*.css`.
 * Aqui esses arquivos são costurados em um HTML só, sem nenhuma referência
 * externa — o que permite abrir a demonstração de qualquer lugar: uma página
 * hospedada, um anexo, um arquivo local.
 *
 *   npm run build:standalone
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist-standalone';
const OUT = 'dist-standalone/nexor-demo.html';

execSync('vite build --mode standalone', { stdio: 'inherit' });

const assets = readdirSync(join(DIST, 'assets'));
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));

if (js.length !== 1) throw new Error(`Esperado exatamente um bundle JS, encontrados ${js.length}`);

const styles = css.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n');
const script = readFileSync(join(DIST, 'assets', js[0]), 'utf8');

/**
 * A página é hospedada dentro do <body> de um documento montado pelo host,
 * então o arquivo carrega apenas conteúdo: título, estilos, raiz e bundle.
 * O <title> vem primeiro porque o host o procura no início do arquivo.
 */
const html = `<title>NEXOR by Norty</title>
<meta name="theme-color" content="#08111F" />

<style>
${styles}
</style>

<div id="root"></div>

<script type="module">
${script}
</script>
`;

mkdirSync(DIST, { recursive: true });
writeFileSync(OUT, html, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\n${OUT}`);
console.log(`  estilos ${kb(styles.length)} · bundle ${kb(script.length)} · total ${kb(html.length)}`);

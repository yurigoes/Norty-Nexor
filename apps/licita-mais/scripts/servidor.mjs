/* =========================================================
   LICITA+ — Servidor de desenvolvimento
   ---------------------------------------------------------
   Estático e sem dependência. Módulos ES precisam ser
   servidos por HTTP com o Content-Type correto — abrir o
   index.html pelo file:// não funciona.
   ========================================================= */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT ?? 5180);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const caminhoUrl = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

    // `normalize` mais a checagem de prefixo impedem que
    // "../../etc/passwd" escape da raiz do projeto.
    const alvo = resolve(RAIZ, `.${normalize(caminhoUrl)}`);
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403).end('Acesso negado');
      return;
    }

    let arquivo = alvo;
    const info = await stat(arquivo).catch(() => null);
    if (!info || info.isDirectory()) arquivo = resolve(RAIZ, 'index.html');

    const corpo = await readFile(arquivo);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(corpo);
  } catch (erro) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Não encontrado: ${erro.message}`);
  }
}).listen(PORTA, () => {
  console.log(`LICITA+ em http://localhost:${PORTA}`);
});

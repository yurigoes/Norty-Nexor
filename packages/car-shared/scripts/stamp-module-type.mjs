/**
 * O pacote é publicado nos dois formatos: a API roda em CommonJS e o
 * aplicativo web em ESM. O Node decide qual leitura aplicar pelo campo
 * `type` do package.json mais próximo — então cada pasta de saída ganha
 * o seu, senão o `"type": "module"` da raiz faria o Node tentar ler o
 * build CommonJS como ESM e quebrar no `require`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

for (const [dir, type] of [['dist/esm', 'module'], ['dist/cjs', 'commonjs']]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type }, null, 2) + '\n');
}
console.log('dist/esm e dist/cjs marcados com o formato de módulo correto');

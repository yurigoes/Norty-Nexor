#!/usr/bin/env node
/**
 * Triagem de currículos — servidor local.
 *
 * Sobe um HTTP simples em localhost que serve a interface e faz o trabalho
 * pesado (ler PDF/DOCX, pontuar, opcionalmente consultar a IA). Nada sai da
 * máquina, exceto as chamadas à API da Anthropic quando a análise por IA é
 * pedida explicitamente. Nenhum currículo é gravado em disco.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { extrairTexto } from './src/extrair.mjs';
import { extrairContato } from './src/contato.mjs';
import { pontuar } from './src/pontuar.mjs';
import { analisarComIa, estadoDaIa } from './src/ia.mjs';
import {
  apagarVaga, listarVagas, lerVaga, salvarVaga, sanearVaga, vagaEmBranco,
} from './src/vagas.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PASTA_WEB = path.join(RAIZ, 'web');
const PASTA_VAGAS = path.join(RAIZ, 'vagas');
const PORTA = Number(process.env.PORT) || 5199;
const LIMITE_DO_CORPO = 200 * 1024 * 1024; // 200 MB por lote de envio

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function responderJson(resposta, status, dados) {
  const corpo = JSON.stringify(dados);
  resposta.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(corpo),
    'cache-control': 'no-store',
  });
  resposta.end(corpo);
}

async function lerCorpo(requisicao) {
  const partes = [];
  let tamanho = 0;
  for await (const parte of requisicao) {
    tamanho += parte.length;
    if (tamanho > LIMITE_DO_CORPO) throw new Error('Envio grande demais. Mande menos arquivos por vez.');
    partes.push(parte);
  }
  if (!partes.length) return {};
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

async function servirArquivo(resposta, nome) {
  // Só entrega o que está dentro de web/: nome vindo da URL nunca vira caminho.
  const alvo = path.join(PASTA_WEB, path.basename(nome));
  try {
    const conteudo = await fs.readFile(alvo);
    resposta.writeHead(200, {
      'content-type': TIPOS[path.extname(alvo)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    resposta.end('Não encontrado');
  }
}

/** Lê, pontua e identifica o contato de um arquivo. */
async function analisarArquivo({ nome, conteudoBase64 }, vaga) {
  const buffer = Buffer.from(conteudoBase64, 'base64');
  const { texto, erro, aviso, paginas } = await extrairTexto(nome, buffer);

  if (erro) {
    return { arquivo: nome, erro };
  }

  const contato = extrairContato(texto, nome);
  const pontuacao = pontuar(texto, vaga);
  return {
    arquivo: nome,
    aviso,
    paginas,
    texto,
    contato,
    ...pontuacao,
  };
}

async function rotear(requisicao, resposta, url) {
  const { pathname } = url;

  if (requisicao.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return servirArquivo(resposta, 'index.html');
  }
  if (requisicao.method === 'GET' && /^\/[\w.-]+\.(css|js|svg)$/.test(pathname)) {
    return servirArquivo(resposta, pathname.slice(1));
  }

  if (requisicao.method === 'GET' && pathname === '/api/estado') {
    const ia = await estadoDaIa();
    return responderJson(resposta, 200, {
      vagas: await listarVagas(PASTA_VAGAS),
      iaConfigurada: ia.disponivel,
      mensagemIa: ia.mensagem,
      vagaEmBranco: vagaEmBranco(),
    });
  }

  const vagaEspecifica = pathname.match(/^\/api\/vagas\/([\w-]+)$/);
  if (vagaEspecifica) {
    const slug = vagaEspecifica[1];
    if (requisicao.method === 'GET') {
      try {
        return responderJson(resposta, 200, await lerVaga(PASTA_VAGAS, slug));
      } catch {
        return responderJson(resposta, 404, { erro: 'Vaga não encontrada.' });
      }
    }
    if (requisicao.method === 'PUT') {
      const corpo = await lerCorpo(requisicao);
      return responderJson(resposta, 200, await salvarVaga(PASTA_VAGAS, slug, corpo));
    }
    if (requisicao.method === 'DELETE') {
      await apagarVaga(PASTA_VAGAS, slug);
      return responderJson(resposta, 200, { ok: true });
    }
  }

  if (requisicao.method === 'POST' && pathname === '/api/vagas') {
    const corpo = await lerCorpo(requisicao);
    return responderJson(resposta, 201, await salvarVaga(PASTA_VAGAS, corpo.slug, corpo.vaga ?? corpo));
  }

  if (requisicao.method === 'POST' && pathname === '/api/analisar') {
    const corpo = await lerCorpo(requisicao);
    const vaga = sanearVaga(corpo.vaga ?? {});
    const arquivos = Array.isArray(corpo.arquivos) ? corpo.arquivos : [];
    const resultados = [];
    // Em série: ler PDF é trabalho de CPU, e paralelizar aqui só disputaria a
    // mesma thread e atrasaria a resposta do lote.
    for (const arquivo of arquivos) {
      resultados.push(await analisarArquivo(arquivo, vaga));
    }
    return responderJson(resposta, 200, { resultados });
  }

  if (requisicao.method === 'POST' && pathname === '/api/ia') {
    const corpo = await lerCorpo(requisicao);
    const vaga = sanearVaga(corpo.vaga ?? {});
    if (!corpo.texto) return responderJson(resposta, 400, { erro: 'Currículo sem texto.' });
    const analise = await analisarComIa({ vaga, texto: corpo.texto, nome: corpo.nome });
    return responderJson(resposta, analise.ok ? 200 : 502, analise);
  }

  return responderJson(resposta, 404, { erro: 'Rota não encontrada.' });
}

const servidor = http.createServer((requisicao, resposta) => {
  const url = new URL(requisicao.url, `http://localhost:${PORTA}`);
  rotear(requisicao, resposta, url).catch((erro) => {
    responderJson(resposta, 500, { erro: erro.message });
  });
});

function abrirNavegador(endereco) {
  const comando =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(comando, [endereco], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' })
      .unref();
  } catch {
    // Sem navegador acessível: o endereço já foi impresso no terminal.
  }
}

// `127.0.0.1` e não `0.0.0.0`: currículo é dado pessoal e não deve ficar
// exposto para a rede local só porque a ferramenta está aberta.
servidor.listen(PORTA, '127.0.0.1', async () => {
  const endereco = `http://localhost:${PORTA}`;
  const ia = await estadoDaIa();
  console.log(`\n  Triagem de currículos rodando em ${endereco}`);
  console.log(`  ${ia.mensagem}${ia.disponivel ? '' : ' — a triagem por critérios funciona normalmente'}`);
  console.log('  Ctrl+C para encerrar.\n');
  if (!process.env.TRIAGEM_SEM_NAVEGADOR) abrirNavegador(endereco);
});

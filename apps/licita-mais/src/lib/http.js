/* =========================================================
   LICITA+ — Cliente HTTP
   ---------------------------------------------------------
   Uma única porta de saída para a API. O que ela resolve, e
   que espalhado por vinte `fetch` ninguém acertaria em todos:

   - **O access token não é persistido.** Ele vive em memória,
     vale 15 minutos e some ao fechar a aba. Guardar em
     localStorage entregaria a sessão a qualquer XSS; o que
     sobrevive ao refresh é o cookie httpOnly, que JavaScript
     não lê.
   - **Renovação em fila única.** A API rotaciona o refresh a
     cada uso: duas renovações simultâneas queimariam o token
     uma da outra e derrubariam a sessão. Por isso a promessa
     de renovação é compartilhada — dez requisições que
     recebam 401 juntas esperam a mesma.
   - **Erro vira mensagem.** O NestJS devolve `message` ora
     como texto, ora como lista (validação). A tela recebe uma
     frase, sempre.
   ========================================================= */

import { BASE_API } from './config.js';

export class ErroHttp extends Error {
  constructor(status, mensagem, corpo) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
    this.corpo = corpo;
  }

  /** Falha de rede, DNS ou API fora do ar — não é resposta do servidor. */
  get semRede() {
    return this.status === 0;
  }
}

let tokenAcesso = null;
let renovacaoEmCurso = null;
let aoPerderSessao = () => {};

export const definirAcesso = (token) => { tokenAcesso = token; };
export const temAcesso = () => tokenAcesso !== null;

/** Chamado quando a renovação falha: a sessão acabou de verdade. */
export const aoExpirarSessao = (manipulador) => { aoPerderSessao = manipulador; };

function cabecalhos(opcoes) {
  const saida = { accept: 'application/json', ...(opcoes.cabecalhos ?? {}) };
  if (opcoes.corpo !== undefined) saida['content-type'] = 'application/json';
  if (tokenAcesso) saida.authorization = `Bearer ${tokenAcesso}`;
  return saida;
}

async function enviar(caminho, opcoes) {
  try {
    return await fetch(`${BASE_API}${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      headers: cabecalhos(opcoes),
      // `include` cobre os dois arranjos: same-origin (o normal,
      // atrás do nginx) e um eventual host separado em
      // desenvolvimento. Same-origin ele se comporta igual.
      credentials: 'include',
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      signal: opcoes.sinal,
    });
  } catch (erro) {
    throw new ErroHttp(0, mensagemDeRede(erro), null);
  }
}

const mensagemDeRede = (erro) =>
  erro?.name === 'AbortError'
    ? 'A requisição demorou demais e foi cancelada.'
    : 'Não foi possível falar com o servidor. Verifique sua conexão.';

async function interpretar(resposta) {
  if (resposta.status === 204) return null;

  const texto = await resposta.text();
  let corpo = null;

  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = { message: texto };
    }
  }

  if (resposta.ok) return corpo;

  throw new ErroHttp(resposta.status, mensagemDoCorpo(corpo, resposta.status), corpo);
}

function mensagemDoCorpo(corpo, status) {
  const bruta = corpo?.message ?? corpo?.error;
  if (Array.isArray(bruta) && bruta.length > 0) return String(bruta[0]);
  if (typeof bruta === 'string' && bruta) return bruta;

  if (status === 429) return 'Muitas tentativas. Espere um instante e tente de novo.';
  if (status >= 500) return 'O servidor teve um problema. Tente novamente em instantes.';
  return `Não foi possível completar a operação (erro ${status}).`;
}

/**
 * Renova o acesso. Devolve `true` se conseguiu. Vários chamadores
 * simultâneos compartilham a mesma promessa — ver o cabeçalho.
 */
export function renovarAcesso() {
  if (renovacaoEmCurso) return renovacaoEmCurso;

  renovacaoEmCurso = (async () => {
    try {
      const resposta = await enviar('/auth/renovar', { metodo: 'POST', semRenovar: true });
      if (!resposta.ok) return null;
      const dados = await resposta.json();
      definirAcesso(dados.accessToken);
      return dados;
    } catch {
      return null;
    } finally {
      // Zerado no próximo tique para que quem já estava esperando
      // leia o resultado antes de uma nova tentativa começar.
      setTimeout(() => { renovacaoEmCurso = null; }, 0);
    }
  })();

  return renovacaoEmCurso;
}

/**
 * @param {string} caminho  ex.: '/oportunidades?pagina=2'
 * @param {object} opcoes   { metodo, corpo, cabecalhos, sinal, semRenovar }
 */
export async function pedir(caminho, opcoes = {}) {
  let resposta = await enviar(caminho, opcoes);

  // Sem token em memória, um 401 não pode ser expiração — não
  // havia o que expirar. É o caso do login com senha errada, e
  // sem esta condição a tela trocaria "E-mail ou senha
  // incorretos" por "Sua sessão expirou": a mensagem mais
  // confusa possível para quem só errou a senha.
  if (resposta.status === 401 && !opcoes.semRenovar && temAcesso()) {
    const renovado = await renovarAcesso();

    if (!renovado) {
      definirAcesso(null);
      aoPerderSessao();
      throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.', null);
    }

    resposta = await enviar(caminho, opcoes);
  }

  return interpretar(resposta);
}

/** Monta querystring ignorando vazios — filtro em branco não vira `?uf=`. */
export function consulta(parametros) {
  const partes = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros ?? {})) {
    if (valor === undefined || valor === null || valor === '') continue;
    partes.set(chave, String(valor));
  }
  const texto = partes.toString();
  return texto ? `?${texto}` : '';
}

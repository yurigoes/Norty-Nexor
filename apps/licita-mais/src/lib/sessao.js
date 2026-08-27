/* =========================================================
   LICITA+ — Sessão do usuário
   ---------------------------------------------------------
   Quem está logado, e como entra e sai. Guarda o usuário em
   memória e avisa quem assina — o shell redesenha o nome e a
   empresa sem que a página precise saber disso.

   Na subida, `restaurarSessao()` tenta uma renovação. É ela
   que faz o F5 não derrubar ninguém: o access token morreu
   junto com a página, mas o cookie httpOnly sobreviveu, e ele
   basta para emitir outro.

   Em modo demonstração a mesma interface funciona sem
   servidor, com uma conta fictícia. É o que mantém a prévia
   navegável enquanto a API não está no ar.
   ========================================================= */

import { pedir, renovarAcesso, definirAcesso, aoExpirarSessao, ErroHttp } from './http.js';
import { emDemonstracao } from './config.js';
import { empresa as empresaDemo } from '../data/mock.js';

const CHAVE_DEMO = 'licita-mais:sessao-demo';

const USUARIO_DEMO = {
  id: 'demo-1',
  nome: empresaDemo.usuario.nome,
  email: empresaDemo.usuario.email,
  papel: 'dono',
  cargo: empresaDemo.usuario.cargo,
  empresa: {
    id: 'demo-emp-1',
    razaoSocial: empresaDemo.razaoSocial,
    nomeFantasia: empresaDemo.nomeFantasia,
    cnpj: empresaDemo.cnpj,
  },
};

let usuario = null;
const assinantes = new Set();

function avisar() {
  for (const assinante of assinantes) assinante(usuario);
}

/** Assina mudanças de sessão. Devolve a função de cancelamento. */
export function assinarSessao(assinante) {
  assinantes.add(assinante);
  return () => assinantes.delete(assinante);
}

export const usuarioLogado = () => usuario;
export const estaAutenticado = () => usuario !== null;

/** Nome curto para saudação — "Bem-vindo, Yuri". */
export const primeiroNome = () => (usuario?.nome ?? '').trim().split(/\s+/)[0] ?? '';

function guardar(dados) {
  definirAcesso(dados.accessToken);
  usuario = dados.usuario;
  avisar();
  return usuario;
}

/* ---------- Demonstração ---------- */

function marcaDemo(ligada) {
  try {
    if (ligada) sessionStorage.setItem(CHAVE_DEMO, '1');
    else sessionStorage.removeItem(CHAVE_DEMO);
  } catch {
    /* Sem sessionStorage a sessão fictícia vive só em memória. */
  }
}

const temMarcaDemo = () => {
  try {
    return sessionStorage.getItem(CHAVE_DEMO) === '1';
  } catch {
    return false;
  }
};

/* ---------- Entrada e saída ---------- */

export async function entrarNaConta({ email, senha }) {
  if (emDemonstracao()) {
    if (!email.includes('@')) throw new ErroHttp(400, 'Informe um e-mail válido.', null);
    usuario = { ...USUARIO_DEMO, email };
    marcaDemo(true);
    avisar();
    return usuario;
  }

  return guardar(await pedir('/auth/entrar', { metodo: 'POST', corpo: { email, senha } }));
}

export async function cadastrarConta(dados) {
  if (emDemonstracao()) {
    return {
      mensagem:
        'Em modo demonstração nenhuma conta é criada de verdade — ' +
        'a API não está respondendo neste ambiente.',
    };
  }
  return pedir('/auth/cadastrar', { metodo: 'POST', corpo: dados });
}

export async function sairDaConta() {
  if (!emDemonstracao() && usuario) {
    // Se a chamada falhar, a sessão local sai do mesmo jeito: o
    // usuário pediu para sair, e deixá-lo dentro por causa de um
    // erro de rede é a resposta errada.
    await pedir('/auth/sair', { metodo: 'POST' }).catch(() => null);
  }

  definirAcesso(null);
  marcaDemo(false);
  usuario = null;
  avisar();
}

/** Tenta reerguer a sessão na subida. Devolve o usuário ou `null`. */
export async function restaurarSessao() {
  if (emDemonstracao()) {
    usuario = temMarcaDemo() ? USUARIO_DEMO : null;
    avisar();
    return usuario;
  }

  const dados = await renovarAcesso();
  if (!dados) {
    usuario = null;
    avisar();
    return null;
  }

  return guardar(dados);
}

/* ---------- Fluxos por e-mail ---------- */

export const confirmarEmailToken = (token) =>
  pedir('/auth/confirmar', { metodo: 'POST', corpo: { token } });

export const reenviarConfirmacao = (email) =>
  pedir('/auth/reenviar-confirmacao', { metodo: 'POST', corpo: { email } });

export const pedirRedefinicao = (email) =>
  pedir('/auth/esqueci-senha', { metodo: 'POST', corpo: { email } });

export const redefinirSenhaToken = (token, senha) =>
  pedir('/auth/redefinir-senha', { metodo: 'POST', corpo: { token, senha } });

/* ---------- Destino barrado pela guarda de rota ----------
   Quem abre um link de oportunidade sem sessão vai para o
   login e volta para *aquela* tela depois de entrar, em vez de
   cair no painel e ter de procurar de novo. */

let destinoPendente = null;

export const guardarDestino = (caminho) => { destinoPendente = caminho; };

/** Consome o destino guardado; sem um, o painel. */
export function destinoAposEntrar() {
  const destino = destinoPendente;
  destinoPendente = null;
  return destino ?? '/painel';
}

/* ---------- Expiração vinda do cliente HTTP ---------- */

aoExpirarSessao(() => {
  usuario = null;
  avisar();
});

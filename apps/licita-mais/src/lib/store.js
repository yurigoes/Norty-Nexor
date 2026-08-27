/* =========================================================
   LICITA+ — Estado da aplicação
   ---------------------------------------------------------
   Loja mínima com assinatura: quem muda o estado não sabe
   quem escuta, e quem escuta não sabe quem mudou. É o que
   permite favoritar numa lista e ver o contador da sidebar
   mudar sem uma linha ligando as duas.

   O que é decisão do usuário (favoritos, monitoramentos,
   tema, perfil visto) persiste em localStorage. Toda leitura
   e escrita é protegida: em janela anônima o acesso lança, e
   uma exceção aqui derrubaria a inicialização inteira.
   ========================================================= */

const CHAVE = 'licita-mais:v1';

function lerDoDisco() {
  try {
    const cru = localStorage.getItem(CHAVE);
    return cru ? JSON.parse(cru) : null;
  } catch {
    return null;
  }
}

function gravarNoDisco(dados) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* Sem persistência a sessão ainda funciona; só não sobrevive ao refresh. */
  }
}

const PADRAO = {
  favoritos: ['LIC-2026-0007', 'LIC-2026-0012'],
  monitoramentosSilenciados: [],
  notificacoesLidas: [],
  tema: 'claro',
  onboardingConcluido: true,
  ordenacao: 'compatibilidade',
  modoLista: 'cartoes',
};

const persistido = lerDoDisco();
const estado = { ...PADRAO, ...(persistido ?? {}) };

const ouvintes = new Set();

/** Assina mudanças. Devolve a função de cancelamento. */
export function assinar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function notificar(evento) {
  for (const ouvinte of ouvintes) ouvinte(estado, evento);
}

export const obter = () => estado;

export function definir(parcial, evento = 'mudanca') {
  Object.assign(estado, parcial);
  gravarNoDisco(estado);
  notificar(evento);
}

/* ---------- Favoritos ---------- */

export const ehFavorito = (id) => estado.favoritos.includes(id);

/** Alterna e devolve o novo estado, para quem chamou dar o retorno visual. */
export function alternarFavorito(id) {
  const jaEra = ehFavorito(id);
  estado.favoritos = jaEra
    ? estado.favoritos.filter((f) => f !== id)
    : [id, ...estado.favoritos];
  gravarNoDisco(estado);
  notificar('favoritos');
  return !jaEra;
}

export const totalFavoritos = () => estado.favoritos.length;

/* ---------- Notificações ---------- */

export const notificacaoLida = (id) => estado.notificacoesLidas.includes(id);

export function marcarTudoLido(ids) {
  estado.notificacoesLidas = [...new Set([...estado.notificacoesLidas, ...ids])];
  gravarNoDisco(estado);
  notificar('notificacoes');
}

/* ---------- Tema ----------
   O modo escuro já funciona no nível dos tokens; o botão só
   troca o atributo na raiz. */

export function alternarTema() {
  const novo = estado.tema === 'escuro' ? 'claro' : 'escuro';
  definir({ tema: novo }, 'tema');
  aplicarTema();
  return novo;
}

export function aplicarTema() {
  document.documentElement.setAttribute('data-tema', estado.tema);
}

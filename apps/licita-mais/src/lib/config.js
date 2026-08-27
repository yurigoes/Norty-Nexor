/* =========================================================
   LICITA+ — Configuração de execução
   ---------------------------------------------------------
   O mesmo código roda em três lugares: aberto do disco, na
   prévia publicada em arquivo único e em produção atrás do
   nginx. Só um deles tem API.

   A fonte de dados é resolvida uma vez, na subida, e o padrão
   é `auto`: pergunta à API se ela existe. O motivo de não ser
   um valor fixo no HTML é o modo de falhar. Se o padrão fosse
   "demonstração" e a substituição no deploy falhasse, produção
   serviria dados fictícios em silêncio — exatamente o pior
   resultado possível. Com `auto`, produção vira real sozinha
   assim que a API responde, e a ausência dela é anunciada em
   tela, nunca escondida.
   ========================================================= */

const DO_HTML = (typeof window !== 'undefined' && window.LICITA_CONFIG) || {};

/**
 * Caminho da API. Same-origin de propósito: o refresh token vive
 * num cookie `SameSite=Lax`, que o navegador não envia numa
 * requisição entre sites. Servir a API sob `/v1` do mesmo domínio
 * resolve cookie e CORS de uma vez — em vez de afrouxar o cookie
 * para `None` só para acomodar um subdomínio diferente.
 */
export const BASE_API = DO_HTML.api ?? '/v1';

/** 'auto' | 'api' | 'demo' */
const FONTE_PEDIDA = lerFontePedida();

function lerFontePedida() {
  try {
    // Escape para desenvolvimento: força uma fonte sem rebuild.
    const forcada = localStorage.getItem('licita-mais:fonte');
    if (forcada === 'api' || forcada === 'demo') return forcada;
  } catch {
    /* Janela anônima: segue com o que veio do HTML. */
  }
  return DO_HTML.fonte ?? 'auto';
}

let fonteResolvida = null;

/**
 * Decide a fonte e devolve 'api' ou 'demo'. No modo `auto`, uma
 * chamada ao healthcheck decide — ele é público e toca o banco,
 * então uma resposta boa significa API *e* Postgres de pé, não
 * só um processo escutando a porta.
 */
export async function resolverFonte() {
  if (fonteResolvida) return fonteResolvida;

  if (FONTE_PEDIDA !== 'auto') {
    fonteResolvida = FONTE_PEDIDA;
    return fonteResolvida;
  }

  // Aberto do disco (`file://`) ou como arquivo único: não há
  // origem para consultar, e tentar deixaria um erro de CORS no
  // console a cada carga. A ausência de servidor já é a resposta.
  if (!/^https?:$/.test(window.location.protocol)) {
    fonteResolvida = 'demo';
    return fonteResolvida;
  }

  try {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 4000);
    const resposta = await fetch(`${BASE_API}/saude`, { signal: controle.signal });
    clearTimeout(relogio);
    fonteResolvida = resposta.ok ? 'api' : 'demo';
  } catch {
    fonteResolvida = 'demo';
  }

  return fonteResolvida;
}

/** Só depois de `resolverFonte()`. Antes disso, assume demonstração. */
export const fonteAtual = () => fonteResolvida ?? 'demo';
export const emDemonstracao = () => fonteAtual() === 'demo';

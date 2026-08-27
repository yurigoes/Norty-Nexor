/* =========================================================
   LICITA+ — Roteador
   ---------------------------------------------------------
   Rotas por hash, de propósito: a prévia precisa funcionar
   aberta direto do disco e publicada como arquivo único, e
   `history.pushState` exige servidor que reescreva as rotas.
   Com hash, o mesmo build navega nos dois lugares.

   Cada rota declara se usa o shell (sidebar + header) ou é
   tela pública — quem decide isso é a rota, não a página.
   ========================================================= */

const rotas = [];
let aoTrocar = () => {};
let rotaAtual = null;

/**
 * @param {string} padrao  ex.: '/oportunidades' ou '/oportunidade/:id'
 * @param {object} config  { pagina, titulo, trilha, shell, nav }
 */
export function registrar(padrao, config) {
  const nomesParam = [];
  const regex = new RegExp(
    `^${padrao.replace(/:[^/]+/g, (m) => {
      nomesParam.push(m.slice(1));
      return '([^/]+)';
    })}$`,
  );
  rotas.push({ padrao, regex, nomesParam, ...config });
}

export function resolverRota(caminho) {
  for (const rota of rotas) {
    const achou = caminho.match(rota.regex);
    if (!achou) continue;
    const params = {};
    rota.nomesParam.forEach((nome, i) => {
      params[nome] = decodeURIComponent(achou[i + 1]);
    });
    return { rota, params };
  }
  return null;
}

export const caminhoAtual = () => {
  const bruto = window.location.hash.replace(/^#/, '');
  return bruto.split('?')[0] || '/';
};

/** Parâmetros de consulta depois do `?` dentro do hash. */
export function consultaAtual() {
  const bruto = window.location.hash.replace(/^#/, '');
  const [, consulta = ''] = bruto.split('?');
  return Object.fromEntries(new URLSearchParams(consulta));
}

export function irPara(caminho, { substituir = false } = {}) {
  const alvo = `#${caminho}`;
  if (window.location.hash === alvo) return;
  if (substituir) window.location.replace(alvo);
  else window.location.hash = alvo;
}

export function aoMudarRota(manipulador) {
  aoTrocar = manipulador;
}

function despachar() {
  const caminho = caminhoAtual();
  const achado = resolverRota(caminho) ?? resolverRota('/404') ?? null;
  rotaAtual = achado;
  aoTrocar(achado, caminho);
}

export function iniciar(caminhoPadrao = '/') {
  window.addEventListener('hashchange', despachar);
  if (!window.location.hash) irPara(caminhoPadrao, { substituir: true });
  despachar();
}

export const rotaCorrente = () => rotaAtual;
export const todasAsRotas = () => rotas.slice();

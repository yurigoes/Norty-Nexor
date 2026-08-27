/* =========================================================
   LICITA+ — Oportunidades
   ---------------------------------------------------------
   Busca, filtro, ordenação e alternância lista/tabela sobre a
   base de demonstração. Tudo acontece em memória e repinta só
   a região de resultados — o cabeçalho e os filtros não
   piscam a cada tecla.

   O estado da tela mora num objeto só (`filtro`), e é ele que
   a URL reflete. Isso é o que permite salvar uma pesquisa e
   voltar a ela depois.
   ========================================================= */

import { html, raw, $, $$, ao, aoClicarEm, debounce } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, normalizar, diasAte } from '../lib/format.js';
import { cartaoOportunidade, linhaOportunidade, cabecalhoPagina } from '../ui/domain.js';
import { busca, seletor, botao, vazio, paginacao, selo, abrirGaveta, fecharGaveta, toast, caixaSelecao, skeletonCartao } from '../ui/primitives.js';
import { licitacoes, modalidades, categorias, orgaos } from '../data/mock.js';
import { obter, definir } from '../lib/store.js';

const POR_PAGINA = 6;

const filtro = {
  termo: '',
  modalidade: '',
  categoria: '',
  uf: '',
  orgao: '',
  valorMin: '',
  valorMax: '',
  compatMin: 0,
  apenasFavoritos: false,
  ordem: 'compatibilidade',
  pagina: 1,
};

const ORDENS = [
  { valor: 'compatibilidade', rotulo: 'Maior compatibilidade' },
  { valor: 'prazo', rotulo: 'Encerra primeiro' },
  { valor: 'valor-desc', rotulo: 'Maior valor' },
  { valor: 'valor-asc', rotulo: 'Menor valor' },
  { valor: 'recente', rotulo: 'Publicadas recentemente' },
];

/** Aplica todos os filtros e a ordenação. Função pura sobre a base. */
export function aplicar(base = licitacoes, f = filtro) {
  const termo = normalizar(f.termo);

  let saida = base.filter((l) => {
    if (termo) {
      const alvo = normalizar(`${l.objeto} ${l.orgao.nome} ${l.categoria} ${l.numero} ${l.orgao.cidade}`);
      if (!alvo.includes(termo)) return false;
    }
    if (f.modalidade && l.modalidade !== f.modalidade) return false;
    if (f.categoria && l.categoria !== f.categoria) return false;
    if (f.uf && l.orgao.uf !== f.uf) return false;
    if (f.orgao && l.orgao.id !== f.orgao) return false;
    if (f.valorMin && l.valor < Number(f.valorMin)) return false;
    if (f.valorMax && l.valor > Number(f.valorMax)) return false;
    if (f.compatMin && l.compatibilidade < f.compatMin) return false;
    return true;
  });

  const ordenadores = {
    compatibilidade: (a, b) => b.compatibilidade - a.compatibilidade,
    prazo: (a, b) => new Date(a.encerramento) - new Date(b.encerramento),
    'valor-desc': (a, b) => b.valor - a.valor,
    'valor-asc': (a, b) => a.valor - b.valor,
    recente: (a, b) => new Date(b.abertura) - new Date(a.abertura),
  };

  saida = [...saida].sort(ordenadores[f.ordem] ?? ordenadores.compatibilidade);
  return saida;
}

/** Chips do que está filtrado — e o botão de tirar cada um. */
function chipsAtivos() {
  const chips = [];
  const add = (chave, texto) =>
    chips.push(`<span class="filtro-chip">${texto}
      <button data-acao="remover-filtro" data-chave="${chave}" aria-label="Remover filtro ${texto}">
        ${icone('fechar')}</button></span>`);

  if (filtro.termo) add('termo', `"${filtro.termo}"`);
  if (filtro.modalidade) add('modalidade', filtro.modalidade);
  if (filtro.categoria) add('categoria', filtro.categoria);
  if (filtro.uf) add('uf', filtro.uf);
  if (filtro.orgao) add('orgao', orgaos.find((o) => o.id === filtro.orgao)?.sigla ?? filtro.orgao);
  if (filtro.valorMin) add('valorMin', `a partir de ${moeda(Number(filtro.valorMin))}`);
  if (filtro.valorMax) add('valorMax', `até ${moeda(Number(filtro.valorMax))}`);
  if (filtro.compatMin) add('compatMin', `${filtro.compatMin}%+ compatível`);

  if (chips.length === 0) return '';

  return `<div class="filtros-barra" style="margin-top: var(--e-3)">
    ${chips.join('')}
    <button class="btn -fantasma -sm" data-acao="limpar-tudo">Limpar tudo</button>
  </div>`;
}

function corpoResultados() {
  const resultados = aplicar();
  const totalPaginas = Math.max(1, Math.ceil(resultados.length / POR_PAGINA));
  const pagina = Math.min(filtro.pagina, totalPaginas);
  const fatia = resultados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const modo = obter().modoLista;

  if (resultados.length === 0) {
    return vazio({
      nomeIcone: 'arquivo_x',
      titulo: 'Nenhuma oportunidade encontrada',
      texto: 'Tente alterar seus filtros ou realizar uma nova busca. Você também pode ampliar a faixa de valor ou incluir outros estados.',
      acao: `<button class="btn -secundario" data-acao="limpar-tudo">Limpar filtros</button>`,
    });
  }

  const lista =
    modo === 'tabela'
      ? `<div class="tabela-caixa"><div class="tabela-rolagem"><table class="tabela">
          <thead><tr>
            <th>Objeto</th><th>Modalidade</th><th class="-num">Valor estimado</th>
            <th>Encerramento</th><th>Compatibilidade</th><th></th>
          </tr></thead>
          <tbody>${fatia.map(linhaOportunidade).join('')}</tbody>
        </table></div></div>`
      : `<div class="pilha">${fatia.map((l) => cartaoOportunidade(l)).join('')}</div>`;

  return `${lista}
    <div style="margin-top: var(--e-5)">
      ${paginacao({ pagina, totalPaginas, totalItens: resultados.length, porPagina: POR_PAGINA })}
    </div>`;
}

/* ---------- Gaveta de filtros avançados ---------- */

function gavetaFiltros() {
  const ufs = [...new Set(orgaos.map((o) => o.uf))].sort();

  abrirGaveta({
    titulo: 'Filtros',
    corpo: html`<div class="pilha">
      ${raw(seletor({
        rotulo: 'Modalidade', id: 'f-modalidade', valor: filtro.modalidade,
        opcoes: [{ valor: '', rotulo: 'Todas as modalidades' }, ...modalidades.map((m) => ({ valor: m, rotulo: m }))],
      }))}
      ${raw(seletor({
        rotulo: 'Categoria', id: 'f-categoria', valor: filtro.categoria,
        opcoes: [{ valor: '', rotulo: 'Todas as categorias' }, ...categorias.map((c) => ({ valor: c, rotulo: c }))],
      }))}
      ${raw(seletor({
        rotulo: 'Estado', id: 'f-uf', valor: filtro.uf,
        opcoes: [{ valor: '', rotulo: 'Todos os estados' }, ...ufs.map((u) => ({ valor: u, rotulo: u }))],
      }))}
      ${raw(seletor({
        rotulo: 'Órgão', id: 'f-orgao', valor: filtro.orgao,
        opcoes: [{ valor: '', rotulo: 'Todos os órgãos' }, ...orgaos.map((o) => ({ valor: o.id, rotulo: o.nome }))],
      }))}

      <div class="grade grade-2" style="gap: var(--e-3)">
        <label class="campo" for="f-valor-min">
          <span class="campo-rotulo">Valor mínimo</span>
          <input class="input" id="f-valor-min" type="number" min="0" step="1000"
            placeholder="R$ 0" value="${filtro.valorMin}">
        </label>
        <label class="campo" for="f-valor-max">
          <span class="campo-rotulo">Valor máximo</span>
          <input class="input" id="f-valor-max" type="number" min="0" step="1000"
            placeholder="sem limite" value="${filtro.valorMax}">
        </label>
      </div>

      <label class="campo" for="f-compat">
        <span class="campo-rotulo">Compatibilidade mínima</span>
        <input class="input" id="f-compat" type="range" min="0" max="100" step="10"
          value="${filtro.compatMin}" style="padding: 0; height: 34px">
        <span class="campo-ajuda" id="f-compat-saida">
          ${filtro.compatMin === 0 ? 'Qualquer compatibilidade' : `A partir de ${filtro.compatMin}%`}
        </span>
      </label>

      ${raw(seletor({
        rotulo: 'Situação', id: 'f-situacao', valor: '',
        opcoes: [
          { valor: '', rotulo: 'Recebendo propostas' },
          { valor: 'julgamento', rotulo: 'Em julgamento' },
          { valor: 'homologada', rotulo: 'Homologada' },
        ],
      }))}
    </div>`,
    rodape: `
      <button class="btn -fantasma" data-acao="limpar-gaveta">Limpar</button>
      <button class="btn -primario" data-acao="aplicar-gaveta">Aplicar filtros</button>`,
  });

  const gaveta = $('.gaveta');

  const faixa = $('#f-compat', gaveta);
  ao(faixa, 'input', () => {
    const v = Number(faixa.value);
    $('#f-compat-saida', gaveta).textContent =
      v === 0 ? 'Qualquer compatibilidade' : `A partir de ${v}%`;
  });

  aoClicarEm(gaveta, '[data-acao="aplicar-gaveta"]', () => {
    Object.assign(filtro, {
      modalidade: $('#f-modalidade', gaveta).value,
      categoria: $('#f-categoria', gaveta).value,
      uf: $('#f-uf', gaveta).value,
      orgao: $('#f-orgao', gaveta).value,
      valorMin: $('#f-valor-min', gaveta).value,
      valorMax: $('#f-valor-max', gaveta).value,
      compatMin: Number($('#f-compat', gaveta).value),
      pagina: 1,
    });
    fecharGaveta();
    repintar();
    toast('Filtros aplicados', { variante: 'info', sub: `${aplicar().length} oportunidades encontradas` });
  });

  aoClicarEm(gaveta, '[data-acao="limpar-gaveta"]', () => {
    Object.assign(filtro, {
      modalidade: '', categoria: '', uf: '', orgao: '',
      valorMin: '', valorMax: '', compatMin: 0, pagina: 1,
    });
    fecharGaveta();
    repintar();
  });
}

let raizPagina = null;

function repintar() {
  if (!raizPagina) return;
  $('#resultados', raizPagina).innerHTML = corpoResultados();
  $('#chips', raizPagina).innerHTML = chipsAtivos();
  $('#contagem', raizPagina).textContent = `${aplicar().length} oportunidades`;
}

export default {
  titulo: 'Oportunidades',
  trilha: ['Início', 'Oportunidades'],
  nav: 'oportunidades',

  render(ctx) {
    if (ctx?.consulta?.q) filtro.termo = ctx.consulta.q;
    const modo = obter().modoLista;

    return html`
<div class="pilha">
  ${raw(cabecalhoPagina({
    titulo: 'Oportunidades',
    subtitulo: 'Todas as licitações que o LICITA+ encontrou e analisou para o seu perfil.',
    acoes: `
      <button class="btn -secundario -sm" data-acao="salvar-pesquisa">
        ${icone('salvar')} Salvar pesquisa
      </button>`,
  }))}

  <!-- Barra de busca e controles -->
  <div class="card">
    <div class="card-corpo">
      <div class="linha" style="gap: var(--e-3); flex-wrap: wrap">
        <div style="flex: 1; min-width: 260px">
          ${raw(busca({ id: 'busca-oport', placeholder: 'Buscar por objeto, órgão, número ou cidade…', valor: filtro.termo }))}
        </div>

        <button class="filtro-pill" data-acao="abrir-filtros">
          ${raw(icone('filtro'))} Filtros
        </button>

        <label class="campo" style="min-width: 190px">
          <select class="select" id="ordem" aria-label="Ordenar por">
            ${raw(ORDENS.map((o) =>
              `<option value="${o.valor}" ${o.valor === filtro.ordem ? 'selected' : ''}>${o.rotulo}</option>`,
            ).join(''))}
          </select>
        </label>

        <div class="linha" style="gap: 2px; padding: 3px; background: var(--superficie-afundada);
          border-radius: var(--r-md)">
          <button class="btn-icone ${modo === 'cartoes' ? '-ativo' : ''}" data-acao="modo" data-modo="cartoes"
            aria-label="Ver em cartões" aria-pressed="${modo === 'cartoes'}">${raw(icone('lista'))}</button>
          <button class="btn-icone ${modo === 'tabela' ? '-ativo' : ''}" data-acao="modo" data-modo="tabela"
            aria-label="Ver em tabela" aria-pressed="${modo === 'tabela'}">${raw(icone('grade'))}</button>
        </div>
      </div>

      <div id="chips">${raw(chipsAtivos())}</div>
    </div>
  </div>

  <div class="linha-entre">
    <span class="rotulo" id="contagem">${aplicar().length} oportunidades</span>
    <span class="tenue" style="font-size: var(--t-micro)">Dados de demonstração</span>
  </div>

  <div id="resultados">${raw(corpoResultados())}</div>
</div>`;
  },

  ativar(raiz) {
    raizPagina = raiz;

    const entrada = $('#busca-oport', raiz);
    const caixaBusca = entrada.closest('[data-busca]');

    const buscar = debounce(() => {
      filtro.termo = entrada.value.trim();
      filtro.pagina = 1;
      caixaBusca.classList.toggle('-preenchida', entrada.value.length > 0);
      repintar();
    }, 220);

    ao(entrada, 'input', buscar);

    aoClicarEm(raiz, '[data-acao="limpar-busca"]', () => {
      entrada.value = '';
      filtro.termo = '';
      filtro.pagina = 1;
      caixaBusca.classList.remove('-preenchida');
      repintar();
    });

    ao($('#ordem', raiz), 'change', (evento) => {
      filtro.ordem = evento.target.value;
      filtro.pagina = 1;
      repintar();
    });

    aoClicarEm(raiz, '[data-acao="modo"]', (_evento, alvo) => {
      definir({ modoLista: alvo.dataset.modo }, 'modo');
      $$('[data-acao="modo"]', raiz).forEach((b) => {
        const ativo = b.dataset.modo === alvo.dataset.modo;
        b.classList.toggle('-ativo', ativo);
        b.setAttribute('aria-pressed', String(ativo));
      });
      repintar();
    });

    aoClicarEm(raiz, '[data-acao="abrir-filtros"]', gavetaFiltros);

    aoClicarEm(raiz, '[data-acao="remover-filtro"]', (_evento, alvo) => {
      const chave = alvo.dataset.chave;
      filtro[chave] = chave === 'compatMin' ? 0 : '';
      if (chave === 'termo') entrada.value = '';
      filtro.pagina = 1;
      repintar();
    });

    aoClicarEm(raiz, '[data-acao="limpar-tudo"]', () => {
      Object.assign(filtro, {
        termo: '', modalidade: '', categoria: '', uf: '', orgao: '',
        valorMin: '', valorMax: '', compatMin: 0, pagina: 1,
      });
      entrada.value = '';
      caixaBusca.classList.remove('-preenchida');
      repintar();
    });

    aoClicarEm(raiz, '[data-acao="pagina"]', (_evento, alvo) => {
      filtro.pagina = Number(alvo.dataset.pagina);
      repintar();
      raiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    aoClicarEm(raiz, '[data-acao="salvar-pesquisa"]', () => {
      toast('Pesquisa salva', {
        variante: 'sucesso',
        sub: 'Você receberá alerta quando surgirem novas oportunidades com estes filtros.',
      });
    });
  },
};

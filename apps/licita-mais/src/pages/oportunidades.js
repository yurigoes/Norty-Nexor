/* =========================================================
   LICITA+ — Oportunidades
   ---------------------------------------------------------
   Busca, filtro, ordenação e alternância lista/tabela.

   Filtrar, ordenar e paginar acontecem **no servidor**. A
   tentação seria trazer tudo e peneirar aqui, o que funciona
   com trinta licitações e desmorona com trinta mil — que é o
   volume real de um mês de PNCP em três estados. A nota já
   está indexada por `(empresaId, nota)` no banco; ordenar lá
   é uma consulta, ordenar aqui seria carregar a base inteira
   na memória do navegador a cada clique.

   O estado da tela mora num objeto só (`filtro`), e é ele que
   vira querystring. É o que permite salvar a pesquisa como
   monitoramento com exatamente o que está em tela.
   ========================================================= */

import { html, raw, $, $$, ao, aoClicarEm, debounce } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda } from '../lib/format.js';
import { cartaoOportunidade, linhaOportunidade, cabecalhoPagina } from '../ui/domain.js';
import { busca, seletor, vazio, paginacao, abrirGaveta, fecharGaveta, toast, skeletonCartao, campo } from '../ui/primitives.js';
import { obter, definir } from '../lib/store.js';
import { listarOportunidades, criarMonitoramento } from '../dados/index.js';
import { MODALIDADES_PNCP, UFS, ORDENS_LISTA, nomeModalidade } from '../lib/tabelas.js';

const POR_PAGINA = 8;

const filtro = {
  termo: '',
  modalidadeCodigo: '',
  uf: '',
  valorMin: '',
  valorMax: '',
  compatMin: 0,
  ordem: 'compatibilidade',
  pagina: 1,
};

/** Última resposta do servidor — o que a tela está mostrando. */
let ultima = { itens: [], total: 0, pagina: 1, totalPaginas: 1 };
let raizPagina = null;

const paraConsulta = () => ({ ...filtro, tamanho: POR_PAGINA });

/* ---------- Chips do que está filtrado ---------- */

function chipsAtivos() {
  const chips = [];
  const add = (chave, texto) =>
    chips.push(`<span class="filtro-chip">${texto}
      <button data-acao="remover-filtro" data-chave="${chave}" aria-label="Remover filtro ${texto}">
        ${icone('fechar')}</button></span>`);

  if (filtro.termo) add('termo', `"${filtro.termo}"`);
  if (filtro.modalidadeCodigo) add('modalidadeCodigo', nomeModalidade(Number(filtro.modalidadeCodigo)));
  if (filtro.uf) add('uf', filtro.uf);
  if (filtro.valorMin) add('valorMin', `a partir de ${moeda(Number(filtro.valorMin))}`);
  if (filtro.valorMax) add('valorMax', `até ${moeda(Number(filtro.valorMax))}`);
  if (filtro.compatMin) add('compatMin', `${filtro.compatMin}%+ compatível`);

  if (chips.length === 0) return '';

  return `<div class="filtros-barra" style="margin-top: var(--e-3)">
    ${chips.join('')}
    <button class="btn -fantasma -sm" data-acao="limpar-tudo">Limpar tudo</button>
  </div>`;
}

/* ---------- Resultados ---------- */

const temFiltro = () =>
  Boolean(filtro.termo || filtro.modalidadeCodigo || filtro.uf || filtro.valorMin
    || filtro.valorMax || filtro.compatMin);

function corpoResultados() {
  if (ultima.itens.length === 0) {
    return temFiltro()
      ? vazio({
          nomeIcone: 'arquivo_x',
          titulo: 'Nenhuma oportunidade com esses filtros',
          texto: 'Amplie a faixa de valor, baixe a compatibilidade mínima ou inclua outros estados.',
          acao: '<button class="btn -secundario" data-acao="limpar-tudo">Limpar filtros</button>',
        })
      : vazio({
          nomeIcone: 'radar',
          titulo: 'Ainda não há oportunidades avaliadas',
          texto: 'A varredura dos portais roda todo dia de madrugada. Enquanto isso, completar o perfil da empresa faz a próxima rodada render mais.',
          acao: '<a class="btn -primario" href="#/empresa">Completar perfil</a>',
        });
  }

  const modo = obter().modoLista;

  const lista =
    modo === 'tabela'
      ? `<div class="tabela-caixa"><div class="tabela-rolagem"><table class="tabela">
          <thead><tr>
            <th>Objeto</th><th>Modalidade</th><th class="-num">Valor estimado</th>
            <th>Encerramento</th><th>Compatibilidade</th><th></th>
          </tr></thead>
          <tbody>${ultima.itens.map(linhaOportunidade).join('')}</tbody>
        </table></div></div>`
      : `<div class="pilha">${ultima.itens.map((l) => cartaoOportunidade(l)).join('')}</div>`;

  return `${lista}
    <div style="margin-top: var(--e-5)">
      ${paginacao({
        pagina: ultima.pagina,
        totalPaginas: ultima.totalPaginas,
        totalItens: ultima.total,
        porPagina: POR_PAGINA,
      })}
    </div>`;
}

/**
 * Busca no servidor e repinta só a região de resultados. O
 * cabeçalho e os filtros não piscam a cada tecla — e o contador
 * de requisições evita que uma resposta lenta de duas teclas
 * atrás sobrescreva a atual.
 */
let consultaAtualId = 0;

async function repintar() {
  if (!raizPagina) return;

  const minha = ++consultaAtualId;
  const alvo = $('#resultados', raizPagina);
  alvo.setAttribute('aria-busy', 'true');
  alvo.style.opacity = '.5';

  try {
    const resposta = await listarOportunidades(paraConsulta());
    if (minha !== consultaAtualId) return;
    ultima = resposta;
  } catch (erro) {
    if (minha !== consultaAtualId) return;
    alvo.style.opacity = '';
    alvo.removeAttribute('aria-busy');
    alvo.innerHTML = vazio({
      nomeIcone: 'alerta',
      titulo: 'Não foi possível carregar',
      texto: erro.message,
    });
    return;
  }

  alvo.style.opacity = '';
  alvo.removeAttribute('aria-busy');
  alvo.innerHTML = corpoResultados();
  $('#chips', raizPagina).innerHTML = chipsAtivos();
  $('#contagem', raizPagina).textContent = `${ultima.total} oportunidade${ultima.total === 1 ? '' : 's'}`;
}

/* ---------- Gaveta de filtros avançados ---------- */

function gavetaFiltros() {
  abrirGaveta({
    titulo: 'Filtros',
    corpo: html`<div class="pilha">
      ${raw(seletor({
        rotulo: 'Modalidade', id: 'f-modalidade', valor: String(filtro.modalidadeCodigo),
        opcoes: [
          { valor: '', rotulo: 'Todas as modalidades' },
          ...MODALIDADES_PNCP.map((m) => ({ valor: String(m.codigo), rotulo: m.nome })),
        ],
      }))}
      ${raw(seletor({
        rotulo: 'Estado', id: 'f-uf', valor: filtro.uf,
        opcoes: [{ valor: '', rotulo: 'Todos os estados' }, ...UFS.map((u) => ({ valor: u, rotulo: u }))],
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

      <p class="tenue" style="font-size: var(--t-micro); line-height: 1.5">
        A lista mostra apenas o que ainda recebe proposta. Certame encerrado sai da
        listagem sozinho — não há filtro de situação porque não haveria o que filtrar.
      </p>
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

  aoClicarEm(gaveta, '[data-acao="aplicar-gaveta"]', async () => {
    Object.assign(filtro, {
      modalidadeCodigo: $('#f-modalidade', gaveta).value,
      uf: $('#f-uf', gaveta).value,
      valorMin: $('#f-valor-min', gaveta).value,
      valorMax: $('#f-valor-max', gaveta).value,
      compatMin: Number($('#f-compat', gaveta).value),
      pagina: 1,
    });
    fecharGaveta();
    await repintar();
    toast('Filtros aplicados', { variante: 'info', sub: `${ultima.total} oportunidades encontradas` });
  });

  aoClicarEm(gaveta, '[data-acao="limpar-gaveta"]', () => {
    Object.assign(filtro, {
      modalidadeCodigo: '', uf: '', valorMin: '', valorMax: '', compatMin: 0, pagina: 1,
    });
    fecharGaveta();
    repintar();
  });
}

/* ---------- Salvar como monitoramento ----------
   O botão cria uma busca salva de verdade, com os filtros que
   estão em tela. Um "salvar" que só mostra um toast é a
   diferença entre protótipo e produto. */

function gavetaSalvarPesquisa() {
  abrirGaveta({
    titulo: 'Salvar como monitoramento',
    corpo: html`<div class="pilha">
      <p class="suave" style="font-size: var(--t-corpo-sm); line-height: 1.6">
        O monitoramento guarda estes filtros e avisa quando aparecer algo novo que
        se encaixe neles.
      </p>

      ${raw(campo({
        rotulo: 'Nome do monitoramento', id: 'sp-nome',
        valor: filtro.termo || 'Minha pesquisa',
        placeholder: 'Ex.: Equipamentos de informática na Bahia',
        atributos: 'required',
      }))}

      <div class="card">
        <div class="card-corpo pilha-sm">
          <span class="rotulo">Filtros que serão guardados</span>
          ${raw(chipsAtivos() || '<p class="tenue" style="font-size: var(--t-micro); margin: 0">Nenhum filtro — o monitoramento acompanharia tudo.</p>')}
        </div>
      </div>

      <label class="check" for="sp-email">
        <input type="checkbox" id="sp-email" checked>
        <span>Quero receber e-mail quando houver novidade</span>
      </label>
    </div>`,
    rodape: `
      <button class="btn -fantasma" data-acao="fechar-gaveta">Cancelar</button>
      <button class="btn -primario" data-acao="confirmar-salvar">Criar monitoramento</button>`,
  });

  const gaveta = $('.gaveta');

  aoClicarEm(gaveta, '[data-acao="confirmar-salvar"]', async (_evento, alvo) => {
    const nome = $('#sp-nome', gaveta).value.trim();
    if (!nome) {
      toast('Dê um nome ao monitoramento', { variante: 'erro' });
      return;
    }

    alvo.disabled = true;

    try {
      await criarMonitoramento({
        nome,
        termos: filtro.termo ? [filtro.termo] : [],
        estados: filtro.uf ? [filtro.uf] : [],
        modalidades: filtro.modalidadeCodigo ? [Number(filtro.modalidadeCodigo)] : [],
        valorMinimo: filtro.valorMin ? Number(filtro.valorMin) : undefined,
        alertaEmail: $('#sp-email', gaveta).checked,
      });

      fecharGaveta();
      toast('Monitoramento criado', {
        variante: 'sucesso',
        sub: 'Você será avisado quando surgir algo novo com estes filtros.',
      });
    } catch (erro) {
      alvo.disabled = false;
      toast('Não foi possível criar', { variante: 'erro', sub: erro.message });
    }
  });
}

/* ---------- Página ---------- */

export default {
  titulo: 'Oportunidades',
  trilha: ['Início', 'Oportunidades'],
  nav: 'oportunidades',

  esqueleto: () => skeletonCartao(4),

  async render(ctx) {
    if (ctx?.consulta?.q !== undefined) filtro.termo = ctx.consulta.q;
    filtro.pagina = 1;

    ultima = await listarOportunidades(paraConsulta());
    const modo = obter().modoLista;

    return html`
<div class="pilha">
  ${raw(cabecalhoPagina({
    titulo: 'Oportunidades',
    subtitulo: 'Tudo o que o LICITA+ encontrou nos portais públicos e analisou para o seu perfil.',
    acoes: `
      <button class="btn -secundario -sm" data-acao="salvar-pesquisa">
        ${icone('salvar')} Salvar pesquisa
      </button>`,
  }))}

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
            ${raw(ORDENS_LISTA.map((o) =>
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
    <span class="rotulo" id="contagem">${ultima.total} oportunidade${ultima.total === 1 ? '' : 's'}</span>
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
    }, 280);

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
      // Só a apresentação mudou: redesenha do que já está em mãos,
      // sem uma ida ao servidor que traria exatamente o mesmo.
      $('#resultados', raiz).innerHTML = corpoResultados();
    });

    aoClicarEm(raiz, '[data-acao="abrir-filtros"]', gavetaFiltros);
    aoClicarEm(raiz, '[data-acao="salvar-pesquisa"]', gavetaSalvarPesquisa);

    aoClicarEm(raiz, '[data-acao="remover-filtro"]', (_evento, alvo) => {
      const chave = alvo.dataset.chave;
      filtro[chave] = chave === 'compatMin' ? 0 : '';
      if (chave === 'termo') entrada.value = '';
      filtro.pagina = 1;
      repintar();
    });

    aoClicarEm(raiz, '[data-acao="limpar-tudo"]', () => {
      Object.assign(filtro, {
        termo: '', modalidadeCodigo: '', uf: '',
        valorMin: '', valorMax: '', compatMin: 0, pagina: 1,
      });
      entrada.value = '';
      caixaBusca.classList.remove('-preenchida');
      repintar();
    });

    aoClicarEm(raiz, '[data-acao="pagina"]', async (_evento, alvo) => {
      filtro.pagina = Number(alvo.dataset.pagina);
      await repintar();
      raiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => { raizPagina = null; };
  },
};

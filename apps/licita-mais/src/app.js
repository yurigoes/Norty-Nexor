/* =========================================================
   LICITA+ — Shell e inicialização
   ---------------------------------------------------------
   Monta sidebar, header e área de conteúdo, registra as rotas
   e liga as ações que valem para o app inteiro — favoritar,
   abrir a explicação do score, gaveta mobile, notificações.

   Por que estas ações são globais: elas aparecem em cartões
   que várias páginas renderizam. Ligar uma por página faria
   cada tela repetir o mesmo ouvinte, e esquecer numa delas
   produziria um botão que não faz nada.
   ========================================================= */

import { html, raw, $, $$, ao, aoClicarEm, elemento } from './lib/dom.js';
import { icone } from './lib/icons.js';
import { registrar, iniciar, aoMudarRota, caminhoAtual, consultaAtual, irPara } from './lib/router.js';
import { marcaSidebar } from './ui/brand.js';
import { avatar, botaoIcone, abrirDropdown, fecharDropdown, itemDropdown, separadorDropdown, toast, abrirGaveta, fecharGaveta, abrirModal } from './ui/primitives.js';
import { itemNotificacao, corpoExplicacao } from './ui/domain.js';
import { alternarFavorito, obter, aplicarTema, assinar, totalFavoritos, alternarTema, marcarTudoLido } from './lib/store.js';
import { empresa, notificacoes, licitacoes, licitacaoPorId, monitoramentos } from './data/mock.js';
import { iniciais } from './lib/format.js';
import { mostrarCarregando, fecharCarregando } from './ui/carregando.js';

/* ---------- Páginas ---------- */

import landing from './pages/landing.js';
import login from './pages/login.js';
import onboarding from './pages/onboarding.js';
import painel from './pages/painel.js';
import oportunidades from './pages/oportunidades.js';
import detalhe from './pages/detalhe.js';
import buscaPagina from './pages/busca.js';
import recomendacoes from './pages/recomendacoes.js';
import monitoramentosPagina from './pages/monitoramentos.js';
import favoritos from './pages/favoritos.js';
import participacoesPagina from './pages/participacoes.js';
import relatorios from './pages/relatorios.js';
import empresaPagina from './pages/empresa.js';
import configuracoes from './pages/configuracoes.js';

/* ---------- Navegação ---------- */

const NAV = [
  { grupo: 'Descobrir', itens: [
    { chave: 'painel', rotulo: 'Painel', href: '#/painel', icone: 'painel' },
    { chave: 'oportunidades', rotulo: 'Oportunidades', href: '#/oportunidades', icone: 'radar' },
    { chave: 'busca', rotulo: 'Buscar licitações', href: '#/buscar', icone: 'busca' },
    { chave: 'recomendacoes', rotulo: 'Recomendações', href: '#/recomendacoes', icone: 'faisca' },
  ] },
  { grupo: 'Acompanhar', itens: [
    { chave: 'monitoramentos', rotulo: 'Monitoramentos', href: '#/monitoramentos', icone: 'sino_ativo' },
    { chave: 'favoritos', rotulo: 'Favoritos', href: '#/favoritos', icone: 'coracao', contagem: () => totalFavoritos() },
    { chave: 'participacoes', rotulo: 'Participações', href: '#/participacoes', icone: 'balanca' },
    { chave: 'relatorios', rotulo: 'Relatórios', href: '#/relatorios', icone: 'grafico' },
  ] },
  { grupo: 'Conta', itens: [
    { chave: 'empresa', rotulo: 'Minha empresa', href: '#/empresa', icone: 'predio' },
    { chave: 'configuracoes', rotulo: 'Configurações', href: '#/configuracoes', icone: 'engrenagem' },
  ] },
];

const NAV_MOBILE = [
  { chave: 'painel', rotulo: 'Início', href: '#/painel', icone: 'casa' },
  { chave: 'busca', rotulo: 'Buscar', href: '#/buscar', icone: 'busca' },
  { chave: 'oportunidades', rotulo: 'Oportunidades', href: '#/oportunidades', icone: 'radar' },
  { chave: 'favoritos', rotulo: 'Favoritos', href: '#/favoritos', icone: 'coracao' },
  { chave: 'empresa', rotulo: 'Perfil', href: '#/empresa', icone: 'usuario' },
];

/* ---------- Marcação do shell ---------- */

function itemNav(item, ativo) {
  const contagem = item.contagem?.();
  return `<a class="nav-item" href="${item.href}" data-nav="${item.chave}"
    ${ativo ? 'aria-current="page"' : ''}>
    ${icone(item.icone)}<span>${item.rotulo}</span>
    ${contagem ? `<span class="nav-item-contagem">${contagem}</span>` : ''}
  </a>`;
}

function sidebar(navAtiva) {
  return html`<aside class="sidebar" id="sidebar">
    <div class="sidebar-topo">${raw(marcaSidebar())}</div>

    <nav class="sidebar-nav" aria-label="Navegação principal">
      ${raw(NAV.map((secao) => `
        <div class="nav-grupo-rotulo">${secao.grupo}</div>
        ${secao.itens.map((item) => itemNav(item, item.chave === navAtiva)).join('')}
      `).join(''))}
    </nav>

    <div class="sidebar-rodape">
      <button class="conta" data-acao="menu-conta" aria-haspopup="menu" aria-expanded="false">
        ${raw(avatar({ iniciais: iniciais(empresa.usuario.nome) }))}
        <span class="conta-texto">
          <span class="conta-nome">${empresa.usuario.nome}</span>
          <span class="conta-empresa">${empresa.nomeFantasia}</span>
        </span>
        <span class="conta-seta" style="color: rgba(255,255,255,.4)">${raw(icone('chevron_cima'))}</span>
      </button>
    </div>
  </aside>`;
}

function header(rota) {
  const trilha = rota?.trilha ?? [];
  const naoLidas = notificacoes.filter((n) => !obter().notificacoesLidas.includes(n.id)).length;

  return html`<header class="header">
    <button class="btn-icone" data-acao="abrir-menu" aria-label="Abrir menu"
      style="display: none" id="btn-menu">${raw(icone('menu'))}</button>

    <div class="header-titulo">
      ${raw(trilha.length > 1 ? `<div class="trilha">${trilha
        .map((t, i) => (i === trilha.length - 1 ? `<span>${t}</span>` : `<span>${t}</span>${icone('chevron_dir')}`))
        .join('')}</div>` : '')}
      <h1>${rota?.titulo ?? 'LICITA+'}</h1>
    </div>

    <div class="header-acoes">
      <button class="btn-icone" data-acao="busca-rapida" aria-label="Busca rápida"
        title="Busca rápida">${raw(icone('busca'))}</button>
      ${raw(botaoIcone({ nome: 'sino', rotulo: `Notificações${naoLidas ? ` — ${naoLidas} não lidas` : ''}`,
        acao: 'notificacoes', ponto: naoLidas > 0 }))}
      ${raw(botaoIcone({ nome: 'ajuda', rotulo: 'Ajuda', acao: 'ajuda' }))}
      <div class="dropdown">
        <button class="btn-icone" data-acao="menu-usuario" aria-label="Menu do usuário"
          aria-haspopup="menu" aria-expanded="false" style="width: auto; padding: 0 4px">
          ${raw(avatar({ iniciais: iniciais(empresa.usuario.nome), tamanho: 'sm' }))}
        </button>
      </div>
    </div>
  </header>`;
}

function barraInferior(navAtiva) {
  return html`<nav class="barra-inferior" aria-label="Navegação rápida">
    ${raw(NAV_MOBILE.map((item) => `
      <a class="barra-item" href="${item.href}" data-nav-mobile="${item.chave}"
        ${item.chave === navAtiva ? 'aria-current="page"' : ''}>
        ${icone(item.icone)}<span>${item.rotulo}</span>
      </a>`).join(''))}
  </nav>`;
}

/* ---------- Registro de rotas ---------- */

registrar('/', { pagina: landing, shell: false, titulo: 'LICITA+' });
registrar('/entrar', { pagina: login, shell: false, titulo: 'Entrar' });
registrar('/onboarding', { pagina: onboarding, shell: false, titulo: 'Criar conta' });

const COM_SHELL = [
  ['/painel', painel], ['/oportunidades', oportunidades], ['/oportunidade/:id', detalhe],
  ['/buscar', buscaPagina], ['/recomendacoes', recomendacoes], ['/monitoramentos', monitoramentosPagina],
  ['/favoritos', favoritos], ['/participacoes', participacoesPagina], ['/relatorios', relatorios],
  ['/empresa', empresaPagina], ['/configuracoes', configuracoes],
];

for (const [caminho, pagina] of COM_SHELL) {
  registrar(caminho, { pagina, shell: true, titulo: pagina.titulo, trilha: pagina.trilha, nav: pagina.nav });
}

registrar('/404', {
  shell: true,
  titulo: 'Página não encontrada',
  pagina: {
    titulo: 'Página não encontrada',
    render: () => `<div class="vazio">
      <span class="vazio-arte">${icone('arquivo_x')}</span>
      <h3>Esta página não existe</h3>
      <p>O endereço pode ter mudado. Volte ao painel para continuar.</p>
      <a class="btn -primario" href="#/painel" style="margin-top: var(--e-4)">Ir para o painel</a>
    </div>`,
  },
});

/* ---------- Renderização ---------- */

const raiz = document.getElementById('app');
let limparPagina = null;

function renderizar(achado) {
  if (!achado) return;
  const { rota, params } = achado;
  const pagina = rota.pagina;
  const ctx = { params, consulta: consultaAtual() };

  // Desliga o que a página anterior tenha assinado.
  if (typeof limparPagina === 'function') limparPagina();
  limparPagina = null;

  fecharDropdown();

  if (rota.shell === false) {
    raiz.innerHTML = pagina.render(ctx);
    limparPagina = pagina.ativar?.(raiz, ctx) ?? null;
  } else {
    raiz.innerHTML = html`
      <div class="shell">
        ${raw(sidebar(rota.nav))}
        <div class="principal">
          ${raw(header(rota))}
          <main class="conteudo aparece" id="conteudo" tabindex="-1"></main>
        </div>
      </div>
      <div class="sidebar-fundo" id="sidebar-fundo"></div>
      ${raw(barraInferior(rota.nav))}`;

    const conteudo = $('#conteudo', raiz);
    conteudo.innerHTML = pagina.render(ctx);
    limparPagina = pagina.ativar?.(conteudo, ctx) ?? null;

    ligarShell();
  }

  document.title = `${rota.titulo ?? 'LICITA+'} · LICITA+`;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- Comportamento do shell ---------- */

function ligarShell() {
  const sidebarEl = $('#sidebar');
  const fundo = $('#sidebar-fundo');
  const btnMenu = $('#btn-menu');

  // O botão de menu só existe no mobile; a media query controla
  // a visibilidade, mas o display inline precisa acompanhar.
  const ajustarMenu = () => {
    if (btnMenu) btnMenu.style.display = window.innerWidth <= 760 ? 'inline-flex' : 'none';
  };
  ajustarMenu();
  ao(window, 'resize', ajustarMenu);

  const abrir = () => {
    sidebarEl.classList.add('-aberta');
    fundo.classList.add('-ativa');
    requestAnimationFrame(() => fundo.classList.add('-visivel'));
  };

  const fechar = () => {
    sidebarEl.classList.remove('-aberta');
    fundo.classList.remove('-visivel');
    setTimeout(() => fundo.classList.remove('-ativa'), 300);
  };

  if (btnMenu) ao(btnMenu, 'click', abrir);
  if (fundo) ao(fundo, 'click', fechar);
  $$('.sidebar .nav-item').forEach((item) => ao(item, 'click', fechar));

  // Menu da conta na base da sidebar
  const conta = $('[data-acao="menu-conta"]');
  if (conta) {
    ao(conta, 'click', (evento) => {
      evento.stopPropagation();
      abrirDropdown(conta, [
        itemDropdown({ rotulo: 'Minha empresa', nomeIcone: 'predio', href: '#/empresa' }),
        itemDropdown({ rotulo: 'Configurações', nomeIcone: 'engrenagem', href: '#/configuracoes' }),
        separadorDropdown(),
        itemDropdown({ rotulo: 'Alternar tema', nomeIcone: 'olho', acao: 'tema' }),
        itemDropdown({ rotulo: 'Sair', nomeIcone: 'sair', acao: 'sair', variante: '-perigo' }),
      ].join(''), { alinhar: 'esquerda' });
    });
  }

  const menuUsuario = $('[data-acao="menu-usuario"]');
  if (menuUsuario) {
    ao(menuUsuario, 'click', (evento) => {
      evento.stopPropagation();
      abrirDropdown(menuUsuario, [
        `<div style="padding: var(--e-3); border-bottom: 1px solid var(--borda-suave); margin-bottom: 4px">
          <div style="font-weight: var(--p-semi); font-size: var(--t-corpo-sm)">${empresa.usuario.nome}</div>
          <div class="suave" style="font-size: var(--t-micro)">${empresa.usuario.email}</div>
        </div>`,
        itemDropdown({ rotulo: 'Minha empresa', nomeIcone: 'predio', href: '#/empresa' }),
        itemDropdown({ rotulo: 'Configurações', nomeIcone: 'engrenagem', href: '#/configuracoes' }),
        separadorDropdown(),
        itemDropdown({ rotulo: 'Sair', nomeIcone: 'sair', acao: 'sair', variante: '-perigo' }),
      ].join(''));
    });
  }
}

/* ---------- Ações globais ----------
   Delegadas no body: valem em qualquer tela, inclusive dentro
   de modal e gaveta, que vivem fora da raiz do app. */

function ligarAcoesGlobais() {
  aoClicarEm(document.body, '[data-acao="favoritar"]', (evento, alvo) => {
    evento.preventDefault();
    evento.stopPropagation();

    const id = alvo.dataset.id;
    const agora = alternarFavorito(id);

    alvo.classList.toggle('-ativo', agora);
    alvo.setAttribute('aria-pressed', String(agora));
    alvo.setAttribute('aria-label', agora ? 'Remover dos favoritos' : 'Adicionar aos favoritos');

    toast(agora ? 'Oportunidade adicionada aos favoritos.' : 'Oportunidade removida dos favoritos.', {
      variante: agora ? 'sucesso' : 'info',
    });
  });

  aoClicarEm(document.body, '[data-acao="explicar-score"]', (evento) => {
    const cartao = evento.target.closest('[data-id]');
    const licitacao = licitacaoPorId(cartao?.dataset.id);
    if (!licitacao) return;

    abrirModal({
      titulo: 'Por que recomendamos esta oportunidade?',
      subtitulo: licitacao.objeto,
      corpo: corpoExplicacao(licitacao),
      rodape: `<a class="btn -secundario" href="#/oportunidade/${licitacao.id}"
                 data-acao="fechar-modal">Ver oportunidade</a>
               <button class="btn -primario" data-acao="fechar-modal">Entendi</button>`,
    });
  });

  aoClicarEm(document.body, '[data-acao="notificacoes"]', () => {
    const lidas = obter().notificacoesLidas;
    abrirGaveta({
      titulo: 'Notificações',
      corpo: `<div style="margin: calc(var(--e-5) * -1)">
        ${notificacoes.map((n) => itemNotificacao(n, { nova: !lidas.includes(n.id) })).join('')}
      </div>`,
      rodape: `<button class="btn -fantasma" data-acao="marcar-lidas">Marcar todas como lidas</button>`,
    });
  });

  aoClicarEm(document.body, '[data-acao="marcar-lidas"]', () => {
    marcarTudoLido(notificacoes.map((n) => n.id));
    $$('.notif.-nova').forEach((el) => el.classList.remove('-nova'));
    $$('.btn-icone-ponto').forEach((el) => el.remove());
    toast('Notificações marcadas como lidas', { variante: 'info' });
  });

  aoClicarEm(document.body, '[data-acao="ajuda"]', () => {
    abrirModal({
      titulo: 'Como o LICITA+ funciona',
      corpo: `<div class="pilha">
        <p style="line-height: 1.7">
          O LICITA+ acompanha as publicações dos portais públicos, compara cada uma com o
          perfil da sua empresa e atribui um <b>percentual de compatibilidade</b> — sempre
          com a conta aberta, critério por critério.
        </p>
        <div class="alerta-bloco -info">${icone('info')}
          <div><b>O que ele não faz:</b> enviar proposta e dar lance. O envio é feito por
          você na plataforma do órgão, com certificado digital, porque proposta é ato
          juridicamente vinculante.</div>
        </div>
        <p class="suave" style="font-size: var(--t-corpo-sm); line-height: 1.6">
          Atalhos: <b>/</b> abre a busca rápida · <b>Esc</b> fecha modal e gaveta.
        </p>
      </div>`,
      rodape: '<button class="btn -primario" data-acao="fechar-modal">Entendi</button>',
    });
  });

  aoClicarEm(document.body, '[data-acao="busca-rapida"]', () => irPara('/buscar'));

  aoClicarEm(document.body, '[data-acao="tema"]', () => {
    fecharDropdown();
    const novo = alternarTema();
    toast(novo === 'escuro' ? 'Modo escuro ativado' : 'Modo claro ativado', { variante: 'info' });
  });

  aoClicarEm(document.body, '[data-acao="sair"]', () => {
    fecharDropdown();
    irPara('/');
    toast('Sessão encerrada', { variante: 'info' });
  });

  aoClicarEm(document.body, '[data-acao="abrir-notificacao"]', () => {
    fecharGaveta();
  });

  // Atalho de teclado: "/" foca a busca, exceto dentro de campo.
  ao(document, 'keydown', (evento) => {
    if (evento.key !== '/' || /input|textarea|select/i.test(evento.target.tagName)) return;
    evento.preventDefault();
    const campoBusca = $('#busca-oport') ?? $('#busca-grande');
    if (campoBusca) campoBusca.focus();
    else irPara('/buscar');
  });
}

/* ---------- Contador de favoritos na sidebar ---------- */

assinar((_estado, evento) => {
  if (evento !== 'favoritos') return;
  const item = $('.nav-item[data-nav="favoritos"]');
  if (!item) return;

  const total = totalFavoritos();
  let selo = item.querySelector('.nav-item-contagem');

  if (total === 0) {
    selo?.remove();
    return;
  }
  if (!selo) {
    selo = elemento('<span class="nav-item-contagem"></span>');
    item.appendChild(selo);
  }
  selo.textContent = String(total);
});

/* ---------- Início ---------- */

aplicarTema();
ligarAcoesGlobais();
aoMudarRota(renderizar);
iniciar('/');

/**
 * Abertura: a marca se monta uma vez, no primeiro carregamento
 * da sessão. Nas navegações seguintes ela não reaparece —
 * cortina que volta a cada clique deixa de ser identidade e
 * vira obstáculo.
 */
function abertura() {
  try {
    if (sessionStorage.getItem('licita-mais:aberto')) return;
    sessionStorage.setItem('licita-mais:aberto', '1');
  } catch {
    /* Janela anônima: sem persistência, a cortina roda de novo.
       É o menor dos males — melhor repetir que quebrar a carga. */
  }

  mostrarCarregando({
    texto: 'Inteligência para oportunidades públicas',
    etapas: ['Conectando aos portais públicos', 'Preparando o seu radar'],
    intervalo: 900,
  });

  setTimeout(fecharCarregando, 2400);
}

abertura();

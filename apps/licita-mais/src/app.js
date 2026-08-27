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

   A renderização é assíncrona porque as páginas buscam dados.
   Duas consequências que o código trata explicitamente: o
   conteúdo aparece como esqueleto enquanto carrega, e uma
   navegação disparada no meio de outra descarta a anterior —
   sem isso, a resposta lenta da tela que o usuário já
   abandonou sobrescreveria a que ele está vendo.
   ========================================================= */

import { html, raw, $, $$, ao, aoClicarEm, elemento } from './lib/dom.js';
import { icone } from './lib/icons.js';
import { registrar, iniciar, aoMudarRota, consultaAtual, irPara, caminhoAtual } from './lib/router.js';
import { marcaSidebar } from './ui/brand.js';
import { avatar, botaoIcone, abrirDropdown, fecharDropdown, itemDropdown, separadorDropdown, toast, abrirGaveta, fecharGaveta, abrirModal, skeletonCartao } from './ui/primitives.js';
import { itemNotificacao, corpoExplicacao } from './ui/domain.js';
import { obter, aplicarTema, assinar, totalFavoritos, alternarTema, marcarTudoLido, ehFavorito } from './lib/store.js';
import { iniciais } from './lib/format.js';
import { mostrarCarregando, fecharCarregando } from './ui/carregando.js';
import { resolverFonte, emDemonstracao } from './lib/config.js';
import { restaurarSessao, usuarioLogado, estaAutenticado, sairDaConta, guardarDestino } from './lib/sessao.js';
import { alternarFavoritoRemoto, listarNotificacoes, obterOportunidade } from './dados/index.js';

/* ---------- Páginas ---------- */

import landing from './pages/landing.js';
import login from './pages/login.js';
import cadastro from './pages/cadastro.js';
import confirmar from './pages/confirmar.js';
import esqueciSenha from './pages/esqueci-senha.js';
import redefinir from './pages/redefinir.js';
import onboarding from './pages/onboarding.js';
import painel from './pages/painel.js';
import oportunidades from './pages/oportunidades.js';
import detalhe from './pages/detalhe.js';
import buscaPagina from './pages/busca.js';
import recomendacoes from './pages/recomendacoes.js';
import monitoramentosPagina from './pages/monitoramentos.js';
import favoritos from './pages/favoritos.js';
import participacoesPagina from './pages/participacoes.js';
import relatoriosPagina from './pages/relatorios.js';
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

/* ---------- Identidade em tela ----------
   Nome e empresa saem da sessão. Enquanto ela não existe (a
   restauração ainda não terminou), o shell mostra reticências
   em vez de um nome fictício — que é o que apareceria se o
   fallback fosse o usuário de demonstração. */

const nomeEmTela = () => usuarioLogado()?.nome ?? '—';
const emailEmTela = () => usuarioLogado()?.email ?? '';

const empresaEmTela = () => {
  const conta = usuarioLogado()?.empresa;
  return conta?.nomeFantasia || conta?.razaoSocial || 'Sua empresa';
};

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
        ${raw(avatar({ iniciais: iniciais(nomeEmTela()) }))}
        <span class="conta-texto">
          <span class="conta-nome">${nomeEmTela()}</span>
          <span class="conta-empresa">${empresaEmTela()}</span>
        </span>
        <span class="conta-seta" style="color: rgba(255,255,255,.4)">${raw(icone('chevron_cima'))}</span>
      </button>
    </div>
  </aside>`;
}

function header(rota) {
  const trilha = rota?.trilha ?? [];

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
      ${raw(botaoIcone({ nome: 'sino', rotulo: 'Notificações', acao: 'notificacoes' }))}
      ${raw(botaoIcone({ nome: 'ajuda', rotulo: 'Ajuda', acao: 'ajuda' }))}
      <div class="dropdown">
        <button class="btn-icone" data-acao="menu-usuario" aria-label="Menu do usuário"
          aria-haspopup="menu" aria-expanded="false" style="width: auto; padding: 0 4px">
          ${raw(avatar({ iniciais: iniciais(nomeEmTela()), tamanho: 'sm' }))}
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

/**
 * Faixa de demonstração. Aparece só quando a API não respondeu,
 * e é deliberadamente impossível de não ver: o pior resultado
 * possível deste produto é alguém tomar decisão de negócio
 * sobre dado fictício achando que é edital de verdade.
 */
const faixaDemo = () => (emDemonstracao()
  ? `<div class="faixa-demo" role="status">
      ${icone('info')}
      <span><b>Modo demonstração.</b> A API não está respondendo neste ambiente —
      os dados abaixo são fictícios e não correspondem a licitações reais.</span>
    </div>`
  : '');

/* ---------- Registro de rotas ---------- */

registrar('/', { pagina: landing, shell: false, titulo: 'LICITA+' });
registrar('/entrar', { pagina: login, shell: false, titulo: 'Entrar' });
registrar('/criar-conta', { pagina: cadastro, shell: false, titulo: 'Criar conta' });
registrar('/confirmar', { pagina: confirmar, shell: false, titulo: 'Confirmar e-mail' });
registrar('/esqueci-senha', { pagina: esqueciSenha, shell: false, titulo: 'Recuperar acesso' });
registrar('/redefinir', { pagina: redefinir, shell: false, titulo: 'Nova senha' });
registrar('/onboarding', { pagina: onboarding, shell: false, titulo: 'Configurar perfil', protegida: true });

const COM_SHELL = [
  ['/painel', painel], ['/oportunidades', oportunidades], ['/oportunidade/:id', detalhe],
  ['/buscar', buscaPagina], ['/recomendacoes', recomendacoes], ['/monitoramentos', monitoramentosPagina],
  ['/favoritos', favoritos], ['/participacoes', participacoesPagina], ['/relatorios', relatoriosPagina],
  ['/empresa', empresaPagina], ['/configuracoes', configuracoes],
];

for (const [caminho, pagina] of COM_SHELL) {
  registrar(caminho, {
    pagina,
    shell: true,
    protegida: true,
    titulo: pagina.titulo,
    trilha: pagina.trilha,
    nav: pagina.nav,
  });
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

/**
 * Cada renderização recebe um número. Se ele mudou quando o
 * `await` da página volta, o usuário já navegou para outro
 * lugar — e escrever no DOM agora sobrescreveria a tela nova
 * com a antiga.
 */
let geracao = 0;

function erroDePagina(erro) {
  return `<div class="vazio">
    <span class="vazio-arte">${icone('alerta')}</span>
    <h3>Não foi possível carregar</h3>
    <p>${erro?.message ?? 'Erro inesperado.'}</p>
    <button class="btn -secundario" data-acao="recarregar" style="margin-top: var(--e-4)">
      Tentar de novo
    </button>
  </div>`;
}

/** Desenha o conteúdo de uma página, com esqueleto durante a espera. */
async function desenhar(alvo, pagina, ctx, minha) {
  alvo.innerHTML = pagina.esqueleto?.(ctx) ?? skeletonCartao(3);

  let marcacao;
  try {
    marcacao = await pagina.render(ctx);
  } catch (erro) {
    if (minha !== geracao) return;
    alvo.innerHTML = erroDePagina(erro);
    return;
  }

  if (minha !== geracao) return;

  alvo.innerHTML = marcacao;
  limparPagina = pagina.ativar?.(alvo, ctx) ?? null;
}

async function renderizar(achado) {
  if (!achado) return;
  const { rota, params } = achado;

  // Guarda de rota. O menu esconder o item é conveniência; o
  // que impede a tela de abrir é isto.
  if (rota.protegida && !estaAutenticado()) {
    guardarDestino(caminhoAtual());
    irPara('/entrar', { substituir: true });
    return;
  }

  const pagina = rota.pagina;
  const ctx = { params, consulta: consultaAtual() };
  const minha = ++geracao;

  if (typeof limparPagina === 'function') limparPagina();
  limparPagina = null;
  fecharDropdown();

  document.title = `${rota.titulo ?? 'LICITA+'} · LICITA+`;
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (rota.shell === false) {
    await desenhar(raiz, pagina, ctx, minha);
    return;
  }

  raiz.innerHTML = html`
    <div class="shell">
      ${raw(sidebar(rota.nav))}
      <div class="principal">
        ${raw(header(rota))}
        ${raw(faixaDemo())}
        <main class="conteudo aparece" id="conteudo" tabindex="-1"></main>
      </div>
    </div>
    <div class="sidebar-fundo" id="sidebar-fundo"></div>
    ${raw(barraInferior(rota.nav))}`;

  ligarShell();
  await desenhar($('#conteudo', raiz), pagina, ctx, minha);
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
          <div style="font-weight: var(--p-semi); font-size: var(--t-corpo-sm)">${nomeEmTela()}</div>
          <div class="suave" style="font-size: var(--t-micro)">${emailEmTela()}</div>
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
  aoClicarEm(document.body, '[data-acao="favoritar"]', async (evento, alvo) => {
    evento.preventDefault();
    evento.stopPropagation();

    const id = alvo.dataset.id;
    if (alvo.dataset.emCurso === '1') return;
    alvo.dataset.emCurso = '1';

    // O ícone acende antes da resposta e é desfeito se a
    // gravação falhar — ver o comentário em dados/index.js.
    const otimista = !ehFavorito(id);
    pintarFavorito(alvo, otimista);

    try {
      const agora = await alternarFavoritoRemoto(id);
      pintarFavorito(alvo, agora);
      toast(agora ? 'Oportunidade adicionada aos favoritos.' : 'Oportunidade removida dos favoritos.', {
        variante: agora ? 'sucesso' : 'info',
      });
    } catch (erro) {
      pintarFavorito(alvo, ehFavorito(id));
      toast('Não foi possível salvar o favorito', { variante: 'erro', sub: erro.message });
    } finally {
      delete alvo.dataset.emCurso;
    }
  });

  aoClicarEm(document.body, '[data-acao="explicar-score"]', async (evento) => {
    const cartao = evento.target.closest('[data-id]');
    if (!cartao) return;

    try {
      const licitacao = await obterOportunidade(cartao.dataset.id);
      abrirModal({
        titulo: 'Por que recomendamos esta oportunidade?',
        subtitulo: licitacao.objeto,
        corpo: corpoExplicacao(licitacao),
        rodape: `<a class="btn -secundario" href="#/oportunidade/${licitacao.id}"
                   data-acao="fechar-modal">Ver oportunidade</a>
                 <button class="btn -primario" data-acao="fechar-modal">Entendi</button>`,
      });
    } catch (erro) {
      toast('Não foi possível abrir a explicação', { variante: 'erro', sub: erro.message });
    }
  });

  aoClicarEm(document.body, '[data-acao="notificacoes"]', async () => {
    abrirGaveta({
      titulo: 'Notificações',
      corpo: '<div class="pilha" id="lista-notificacoes">' + skeletonCartao(3) + '</div>',
      rodape: '<button class="btn -fantasma" data-acao="marcar-lidas">Marcar todas como lidas</button>',
    });

    const lista = await listarNotificacoes().catch(() => []);
    const destino = $('#lista-notificacoes');
    if (!destino) return;

    const lidas = obter().notificacoesLidas;
    destino.outerHTML = lista.length
      ? `<div style="margin: calc(var(--e-5) * -1)">
          ${lista.map((n) => itemNotificacao(n, { nova: !lidas.includes(n.id) })).join('')}
        </div>`
      : `<div class="vazio" style="padding: var(--e-8) 0">
          <span class="vazio-arte">${icone('sino')}</span>
          <h3>Nada por aqui</h3>
          <p>Quando um prazo apertar ou um monitoramento trouxer novidade, avisamos aqui.</p>
        </div>`;
  });

  aoClicarEm(document.body, '[data-acao="marcar-lidas"]', () => {
    marcarTudoLido($$('.notif').map((el) => el.dataset.id));
    $$('.notif.-nova').forEach((el) => el.classList.remove('-nova'));
    $$('.btn-icone-ponto').forEach((el) => el.remove());
    toast('Notificações marcadas como lidas', { variante: 'info' });
  });

  aoClicarEm(document.body, '[data-acao="ajuda"]', () => {
    abrirModal({
      titulo: 'Como o LICITA+ funciona',
      corpo: `<div class="pilha">
        <p style="line-height: 1.7">
          O LICITA+ acompanha as publicações do Portal Nacional de Contratações Públicas,
          compara cada uma com o perfil da sua empresa e atribui um
          <b>percentual de compatibilidade</b> — sempre com a conta aberta, critério por
          critério.
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

  aoClicarEm(document.body, '[data-acao="recarregar"]', () => window.location.reload());

  aoClicarEm(document.body, '[data-acao="tema"]', () => {
    fecharDropdown();
    const novo = alternarTema();
    toast(novo === 'escuro' ? 'Modo escuro ativado' : 'Modo claro ativado', { variante: 'info' });
  });

  aoClicarEm(document.body, '[data-acao="sair"]', async () => {
    fecharDropdown();
    await sairDaConta();
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

function pintarFavorito(alvo, ligado) {
  alvo.classList.toggle('-ativo', ligado);
  alvo.setAttribute('aria-pressed', String(ligado));
  alvo.setAttribute('aria-label', ligado ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
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

/* ---------- Abertura ---------- */

/**
 * A marca se monta uma vez, no primeiro carregamento da sessão.
 * Nas navegações seguintes ela não reaparece — cortina que volta
 * a cada clique deixa de ser identidade e vira obstáculo.
 */
function abertura() {
  try {
    if (sessionStorage.getItem('licita-mais:aberto')) return false;
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

  return true;
}

/* ---------- Início ----------
   A ordem importa: resolver a fonte antes de restaurar a sessão
   (a restauração precisa saber se há API), e restaurar a sessão
   antes do primeiro despacho (a guarda de rota precisa saber se
   há usuário). Despachar antes disso mandaria para o login quem
   já estava logado, a cada F5. */

async function subir() {
  aplicarTema();
  ligarAcoesGlobais();
  aoMudarRota(renderizar);

  const cortina = abertura();

  await resolverFonte();
  await restaurarSessao().catch(() => null);

  iniciar('/');

  if (cortina) setTimeout(fecharCarregando, 1400);
}

subir();

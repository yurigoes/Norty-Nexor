/* =========================================================
   LICITA+ — Primitivos do Design System
   ---------------------------------------------------------
   Cada função devolve marcação; os que têm comportamento
   (modal, gaveta, toast, abas, dropdown) devolvem também um
   controlador com `fechar()`.

   Regra do conjunto: nenhum primitivo escreve cor literal.
   Tudo sai de token, e é por isso que o modo escuro liga sem
   tocar em nenhum arquivo desta pasta.
   ========================================================= */

import { html, raw, elemento, $, $$, ao, prenderFoco } from '../lib/dom.js';
import { icone } from '../lib/icons.js';

/* ---------- Botão ---------- */

export function botao({
  rotulo, variante = 'primario', tamanho = '', icone: nomeIcone,
  iconeDireita, tipo = 'button', acao = '', atributos = '', cheio = false,
  carregando = false, desabilitado = false,
}) {
  const classes = ['btn', `-${variante}`, tamanho && `-${tamanho}`, cheio && '-cheio', carregando && '-carregando']
    .filter(Boolean)
    .join(' ');

  return html`<button type="${tipo}" class="${classes}" ${raw(acao ? `data-acao="${acao}"` : '')}
    ${raw(desabilitado ? 'disabled' : '')} ${raw(atributos)}>
    ${raw(nomeIcone ? icone(nomeIcone) : '')}
    <span>${rotulo}</span>
    ${raw(iconeDireita ? icone(iconeDireita) : '')}
  </button>`;
}

export function botaoIcone({ nome, rotulo, acao = '', variante = '', atributos = '', ponto = false }) {
  return html`<button type="button" class="btn-icone ${variante}" aria-label="${rotulo}"
    ${raw(acao ? `data-acao="${acao}"` : '')} ${raw(atributos)}>
    ${raw(icone(nome))}
    ${raw(ponto ? '<span class="btn-icone-ponto"></span>' : '')}
  </button>`;
}

/* ---------- Campos ---------- */

export function campo({ rotulo, id, tipo = 'text', valor = '', placeholder = '', ajuda, erro, atributos = '' }) {
  return html`<label class="campo" for="${id}">
    <span class="campo-rotulo">${rotulo}</span>
    <input class="input ${erro ? '-invalido' : ''}" id="${id}" name="${id}" type="${tipo}"
      value="${valor}" placeholder="${placeholder}" ${raw(atributos)}>
    ${raw(ajuda ? `<span class="campo-ajuda">${ajuda}</span>` : '')}
    ${raw(erro ? `<span class="campo-erro">${erro}</span>` : '')}
  </label>`;
}

export function seletor({ rotulo, id, opcoes, valor = '', atributos = '' }) {
  const corpo = opcoes
    .map((o) => {
      const v = typeof o === 'string' ? o : o.valor;
      const t = typeof o === 'string' ? o : o.rotulo;
      return `<option value="${v}" ${v === valor ? 'selected' : ''}>${t}</option>`;
    })
    .join('');

  return html`<label class="campo" for="${id}">
    ${raw(rotulo ? `<span class="campo-rotulo">${rotulo}</span>` : '')}
    <select class="select" id="${id}" name="${id}" ${raw(atributos)}>${raw(corpo)}</select>
  </label>`;
}

export function busca({ id, placeholder = 'Buscar…', valor = '', grande = false, atributos = '' }) {
  return html`<div class="busca ${grande ? '-grande' : ''} ${valor ? '-preenchida' : ''}" data-busca>
    ${raw(icone('busca', { classe: 'busca-icone' }))}
    <input class="input" type="search" id="${id}" name="${id}" value="${valor}"
      placeholder="${placeholder}" autocomplete="off" ${raw(atributos)}>
    <button type="button" class="busca-limpar" data-acao="limpar-busca" aria-label="Limpar busca">
      ${raw(icone('fechar'))}
    </button>
  </div>`;
}

export function switchCampo({ id, rotulo, ligado = false, acao = '' }) {
  return html`<label class="switch" for="${id}">
    <input type="checkbox" id="${id}" ${raw(ligado ? 'checked' : '')} ${raw(acao ? `data-acao="${acao}"` : '')}>
    <span class="switch-trilho"><span class="switch-bolinha"></span></span>
    <span>${rotulo}</span>
  </label>`;
}

export function caixaSelecao({ id, rotulo, marcado = false, bloco = false, acao = '', valor = '' }) {
  return html`<label class="check ${bloco ? '-bloco' : ''}" for="${id}">
    <input type="checkbox" id="${id}" value="${valor}" ${raw(marcado ? 'checked' : '')}
      ${raw(acao ? `data-acao="${acao}"` : '')}>
    <span>${rotulo}</span>
  </label>`;
}

/* ---------- Selo ---------- */

export function selo({ texto, variante = 'neutro', nomeIcone }) {
  return html`<span class="selo -${variante}">${raw(nomeIcone ? icone(nomeIcone) : '')}${texto}</span>`;
}

/* ---------- Avatar ---------- */

export function avatar({ iniciais, tamanho = '' }) {
  return html`<span class="avatar ${tamanho && `-${tamanho}`}" aria-hidden="true">${iniciais}</span>`;
}

/* ---------- Progresso ---------- */

export function progresso({ valor, verde = false, rotuloAcessivel = 'Progresso' }) {
  return html`<div class="progresso-trilho" role="progressbar" aria-valuenow="${valor}"
    aria-valuemin="0" aria-valuemax="100" aria-label="${rotuloAcessivel}">
    <span class="progresso-fill ${verde ? '-verde' : ''}" style="width: ${valor}%"></span>
  </div>`;
}

/* ---------- Estado vazio ---------- */

export function vazio({ nomeIcone = 'busca', titulo, texto, acao = '' }) {
  return html`<div class="vazio">
    <span class="vazio-arte">${raw(icone(nomeIcone))}</span>
    <h3>${titulo}</h3>
    <p>${texto}</p>
    ${raw(acao)}
  </div>`;
}

/* ---------- Skeleton ---------- */

export function skeletonCartao(quantidade = 3) {
  return Array.from({ length: quantidade })
    .map(
      () => `<div class="card"><div class="card-corpo pilha">
        <div class="sk sk-titulo"></div>
        <div class="sk sk-linha" style="width: 40%"></div>
        <div class="sk sk-linha" style="width: 88%"></div>
        <div class="sk sk-linha" style="width: 62%"></div>
      </div></div>`,
    )
    .join('');
}

export function skeletonIndicadores(quantidade = 4) {
  return Array.from({ length: quantidade })
    .map(() => '<div class="sk sk-bloco"></div>')
    .join('');
}

/* ---------- Alerta ---------- */

export function alerta({ texto, variante = 'info', nomeIcone = 'info' }) {
  return html`<div class="alerta-bloco -${variante}">${raw(icone(nomeIcone))}<div>${raw(texto)}</div></div>`;
}

/* ---------- Abas ---------- */

export function abas({ itens, ativa }) {
  return html`<div class="abas" role="tablist">
    ${raw(
      itens
        .map(
          (item) => `<button class="aba" role="tab" data-aba="${item.chave}"
            aria-selected="${item.chave === ativa}">${item.rotulo}${
              item.contagem !== undefined ? ` (${item.contagem})` : ''
            }</button>`,
        )
        .join(''),
    )}
  </div>`;
}

/** Liga a troca de aba. `aoTrocar` recebe a chave selecionada. */
export function ativarAbas(raiz, aoTrocar) {
  const lista = $$('.aba', raiz);
  lista.forEach((aba) =>
    ao(aba, 'click', () => {
      lista.forEach((outra) => outra.setAttribute('aria-selected', String(outra === aba)));
      aoTrocar(aba.dataset.aba);
    }),
  );
}

/* ---------- Modal ---------- */

let modalAberto = null;

export function abrirModal({ titulo, subtitulo, corpo, rodape, largo = false }) {
  fecharModal();

  const fundo = elemento(html`<div class="modal-fundo" role="dialog" aria-modal="true"
    aria-label="${titulo}">
    <div class="modal ${largo ? '-lg' : ''}">
      <div class="modal-topo">
        <div>
          <h2 class="card-titulo">${titulo}</h2>
          ${raw(subtitulo ? `<p class="card-sub">${subtitulo}</p>` : '')}
        </div>
        ${raw(botaoIcone({ nome: 'fechar', rotulo: 'Fechar', acao: 'fechar-modal' }))}
      </div>
      <div class="modal-corpo">${raw(corpo)}</div>
      ${raw(rodape ? `<div class="modal-rodape">${rodape}</div>` : '')}
    </div>
  </div>`);

  document.body.appendChild(fundo);
  document.body.style.overflow = 'hidden';

  const soltarFoco = prenderFoco(fundo);

  // Clique no fundo fecha; clique dentro do cartão, não.
  ao(fundo, 'click', (evento) => {
    if (evento.target === fundo || evento.target.closest('[data-acao="fechar-modal"]')) fecharModal();
  });

  const soltarTecla = ao(document, 'keydown', (evento) => {
    if (evento.key === 'Escape') fecharModal();
  });

  modalAberto = { fundo, limpar: () => { soltarFoco(); soltarTecla(); } };
  return { fechar: fecharModal, elemento: fundo };
}

export function fecharModal() {
  if (!modalAberto) return;
  modalAberto.limpar();
  modalAberto.fundo.remove();
  document.body.style.overflow = '';
  modalAberto = null;
}

/* ---------- Gaveta ---------- */

let gavetaAberta = null;

export function abrirGaveta({ titulo, corpo, rodape }) {
  fecharGaveta();

  const fundo = elemento('<div class="gaveta-fundo"></div>');
  const gaveta = elemento(html`<aside class="gaveta" role="dialog" aria-modal="true" aria-label="${titulo}">
    <div class="modal-topo">
      <h2 class="card-titulo">${titulo}</h2>
      ${raw(botaoIcone({ nome: 'fechar', rotulo: 'Fechar', acao: 'fechar-gaveta' }))}
    </div>
    <div class="modal-corpo">${raw(corpo)}</div>
    ${raw(rodape ? `<div class="modal-rodape">${rodape}</div>` : '')}
  </aside>`);

  document.body.append(fundo, gaveta);
  document.body.style.overflow = 'hidden';

  const soltarFoco = prenderFoco(gaveta);
  ao(fundo, 'click', fecharGaveta);
  ao(gaveta, 'click', (evento) => {
    if (evento.target.closest('[data-acao="fechar-gaveta"]')) fecharGaveta();
  });
  const soltarTecla = ao(document, 'keydown', (e) => e.key === 'Escape' && fecharGaveta());

  gavetaAberta = { fundo, gaveta, limpar: () => { soltarFoco(); soltarTecla(); } };
  return { fechar: fecharGaveta, elemento: gaveta };
}

export function fecharGaveta() {
  if (!gavetaAberta) return;
  gavetaAberta.limpar();
  gavetaAberta.fundo.remove();
  gavetaAberta.gaveta.remove();
  document.body.style.overflow = '';
  gavetaAberta = null;
}

/* ---------- Toast ---------- */

const ICONE_TOAST = { sucesso: 'check_circulo', erro: 'alerta', aviso: 'alerta', info: 'info' };

export function toast(texto, { variante = 'sucesso', sub, duracao = 3600 } = {}) {
  let area = $('.toast-area');
  if (!area) {
    area = elemento('<div class="toast-area" role="status" aria-live="polite"></div>');
    document.body.appendChild(area);
  }

  const el = elemento(html`<div class="toast -${variante}">
    ${raw(icone(ICONE_TOAST[variante] ?? 'info'))}
    <div>
      <div class="toast-texto">${texto}</div>
      ${raw(sub ? `<div class="toast-sub">${sub}</div>` : '')}
    </div>
  </div>`);

  area.appendChild(el);

  setTimeout(() => {
    el.classList.add('-saindo');
    setTimeout(() => el.remove(), 240);
  }, duracao);

  return el;
}

/* ---------- Dropdown ---------- */

let dropdownAberto = null;

/** Abre um menu ancorado ao gatilho. Fecha ao clicar fora ou no Escape. */
export function abrirDropdown(gatilho, itensHtml, { alinhar = 'direita' } = {}) {
  fecharDropdown();

  const container = gatilho.closest('.dropdown') ?? gatilho.parentElement;
  container.classList.add('dropdown');

  const menu = elemento(`<div class="dropdown-menu ${alinhar === 'esquerda' ? '-esquerda' : ''}"
    role="menu">${itensHtml}</div>`);
  container.appendChild(menu);
  gatilho.setAttribute('aria-expanded', 'true');

  const foraDoMenu = (evento) => {
    if (!menu.contains(evento.target) && !gatilho.contains(evento.target)) fecharDropdown();
  };

  // O listener entra no próximo tique: sem isso, o mesmo clique
  // que abriu o menu já o fecharia.
  setTimeout(() => document.addEventListener('click', foraDoMenu), 0);
  const soltarTecla = ao(document, 'keydown', (e) => e.key === 'Escape' && fecharDropdown());

  dropdownAberto = {
    menu, gatilho,
    limpar: () => { document.removeEventListener('click', foraDoMenu); soltarTecla(); },
  };
  return menu;
}

export function fecharDropdown() {
  if (!dropdownAberto) return;
  dropdownAberto.limpar();
  dropdownAberto.menu.remove();
  dropdownAberto.gatilho.setAttribute('aria-expanded', 'false');
  dropdownAberto = null;
}

export function itemDropdown({ rotulo, nomeIcone, acao = '', variante = '', href }) {
  const conteudo = `${nomeIcone ? icone(nomeIcone) : ''}<span>${rotulo}</span>`;
  return href
    ? `<a class="dropdown-item ${variante}" role="menuitem" href="${href}">${conteudo}</a>`
    : `<button class="dropdown-item ${variante}" role="menuitem" data-acao="${acao}">${conteudo}</button>`;
}

export const separadorDropdown = () => '<div class="dropdown-sep"></div>';

/* ---------- Tooltip ---------- */

export function dica(conteudo, texto) {
  return html`<span class="tip">${raw(conteudo)}<span class="tip-balao" role="tooltip">${texto}</span></span>`;
}

/* ---------- Paginação ---------- */

export function paginacao({ pagina, totalPaginas, totalItens, porPagina }) {
  if (totalPaginas <= 1) {
    return html`<div class="paginacao"><span class="suave" style="font-size: var(--t-micro)">
      ${totalItens} ${totalItens === 1 ? 'resultado' : 'resultados'}
    </span></div>`;
  }

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, totalItens);

  // Janela de 5 páginas em volta da atual, sempre dentro dos limites.
  const primeira = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const numeros = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => primeira + i);

  return html`<div class="paginacao">
    <span class="suave" style="font-size: var(--t-micro)">
      ${inicio}–${fim} de ${totalItens}
    </span>
    <div class="paginacao-btns">
      <button class="paginacao-num" data-acao="pagina" data-pagina="${pagina - 1}"
        ${raw(pagina === 1 ? 'disabled' : '')} aria-label="Página anterior">
        ${raw(icone('chevron_esq'))}
      </button>
      ${raw(
        numeros
          .map(
            (n) => `<button class="paginacao-num" data-acao="pagina" data-pagina="${n}"
              ${n === pagina ? 'aria-current="page"' : ''}>${n}</button>`,
          )
          .join(''),
      )}
      <button class="paginacao-num" data-acao="pagina" data-pagina="${pagina + 1}"
        ${raw(pagina === totalPaginas ? 'disabled' : '')} aria-label="Próxima página">
        ${raw(icone('chevron_dir'))}
      </button>
    </div>
  </div>`;
}

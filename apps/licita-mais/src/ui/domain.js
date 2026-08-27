/* =========================================================
   LICITA+ — Componentes de domínio
   ---------------------------------------------------------
   O que é específico de licitação: score de compatibilidade,
   cartão de oportunidade, indicador, notificação.

   O princípio que atravessa todos: **o usuário não deveria
   precisar abrir a licitação para saber se ela interessa.**
   Por isso o cartão já responde as cinco perguntas — o que é,
   por que interessa, quanto vale, quando termina, o que fazer.
   ========================================================= */

import { html, raw } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, moedaCurta, data, prazoTexto, prazoUrgente, faixaScore, tempoRelativo } from '../lib/format.js';
import { ehFavorito } from '../lib/store.js';

/* ---------- Score de compatibilidade ----------
   Nunca comunica a faixa só pela cor: o número e a palavra
   ("Alta") acompanham sempre. Quem não distingue verde de
   amarelo continua lendo o resultado. */

export function scoreAnel({ valor, tamanho = 56, comTexto = true, interativo = false }) {
  const faixa = faixaScore(valor);
  const raio = (tamanho - 7) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const preenchido = circunferencia * (valor / 100);

  const anel = html`<span class="score-anel" style="width: ${tamanho}px; height: ${tamanho}px">
    <svg width="${tamanho}" height="${tamanho}" aria-hidden="true">
      <circle class="score-anel-trilho" cx="${tamanho / 2}" cy="${tamanho / 2}" r="${raio}"
        fill="none" stroke-width="5"/>
      <circle class="score-anel-valor" cx="${tamanho / 2}" cy="${tamanho / 2}" r="${raio}"
        fill="none" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${circunferencia}" stroke-dashoffset="${circunferencia - preenchido}"/>
    </svg>
    <span class="score-anel-num">${valor}</span>
  </span>`;

  return html`<span class="score -${faixa.chave}" ${raw(interativo ? 'data-acao="explicar-score"' : '')}
    role="img" aria-label="${valor} por cento compatível — ${faixa.rotulo}">
    ${raw(anel)}
    ${raw(
      comTexto
        ? `<span class="score-texto">
             <span class="score-faixa">${faixa.rotulo}</span>
             <span class="score-legenda">compatibilidade</span>
           </span>`
        : '',
    )}
  </span>`;
}

/** Versão em pílula para tabela e lista densa. */
export function scorePill(valor) {
  const faixa = faixaScore(valor);
  return html`<span class="score-pill -${faixa.chave}" title="${faixa.descricao}">
    <span class="score-pill-ponto"></span>${valor}% ${faixa.rotulo}
  </span>`;
}

/* ---------- Lista de razões ---------- */

export function listaRazoes(razoes) {
  return html`<div class="razoes">
    ${raw(
      razoes
        .map(
          (r) => `<div class="razao ${r.ok ? '-ok' : '-nao'}">
            <span class="razao-marca">${icone(r.ok ? 'check' : 'fechar')}</span>
            <div>
              <div class="razao-titulo">${r.titulo}</div>
              <div class="razao-detalhe">${r.detalhe}</div>
            </div>
            <span class="rotulo" style="margin-left: auto; white-space: nowrap">
              ${r.ok ? `+${r.peso}` : '0'} pts
            </span>
          </div>`,
        )
        .join(''),
    )}
  </div>`;
}

/**
 * Corpo do modal "Por que recomendamos esta oportunidade?".
 * Mostra a conta inteira: quanto cada critério vale e quanto
 * entrou. O score deixa de ser opaco e vira argumento.
 */
export function corpoExplicacao(licitacao) {
  const faixa = faixaScore(licitacao.compatibilidade);
  const atendidos = licitacao.razoes.filter((r) => r.ok).length;

  return html`<div class="pilha">
    <div class="linha" style="gap: var(--e-5); align-items: center">
      ${raw(scoreAnel({ valor: licitacao.compatibilidade, tamanho: 84, comTexto: false }))}
      <div>
        <div style="font-size: var(--t-h4); font-weight: var(--p-bold); color: var(--texto-forte)">
          Compatibilidade ${faixa.rotulo.toLowerCase()}
        </div>
        <p class="suave" style="font-size: var(--t-corpo-sm); margin-top: 2px">
          ${faixa.descricao}. ${atendidos} de ${licitacao.razoes.length} critérios atendidos.
        </p>
      </div>
    </div>

    ${raw(listaRazoes(licitacao.razoes))}

    <p class="tenue" style="font-size: var(--t-micro); line-height: 1.55">
      O percentual compara o edital com o perfil da sua empresa. Ele orienta a triagem —
      não substitui a leitura do edital, que é onde estão as exigências de habilitação.
    </p>
  </div>`;
}

/* ---------- Cartão de oportunidade ---------- */

export function cartaoOportunidade(licitacao, { compacto = false } = {}) {
  const favorito = ehFavorito(licitacao.id);
  const urgente = prazoUrgente(licitacao.encerramento);

  return html`<article class="oport" data-id="${licitacao.id}">
    <div>
      <h3 class="oport-titulo">
        <a href="#/oportunidade/${licitacao.id}">${licitacao.objeto}</a>
      </h3>
      <p class="oport-orgao">${licitacao.orgao.nome}</p>

      <div class="oport-meta">
        <span class="oport-meta-item">${raw(icone('pin'))}${licitacao.orgao.cidade} — ${licitacao.orgao.uf}</span>
        <span class="oport-meta-item">${raw(icone('martelo'))}${licitacao.modalidade}</span>
        <span class="oport-meta-item">${raw(icone('documento'))}Nº ${licitacao.numero}</span>
        <span class="oport-meta-item oport-prazo ${urgente ? '-urgente' : ''}">
          ${raw(icone('relogio'))}
          Encerra ${data(licitacao.encerramento)} · <b>${prazoTexto(licitacao.encerramento)}</b>
        </span>
      </div>

      ${raw(
        compacto
          ? ''
          : `<div class="linha" style="gap: var(--e-2); flex-wrap: wrap">
               <span class="selo -neutro">${licitacao.categoria}</span>
               ${licitacao.srp ? '<span class="selo -aviso">Registro de preços</span>' : ''}
               <span class="selo -contorno">${licitacao.plataforma}</span>
             </div>`,
      )}
    </div>

    <div class="oport-lado">
      ${raw(scoreAnel({ valor: licitacao.compatibilidade, tamanho: 54, interativo: true }))}

      <div class="oport-valor">
        <div class="oport-valor-num">${moedaCurta(licitacao.valor)}</div>
        <div class="oport-valor-rot">valor estimado</div>
      </div>

      <div class="oport-acoes">
        <button type="button" class="btn-icone -borda ${favorito ? '-ativo' : ''}"
          data-acao="favoritar" data-id="${licitacao.id}"
          aria-pressed="${favorito}"
          aria-label="${favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
          ${raw(icone(favorito ? 'coracao' : 'coracao'))}
        </button>
        <a class="btn -secundario -sm" href="#/oportunidade/${licitacao.id}">
          Ver oportunidade ${raw(icone('chevron_dir'))}
        </a>
      </div>
    </div>
  </article>`;
}

/* ---------- Linha de tabela ---------- */

export function linhaOportunidade(licitacao) {
  const urgente = prazoUrgente(licitacao.encerramento);
  return html`<tr data-id="${licitacao.id}">
    <td>
      <a class="tabela-titulo-celula" href="#/oportunidade/${licitacao.id}">${licitacao.objeto}</a>
      <div class="suave" style="font-size: var(--t-micro); margin-top: 2px">
        ${licitacao.orgao.nome} · ${licitacao.orgao.cidade}/${licitacao.orgao.uf}
      </div>
    </td>
    <td style="white-space: nowrap">${licitacao.modalidade}</td>
    <td class="-num" style="white-space: nowrap">${moeda(licitacao.valor)}</td>
    <td style="white-space: nowrap" class="${urgente ? 'oport-prazo -urgente' : ''}">
      ${data(licitacao.encerramento)}
      <div style="font-size: var(--t-micro)" class="${urgente ? '' : 'suave'}">
        ${prazoTexto(licitacao.encerramento)}
      </div>
    </td>
    <td>${raw(scorePill(licitacao.compatibilidade))}</td>
    <td>
      <a class="btn -fantasma -sm" href="#/oportunidade/${licitacao.id}" aria-label="Abrir ${licitacao.objeto}">
        ${raw(icone('chevron_dir'))}
      </a>
    </td>
  </tr>`;
}

/* ---------- Cartão de indicador ---------- */

export function cartaoIndicador({ rotulo, valor, delta, periodo = 'este mês', nomeIcone, cor = 'azul', link }) {
  const sobe = (delta ?? 0) >= 0;

  return html`<div class="stat">
    <div class="stat-topo">
      <span class="stat-rotulo">${rotulo}</span>
      <span class="stat-icone -${cor}">${raw(icone(nomeIcone))}</span>
    </div>
    <div class="stat-num">${valor}</div>
    <div class="stat-rodape">
      ${raw(
        delta !== undefined
          ? `<span class="stat-delta ${sobe ? '-sobe' : '-desce'}">
               ${icone(sobe ? 'subindo' : 'descendo')}${sobe ? '+' : ''}${delta}%
             </span><span class="stat-periodo">${periodo}</span>`
          : link
            ? `<a href="${link.href}" style="font-weight: var(--p-semi); font-size: var(--t-micro)">
                 ${link.rotulo} →</a>`
            : `<span class="stat-periodo">${periodo}</span>`,
      )}
    </div>
  </div>`;
}

/* ---------- Notificação ---------- */

export function itemNotificacao(notificacao, { nova = false } = {}) {
  const variante = { sucesso: 'sucesso', aviso: 'aviso', info: 'info' }[notificacao.tipo] ?? 'info';

  return html`<a class="notif ${nova ? '-nova' : ''}" href="${notificacao.link}"
    data-acao="abrir-notificacao" data-id="${notificacao.id}">
    <span class="notif-marca -${variante}">${raw(icone(notificacao.icone))}</span>
    <div style="min-width: 0">
      <div class="notif-titulo">${notificacao.titulo}</div>
      <div class="notif-texto">${notificacao.texto}</div>
      <div class="notif-quando">${tempoRelativo(notificacao.quando)}</div>
    </div>
  </a>`;
}

/* ---------- Cabeçalho de página ---------- */

export function cabecalhoPagina({ titulo, subtitulo, acoes = '' }) {
  return html`<div class="cabecalho-secao" style="margin-bottom: var(--e-6)">
    <div>
      <h2>${titulo}</h2>
      ${raw(subtitulo ? `<p>${subtitulo}</p>` : '')}
    </div>
    ${raw(acoes ? `<div class="linha" style="gap: var(--e-2)">${acoes}</div>` : '')}
  </div>`;
}

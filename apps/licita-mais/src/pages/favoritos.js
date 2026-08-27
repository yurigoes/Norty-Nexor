/* =========================================================
   LICITA+ — Favoritos
   ---------------------------------------------------------
   Lista curta e viva: o usuário salvou porque pretende
   decidir. Por isso a tela ordena por prazo, não por nota — o
   que ele precisa saber aqui é o que vence primeiro.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { diasAte, prazoTexto } from '../lib/format.js';
import { cartaoOportunidade, cabecalhoPagina } from '../ui/domain.js';
import { vazio, toast, alerta } from '../ui/primitives.js';
import { licitacoes } from '../data/mock.js';
import { obter, assinar } from '../lib/store.js';

function listaFavoritos() {
  const ids = obter().favoritos;

  const itens = licitacoes
    .filter((l) => ids.includes(l.id))
    .sort((a, b) => new Date(a.encerramento) - new Date(b.encerramento));

  if (itens.length === 0) {
    return vazio({
      nomeIcone: 'coracao',
      titulo: 'Nenhum favorito ainda',
      texto: 'Favorite uma oportunidade para acompanhar o prazo dela aqui e receber alerta quando o encerramento se aproximar.',
      acao: '<a class="btn -primario" href="#/oportunidades">Explorar oportunidades</a>',
    });
  }

  const urgentes = itens.filter((l) => {
    const d = diasAte(l.encerramento);
    return d !== null && d >= 0 && d <= 3;
  });

  return `
    ${urgentes.length > 0 ? alerta({
      variante: 'aviso',
      nomeIcone: 'relogio',
      texto: `<b>${urgentes.length} ${urgentes.length === 1 ? 'favorita encerra' : 'favoritas encerram'} em até 3 dias.</b>
        Confira se suas certidões estão válidas antes de montar a proposta.`,
    }) : ''}
    <div class="pilha" style="margin-top: var(--e-4)">
      ${itens.map((l) => cartaoOportunidade(l)).join('')}
    </div>`;
}

export default {
  titulo: 'Favoritos',
  trilha: ['Início', 'Favoritos'],
  nav: 'favoritos',

  render() {
    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Favoritos',
    subtitulo: 'As oportunidades que você separou, ordenadas pelo que encerra primeiro.',
  }))}
  <div id="lista-favoritos">${raw(listaFavoritos())}</div>
</div>`;
  },

  ativar(raiz) {
    // Repinta quando o favorito mudar em qualquer lugar do app —
    // inclusive pelo botão dentro do próprio cartão desta lista.
    const cancelar = assinar((_estado, evento) => {
      if (evento !== 'favoritos') return;
      const alvo = $('#lista-favoritos', raiz);
      if (alvo) alvo.innerHTML = listaFavoritos();
    });

    return cancelar;
  },
};

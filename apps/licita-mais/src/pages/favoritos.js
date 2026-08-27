/* =========================================================
   LICITA+ — Favoritos
   ---------------------------------------------------------
   Lista curta e viva: o usuário salvou porque pretende
   decidir. Por isso a tela ordena por prazo, não por nota — o
   que ele precisa saber aqui é o que vence primeiro. A API já
   devolve nessa ordem.

   Favorito é da conta, não do navegador: quem marca no
   escritório encontra a mesma lista no celular.
   ========================================================= */

import { html, raw, $ } from '../lib/dom.js';
import { diasAte } from '../lib/format.js';
import { cartaoOportunidade, cabecalhoPagina } from '../ui/domain.js';
import { vazio, alerta, skeletonCartao } from '../ui/primitives.js';
import { assinar } from '../lib/store.js';
import { listarFavoritos } from '../dados/index.js';

function corpoFavoritos(itens) {
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

  esqueleto: () => skeletonCartao(3),

  async render() {
    const itens = await listarFavoritos();

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Favoritos',
    subtitulo: 'As oportunidades que você separou, ordenadas pelo que encerra primeiro.',
  }))}
  <div id="lista-favoritos">${raw(corpoFavoritos(itens))}</div>
</div>`;
  },

  ativar(raiz) {
    // Desfavoritar dentro desta própria lista precisa tirar o
    // cartão de tela. Buscar de novo em vez de remover o nó local
    // mantém o aviso de urgência e a contagem coerentes com o que
    // o servidor tem.
    return assinar(async (_estado, evento) => {
      if (evento !== 'favoritos') return;
      const alvo = $('#lista-favoritos', raiz);
      if (!alvo) return;

      const itens = await listarFavoritos().catch(() => null);
      if (itens && alvo.isConnected) alvo.innerHTML = corpoFavoritos(itens);
    });
  },
};

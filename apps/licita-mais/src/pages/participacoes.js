/* =========================================================
   LICITA+ — Participações
   ---------------------------------------------------------
   Histórico do que a empresa disputou. Tabela em vez de
   cartão: são poucos campos por linha e o usuário compara
   entre linhas, que é exatamente onde a tabela ganha.
   ========================================================= */

import { html, raw, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, data } from '../lib/format.js';
import { cabecalhoPagina, cartaoIndicador } from '../ui/domain.js';
import { abas, ativarAbas } from '../ui/primitives.js';
import { participacoes } from '../data/mock.js';

const ESTADO = {
  ganha: { variante: 'sucesso', rotulo: 'Ganha', icone: 'check_circulo' },
  perdida: { variante: 'erro', rotulo: 'Perdida', icone: 'fechar' },
  analise: { variante: 'info', rotulo: 'Em análise', icone: 'relogio' },
};

function tabela(filtro = 'todas') {
  const itens = filtro === 'todas' ? participacoes : participacoes.filter((p) => p.situacao === filtro);

  if (itens.length === 0) {
    return `<div class="vazio"><h3>Nenhuma participação nesta situação</h3>
      <p>Assim que houver, ela aparece aqui.</p></div>`;
  }

  return `<div class="tabela-rolagem"><table class="tabela">
    <thead><tr>
      <th>Certame</th><th>Órgão</th><th>Data</th><th class="-num">Valor</th><th>Resultado</th>
    </tr></thead>
    <tbody>
      ${itens.map((p) => {
        const e = ESTADO[p.situacao];
        return `<tr>
          <td class="tabela-titulo-celula">${p.licitacao}</td>
          <td class="suave">${p.orgao}</td>
          <td class="num" style="white-space: nowrap">${data(p.data)}</td>
          <td class="-num">${moeda(p.valor)}</td>
          <td><span class="selo -${e.variante}">${icone(e.icone)}${e.rotulo}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

export default {
  titulo: 'Participações',
  trilha: ['Início', 'Participações'],
  nav: 'participacoes',

  render() {
    const ganhas = participacoes.filter((p) => p.situacao === 'ganha');
    const perdidas = participacoes.filter((p) => p.situacao === 'perdida');
    const analise = participacoes.filter((p) => p.situacao === 'analise');
    const valorGanho = ganhas.reduce((s, p) => s + p.valor, 0);

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Participações',
    subtitulo: 'Os certames que a sua empresa disputou e como cada um terminou.',
  }))}

  <section class="grade grade-4">
    ${raw(cartaoIndicador({ rotulo: 'Total disputado', valor: participacoes.length, nomeIcone: 'balanca', cor: 'azul', periodo: 'no período' }))}
    ${raw(cartaoIndicador({ rotulo: 'Ganhas', valor: ganhas.length, nomeIcone: 'check_circulo', cor: 'verde', periodo: `${Math.round((ganhas.length / participacoes.length) * 100)}% do total` }))}
    ${raw(cartaoIndicador({ rotulo: 'Em análise', valor: analise.length, nomeIcone: 'relogio', cor: 'amarelo', periodo: 'aguardando resultado' }))}
    ${raw(cartaoIndicador({ rotulo: 'Valor ganho', valor: moeda(valorGanho), nomeIcone: 'carteira', cor: 'verde', periodo: 'contratos firmados' }))}
  </section>

  <section class="card">
    <div style="padding: 0 var(--e-5)">
      ${raw(abas({
        ativa: 'todas',
        itens: [
          { chave: 'todas', rotulo: 'Todas', contagem: participacoes.length },
          { chave: 'ganha', rotulo: 'Ganhas', contagem: ganhas.length },
          { chave: 'analise', rotulo: 'Em análise', contagem: analise.length },
          { chave: 'perdida', rotulo: 'Perdidas', contagem: perdidas.length },
        ],
      }))}
    </div>
    <div id="painel-part">${raw(tabela('todas'))}</div>
  </section>
</div>`;
  },

  ativar(raiz) {
    const painel = raiz.querySelector('#painel-part');
    ativarAbas(raiz, (chave) => { painel.innerHTML = tabela(chave); });
  },
};

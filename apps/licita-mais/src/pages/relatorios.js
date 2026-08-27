/* =========================================================
   LICITA+ — Relatórios
   ---------------------------------------------------------
   Quatro gráficos, não quatorze. Cada um responde uma
   pergunta e nenhum repete o que o vizinho já disse.

   Decisões de visualização, todas deliberadas:

   - **Nunca dois eixos Y.** Volume e valor têm escalas
     diferentes, então são gráficos diferentes — nunca duas
     escalas no mesmo desenho.
   - **Série única usa um tom só.** Cor aqui carrega
     magnitude, não identidade; variar a cor por barra
     inventaria uma categoria que não existe.
   - **A única paleta categórica é a das participações**, e ela
     foi validada: ΔE ≥ 8 em todos os pares sob as três formas
     de daltonismo, com legenda e rótulo direto por cima.
   ========================================================= */

import { html, raw } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, moedaCurta, numero } from '../lib/format.js';
import { cabecalhoPagina, cartaoIndicador } from '../ui/domain.js';
import { seletor } from '../ui/primitives.js';
import { graficoArea, graficoBarrasH, graficoColunas, graficoEmpilhado, legenda, ativarGraficos } from '../lib/charts.js';
import { serieMensal, porCategoria, porEstado, participacoes, licitacoes, indicadores } from '../data/mock.js';

export default {
  titulo: 'Relatórios',
  trilha: ['Início', 'Relatórios'],
  nav: 'relatorios',

  render() {
    const ganhas = participacoes.filter((p) => p.situacao === 'ganha');
    const perdidas = participacoes.filter((p) => p.situacao === 'perdida');
    const analise = participacoes.filter((p) => p.situacao === 'analise');

    const valorGanho = ganhas.reduce((s, p) => s + p.valor, 0);
    const taxaVitoria = Math.round((ganhas.length / (ganhas.length + perdidas.length)) * 100);
    const compatMedia = Math.round(
      licitacoes.reduce((s, l) => s + l.compatibilidade, 0) / licitacoes.length,
    );

    const segmentos = [
      { rotulo: 'Ganhas', valor: ganhas.length },
      { rotulo: 'Em análise', valor: analise.length },
      { rotulo: 'Perdidas', valor: perdidas.length },
    ];

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Relatórios',
    subtitulo: 'Como as oportunidades e as suas participações evoluíram nos últimos 12 meses.',
    acoes: `
      <div style="min-width: 170px">
        ${seletor({ id: 'periodo', valor: '12m', opcoes: [
          { valor: '3m', rotulo: 'Últimos 3 meses' },
          { valor: '6m', rotulo: 'Últimos 6 meses' },
          { valor: '12m', rotulo: 'Últimos 12 meses' },
        ] })}
      </div>
      <button class="btn -secundario">${icone('baixar')} Exportar</button>`,
  }))}

  <!-- Números-cabeçalho: o que não vira gráfico -->
  <section class="grade grade-4">
    ${raw(cartaoIndicador({
      rotulo: 'Oportunidades no período', valor: numero(1360), delta: 21,
      periodo: 'vs. período anterior', nomeIcone: 'radar', cor: 'azul',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Valor ganho', valor: moedaCurta(valorGanho), delta: 34,
      periodo: 'vs. período anterior', nomeIcone: 'carteira', cor: 'verde',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Taxa de vitória', valor: `${taxaVitoria}%`, delta: 9,
      periodo: 'vs. período anterior', nomeIcone: 'balanca', cor: 'amarelo',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Compatibilidade média', valor: `${compatMedia}%`, delta: 4,
      periodo: 'vs. período anterior', nomeIcone: 'alvo', cor: 'azul',
    }))}
  </section>

  <!-- Evolução: uma medida, um eixo -->
  <section class="card">
    <div class="card-topo">
      <div>
        <div class="card-titulo">Oportunidades encontradas por mês</div>
        <div class="card-sub">Volume mensal · perfil atual da empresa</div>
      </div>
    </div>
    <div class="card-corpo">
      ${raw(graficoArea({ dados: serieMensal, id: 'rel-evolucao' }))}
    </div>
  </section>

  <div class="grade grade-2">
    <!-- Categoria -->
    <section class="card">
      <div class="card-topo">
        <div>
          <div class="card-titulo">Por categoria</div>
          <div class="card-sub">Onde estão as oportunidades do seu perfil</div>
        </div>
      </div>
      <div class="card-corpo">
        ${raw(graficoBarrasH({ dados: porCategoria, id: 'rel-categoria' }))}
      </div>
    </section>

    <!-- Estado -->
    <section class="card">
      <div class="card-topo">
        <div>
          <div class="card-titulo">Por estado</div>
          <div class="card-sub">Distribuição geográfica no período</div>
        </div>
      </div>
      <div class="card-corpo">
        ${raw(graficoColunas({ dados: porEstado, id: 'rel-estado' }))}
      </div>
    </section>
  </div>

  <!-- Participações: única paleta categórica da tela -->
  <section class="card">
    <div class="card-topo">
      <div>
        <div class="card-titulo">Suas participações</div>
        <div class="card-sub">${participacoes.length} certames disputados no período</div>
      </div>
    </div>
    <div class="card-corpo">
      ${raw(graficoEmpilhado({ segmentos, id: 'rel-participacoes' }))}
      ${raw(legenda(segmentos.map((s) => ({ rotulo: s.rotulo, valor: s.valor }))))}
    </div>

    <div class="tabela-rolagem" style="border-top: 1px solid var(--borda-suave)">
      <table class="tabela">
        <thead><tr>
          <th>Certame</th><th>Órgão</th><th class="-num">Valor</th><th>Resultado</th>
        </tr></thead>
        <tbody>
          ${raw(participacoes.map((p) => {
            const mapa = {
              ganha: ['sucesso', 'Ganha', 'check_circulo'],
              perdida: ['erro', 'Perdida', 'fechar'],
              analise: ['info', 'Em análise', 'relogio'],
            };
            const [variante, rotulo, ic] = mapa[p.situacao];
            return `<tr>
              <td class="tabela-titulo-celula">${p.licitacao}</td>
              <td class="suave">${p.orgao}</td>
              <td class="-num">${moeda(p.valor)}</td>
              <td><span class="selo -${variante}">${icone(ic)}${rotulo}</span></td>
            </tr>`;
          }).join(''))}
        </tbody>
      </table>
    </div>
  </section>

  <p class="tenue" style="font-size: var(--t-micro); text-align: center">
    Relatórios gerados sobre dados de demonstração.
  </p>
</div>`;
  },

  ativar(raiz) {
    ativarGraficos(raiz);
  },
};

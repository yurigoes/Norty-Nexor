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

   Nenhum indicador mostra variação contra o período anterior.
   Comparar exigiria uma base histórica que só existe depois de
   meses de varredura, e um delta inventado sobre poucos dias
   seria ruído apresentado como tendência — o oposto do que um
   relatório serve para fazer.
   ========================================================= */

import { html, raw } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, moedaCurta, numero } from '../lib/format.js';
import { cabecalhoPagina, cartaoIndicador } from '../ui/domain.js';
import { skeletonIndicadores, skeletonCartao, vazio } from '../ui/primitives.js';
import { graficoArea, graficoBarrasH, graficoColunas, graficoEmpilhado, legenda, ativarGraficos } from '../lib/charts.js';
import { relatorios, listarParticipacoes } from '../dados/index.js';

const SITUACAO = {
  ganha: ['sucesso', 'Ganha', 'check_circulo'],
  perdida: ['erro', 'Perdida', 'fechar'],
  analise: ['info', 'Em análise', 'relogio'],
  desistiu: ['neutro', 'Desistiu', 'menos'],
};

/** Um gráfico sem dado é um retângulo vazio que promete algo. */
const semDados = (texto) =>
  `<p class="tenue" style="font-size: var(--t-corpo-sm); text-align: center;
     padding: var(--e-8) var(--e-4); line-height: 1.6; margin: 0">${texto}</p>`;

const temValor = (serie) => Array.isArray(serie) && serie.some((p) => p.valor > 0);

export default {
  titulo: 'Relatórios',
  trilha: ['Início', 'Relatórios'],
  nav: 'relatorios',

  esqueleto: () => `<div class="pilha-lg">${skeletonIndicadores(4)}${skeletonCartao(2)}</div>`,

  async render() {
    const [dados, historico] = await Promise.all([
      relatorios(),
      listarParticipacoes().catch(() => ({ itens: [], resumo: null })),
    ]);

    const { serieMensal, porCategoria, porEstado, participacoes, indicadores } = dados;

    if (!indicadores.encontradas && !participacoes.total) {
      return vazio({
        nomeIcone: 'grafico',
        titulo: 'Ainda não há o que relatar',
        texto: 'Os relatórios se montam sozinhos conforme a varredura acumula oportunidades e você registra as participações da sua empresa.',
        acao: '<a class="btn -primario" href="#/oportunidades">Ver oportunidades</a>',
      });
    }

    const segmentos = [
      { rotulo: 'Ganhas', valor: participacoes.ganhas },
      { rotulo: 'Em análise', valor: participacoes.emAnalise },
      { rotulo: 'Perdidas', valor: participacoes.perdidas },
    ];

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Relatórios',
    subtitulo: 'Como as oportunidades e as suas participações evoluíram nos últimos 12 meses.',
  }))}

  <section class="grade grade-4">
    ${raw(cartaoIndicador({
      rotulo: 'Oportunidades abertas', valor: numero(indicadores.encontradas),
      periodo: 'com proposta em aberto', nomeIcone: 'radar', cor: 'azul',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Valor ganho', valor: moedaCurta(participacoes.valorGanho),
      periodo: 'contratos firmados', nomeIcone: 'carteira', cor: 'verde',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Taxa de vitória',
      valor: participacoes.taxaVitoria === null ? '—' : `${participacoes.taxaVitoria}%`,
      periodo: participacoes.taxaVitoria === null
        ? 'nenhum certame decidido ainda'
        : `${participacoes.ganhas + participacoes.perdidas} certames decididos`,
      nomeIcone: 'balanca', cor: 'amarelo',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Alta compatibilidade', valor: numero(indicadores.altaCompatibilidade),
      periodo: '80% ou mais de aderência', nomeIcone: 'alvo', cor: 'azul',
    }))}
  </section>

  <section class="card">
    <div class="card-topo">
      <div>
        <div class="card-titulo">Oportunidades encontradas por mês</div>
        <div class="card-sub">Volume mensal · perfil atual da empresa</div>
      </div>
    </div>
    <div class="card-corpo">
      ${raw(temValor(serieMensal)
        ? graficoArea({ dados: serieMensal, id: 'rel-evolucao' })
        : semDados('A série mensal se forma conforme a varredura acumula meses. O primeiro ponto aparece já na próxima rodada.'))}
    </div>
  </section>

  <div class="grade grade-2">
    <section class="card">
      <div class="card-topo">
        <div>
          <div class="card-titulo">Por linha de fornecimento</div>
          <div class="card-sub">Onde estão as oportunidades do seu perfil</div>
        </div>
      </div>
      <div class="card-corpo">
        ${raw(temValor(porCategoria)
          ? graficoBarrasH({ dados: porCategoria, id: 'rel-categoria' })
          : semDados('Declare o que a sua empresa vende em Minha empresa para que as oportunidades sejam classificadas por linha.'))}
      </div>
    </section>

    <section class="card">
      <div class="card-topo">
        <div>
          <div class="card-titulo">Por estado</div>
          <div class="card-sub">Distribuição geográfica das oportunidades avaliadas</div>
        </div>
      </div>
      <div class="card-corpo">
        ${raw(temValor(porEstado)
          ? graficoColunas({ dados: porEstado, id: 'rel-estado' })
          : semDados('Ainda não há oportunidade avaliada para distribuir por estado.'))}
      </div>
    </section>
  </div>

  <section class="card">
    <div class="card-topo">
      <div>
        <div class="card-titulo">Suas participações</div>
        <div class="card-sub">${participacoes.total} certame${participacoes.total === 1 ? '' : 's'} registrado${participacoes.total === 1 ? '' : 's'}</div>
      </div>
      <a class="btn -fantasma -sm" href="#/participacoes">Gerenciar ${raw(icone('seta_dir'))}</a>
    </div>

    ${raw(participacoes.total === 0
      ? `<div class="card-corpo">${semDados('Registre os certames que a sua empresa disputou. É esse histórico que mostra em que faixa de preço você costuma ganhar.')}</div>`
      : `<div class="card-corpo">
          ${graficoEmpilhado({ segmentos, id: 'rel-participacoes' })}
          ${legenda(segmentos.map((s) => ({ rotulo: s.rotulo, valor: s.valor })))}
        </div>

        <div class="tabela-rolagem" style="border-top: 1px solid var(--borda-suave)">
          <table class="tabela">
            <thead><tr>
              <th>Certame</th><th>Órgão</th><th class="-num">Valor</th><th>Resultado</th>
            </tr></thead>
            <tbody>
              ${historico.itens.slice(0, 12).map((p) => {
                const [variante, rotulo, ic] = SITUACAO[p.situacao] ?? SITUACAO.analise;
                return `<tr>
                  <td class="tabela-titulo-celula">${p.descricao}</td>
                  <td class="suave">${p.orgao}</td>
                  <td class="-num">${p.valor === null || p.valor === undefined ? '—' : moeda(p.valor)}</td>
                  <td><span class="selo -${variante}">${icone(ic)}${rotulo}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`)}
  </section>
</div>`;
  },

  ativar(raiz) {
    ativarGraficos(raiz);
  },
};

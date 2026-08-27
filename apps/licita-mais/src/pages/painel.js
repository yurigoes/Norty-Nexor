/* =========================================================
   LICITA+ — Painel
   ---------------------------------------------------------
   A tela que responde "o que eu faço hoje". Ordem deliberada:
   resumo primeiro, depois o que fecha logo, depois o que o
   sistema recomenda, e só então o histórico.

   O que fecha em menos de 4 dias vem antes das recomendações
   de propósito: uma oportunidade de 96% que encerra semana que
   vem espera; uma de 78% que encerra amanhã, não.
   ========================================================= */

import { html, raw, $, $$, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moedaCurta, numero, data, prazoTexto, diasAte } from '../lib/format.js';
import { cartaoIndicador, cartaoOportunidade, scorePill, itemNotificacao } from '../ui/domain.js';
import { botao, alerta, progresso } from '../ui/primitives.js';
import { graficoArea, ativarGraficos } from '../lib/charts.js';
import { licitacoes, indicadores, empresa, monitoramentos, notificacoes, serieMensal } from '../data/mock.js';

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default {
  titulo: 'Painel',
  trilha: ['Início'],
  nav: 'painel',

  render() {
    const primeiroNome = empresa.usuario.nome.split(' ')[0];

    const fechandoLogo = licitacoes
      .filter((l) => {
        const dias = diasAte(l.encerramento);
        return dias !== null && dias >= 0 && dias <= 6;
      })
      .sort((a, b) => new Date(a.encerramento) - new Date(b.encerramento))
      .slice(0, 3);

    const recomendadas = [...licitacoes]
      .sort((a, b) => b.compatibilidade - a.compatibilidade)
      .slice(0, 4);

    const totalNovas = monitoramentos.reduce((s, m) => s + m.novas, 0);

    return html`
<div class="pilha-lg">

  <!-- Saudação -->
  <header>
    <h1 style="font-size: var(--t-h1)">${saudacao()}, ${primeiroNome} 👋</h1>
    <p class="suave" style="margin-top: 4px; font-size: var(--t-corpo)">
      Aqui estão as oportunidades mais relevantes para a ${empresa.nomeFantasia}.
    </p>
  </header>

  <!-- Indicadores -->
  <section class="grade grade-4" aria-label="Resumo do período">
    ${raw(cartaoIndicador({
      rotulo: 'Oportunidades encontradas',
      valor: numero(indicadores.encontradas),
      delta: indicadores.encontradasDelta,
      nomeIcone: 'radar', cor: 'azul',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Valor estimado',
      valor: moedaCurta(indicadores.valorTotal),
      delta: indicadores.valorDelta,
      nomeIcone: 'carteira', cor: 'verde',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Alta compatibilidade',
      valor: numero(indicadores.altaCompatibilidade),
      delta: indicadores.altaDelta,
      nomeIcone: 'alvo', cor: 'amarelo',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Novas hoje',
      valor: numero(indicadores.novasHoje),
      nomeIcone: 'faisca', cor: 'azul',
      link: { href: '#/oportunidades', rotulo: 'Ver agora' },
    }))}
  </section>

  <div class="grade-conteudo-trilho">

    <!-- Coluna principal -->
    <div class="pilha-lg" style="min-width: 0">

      <!-- Fechando logo: urgência vence nota -->
      <section>
        <div class="cabecalho-secao" style="margin-bottom: var(--e-4)">
          <div>
            <h2 class="titulo-seccao">Fecha nos próximos dias</h2>
            <p class="suave" style="font-size: var(--t-corpo-sm); margin-top: 2px">
              Prazo curto é o que mais elimina fornecedor — estas vêm primeiro.
            </p>
          </div>
          <a class="btn -fantasma -sm" href="#/oportunidades">Ver todas ${raw(icone('seta_dir'))}</a>
        </div>
        <div class="pilha">
          ${raw(fechandoLogo.map((l) => cartaoOportunidade(l, { compacto: true })).join(''))}
        </div>
      </section>

      <!-- Recomendações -->
      <section>
        <div class="cabecalho-secao" style="margin-bottom: var(--e-4)">
          <div>
            <h2 class="titulo-seccao">Recomendadas para você</h2>
            <p class="suave" style="font-size: var(--t-corpo-sm); margin-top: 2px">
              Ordenadas pela aderência ao perfil da sua empresa.
            </p>
          </div>
          <a class="btn -fantasma -sm" href="#/recomendacoes">Ver todas ${raw(icone('seta_dir'))}</a>
        </div>
        <div class="pilha">
          ${raw(recomendadas.map((l) => cartaoOportunidade(l)).join(''))}
        </div>
      </section>

      <!-- Evolução -->
      <section class="card">
        <div class="card-topo">
          <div>
            <div class="card-titulo">Oportunidades encontradas por mês</div>
            <div class="card-sub">Últimos 12 meses · perfil atual</div>
          </div>
          <a class="btn -fantasma -sm" href="#/relatorios">Relatórios ${raw(icone('seta_dir'))}</a>
        </div>
        <div class="card-corpo">
          ${raw(graficoArea({ dados: serieMensal, formatar: (v) => `${v}`, id: 'painel-evolucao' }))}
        </div>
      </section>

    </div>

    <!-- Trilho lateral -->
    <aside class="pilha">

      <!-- Perfil incompleto: ação com retorno direto -->
      <div class="card">
        <div class="card-corpo pilha-sm">
          <div class="linha-entre">
            <span class="rotulo">Perfil da empresa</span>
            <span style="font-weight: var(--p-extra); color: var(--azul-600)">${empresa.perfilCompleto}%</span>
          </div>
          ${raw(progresso({ valor: empresa.perfilCompleto, rotuloAcessivel: 'Completude do perfil' }))}
          <p class="suave" style="font-size: var(--t-micro); line-height: 1.5; margin-top: 4px">
            Quanto mais completo o perfil, mais precisas as recomendações.
            Faltam <b>faixa de valor por categoria</b> e <b>atestados técnicos</b>.
          </p>
          <a class="btn -secundario -sm -cheio" href="#/empresa" style="margin-top: var(--e-2)">
            Completar perfil
          </a>
        </div>
      </div>

      <!-- Monitoramentos -->
      <div class="card">
        <div class="card-topo">
          <div class="card-titulo" style="font-size: var(--t-corpo)">Meus monitoramentos</div>
          <span class="selo -info">${totalNovas} novas</span>
        </div>
        <div class="card-corpo pilha-sm" style="padding-top: var(--e-3)">
          ${raw(
            monitoramentos
              .filter((m) => m.ativo)
              .map(
                (m) => `<a href="#/monitoramentos" class="linha-entre"
                  style="padding: 9px 0; border-bottom: 1px solid var(--borda-suave); color: inherit">
                  <span style="font-size: var(--t-corpo-sm); font-weight: var(--p-medio); min-width:0;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${m.nome}</span>
                  <span class="selo ${m.novas > 0 ? '-sucesso' : '-neutro'}" style="flex:none">
                    ${m.novas > 0 ? `${icone('sino_ativo')}${m.novas}` : '—'}
                  </span>
                </a>`,
              )
              .join(''),
          )}
          <a class="btn -fantasma -sm -cheio" href="#/monitoramentos" style="margin-top: var(--e-2)">
            ${raw(icone('mais'))} Novo monitoramento
          </a>
        </div>
      </div>

      <!-- Notificações recentes -->
      <div class="card">
        <div class="card-topo">
          <div class="card-titulo" style="font-size: var(--t-corpo)">Atividade recente</div>
        </div>
        <div style="padding-top: var(--e-2)">
          ${raw(notificacoes.slice(0, 3).map((n, i) => itemNotificacao(n, { nova: i === 0 })).join(''))}
        </div>
      </div>

    </aside>
  </div>
</div>`;
  },

  ativar(raiz) {
    ativarGraficos(raiz);
  },
};

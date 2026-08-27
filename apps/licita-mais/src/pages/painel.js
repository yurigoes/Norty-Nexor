/* =========================================================
   LICITA+ — Painel
   ---------------------------------------------------------
   A tela que responde "o que eu faço hoje". Ordem deliberada:
   resumo primeiro, depois o que fecha logo, depois o que o
   sistema recomenda, e só então o histórico.

   O que fecha em menos de uma semana vem antes das
   recomendações de propósito: uma oportunidade de 96% que
   encerra semana que vem espera; uma de 78% que encerra
   amanhã, não.

   Os cartões de resumo não mostram variação percentual. Ela
   exigiria comparar com o período anterior, e enquanto a base
   tem poucos dias de ingestão qualquer delta seria ruído
   apresentado como tendência.
   ========================================================= */

import { html, raw } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moedaCurta, numero, diasAte } from '../lib/format.js';
import { cartaoIndicador, cartaoOportunidade, itemNotificacao } from '../ui/domain.js';
import { progresso, skeletonIndicadores, skeletonCartao } from '../ui/primitives.js';
import { graficoArea, ativarGraficos } from '../lib/charts.js';
import { primeiroNome } from '../lib/sessao.js';
import {
  resumoPainel, listarOportunidades, listarMonitoramentos,
  listarNotificacoes, obterEmpresa, relatorios,
} from '../dados/index.js';

function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** O que falta no perfil, dito em nome de coisa, não em porcentagem. */
function faltando(perfil) {
  const pendencias = [];
  if (!perfil?.linhas?.length) pendencias.push('linhas de fornecimento');
  else if (perfil.linhas.length < 2) pendencias.push('mais de uma linha de fornecimento');
  if (!perfil?.municipiosRegiao?.length) pendencias.push('municípios da sua região');
  if (!perfil?.municipioIbge) pendencias.push('a cidade sede na lista oficial');
  if (!perfil?.modalidades?.length) pendencias.push('modalidades que você atende');

  if (pendencias.length === 0) {
    return 'Seu perfil está completo. As recomendações já usam tudo o que você declarou.';
  }
  return `Falta declarar <b>${pendencias.slice(0, 2).join('</b> e <b>')}</b>.`;
}

export default {
  titulo: 'Painel',
  trilha: ['Início'],
  nav: 'painel',

  esqueleto: () => `<div class="pilha-lg">
    ${skeletonIndicadores(4)}
    ${skeletonCartao(3)}
  </div>`,

  async render() {
    // Tudo de uma vez: são consultas independentes, e encadeá-las
    // somaria as latências sem necessidade.
    const [resumo, urgentes, melhores, monitores, avisos, perfil, series] = await Promise.all([
      resumoPainel(),
      listarOportunidades({ ordem: 'prazo', tamanho: 6 }),
      listarOportunidades({ ordem: 'compatibilidade', tamanho: 4 }),
      listarMonitoramentos().catch(() => []),
      listarNotificacoes().catch(() => []),
      obterEmpresa().catch(() => null),
      relatorios().catch(() => null),
    ]);

    const fechandoLogo = urgentes.itens
      .filter((l) => {
        const dias = diasAte(l.encerramento);
        return dias !== null && dias >= 0 && dias <= 7;
      })
      .slice(0, 3);

    const totalNovas = monitores.reduce((soma, m) => soma + (m.novas ?? 0), 0);
    const nomeEmpresa = perfil?.nomeFantasia || perfil?.razaoSocial || 'sua empresa';

    return html`
<div class="pilha-lg">

  <header>
    <h1 style="font-size: var(--t-h1)">${saudacao()}, ${primeiroNome()} 👋</h1>
    <p class="suave" style="margin-top: 4px; font-size: var(--t-corpo)">
      Aqui estão as oportunidades mais relevantes para a ${nomeEmpresa}.
    </p>
  </header>

  <section class="grade grade-4" aria-label="Resumo do período">
    ${raw(cartaoIndicador({
      rotulo: 'Oportunidades abertas',
      valor: numero(resumo.encontradas),
      periodo: 'com proposta em aberto',
      nomeIcone: 'radar', cor: 'azul',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Valor estimado',
      valor: moedaCurta(resumo.valorEstimado),
      periodo: 'somando o que está aberto',
      nomeIcone: 'carteira', cor: 'verde',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Alta compatibilidade',
      valor: numero(resumo.altaCompatibilidade),
      periodo: '80% ou mais',
      nomeIcone: 'alvo', cor: 'amarelo',
    }))}
    ${raw(cartaoIndicador({
      rotulo: 'Novas hoje',
      valor: numero(resumo.novasHoje),
      periodo: 'nas últimas 24 horas',
      nomeIcone: 'faisca', cor: 'azul',
      link: { href: '#/oportunidades', rotulo: 'Ver agora' },
    }))}
  </section>

  <div class="grade-conteudo-trilho">

    <div class="pilha-lg" style="min-width: 0">

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
          ${raw(fechandoLogo.length
            ? fechandoLogo.map((l) => cartaoOportunidade(l, { compacto: true })).join('')
            : nadaAqui('Nada fecha nesta semana. É bom sinal: dá tempo de preparar as propostas com calma.'))}
        </div>
      </section>

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
          ${raw(melhores.itens.length
            ? melhores.itens.map((l) => cartaoOportunidade(l)).join('')
            : nadaAqui('Ainda não há oportunidade avaliada para o seu perfil. A varredura roda todo dia de madrugada.'))}
        </div>
      </section>

      ${raw(series?.serieMensal ? `
      <section class="card">
        <div class="card-topo">
          <div>
            <div class="card-titulo">Oportunidades encontradas por mês</div>
            <div class="card-sub">Últimos 12 meses · perfil atual</div>
          </div>
          <a class="btn -fantasma -sm" href="#/relatorios">Relatórios ${icone('seta_dir')}</a>
        </div>
        <div class="card-corpo">
          ${graficoArea({ dados: series.serieMensal, formatar: (v) => `${v}`, id: 'painel-evolucao' })}
        </div>
      </section>` : '')}

    </div>

    <aside class="pilha">

      <div class="card">
        <div class="card-corpo pilha-sm">
          <div class="linha-entre">
            <span class="rotulo">Perfil da empresa</span>
            <span style="font-weight: var(--p-extra); color: var(--azul-600)">${perfil?.completude ?? 0}%</span>
          </div>
          ${raw(progresso({ valor: perfil?.completude ?? 0, rotuloAcessivel: 'Completude do perfil' }))}
          <p class="suave" style="font-size: var(--t-micro); line-height: 1.5; margin-top: 4px">
            Quanto mais completo o perfil, mais precisas as recomendações.
            ${raw(faltando(perfil))}
          </p>
          <a class="btn -secundario -sm -cheio" href="#/empresa" style="margin-top: var(--e-2)">
            Completar perfil
          </a>
        </div>
      </div>

      <div class="card">
        <div class="card-topo">
          <div class="card-titulo" style="font-size: var(--t-corpo)">Meus monitoramentos</div>
          ${raw(totalNovas > 0 ? `<span class="selo -info">${totalNovas} novas</span>` : '')}
        </div>
        <div class="card-corpo pilha-sm" style="padding-top: var(--e-3)">
          ${raw(monitores.filter((m) => m.ativo).map((m) => `
            <a href="#/monitoramentos" class="linha-entre"
              style="padding: 9px 0; border-bottom: 1px solid var(--borda-suave); color: inherit">
              <span style="font-size: var(--t-corpo-sm); font-weight: var(--p-medio); min-width:0;
                overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${m.nome}</span>
              <span class="selo ${(m.novas ?? 0) > 0 ? '-sucesso' : '-neutro'}" style="flex:none">
                ${(m.novas ?? 0) > 0 ? `${icone('sino_ativo')}${m.novas}` : '—'}
              </span>
            </a>`).join(''))}
          <a class="btn -fantasma -sm -cheio" href="#/monitoramentos" style="margin-top: var(--e-2)">
            ${raw(icone('mais'))} Novo monitoramento
          </a>
        </div>
      </div>

      ${raw(avisos.length ? `
      <div class="card">
        <div class="card-topo">
          <div class="card-titulo" style="font-size: var(--t-corpo)">Atividade recente</div>
        </div>
        <div style="padding-top: var(--e-2)">
          ${avisos.slice(0, 3).map((n, i) => itemNotificacao(n, { nova: i === 0 })).join('')}
        </div>
      </div>` : '')}

    </aside>
  </div>
</div>`;
  },

  ativar(raiz) {
    ativarGraficos(raiz);
  },
};

const nadaAqui = (texto) => `<div class="card"><div class="card-corpo">
  <p class="suave" style="font-size: var(--t-corpo-sm); line-height: 1.6; margin: 0">${texto}</p>
</div></div>`;

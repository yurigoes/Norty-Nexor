/* =========================================================
   LICITA+ — Busca inteligente
   ---------------------------------------------------------
   Tela de entrada única, com o campo grande no centro. A
   diferença para a lista de oportunidades é a intenção: aqui
   o usuário chega sem saber o que quer, então a tela oferece
   caminhos em vez de filtros.

   Os atalhos abaixo do campo não são decoração — cada um é
   uma consulta que o perfil da empresa já responde.
   ========================================================= */

import { html, raw, $, ao, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { irPara } from '../lib/router.js';
import { busca } from '../ui/primitives.js';
import { cartaoOportunidade } from '../ui/domain.js';
import { licitacoes, buscasSugeridas, termosPopulares, empresa } from '../data/mock.js';
import { normalizar } from '../lib/format.js';

export default {
  titulo: 'Buscar licitações',
  trilha: ['Início', 'Buscar'],
  nav: 'busca',

  render() {
    const destaques = [...licitacoes].sort((a, b) => b.compatibilidade - a.compatibilidade).slice(0, 3);

    return html`
<div class="pilha-lg">

  <!-- Herói da busca -->
  <section style="position: relative; padding: var(--e-12) 0 var(--e-8); text-align: center; overflow: hidden">
    <span class="geo geo-losango" style="width: 300px; height: 300px; left: -110px; top: -60px;
      background: linear-gradient(135deg, rgba(22,119,232,.07), rgba(0,140,69,.05))"></span>
    <span class="geo geo-anel" style="width: 220px; height: 220px; right: -40px; bottom: -90px;
      color: var(--azul-500)"></span>

    <div style="position: relative; max-width: 720px; margin: 0 auto">
      <h1 style="font-size: clamp(1.7rem, 4vw, var(--t-h1))">
        O que sua empresa está procurando?
      </h1>
      <p class="suave" style="margin-top: var(--e-3); font-size: var(--t-corpo)">
        Busque por produto, serviço, órgão ou cidade. O LICITA+ analisa cada resultado
        contra o perfil da ${empresa.nomeFantasia}.
      </p>

      <div style="margin-top: var(--e-6)">
        ${raw(busca({
          id: 'busca-grande',
          grande: true,
          placeholder: 'Ex.: computadores, serviços de manutenção, material hospitalar…',
          atributos: 'autofocus',
        }))}
      </div>

      <button class="btn -gradiente -lg" data-acao="buscar" style="margin-top: var(--e-4)">
        ${raw(icone('busca'))} Encontrar oportunidades
      </button>

      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; justify-content: center; margin-top: var(--e-6)">
        <span class="rotulo" style="width: 100%; margin-bottom: 2px">Buscas populares</span>
        ${raw(termosPopulares.map((t) =>
          `<button class="filtro-pill" data-acao="termo" data-termo="${t}">${t}</button>`,
        ).join(''))}
      </div>
    </div>
  </section>

  <!-- Atalhos guiados pelo perfil -->
  <section>
    <h2 class="titulo-seccao" style="margin-bottom: var(--e-4)">Sugestões para o seu perfil</h2>
    <div class="grade grade-4">
      ${raw(buscasSugeridas.map((s) => `
        <button class="card -interativo" data-acao="sugestao" data-consulta="${s.consulta}"
          style="text-align: left; width: 100%">
          <div class="card-corpo pilha-sm">
            <span class="stat-icone -azul">${icone(s.icone)}</span>
            <div style="font-weight: var(--p-semi); color: var(--texto-forte); font-size: var(--t-corpo-sm);
              margin-top: var(--e-2)">${s.rotulo}</div>
            <span class="suave" style="font-size: var(--t-micro)">Ver resultados →</span>
          </div>
        </button>`).join(''))}
    </div>
  </section>

  <!-- Prévia de resultados -->
  <section>
    <div class="cabecalho-secao" style="margin-bottom: var(--e-4)">
      <div>
        <h2 class="titulo-seccao">Mais compatíveis agora</h2>
        <p class="suave" style="font-size: var(--t-corpo-sm); margin-top: 2px">
          O que o LICITA+ separou para você sem que você precisasse pedir.
        </p>
      </div>
      <a class="btn -fantasma -sm" href="#/oportunidades">Ver todas ${raw(icone('seta_dir'))}</a>
    </div>
    <div class="pilha">${raw(destaques.map((l) => cartaoOportunidade(l)).join(''))}</div>
  </section>
</div>`;
  },

  ativar(raiz) {
    const entrada = $('#busca-grande', raiz);
    const caixa = entrada.closest('[data-busca]');

    const disparar = (termo) => {
      const q = (termo ?? entrada.value).trim();
      irPara(q ? `/oportunidades?q=${encodeURIComponent(q)}` : '/oportunidades');
    };

    ao(entrada, 'input', () => caixa.classList.toggle('-preenchida', entrada.value.length > 0));
    ao(entrada, 'keydown', (evento) => {
      if (evento.key === 'Enter') disparar();
    });

    aoClicarEm(raiz, '[data-acao="limpar-busca"]', () => {
      entrada.value = '';
      caixa.classList.remove('-preenchida');
      entrada.focus();
    });

    aoClicarEm(raiz, '[data-acao="buscar"]', () => disparar());
    aoClicarEm(raiz, '[data-acao="termo"]', (_e, alvo) => disparar(alvo.dataset.termo));
    aoClicarEm(raiz, '[data-acao="sugestao"]', (_e, alvo) => disparar(alvo.dataset.consulta));
  },
};

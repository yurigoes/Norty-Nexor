/* =========================================================
   LICITA+ — Landing pública
   ---------------------------------------------------------
   O herói é a tese do produto: à esquerda a promessa, à
   direita o próprio painel funcionando. Mostrar a ferramenta
   convence mais do que descrevê-la.

   A geometria brasileira aparece como textura de fundo —
   losango, círculo, malha de pontos — nunca como bandeira
   aplicada. O produto é privado e independente, e precisa
   parecer isso.
   ========================================================= */

import { html, raw } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { marcaHorizontal, simbolo } from '../ui/brand.js';
import { scorePill, scoreAnel } from '../ui/domain.js';
import { moedaCurta } from '../lib/format.js';

const RECURSOS = [
  { i: 'radar', t: 'Varredura contínua', d: 'O LICITA+ acompanha os portais públicos e traz o que foi publicado, sem você precisar procurar.' },
  { i: 'alvo', t: 'Compatibilidade explicada', d: 'Cada licitação recebe um percentual e a conta que o gerou: CNAE, região, faixa de valor, catálogo e histórico.' },
  { i: 'sino_ativo', t: 'Monitoramentos que trabalham', d: 'Salve uma busca e receba alerta quando algo novo aparecer. Sem abrir a plataforma todo dia.' },
  { i: 'documento', t: 'Edital destrinchado', d: 'Objeto, itens, exigências de habilitação e prazos organizados — não um PDF de 80 páginas.' },
  { i: 'relogio', t: 'Prazo em primeiro plano', d: 'O que encerra antes aparece antes. Prazo é o que mais elimina fornecedor pequeno.' },
  { i: 'grafico', t: 'Histórico que ensina', d: 'Acompanhe o que você ganhou, perdeu e por quanto — e calibre o preço da próxima.' },
];

const PASSOS = [
  { t: 'Cadastre sua empresa', d: 'CNPJ, CNAEs, região de atuação e o que você fornece. Leva cerca de 5 minutos.' },
  { t: 'Receba as oportunidades', d: 'O LICITA+ varre os portais e analisa cada publicação contra o seu perfil.' },
  { t: 'Decida com informação', d: 'Compatibilidade, prazo, valor e exigências na mesma tela. Você decide o que disputar.' },
];

export default {
  titulo: 'LICITA+',
  shell: false,

  render() {
    return html`
<div class="tela-publica">

  <header class="topo-publico">
    ${raw(marcaHorizontal({ tamanho: 34 }))}
    <nav aria-label="Navegação principal">
      <a href="#recursos">Recursos</a>
      <a href="#como-funciona">Como funciona</a>
      <a href="#/entrar">Entrar</a>
    </nav>
    <a class="btn -gradiente" href="#/onboarding">Começar agora</a>
  </header>

  <!-- Herói -->
  <section class="heroi">
    <span class="heroi-geo-1" aria-hidden="true"></span>
    <span class="heroi-geo-2" aria-hidden="true"></span>
    <span class="heroi-geo-3" aria-hidden="true"></span>

    <div class="heroi-grade">
      <div>
        <span class="heroi-selo">
          ${raw(simbolo({ tamanho: 20, comPontos: false }))}
          Inteligência para oportunidades públicas
        </span>

        <h1>Encontre as licitações <em>certas</em> para sua empresa.</h1>

        <p class="heroi-sub">
          O LICITA+ usa inteligência para encontrar, analisar e recomendar oportunidades
          públicas compatíveis com o seu negócio — e mostra <b>por que</b> cada uma foi
          recomendada, não só um número.
        </p>

        <div class="heroi-acoes">
          <a class="btn -gradiente -lg" href="#/onboarding">
            Começar agora ${raw(icone('seta_dir'))}
          </a>
          <a class="btn -secundario -lg" href="#/painel">
            ${raw(icone('olho'))} Conhecer a plataforma
          </a>
        </div>

        <div class="heroi-provas">
          <div>
            <div class="heroi-prova-num">1.360</div>
            <div class="heroi-prova-rot">oportunidades analisadas/mês</div>
          </div>
          <div>
            <div class="heroi-prova-num">27</div>
            <div class="heroi-prova-rot">estados cobertos</div>
          </div>
          <div>
            <div class="heroi-prova-num">7</div>
            <div class="heroi-prova-rot">critérios por recomendação</div>
          </div>
        </div>
      </div>

      <!-- Painel de demonstração -->
      <div class="heroi-arte">
        <div class="heroi-painel">
          <div class="heroi-painel-topo">
            <span class="heroi-painel-bolinha"></span>
            <span class="heroi-painel-bolinha"></span>
            <span class="heroi-painel-bolinha"></span>
            <span class="suave" style="margin-left: var(--e-3); font-size: var(--t-micro)">
              LICITA+ · Painel
            </span>
          </div>

          <div style="padding: var(--e-5); display: grid; gap: var(--e-4)">
            <div class="grade" style="grid-template-columns: repeat(3, 1fr); gap: var(--e-3)">
              ${raw([
                ['Encontradas', '157', 'azul', 'radar'],
                ['Valor', moedaCurta(12600000), 'verde', 'carteira'],
                ['Alta compat.', '89', 'amarelo', 'alvo'],
              ].map(([r, v, c, ic]) => `
                <div style="padding: var(--e-3); border: 1px solid var(--borda); border-radius: var(--r-md)">
                  <div class="linha-entre" style="margin-bottom: var(--e-2)">
                    <span class="rotulo" style="font-size: 10px">${r}</span>
                    <span class="stat-icone -${c}" style="width: 24px; height: 24px; border-radius: 6px">
                      ${icone(ic)}</span>
                  </div>
                  <div style="font-size: 1.24rem; font-weight: var(--p-extra); color: var(--texto-forte);
                    letter-spacing: -.02em">${v}</div>
                </div>`).join(''))}
            </div>

            ${raw([
              ['Aquisição de equipamentos de informática', 'Prefeitura de Salvador — BA', 94],
              ['Suporte técnico e manutenção de parque', 'Governo do Estado da Bahia', 87],
              ['Licenças de software de gestão', 'Universidade Federal da Bahia', 82],
            ].map(([obj, org, score]) => `
              <div style="display: flex; gap: var(--e-3); align-items: center; padding: var(--e-3);
                border: 1px solid var(--borda); border-radius: var(--r-md)">
                <div style="flex: 1; min-width: 0">
                  <div style="font-size: var(--t-corpo-sm); font-weight: var(--p-semi);
                    color: var(--texto-forte); overflow: hidden; text-overflow: ellipsis;
                    white-space: nowrap">${obj}</div>
                  <div class="suave" style="font-size: var(--t-micro); overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap">${org}</div>
                </div>
                ${scorePill(score)}
              </div>`).join(''))}
          </div>
        </div>

        <div class="heroi-flutua" style="right: -18px; top: 22%; animation-delay: .6s">
          <div class="linha" style="gap: var(--e-3)">
            ${raw(scoreAnel({ valor: 94, tamanho: 44, comTexto: false }))}
            <div>
              <div style="font-size: var(--t-micro); font-weight: var(--p-bold); color: var(--verde-600)">
                Alta compatibilidade</div>
              <div class="suave" style="font-size: 11px">7 de 7 critérios</div>
            </div>
          </div>
        </div>

        <div class="heroi-flutua" style="left: -30px; bottom: -22px; animation-delay: 1.6s">
          <div class="linha" style="gap: var(--e-2)">
            <span style="color: var(--amarelo-texto)">${raw(icone('relogio'))}</span>
            <div>
              <div style="font-size: var(--t-micro); font-weight: var(--p-bold)">Encerra em 2 dias</div>
              <div class="suave" style="font-size: 11px">Pregão 012/2026</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Recursos -->
  <section class="secao-publica -alt" id="recursos">
    <div class="secao-interna">
      <div class="secao-titulo-central">
        <h2>Não é um buscador de licitações.</h2>
        <p>
          Buscar é o fácil. O difícil é saber quais das centenas publicadas hoje fazem
          sentido para a sua empresa — e é isso que o LICITA+ resolve.
        </p>
      </div>

      <div class="grade grade-3">
        ${raw(RECURSOS.map((r) => `
          <article class="cartao-recurso">
            <span class="stat-icone -azul" style="width: 42px; height: 42px; margin-bottom: var(--e-4)">
              ${icone(r.i)}</span>
            <h3>${r.t}</h3>
            <p>${r.d}</p>
          </article>`).join(''))}
      </div>
    </div>
  </section>

  <!-- Como funciona -->
  <section class="secao-publica -escura" id="como-funciona">
    <span class="geo geo-losango" style="width: 420px; height: 420px; right: -170px; top: -150px;
      background: linear-gradient(135deg, rgba(22,119,232,.2), rgba(0,140,69,.1))"></span>

    <div class="secao-interna" style="position: relative; z-index: 1">
      <div class="secao-titulo-central">
        <h2>Três passos até a primeira oportunidade</h2>
        <p>Do cadastro à decisão, sem planilha e sem abrir portal por portal.</p>
      </div>

      <div class="grade grade-3">
        ${raw(PASSOS.map((p, i) => `
          <article>
            <span class="passo-num"><span>${i + 1}</span></span>
            <h3 style="font-size: var(--t-h4); margin-bottom: var(--e-2)">${p.t}</h3>
            <p style="color: rgba(255,255,255,.66); font-size: var(--t-corpo-sm); line-height: 1.6">
              ${p.d}</p>
          </article>`).join(''))}
      </div>
    </div>
  </section>

  <!-- Transparência -->
  <section class="secao-publica">
    <div class="secao-interna" style="max-width: 780px; text-align: center">
      <span class="stat-icone -verde" style="width: 52px; height: 52px; margin: 0 auto var(--e-5)">
        ${raw(icone('escudo'))}
      </span>
      <h2 style="font-size: clamp(1.5rem, 2.6vw, 2rem)">O LICITA+ não envia proposta por você</h2>
      <p class="suave" style="margin-top: var(--e-4); line-height: 1.7; font-size: 1.02rem">
        Encontramos, analisamos e organizamos. O envio da proposta é feito por você, na
        plataforma oficial do órgão, com o seu certificado digital — porque proposta é
        ato juridicamente vinculante e a responsabilidade é de quem assina.
        Somos uma plataforma privada e independente, sem vínculo com órgãos públicos.
      </p>
    </div>
  </section>

  <!-- CTA -->
  <section class="secao-publica -alt">
    <div class="secao-interna">
      <div class="cta-final">
        <span class="geo geo-pontos" style="inset: 0; color: var(--branco); opacity: .1"></span>
        <div style="position: relative">
          <h2>Comece a encontrar oportunidades hoje</h2>
          <p>Cadastre o perfil da sua empresa e veja o que já está aberto para você.</p>
          <div class="linha" style="justify-content: center; gap: var(--e-3); margin-top: var(--e-8);
            flex-wrap: wrap">
            <a class="btn -lg" href="#/onboarding"
              style="background: var(--branco); color: var(--azul-900)">
              Começar agora ${raw(icone('seta_dir'))}
            </a>
            <a class="btn -lg -fantasma" href="#/entrar" style="color: var(--branco); border-color: rgba(255,255,255,.3)">
              Já tenho conta
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="rodape-publico">
    <div class="rodape-interno">
      ${raw(marcaHorizontal({ tamanho: 32, comTagline: true }))}
      <p class="tenue" style="font-size: var(--t-micro); max-width: 46ch; text-align: right">
        Protótipo de demonstração. Os dados exibidos são fictícios e não representam
        licitações reais.
      </p>
    </div>
  </footer>
</div>`;
  },
};

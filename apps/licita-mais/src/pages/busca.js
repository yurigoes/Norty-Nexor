/* =========================================================
   LICITA+ — Busca inteligente
   ---------------------------------------------------------
   Tela de entrada única, com o campo grande no centro. A
   diferença para a lista de oportunidades é a intenção: aqui
   o usuário chega sem saber o que quer, então a tela oferece
   caminhos em vez de filtros.

   Os atalhos abaixo do campo saem do perfil da empresa — são
   as palavras-chave que ele mesmo declarou nas linhas de
   fornecimento, e os estados em que disse atuar. Uma lista
   fixa de "buscas populares" seria decoração; esta é a
   pergunta que o perfil já responde.
   ========================================================= */

import { html, raw, $, ao, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { irPara } from '../lib/router.js';
import { busca, skeletonCartao } from '../ui/primitives.js';
import { cartaoOportunidade } from '../ui/domain.js';
import { obterEmpresa, listarOportunidades } from '../dados/index.js';

/** Palavras-chave declaradas no perfil, sem repetir. */
function termosDoPerfil(perfil) {
  const termos = (perfil?.linhas ?? []).flatMap((l) => l.palavrasChave ?? []);
  return [...new Set(termos.map((t) => t.trim()).filter(Boolean))].slice(0, 10);
}

/** Atalhos derivados do perfil, cada um uma consulta de verdade. */
function atalhos(perfil) {
  const saida = [];

  for (const linha of (perfil?.linhas ?? []).slice(0, 2)) {
    saida.push({
      rotulo: linha.nome,
      icone: 'maleta',
      consulta: { termo: linha.palavrasChave?.[0] ?? linha.nome },
    });
  }

  if (perfil?.municipio) {
    saida.push({
      rotulo: `Oportunidades em ${perfil.municipio}`,
      icone: 'pin',
      consulta: { termo: perfil.municipio },
    });
  }

  if (perfil?.uf) {
    saida.push({ rotulo: `Tudo em ${perfil.uf}`, icone: 'marcador', consulta: { uf: perfil.uf } });
  }

  saida.push({
    rotulo: 'Só o que é bem compatível',
    icone: 'alvo',
    consulta: { compatMin: '80' },
  });

  return saida.slice(0, 4);
}

const paraHash = (consulta) => {
  const partes = new URLSearchParams();
  for (const [chave, valor] of Object.entries(consulta)) {
    if (valor) partes.set(chave === 'termo' ? 'q' : chave, valor);
  }
  const texto = partes.toString();
  return texto ? `/oportunidades?${texto}` : '/oportunidades';
};

export default {
  titulo: 'Buscar licitações',
  trilha: ['Início', 'Buscar'],
  nav: 'busca',

  esqueleto: () => skeletonCartao(2),

  async render() {
    const [perfil, melhores] = await Promise.all([
      obterEmpresa().catch(() => null),
      listarOportunidades({ ordem: 'compatibilidade', tamanho: 3 }),
    ]);

    const nomeEmpresa = perfil?.nomeFantasia || perfil?.razaoSocial || 'sua empresa';
    const termos = termosDoPerfil(perfil);
    const sugestoes = atalhos(perfil);

    return html`
<div class="pilha-lg">

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
        contra o perfil da ${nomeEmpresa}.
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

      ${raw(termos.length ? `
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; justify-content: center; margin-top: var(--e-6)">
        <span class="rotulo" style="width: 100%; margin-bottom: 2px">Do seu catálogo</span>
        ${termos.map((t) => `<button class="filtro-pill" data-acao="termo" data-termo="${t}">${t}</button>`).join('')}
      </div>` : `
      <p class="tenue" style="margin-top: var(--e-6); font-size: var(--t-micro)">
        Declare o que a sua empresa vende em
        <a href="#/empresa" style="font-weight: var(--p-semi)">Minha empresa</a>
        e os atalhos aparecem aqui.
      </p>`)}
    </div>
  </section>

  <section>
    <h2 class="titulo-seccao" style="margin-bottom: var(--e-4)">Sugestões para o seu perfil</h2>
    <div class="grade grade-4">
      ${raw(sugestoes.map((s) => `
        <a class="card -interativo" href="#${paraHash(s.consulta)}" style="text-align: left; display: block">
          <div class="card-corpo pilha-sm">
            <span class="stat-icone -azul">${icone(s.icone)}</span>
            <div style="font-weight: var(--p-semi); color: var(--texto-forte); font-size: var(--t-corpo-sm);
              margin-top: var(--e-2)">${s.rotulo}</div>
            <span class="suave" style="font-size: var(--t-micro)">Ver resultados →</span>
          </div>
        </a>`).join(''))}
    </div>
  </section>

  ${raw(melhores.itens.length ? `
  <section>
    <div class="cabecalho-secao" style="margin-bottom: var(--e-4)">
      <div>
        <h2 class="titulo-seccao">Mais compatíveis agora</h2>
        <p class="suave" style="font-size: var(--t-corpo-sm); margin-top: 2px">
          O que o LICITA+ separou para você sem que você precisasse pedir.
        </p>
      </div>
      <a class="btn -fantasma -sm" href="#/oportunidades">Ver todas ${icone('seta_dir')}</a>
    </div>
    <div class="pilha">${melhores.itens.map((l) => cartaoOportunidade(l)).join('')}</div>
  </section>` : '')}
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
    aoClicarEm(raiz, '[data-acao="termo"]', (_evento, alvo) => disparar(alvo.dataset.termo));
  },
};

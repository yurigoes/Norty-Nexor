/* =========================================================
   LICITA+ — Recomendações
   ---------------------------------------------------------
   A lista de oportunidades mostra tudo; esta mostra o que o
   sistema defende. A diferença precisa aparecer na tela: cada
   cartão vem com a frase que justifica a recomendação, e não
   só com o número.
   ========================================================= */

import { html, raw, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { cartaoOportunidade, cabecalhoPagina, scorePill } from '../ui/domain.js';
import { abrirModal, alerta, vazio } from '../ui/primitives.js';
import { corpoExplicacao } from '../ui/domain.js';
import { licitacoes, empresa } from '../data/mock.js';
import { licitacaoPorId } from '../data/mock.js';

/** Frase curta que resume por que a oportunidade subiu. */
function justificativa(licitacao) {
  const fortes = licitacao.razoes.filter((r) => r.ok).map((r) => r.titulo.toLowerCase());
  const faltando = licitacao.razoes.filter((r) => !r.ok);

  const positivo = fortes.slice(0, 3).join(', ');
  const ressalva = faltando.length
    ? ` Ponto de atenção: ${faltando[0].titulo.toLowerCase()}.`
    : ' Todos os critérios do seu perfil foram atendidos.';

  return `Recomendada por ${positivo}.${ressalva}`;
}

export default {
  titulo: 'Recomendações',
  trilha: ['Início', 'Recomendações'],
  nav: 'recomendacoes',

  render() {
    const ordenadas = [...licitacoes]
      .filter((l) => l.compatibilidade >= 60)
      .sort((a, b) => b.compatibilidade - a.compatibilidade);

    if (ordenadas.length === 0) {
      return vazio({
        nomeIcone: 'alvo',
        titulo: 'Ainda não há recomendações',
        texto: 'Complete o perfil da sua empresa para o LICITA+ conseguir avaliar as oportunidades.',
        acao: '<a class="btn -primario" href="#/empresa">Completar perfil</a>',
      });
    }

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Recomendadas para você',
    subtitulo: `O LICITA+ analisou o perfil da ${empresa.nomeFantasia} e encontrou oportunidades
      que podem fazer sentido para o seu negócio.`,
  }))}

  ${raw(alerta({
    variante: 'info',
    nomeIcone: 'faisca',
    texto: `A recomendação cruza <b>CNAE</b>, <b>segmento</b>, <b>região</b>, <b>faixa de valor</b>,
      <b>catálogo</b>, <b>histórico</b> e <b>prazo</b>. Clique em "Por que?" em qualquer cartão
      para ver a conta inteira.`,
  }))}

  <div class="pilha">
    ${raw(ordenadas.map((l) => `
      <div class="pilha-sm">
        ${cartaoOportunidade(l)}
        <div class="linha" style="gap: var(--e-3); padding: var(--e-3) var(--e-5);
          background: var(--superficie-afundada); border-radius: var(--r-md);
          border: 1px solid var(--borda-suave)">
          <span style="flex: none; color: var(--azul-600)">${icone('faisca')}</span>
          <p style="font-size: var(--t-corpo-sm); color: var(--texto-padrao); line-height: 1.55; flex: 1">
            ${justificativa(l)}
          </p>
          <button class="btn -fantasma -sm" data-acao="porque" data-id="${l.id}" style="flex: none">
            Por que? ${icone('chevron_dir')}
          </button>
        </div>
      </div>`).join(''))}
  </div>
</div>`;
  },

  ativar(raiz) {
    aoClicarEm(raiz, '[data-acao="porque"]', (_evento, alvo) => {
      const licitacao = licitacaoPorId(alvo.dataset.id);
      if (!licitacao) return;
      abrirModal({
        titulo: 'Por que recomendamos esta oportunidade?',
        subtitulo: licitacao.objeto,
        corpo: corpoExplicacao(licitacao),
        rodape: `<a class="btn -secundario" href="#/oportunidade/${licitacao.id}"
                   data-acao="fechar-modal">Ver oportunidade</a>
                 <button class="btn -primario" data-acao="fechar-modal">Entendi</button>`,
      });
    });
  },
};

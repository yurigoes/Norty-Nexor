/* =========================================================
   LICITA+ — Recomendações
   ---------------------------------------------------------
   A lista de oportunidades mostra tudo; esta mostra o que o
   sistema defende. A diferença precisa aparecer na tela: cada
   cartão vem com a frase que justifica a recomendação, e não
   só com o número.

   O corte é em 60%: abaixo disso a triagem não está
   recomendando, está apenas não descartando — e chamar isso de
   recomendação gastaria a confiança que o número construiu.
   ========================================================= */

import { html, raw, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { cartaoOportunidade, cabecalhoPagina, corpoExplicacao } from '../ui/domain.js';
import { abrirModal, alerta, vazio, toast, skeletonCartao } from '../ui/primitives.js';
import { listarOportunidades, obterOportunidade } from '../dados/index.js';

const COMPATIBILIDADE_MINIMA = 60;

/** Frase curta que resume por que a oportunidade subiu. */
function justificativa(licitacao) {
  const pontos = (r) => r.pontos ?? (r.ok ? r.peso : 0);

  const fortes = licitacao.razoes.filter((r) => pontos(r) >= r.peso).map((r) => r.titulo.toLowerCase());
  const zerados = licitacao.razoes.filter((r) => pontos(r) === 0);

  const positivo = fortes.length
    ? `Recomendada por ${fortes.slice(0, 3).join(', ')}.`
    : 'Recomendada pela soma dos critérios, sem nenhum deles no máximo.';

  const ressalva = zerados.length
    ? ` Ponto de atenção: ${zerados[0].titulo.toLowerCase()}.`
    : ' Todos os critérios do seu perfil pontuaram.';

  return positivo + ressalva;
}

export default {
  titulo: 'Recomendações',
  trilha: ['Início', 'Recomendações'],
  nav: 'recomendacoes',

  esqueleto: () => skeletonCartao(3),

  async render() {
    const { itens } = await listarOportunidades({
      ordem: 'compatibilidade',
      compatMin: COMPATIBILIDADE_MINIMA,
      tamanho: 20,
    });

    if (itens.length === 0) {
      return vazio({
        nomeIcone: 'alvo',
        titulo: 'Ainda não há recomendações',
        texto: `Nada alcançou ${COMPATIBILIDADE_MINIMA}% de compatibilidade com o seu perfil. Declarar mais linhas de fornecimento e ampliar a região de atuação é o que mais muda esse número.`,
        acao: '<a class="btn -primario" href="#/empresa">Completar perfil</a>',
      });
    }

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Recomendadas para você',
    subtitulo: `Oportunidades com ${COMPATIBILIDADE_MINIMA}% ou mais de aderência ao perfil da sua
      empresa, da maior para a menor.`,
  }))}

  ${raw(alerta({
    variante: 'info',
    nomeIcone: 'faisca',
    texto: `A nota soma cinco critérios: <b>aderência ao que você vende</b> (45),
      <b>região</b> (20), <b>faixa de valor</b> (15), <b>modalidade</b> (10) e
      <b>exclusividade ME/EPP</b> (10). Clique em "Por que?" para ver a conta inteira.`,
  }))}

  <div class="pilha">
    ${raw(itens.map((l) => `
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
    aoClicarEm(raiz, '[data-acao="porque"]', async (_evento, alvo) => {
      try {
        const licitacao = await obterOportunidade(alvo.dataset.id);
        abrirModal({
          titulo: 'Por que recomendamos esta oportunidade?',
          subtitulo: licitacao.objeto,
          corpo: corpoExplicacao(licitacao),
          rodape: `<a class="btn -secundario" href="#/oportunidade/${licitacao.id}"
                     data-acao="fechar-modal">Ver oportunidade</a>
                   <button class="btn -primario" data-acao="fechar-modal">Entendi</button>`,
        });
      } catch (erro) {
        toast('Não foi possível abrir a explicação', { variante: 'erro', sub: erro.message });
      }
    });
  },
};

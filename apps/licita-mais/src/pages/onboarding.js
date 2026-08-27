/* =========================================================
   LICITA+ — Primeiro acesso
   ---------------------------------------------------------
   Roda depois do cadastro, com a conta já criada: aqui não se
   pergunta quem é a empresa, e sim o que ela vende e onde. É a
   diferença entre um formulário de registro e a calibragem do
   radar.

   Cada resposta vira campo do perfil e, no fim, uma escrita
   real em `PUT /empresa`. As categorias não viram rótulo
   decorativo — cada uma se transforma numa **linha de
   fornecimento** com as palavras que de fato aparecem em
   edital. É o que faz "notebook" casar com "microcomputador
   portátil" já na primeira varredura, sem o usuário precisar
   adivinhar o vocabulário do órgão.

   Quem pula chega ao painel com o perfil mínimo do cadastro e
   pode completar depois em Minha empresa. Bloquear a entrada
   até o formulário acabar é o caminho mais curto para o
   abandono.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { marcaHorizontal } from '../ui/brand.js';
import { campo, toast } from '../ui/primitives.js';
import { comCarregamento } from '../ui/carregando.js';
import { irPara } from '../lib/router.js';
import { UFS, MODALIDADES_PNCP } from '../lib/tabelas.js';
import { obterEmpresa, salvarEmpresa } from '../dados/index.js';

const TOTAL = 4;

/**
 * Cada categoria carrega o vocabulário de edital correspondente.
 * Órgão não escreve "notebook" — escreve "microcomputador
 * portátil". Entregar esse dicionário pronto é boa parte do
 * valor do primeiro acesso.
 */
const CATALOGO = [
  {
    chave: 'informatica', rotulo: 'Equipamentos de informática', icone: 'painel',
    palavrasChave: ['notebook', 'microcomputador', 'computador', 'monitor', 'impressora', 'nobreak', 'scanner', 'periférico'],
    palavrasExcluidas: ['locação', 'comodato', 'outsourcing'],
  },
  {
    chave: 'ti', rotulo: 'Serviços de TI e software', icone: 'raio',
    palavrasChave: ['suporte técnico', 'manutenção de computadores', 'licença de software', 'help desk', 'infraestrutura de rede', 'cabeamento estruturado'],
    palavrasExcluidas: [],
  },
  {
    chave: 'expediente', rotulo: 'Material de expediente', icone: 'documento',
    palavrasChave: ['material de expediente', 'papel a4', 'toner', 'cartucho', 'material de escritório'],
    palavrasExcluidas: [],
  },
  {
    chave: 'limpeza', rotulo: 'Material de limpeza e higiene', icone: 'faisca',
    palavrasChave: ['material de limpeza', 'higiene', 'papel higiênico', 'saco de lixo', 'desinfetante'],
    palavrasExcluidas: ['prestação de serviço de limpeza'],
  },
  {
    chave: 'mobiliario', rotulo: 'Mobiliário', icone: 'maleta',
    palavrasChave: ['mobiliário', 'cadeira', 'mesa de escritório', 'armário', 'estante'],
    palavrasExcluidas: [],
  },
  {
    chave: 'manutencao', rotulo: 'Manutenção predial e obras', icone: 'martelo',
    palavrasChave: ['manutenção predial', 'reforma', 'material de construção', 'elétrica', 'hidráulica'],
    palavrasExcluidas: [],
  },
  {
    chave: 'saude', rotulo: 'Material e equipamento de saúde', icone: 'escudo',
    palavrasChave: ['material hospitalar', 'equipamento médico', 'material odontológico', 'insumo laboratorial'],
    palavrasExcluidas: ['medicamento'],
  },
  {
    chave: 'alimentacao', rotulo: 'Gêneros alimentícios', icone: 'carteira',
    palavrasChave: ['gênero alimentício', 'alimentação escolar', 'hortifruti', 'cesta básica'],
    palavrasExcluidas: [],
  },
];

/* ---------- Estado do assistente ---------- */

const resposta = {
  fornece: new Set(),
  regiao: new Set(),
  modalidades: new Set([6, 8, 12]),
  valorMinimo: 0,
  valorMaximo: 80000,
};

let atual = 1;
let perfilBase = null;

/* ---------- Marcação ---------- */

function trilha(passo) {
  return `<div class="onb-trilha" role="progressbar" aria-valuenow="${passo}" aria-valuemin="1"
    aria-valuemax="${TOTAL}" aria-label="Passo ${passo} de ${TOTAL}">
    ${Array.from({ length: TOTAL }, (_, i) =>
      `<span class="${i < passo ? '-feito' : ''}"></span>`).join('')}
  </div>`;
}

function opcoes(itens, selecionadas, acao) {
  return `<div class="onb-opcoes">
    ${itens.map((item) => {
      const chave = item.chave ?? item;
      const rotulo = item.rotulo ?? item;
      const marcada = selecionadas.has(chave);
      return `<button type="button" class="onb-opcao ${marcada ? '-marcada' : ''}"
        data-acao="${acao}" data-chave="${chave}" aria-pressed="${marcada}">
        <span class="onb-opcao-marca">${icone('check')}</span>
        ${item.icone ? `<span style="color: var(--azul-600); flex: none">${icone(item.icone)}</span>` : ''}
        <span style="font-size: var(--t-corpo-sm); font-weight: var(--p-medio)">${rotulo}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function passo(n) {
  const nome = perfilBase?.nomeFantasia || perfilBase?.razaoSocial || 'sua empresa';

  const telas = {
    1: () => `<div class="onb-passo" style="text-align: center">
        <div style="display: flex; justify-content: center; margin-bottom: var(--e-8)">
          ${marcaHorizontal({ tamanho: 52, comTagline: true })}
        </div>
        <h2>Conta criada. Vamos calibrar o radar.</h2>
        <p style="max-width: 48ch; margin-left: auto; margin-right: auto">
          Três perguntas sobre o que a ${nome} vende, onde entrega e em que faixa de
          valor compensa disputar. É isso que separa as licitações que interessam das
          milhares que são publicadas todo dia.
        </p>
        <button class="btn -gradiente -lg" data-acao="avancar" style="margin-top: var(--e-8)">
          Começar ${icone('seta_dir')}
        </button>
      </div>`,

    2: () => `<div class="onb-passo">
        <h2>O que a sua empresa vende?</h2>
        <p>
          Cada categoria escolhida vira uma lista de palavras que aparecem em edital —
          incluindo as que o órgão usa e você não usaria. Dá para ajustar tudo depois.
        </p>
        ${opcoes(CATALOGO, resposta.fornece, 'fornece')}
        <div class="alerta-bloco -info" style="margin-top: var(--e-5)">
          ${icone('info')}
          <div>Este é o critério que mais pesa: <b>45 dos 100 pontos</b> da
          compatibilidade vêm da aderência entre o objeto do edital e o que você
          declara aqui.</div>
        </div>
      </div>`,

    3: () => `<div class="onb-passo">
        <h2>Onde a sua empresa consegue entregar?</h2>
        <p>
          Frete e prazo de entrega pesam no preço. Fora destes estados a oportunidade é
          descartada — não apenas rebaixada.
        </p>
        ${opcoes(UFS, resposta.regiao, 'regiao')}
      </div>`,

    4: () => `<div class="onb-passo">
        <h2>Em que faixa compensa disputar?</h2>
        <p>
          Abaixo do mínimo o esforço não paga. Acima do máximo, lembre que em licitação
          você entrega antes de receber.
        </p>

        <div class="grade grade-2" style="gap: var(--e-4); margin-top: var(--e-6)">
          ${campo({
            rotulo: 'Valor mínimo', id: 'onb-min', tipo: 'number',
            valor: resposta.valorMinimo, placeholder: 'R$ 0',
          })}
          ${campo({
            rotulo: 'Valor máximo', id: 'onb-max', tipo: 'number',
            valor: resposta.valorMaximo, placeholder: 'R$ 80.000',
          })}
        </div>

        <div style="margin-top: var(--e-6)">
          <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Modalidades</div>
          <div class="linha" style="gap: var(--e-2); flex-wrap: wrap">
            ${MODALIDADES_PNCP.filter((m) => m.entrada || resposta.modalidades.has(m.codigo))
              .map((m) => `<button type="button"
                class="filtro-pill ${resposta.modalidades.has(m.codigo) ? '-ativo' : ''}"
                data-acao="modalidade" data-codigo="${m.codigo}"
                aria-pressed="${resposta.modalidades.has(m.codigo)}">
                ${resposta.modalidades.has(m.codigo) ? icone('check') : ''}${m.nome}
              </button>`).join('')}
          </div>
          <span class="campo-ajuda" style="display: block; margin-top: var(--e-3)">
            Estas três são as portas de entrada: ritos curtos e de valor baixo. As demais
            pedem estrutura documental que raramente compensa antes das primeiras vitórias —
            você pode habilitá-las depois em Minha empresa.
          </span>
        </div>

        <div class="alerta-bloco -info" style="margin-top: var(--e-5)">
          ${icone('escudo')}
          <div>Até <b>R$ 80 mil por item</b> a contratação pode ser reservada a ME e EPP
          (LC 123/2006). Se a sua empresa se enquadra, é aí que a concorrência é menor.</div>
        </div>
      </div>`,
  };

  return telas[n]();
}

function rodape(n) {
  if (n === 1) return '';

  return `<div class="linha-entre" style="margin-top: var(--e-10)">
    <button class="btn -fantasma" data-acao="voltar">${icone('seta_esq')} Voltar</button>
    <button class="btn -primario" data-acao="${n === TOTAL ? 'concluir' : 'avancar'}" id="btn-onb">
      ${n === TOTAL ? 'Salvar e ver oportunidades' : 'Continuar'} ${icone('seta_dir')}
    </button>
  </div>`;
}

/* ---------- Página ---------- */

export default {
  titulo: 'Configurar perfil',
  shell: false,

  async render() {
    atual = 1;
    perfilBase = await obterEmpresa().catch(() => null);

    // Semeia com o que o cadastro já sabe, em vez de pedir de novo.
    resposta.regiao = new Set(perfilBase?.estadosAtuacao?.length
      ? perfilBase.estadosAtuacao
      : [perfilBase?.uf].filter(Boolean));

    return html`
<div class="tela-publica onb">
  <span class="heroi-geo-1" aria-hidden="true"></span>
  <span class="heroi-geo-2" aria-hidden="true"></span>
  <span class="heroi-geo-3" aria-hidden="true"></span>

  <div class="onb-caixa">
    <div id="onb-trilha">${raw(trilha(1))}</div>
    <div class="card">
      <div class="card-corpo" style="padding: var(--e-10)">
        <div id="onb-conteudo">${raw(passo(1))}</div>
        <div id="onb-rodape">${raw(rodape(1))}</div>
      </div>
    </div>

    <p class="tenue" style="text-align: center; margin-top: var(--e-5); font-size: var(--t-micro)">
      Pode deixar para depois —
      <a href="#/painel" style="font-weight: var(--p-semi)">ir direto ao painel</a>
      e completar em Minha empresa.
    </p>
  </div>
</div>`;
  },

  ativar(raiz) {
    const conteudo = $('#onb-conteudo', raiz);
    const rodapeEl = $('#onb-rodape', raiz);
    const trilhaEl = $('#onb-trilha', raiz);

    const pintar = () => {
      conteudo.innerHTML = passo(atual);
      rodapeEl.innerHTML = rodape(atual);
      trilhaEl.innerHTML = trilha(atual);
    };

    const guardarFaixa = () => {
      const minimo = $('#onb-min', raiz);
      const maximo = $('#onb-max', raiz);
      if (minimo) resposta.valorMinimo = Number(minimo.value) || 0;
      if (maximo) resposta.valorMaximo = Number(maximo.value) || 0;
    };

    aoClicarEm(raiz, '[data-acao="avancar"]', () => {
      if (atual === 2 && resposta.fornece.size === 0) {
        toast('Escolha ao menos uma categoria', {
          variante: 'erro',
          sub: 'Sem isso a triagem não tem com o que comparar o edital.',
        });
        return;
      }
      if (atual === 3 && resposta.regiao.size === 0) {
        toast('Escolha ao menos um estado', {
          variante: 'erro',
          sub: 'Fora dos estados declarados a oportunidade é descartada.',
        });
        return;
      }

      atual = Math.min(TOTAL, atual + 1);
      pintar();
    });

    aoClicarEm(raiz, '[data-acao="voltar"]', () => {
      if (atual === TOTAL) guardarFaixa();
      atual = Math.max(1, atual - 1);
      pintar();
    });

    aoClicarEm(raiz, '[data-acao="fornece"], [data-acao="regiao"]', (_evento, alvo) => {
      const conjunto = alvo.dataset.acao === 'fornece' ? resposta.fornece : resposta.regiao;
      const chave = alvo.dataset.chave;

      if (conjunto.has(chave)) conjunto.delete(chave);
      else conjunto.add(chave);

      const marcada = conjunto.has(chave);
      alvo.classList.toggle('-marcada', marcada);
      alvo.setAttribute('aria-pressed', String(marcada));
    });

    aoClicarEm(raiz, '[data-acao="modalidade"]', (_evento, alvo) => {
      const codigo = Number(alvo.dataset.codigo);
      if (resposta.modalidades.has(codigo)) resposta.modalidades.delete(codigo);
      else resposta.modalidades.add(codigo);

      const ativo = resposta.modalidades.has(codigo);
      alvo.classList.toggle('-ativo', ativo);
      alvo.setAttribute('aria-pressed', String(ativo));
    });

    aoClicarEm(raiz, '[data-acao="concluir"]', async (_evento, alvo) => {
      guardarFaixa();

      if (resposta.valorMaximo && resposta.valorMaximo < resposta.valorMinimo) {
        toast('O valor máximo está abaixo do mínimo', { variante: 'erro' });
        return;
      }

      alvo.disabled = true;

      const linhas = CATALOGO
        .filter((c) => resposta.fornece.has(c.chave))
        .map((c) => ({
          nome: c.rotulo,
          palavrasChave: c.palavrasChave,
          palavrasExcluidas: c.palavrasExcluidas,
        }));

      try {
        await salvarEmpresa({
          estadosAtuacao: [...resposta.regiao],
          modalidades: [...resposta.modalidades],
          valorMinimo: resposta.valorMinimo,
          valorMaximo: resposta.valorMaximo,
          linhas,
        });
      } catch (erro) {
        alvo.disabled = false;
        toast('Não foi possível salvar o perfil', { variante: 'erro', sub: erro.message });
        return;
      }

      comCarregamento(
        {
          texto: 'Montando o seu radar…',
          etapas: [
            'Gravando o perfil da empresa',
            'Preparando a próxima varredura',
            'Abrindo o painel',
          ],
          duracao: 2200,
        },
        () => {
          irPara('/painel');
          toast('Perfil salvo', {
            variante: 'sucesso',
            sub: `${linhas.length} linha${linhas.length === 1 ? '' : 's'} de fornecimento e ${resposta.regiao.size} estado${resposta.regiao.size === 1 ? '' : 's'} declarados.`,
          });
        },
      );
    });
  },
};

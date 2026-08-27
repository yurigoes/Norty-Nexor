/* =========================================================
   LICITA+ — Onboarding
   ---------------------------------------------------------
   Cinco passos que existem por uma razão: cada resposta vira
   um critério de recomendação. Por isso cada tela diz o que a
   informação faz — pedir CNAE sem explicar para quê é o
   caminho mais curto para o abandono.

   O estado vive num objeto só e a barra de progresso reflete
   o passo; não há navegação por URL entre passos de propósito,
   porque voltar pelo botão do navegador quebraria a sequência.
   ========================================================= */

import { html, raw, $, $$, ao, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { marcaHorizontal } from '../ui/brand.js';
import { campo, seletor, toast } from '../ui/primitives.js';
import { irPara } from '../lib/router.js';

const TOTAL = 5;

const resposta = {
  empresa: '',
  cnpj: '',
  porte: 'epp',
  fornece: new Set(),
  regiao: new Set(['BA']),
};

const FORNECIMENTO = [
  { chave: 'informatica', rotulo: 'Equipamentos de informática', icone: 'painel' },
  { chave: 'ti', rotulo: 'Serviços de TI e software', icone: 'raio' },
  { chave: 'expediente', rotulo: 'Material de expediente', icone: 'documento' },
  { chave: 'limpeza', rotulo: 'Material de limpeza', icone: 'faisca' },
  { chave: 'mobiliario', rotulo: 'Mobiliário', icone: 'maleta' },
  { chave: 'manutencao', rotulo: 'Manutenção e obras', icone: 'martelo' },
  { chave: 'saude', rotulo: 'Equipamentos médicos', icone: 'escudo' },
  { chave: 'outros', rotulo: 'Outros', icone: 'mais' },
];

const ESTADOS = ['BA', 'SE', 'PE', 'AL', 'SP', 'RJ', 'MG', 'DF', 'Brasil todo'];

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
  const telas = {
    1: () => `<div class="onb-passo" style="text-align: center">
        <div style="display: flex; justify-content: center; margin-bottom: var(--e-8)">
          ${marcaHorizontal({ tamanho: 52, comTagline: true })}
        </div>
        <h2>Bem-vindo ao LICITA+</h2>
        <p style="max-width: 46ch; margin-left: auto; margin-right: auto">
          Encontre licitações que realmente fazem sentido para sua empresa.
          Vamos montar seu perfil em cinco passos rápidos — é ele que alimenta
          as recomendações.
        </p>
        <button class="btn -gradiente -lg" data-acao="avancar" style="margin-top: var(--e-8)">
          Começar ${icone('seta_dir')}
        </button>
      </div>`,

    2: () => `<div class="onb-passo">
        <h2>Conte sobre sua empresa</h2>
        <p>Usamos o CNPJ para descobrir seus CNAEs e o seu porte automaticamente.</p>
        <div class="pilha" style="margin-top: var(--e-8)">
          ${campo({ rotulo: 'Razão social ou nome fantasia', id: 'onb-empresa',
            valor: resposta.empresa, placeholder: 'Nexor Suprimentos' })}
          ${campo({ rotulo: 'CNPJ', id: 'onb-cnpj', valor: resposta.cnpj,
            placeholder: '00.000.000/0001-00', ajuda: 'Só números ou com máscara — nós formatamos.' })}
          ${seletor({ rotulo: 'Porte da empresa', id: 'onb-porte', valor: resposta.porte, opcoes: [
            { valor: 'mei', rotulo: 'MEI' },
            { valor: 'me', rotulo: 'Microempresa' },
            { valor: 'epp', rotulo: 'Empresa de Pequeno Porte' },
            { valor: 'demais', rotulo: 'Demais portes' },
          ] })}
        </div>
        <div class="alerta-bloco -info" style="margin-top: var(--e-5)">
          ${icone('info')}
          <div>ME e EPP têm acesso à cota exclusiva de até <b>R$ 80 mil por item</b>
          (LC 123/2006). O LICITA+ pontua essas oportunidades mais alto.</div>
        </div>
      </div>`,

    3: () => `<div class="onb-passo">
        <h2>Quais oportunidades você procura?</h2>
        <p>Escolha o que a sua empresa fornece. Isso define o que aparece no seu radar.</p>
        ${opcoes(FORNECIMENTO, resposta.fornece, 'fornece')}
      </div>`,

    4: () => `<div class="onb-passo">
        <h2>Onde sua empresa atua?</h2>
        <p>Entrega e frete pesam no preço. Selecione só onde você consegue atender.</p>
        ${opcoes(ESTADOS, resposta.regiao, 'regiao')}
      </div>`,

    5: () => `<div class="onb-passo onb-final">
        <span class="onb-final-marca">${icone('check')}</span>
        <h2>Pronto!</h2>
        <p style="max-width: 44ch; margin: var(--e-3) auto 0">
          Seu perfil está preparado. Agora vamos encontrar oportunidades para você —
          já separamos <b>23 licitações</b> abertas que batem com o que você declarou.
        </p>
        <button class="btn -gradiente -lg" data-acao="concluir" style="margin-top: var(--e-8)">
          Ver minhas oportunidades ${icone('seta_dir')}
        </button>
      </div>`,
  };

  return telas[n]();
}

function rodape(n) {
  if (n === 1 || n === 5) return '';
  return `<div class="linha-entre" style="margin-top: var(--e-10)">
    <button class="btn -fantasma" data-acao="voltar">${icone('seta_esq')} Voltar</button>
    <button class="btn -primario" data-acao="avancar">
      ${n === 4 ? 'Concluir' : 'Continuar'} ${icone('seta_dir')}
    </button>
  </div>`;
}

let atual = 1;

export default {
  titulo: 'Criar conta',
  shell: false,

  render() {
    atual = 1;
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
      Demonstração — nenhum dado é enviado.
      <a href="#/painel" style="font-weight: var(--p-semi)">Pular e ir ao painel</a>
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

    const guardarPasso2 = () => {
      resposta.empresa = $('#onb-empresa', raiz)?.value.trim() ?? '';
      resposta.cnpj = $('#onb-cnpj', raiz)?.value.trim() ?? '';
      resposta.porte = $('#onb-porte', raiz)?.value ?? 'epp';
    };

    aoClicarEm(raiz, '[data-acao="avancar"]', () => {
      if (atual === 2) {
        guardarPasso2();
        if (!resposta.empresa) {
          toast('Informe o nome da empresa', { variante: 'erro', sub: 'É por ele que identificamos seu perfil.' });
          return;
        }
      }
      if (atual === 3 && resposta.fornece.size === 0) {
        toast('Escolha ao menos uma categoria', { variante: 'erro', sub: 'É o que define o que entra no seu radar.' });
        return;
      }
      atual = Math.min(TOTAL, atual + 1);
      pintar();
    });

    aoClicarEm(raiz, '[data-acao="voltar"]', () => {
      if (atual === 2) guardarPasso2();
      atual = Math.max(1, atual - 1);
      pintar();
    });

    // Alternância de seleção múltipla nos passos 3 e 4.
    aoClicarEm(raiz, '[data-acao="fornece"], [data-acao="regiao"]', (_evento, alvo) => {
      const conjunto = alvo.dataset.acao === 'fornece' ? resposta.fornece : resposta.regiao;
      const chave = alvo.dataset.chave;

      if (conjunto.has(chave)) conjunto.delete(chave);
      else conjunto.add(chave);

      const marcada = conjunto.has(chave);
      alvo.classList.toggle('-marcada', marcada);
      alvo.setAttribute('aria-pressed', String(marcada));
    });

    aoClicarEm(raiz, '[data-acao="concluir"]', () => {
      irPara('/painel');
      toast('Perfil criado', {
        variante: 'sucesso',
        sub: 'Encontramos 23 oportunidades abertas compatíveis com o que você declarou.',
      });
    });
  },
};

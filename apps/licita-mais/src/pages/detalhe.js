/* =========================================================
   LICITA+ — Detalhe da oportunidade
   ---------------------------------------------------------
   A tela em que a decisão acontece. A ordem responde às cinco
   perguntas na sequência em que elas surgem: o que é, por que
   interessa, o que exatamente está sendo comprado, o que
   preciso ler, e quando cada coisa acontece.

   A análise de compatibilidade vem antes do resumo de
   propósito: quem abriu a página já sabe o objeto — o que
   ainda não sabe é se vale o próprio tempo.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, data, dataHora, prazoTexto, prazoUrgente, cnpj, faixaScore } from '../lib/format.js';
import { scoreAnel, listaRazoes, corpoExplicacao } from '../ui/domain.js';
import { selo, abas, ativarAbas, toast, alerta, abrirModal } from '../ui/primitives.js';
import { licitacaoPorId } from '../data/mock.js';
import { ehFavorito, alternarFavorito } from '../lib/store.js';
import { vazio } from '../ui/primitives.js';

function painelItens(licitacao) {
  const total = licitacao.itens.reduce((s, i) => s + i.qtd * i.unitario, 0);

  return html`<div class="tabela-caixa">
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr>
          <th style="width: 48px">Item</th>
          <th>Descrição</th>
          <th class="-num">Qtd.</th>
          <th>Unidade</th>
          <th class="-num">Valor unitário</th>
          <th class="-num">Total estimado</th>
        </tr></thead>
        <tbody>
          ${raw(licitacao.itens.map((i) => `<tr>
            <td class="-num">${i.n}</td>
            <td class="tabela-titulo-celula">${i.descricao}</td>
            <td class="-num">${i.qtd.toLocaleString('pt-BR')}</td>
            <td>${i.un}</td>
            <td class="-num">${moeda(i.unitario)}</td>
            <td class="-num" style="font-weight: var(--p-semi)">${moeda(i.qtd * i.unitario)}</td>
          </tr>`).join(''))}
        </tbody>
        <tfoot><tr>
          <td colspan="5" style="text-align: right; font-weight: var(--p-semi)">Total estimado</td>
          <td class="-num" style="font-weight: var(--p-extra); color: var(--texto-forte)">${moeda(total)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>`;
}

function painelDocumentos(licitacao) {
  return html`<div class="grade grade-2">
    ${raw(licitacao.documentos.map((d) => `
      <div class="card -interativo">
        <div class="card-corpo linha" style="gap: var(--e-3)">
          <span class="stat-icone -azul" style="width: 42px; height: 42px">${icone('documento')}</span>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: var(--p-semi); color: var(--texto-forte); font-size: var(--t-corpo-sm)">
              ${d.nome}
            </div>
            <div class="suave" style="font-size: var(--t-micro)">
              ${d.tipo} · ${d.paginas} páginas · ${d.tamanho}
            </div>
          </div>
          <button class="btn-icone" data-acao="baixar" data-nome="${d.nome}"
            aria-label="Baixar ${d.nome}">${icone('baixar')}</button>
        </div>
      </div>`).join(''))}
  </div>`;
}

function painelCronograma(licitacao) {
  const etapas = [
    { titulo: 'Publicação do edital', quando: licitacao.abertura, estado: 'feito', icone: 'check' },
    { titulo: 'Abertura do recebimento de propostas', quando: licitacao.abertura, estado: 'feito', icone: 'check' },
    { titulo: 'Encerramento das propostas', quando: licitacao.encerramento, estado: 'agora', icone: 'relogio' },
    { titulo: 'Sessão de disputa', quando: null, estado: 'futuro', icone: 'martelo', nota: 'Divulgada após o encerramento' },
    { titulo: 'Habilitação do vencedor', quando: null, estado: 'futuro', icone: 'escudo', nota: 'Verificação de documentos' },
    { titulo: 'Adjudicação e homologação', quando: null, estado: 'futuro', icone: 'balanca', nota: 'Etapa final do certame' },
  ];

  return html`<div class="timeline">
    ${raw(etapas.map((e) => `
      <div class="timeline-item ${e.estado === 'feito' ? '-feito' : e.estado === 'agora' ? '-agora' : ''}">
        <span class="timeline-ponto">${icone(e.icone)}</span>
        <div>
          <div class="timeline-titulo">${e.titulo}</div>
          <div class="timeline-data">${e.quando ? dataHora(e.quando) : e.nota}</div>
        </div>
      </div>`).join(''))}
  </div>`;
}

export default {
  titulo: 'Oportunidade',
  trilha: ['Início', 'Oportunidades', 'Detalhe'],
  nav: 'oportunidades',

  render(ctx) {
    const licitacao = licitacaoPorId(ctx.params.id);

    if (!licitacao) {
      return vazio({
        nomeIcone: 'arquivo_x',
        titulo: 'Oportunidade não encontrada',
        texto: 'Ela pode ter sido removida ou o endereço está incorreto.',
        acao: '<a class="btn -primario" href="#/oportunidades">Voltar para oportunidades</a>',
      });
    }

    const favorito = ehFavorito(licitacao.id);
    const urgente = prazoUrgente(licitacao.encerramento);
    const faixa = faixaScore(licitacao.compatibilidade);
    const atendidos = licitacao.razoes.filter((r) => r.ok).length;

    const infos = [
      ['Órgão', licitacao.orgao.nome],
      ['Modalidade', licitacao.modalidade],
      ['Número', licitacao.numero],
      ['Processo', licitacao.processo],
      ['Cidade', `${licitacao.orgao.cidade} — ${licitacao.orgao.uf}`],
      ['Esfera', licitacao.orgao.esfera],
      ['Valor estimado', moeda(licitacao.valor)],
      ['Abertura', dataHora(licitacao.abertura)],
      ['Encerramento', dataHora(licitacao.encerramento)],
      ['Situação', licitacao.situacao],
      ['Plataforma', licitacao.plataforma],
      ['Registro de preços', licitacao.srp ? 'Sim' : 'Não'],
    ];

    return html`
<div class="pilha-lg">

  <a class="btn -fantasma -sm" href="#/oportunidades" style="align-self: flex-start; margin-left: -12px">
    ${raw(icone('seta_esq'))} Voltar
  </a>

  <!-- Cabeçalho -->
  <header class="card" style="overflow: hidden; position: relative">
    <span class="geo geo-losango" style="width: 200px; height: 200px; right: -80px; top: -80px;
      background: linear-gradient(135deg, var(--azul-50), var(--verde-50))"></span>

    <div class="card-corpo" style="position: relative">
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; margin-bottom: var(--e-3)">
        ${raw(selo({ texto: licitacao.situacao, variante: 'sucesso', nomeIcone: 'check_circulo' }))}
        ${raw(selo({ texto: licitacao.categoria, variante: 'neutro' }))}
        ${raw(licitacao.srp ? selo({ texto: 'Registro de preços', variante: 'aviso' }) : '')}
      </div>

      <div class="linha" style="gap: var(--e-6); align-items: flex-start; flex-wrap: wrap">
        <div style="flex: 1; min-width: 280px">
          <h1 style="font-size: var(--t-h2)">${licitacao.objeto}</h1>
          <p class="suave" style="margin-top: var(--e-2)">
            ${licitacao.orgao.nome} · Nº ${licitacao.numero}
          </p>

          <div class="linha" style="gap: var(--e-5); margin-top: var(--e-5); flex-wrap: wrap">
            <div>
              <div class="rotulo">Valor estimado</div>
              <div style="font-size: var(--t-h3); font-weight: var(--p-extra); color: var(--texto-forte);
                font-variant-numeric: tabular-nums">${moeda(licitacao.valor)}</div>
            </div>
            <div>
              <div class="rotulo">Encerramento</div>
              <div style="font-size: var(--t-h3); font-weight: var(--p-extra);
                color: ${urgente ? 'var(--erro)' : 'var(--texto-forte)'}; font-variant-numeric: tabular-nums">
                ${data(licitacao.encerramento)}
              </div>
              <div style="font-size: var(--t-micro); color: ${urgente ? 'var(--erro)' : 'var(--texto-suave)'}">
                ${prazoTexto(licitacao.encerramento)}
              </div>
            </div>
          </div>
        </div>

        <!-- Bloco de compatibilidade -->
        <div style="flex: none; min-width: 260px; padding: var(--e-4);
          border: 1px solid var(--borda); border-radius: var(--r-lg);
          background: var(--score-${faixa.chave}-fundo)">
          <div class="linha" style="gap: var(--e-4)">
            ${raw(scoreAnel({ valor: licitacao.compatibilidade, tamanho: 68, comTexto: false }))}
            <div>
              <div style="font-weight: var(--p-extra); font-size: var(--t-h4);
                color: var(--score-${faixa.chave})">${faixa.rotulo} compatibilidade</div>
              <div class="suave" style="font-size: var(--t-micro)">
                ${atendidos} de ${licitacao.razoes.length} critérios
              </div>
            </div>
          </div>
          <button class="btn -secundario -sm -cheio" data-acao="explicar" style="margin-top: var(--e-3)">
            ${raw(icone('info'))} Por que recomendamos?
          </button>
        </div>
      </div>

      <div class="linha" style="gap: var(--e-2); margin-top: var(--e-6); flex-wrap: wrap">
        <button class="btn -gradiente" data-acao="analisar">
          ${raw(icone('faisca'))} Analisar oportunidade
        </button>
        <button class="btn -secundario ${favorito ? '-ativo' : ''}" data-acao="favoritar-detalhe">
          ${raw(icone('coracao'))} <span id="rotulo-fav">${favorito ? 'Favoritada' : 'Favoritar'}</span>
        </button>
        <button class="btn -secundario" data-acao="monitorar">
          ${raw(icone('sino'))} Criar alerta
        </button>
        <a class="btn -fantasma" href="#/oportunidades" data-acao="abrir-plataforma">
          ${raw(icone('externo'))} Abrir no ${licitacao.plataforma}
        </a>
      </div>
    </div>
  </header>

  <div class="grade-conteudo-trilho">
    <div class="pilha-lg" style="min-width: 0">

      <!-- Por que é relevante -->
      <section class="card">
        <div class="card-topo">
          <div>
            <div class="card-titulo">Por que essa licitação é relevante para você</div>
            <div class="card-sub">Comparação entre o edital e o perfil da sua empresa</div>
          </div>
        </div>
        <div class="card-corpo">${raw(listaRazoes(licitacao.razoes))}</div>
      </section>

      <!-- Abas: resumo, itens, documentos, cronograma -->
      <section class="card">
        <div style="padding: 0 var(--e-5)">
          ${raw(abas({
            ativa: 'resumo',
            itens: [
              { chave: 'resumo', rotulo: 'Resumo' },
              { chave: 'itens', rotulo: 'Itens', contagem: licitacao.itens.length },
              { chave: 'documentos', rotulo: 'Documentos', contagem: licitacao.documentos.length },
              { chave: 'cronograma', rotulo: 'Cronograma' },
            ],
          }))}
        </div>
        <div class="card-corpo" id="painel-aba">
          <p style="line-height: 1.7; max-width: 72ch">${licitacao.resumo}</p>
        </div>
      </section>
    </div>

    <!-- Trilho: ficha técnica -->
    <aside class="pilha">
      <div class="card">
        <div class="card-topo"><div class="card-titulo" style="font-size: var(--t-corpo)">Ficha técnica</div></div>
        <div class="card-corpo" style="padding-top: var(--e-3)">
          <dl style="display: grid; gap: var(--e-3); margin: 0">
            ${raw(infos.map(([chave, valor]) => `
              <div style="display: grid; gap: 1px">
                <dt class="rotulo">${chave}</dt>
                <dd style="margin: 0; font-size: var(--t-corpo-sm); font-weight: var(--p-medio);
                  color: var(--texto-forte)">${valor}</dd>
              </div>`).join(''))}
          </dl>
        </div>
      </div>

      ${raw(urgente ? alerta({
        variante: 'aviso',
        nomeIcone: 'alerta',
        texto: `<b>Prazo curto.</b> Esta oportunidade ${prazoTexto(licitacao.encerramento)}.
          Confira agora se suas certidões estão válidas — certidão vencida na habilitação
          desclassifica quem já tinha o menor preço.`,
      }) : '')}

      ${raw(alerta({
        variante: 'info',
        nomeIcone: 'info',
        texto: `O LICITA+ não envia proposta. O envio é feito por você na plataforma do órgão,
          com certificado digital — é um ato juridicamente vinculante.`,
      }))}
    </aside>
  </div>
</div>`;
  },

  ativar(raiz, ctx) {
    const licitacao = licitacaoPorId(ctx.params.id);
    if (!licitacao) return;

    const painel = $('#painel-aba', raiz);

    ativarAbas(raiz, (chave) => {
      const conteudos = {
        resumo: `<p style="line-height: 1.7; max-width: 72ch">${licitacao.resumo}</p>`,
        itens: painelItens(licitacao),
        documentos: painelDocumentos(licitacao),
        cronograma: painelCronograma(licitacao),
      };
      painel.innerHTML = conteudos[chave] ?? '';
    });

    aoClicarEm(raiz, '[data-acao="explicar"]', () => {
      abrirModal({
        titulo: 'Por que recomendamos esta oportunidade?',
        subtitulo: licitacao.objeto,
        corpo: corpoExplicacao(licitacao),
        rodape: '<button class="btn -primario" data-acao="fechar-modal">Entendi</button>',
      });
    });

    aoClicarEm(raiz, '[data-acao="favoritar-detalhe"]', (_evento, alvo) => {
      const agora = alternarFavorito(licitacao.id);
      $('#rotulo-fav', raiz).textContent = agora ? 'Favoritada' : 'Favoritar';
      alvo.classList.toggle('-ativo', agora);
      toast(agora ? 'Oportunidade adicionada aos favoritos.' : 'Oportunidade removida dos favoritos.', {
        variante: agora ? 'sucesso' : 'info',
      });
    });

    aoClicarEm(raiz, '[data-acao="monitorar"]', () => {
      toast('Alerta criado', {
        variante: 'sucesso',
        sub: 'Você será avisado sobre retificações e mudanças de prazo nesta licitação.',
      });
    });

    aoClicarEm(raiz, '[data-acao="analisar"]', () => {
      abrirModal({
        titulo: 'Analisar oportunidade',
        subtitulo: licitacao.objeto,
        largo: true,
        corpo: html`<div class="pilha">
          ${raw(alerta({
            variante: 'info', nomeIcone: 'faisca',
            texto: 'A análise cruza o edital com o seu catálogo, histórico de preços e certidões.',
          }))}
          <div class="grade grade-3">
            ${raw([
              { t: 'Itens que você fornece', v: `${licitacao.itens.length} de ${licitacao.itens.length}`, i: 'maleta' },
              { t: 'Margem estimada', v: '18% a 24%', i: 'subindo' },
              { t: 'Concorrentes prováveis', v: '6 a 11 empresas', i: 'usuario' },
            ].map((c) => `<div class="stat">
              <div class="stat-topo">
                <span class="stat-rotulo">${c.t}</span>
                <span class="stat-icone -azul">${icone(c.i)}</span>
              </div>
              <div style="font-size: var(--t-h3); font-weight: var(--p-extra); color: var(--texto-forte)">
                ${c.v}</div>
            </div>`).join(''))}
          </div>
          <p class="suave" style="font-size: var(--t-corpo-sm); line-height: 1.6">
            Estimativas de demonstração, calculadas sobre dados fictícios. Numa conta real elas
            viriam do seu histórico de participações e da tabela de custo do seu fornecedor.
          </p>
        </div>`,
        rodape: `
          <button class="btn -secundario" data-acao="fechar-modal">Fechar</button>
          <button class="btn -primario" data-acao="fechar-modal">Gerar dossiê</button>`,
      });
    });

    aoClicarEm(raiz, '[data-acao="baixar"]', (evento, alvo) => {
      evento.preventDefault();
      toast(`${alvo.dataset.nome}`, { variante: 'info', sub: 'Download indisponível na demonstração.' });
    });

    aoClicarEm(raiz, '[data-acao="abrir-plataforma"]', (evento) => {
      evento.preventDefault();
      toast(`Abriria o ${licitacao.plataforma}`, {
        variante: 'info',
        sub: 'Na versão real, este botão leva direto ao certame na plataforma do órgão.',
      });
    });
  },
};

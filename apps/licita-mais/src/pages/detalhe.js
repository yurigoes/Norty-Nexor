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

   Duas ausências deliberadas. Não há lista de anexos para
   baixar: o PNCP publica o edital como página, não como
   arquivo que possamos servir, e uma lista de documentos que
   não abrem seria pior do que apontar para a fonte. E não há
   estimativa de margem nem de número de concorrentes — seriam
   números inventados no lugar exato onde o usuário decide
   preço.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, data, dataHora, prazoTexto, prazoUrgente, faixaScore } from '../lib/format.js';
import { scoreAnel, listaRazoes, corpoExplicacao } from '../ui/domain.js';
import { selo, abas, ativarAbas, toast, alerta, abrirModal, fecharModal, vazio, skeletonCartao, campo } from '../ui/primitives.js';
import { ehFavorito } from '../lib/store.js';
import { alternarFavoritoRemoto, obterOportunidade, criarParticipacao } from '../dados/index.js';

/* ---------- Abas ---------- */

function painelItens(licitacao) {
  const totalDe = (i) => (i.qtd ?? 0) * (i.unitario ?? 0);
  const total = licitacao.itens.reduce((soma, i) => soma + totalDe(i), 0);
  const temPreco = licitacao.itens.some((i) => i.unitario !== null && i.unitario !== undefined);

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
            <td class="-num">${(i.qtd ?? 0).toLocaleString('pt-BR')}</td>
            <td>${i.un ?? '—'}</td>
            <td class="-num">${i.unitario === null || i.unitario === undefined ? 'sigiloso' : moeda(i.unitario)}</td>
            <td class="-num" style="font-weight: var(--p-semi)">
              ${i.unitario === null || i.unitario === undefined ? '—' : moeda(totalDe(i))}
            </td>
          </tr>`).join(''))}
        </tbody>
        ${raw(temPreco ? `<tfoot><tr>
          <td colspan="5" style="text-align: right; font-weight: var(--p-semi)">Total estimado</td>
          <td class="-num" style="font-weight: var(--p-extra); color: var(--texto-forte)">${moeda(total)}</td>
        </tr></tfoot>` : '')}
      </table>
    </div>
  </div>`;
}

/**
 * Onde ler e onde disputar. São dois endereços diferentes e
 * confundi-los custa o certame: o PNCP publica, mas a proposta
 * é enviada no sistema de origem.
 */
function painelFontes(licitacao) {
  const cartao = (titulo, descricao, href, nomeIcone) => `
    <a class="card -interativo" href="${href}" target="_blank" rel="noopener noreferrer"
       style="display: block">
      <div class="card-corpo linha" style="gap: var(--e-3)">
        <span class="stat-icone -azul" style="width: 42px; height: 42px">${icone(nomeIcone)}</span>
        <div style="flex: 1; min-width: 0">
          <div style="font-weight: var(--p-semi); color: var(--texto-forte); font-size: var(--t-corpo-sm)">
            ${titulo}
          </div>
          <div class="suave" style="font-size: var(--t-micro); line-height: 1.5">${descricao}</div>
        </div>
        <span class="btn-icone" aria-hidden="true">${icone('externo')}</span>
      </div>
    </a>`;

  return html`<div class="pilha">
    ${raw(licitacao.linkPncp
      ? cartao('Edital no PNCP', 'A publicação oficial, com o edital e os anexos do órgão.',
               licitacao.linkPncp, 'documento')
      : '')}

    ${raw(licitacao.linkSistemaOrigem
      ? cartao(`Disputar em ${licitacao.plataforma}`,
               'Onde a proposta é efetivamente enviada. É neste sistema que você precisa ter cadastro e certificado.',
               licitacao.linkSistemaOrigem, 'martelo')
      : `<div class="alerta-bloco -aviso">${icone('alerta')}
          <div>O órgão não informou o sistema de disputa nesta publicação. O caminho está
          no corpo do edital, no PNCP.</div>
        </div>`)}

    <p class="tenue" style="font-size: var(--t-micro); line-height: 1.6">
      Os arquivos do edital ficam no portal do órgão — o LICITA+ aponta para eles em vez
      de hospedar uma cópia que pode envelhecer sem aviso. Edital retificado é comum, e
      uma cópia desatualizada aqui seria pior do que nenhuma.
    </p>
  </div>`;
}

function painelCronograma(licitacao) {
  const etapas = [
    { titulo: 'Abertura do recebimento de propostas', quando: licitacao.abertura, estado: 'feito', icone: 'check' },
    { titulo: 'Encerramento das propostas', quando: licitacao.encerramento, estado: 'agora', icone: 'relogio' },
    { titulo: 'Sessão de disputa', quando: null, estado: 'futuro', icone: 'martelo', nota: 'Data divulgada pelo órgão no edital' },
    { titulo: 'Habilitação do vencedor', quando: null, estado: 'futuro', icone: 'escudo', nota: 'Verificação de documentos' },
    { titulo: 'Adjudicação e homologação', quando: null, estado: 'futuro', icone: 'balanca', nota: 'Etapa final do certame' },
  ];

  return html`<div class="pilha">
    <div class="timeline">
      ${raw(etapas.map((e) => `
        <div class="timeline-item ${e.estado === 'feito' ? '-feito' : e.estado === 'agora' ? '-agora' : ''}">
          <span class="timeline-ponto">${icone(e.icone)}</span>
          <div>
            <div class="timeline-titulo">${e.titulo}</div>
            <div class="timeline-data">${e.quando ? dataHora(e.quando) : e.nota}</div>
          </div>
        </div>`).join(''))}
    </div>

    <p class="tenue" style="font-size: var(--t-micro); line-height: 1.6">
      Só as duas primeiras datas são publicadas junto com a contratação. As seguintes
      dependem do andamento da sessão e saem no próprio certame — por isso aparecem sem
      data em vez de com uma estimativa.
    </p>
  </div>`;
}

/* ---------- Página ---------- */

export default {
  titulo: 'Oportunidade',
  trilha: ['Início', 'Oportunidades', 'Detalhe'],
  nav: 'oportunidades',

  esqueleto: () => skeletonCartao(2),

  async render(ctx) {
    let licitacao;

    try {
      licitacao = await obterOportunidade(ctx.params.id);
    } catch {
      return vazio({
        nomeIcone: 'arquivo_x',
        titulo: 'Oportunidade não encontrada',
        texto: 'Ela pode ter encerrado o prazo de propostas ou o endereço está incorreto.',
        acao: '<a class="btn -primario" href="#/oportunidades">Voltar para oportunidades</a>',
      });
    }

    const favorito = licitacao.favorito ?? ehFavorito(licitacao.id);
    const urgente = prazoUrgente(licitacao.encerramento);
    const faixa = faixaScore(licitacao.compatibilidade);
    const pontuados = licitacao.razoes.filter((r) => (r.pontos ?? 0) > 0).length;

    const infos = [
      ['Órgão', licitacao.orgao.nome],
      ['Unidade', licitacao.orgao.unidade ?? '—'],
      ['Modalidade', licitacao.modalidade],
      ['Número', licitacao.numero],
      ['Processo', licitacao.processo],
      ['Cidade', `${licitacao.orgao.cidade} — ${licitacao.orgao.uf}`],
      ['Esfera', licitacao.orgao.esfera],
      ['Valor estimado', licitacao.valor === null ? 'Orçamento sigiloso' : moeda(licitacao.valor)],
      ['Abertura', dataHora(licitacao.abertura)],
      ['Encerramento', dataHora(licitacao.encerramento)],
      ['Registro de preços', licitacao.srp ? 'Sim' : 'Não'],
      ['Referência PNCP', licitacao.referencia ?? '—'],
    ];

    return html`
<div class="pilha-lg">

  <a class="btn -fantasma -sm" href="#/oportunidades" style="align-self: flex-start; margin-left: -12px">
    ${raw(icone('seta_esq'))} Voltar
  </a>

  <header class="card" style="overflow: hidden; position: relative">
    <span class="geo geo-losango" style="width: 200px; height: 200px; right: -80px; top: -80px;
      background: linear-gradient(135deg, var(--azul-50), var(--verde-50))"></span>

    <div class="card-corpo" style="position: relative">
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; margin-bottom: var(--e-3)">
        ${raw(selo({ texto: licitacao.situacao, variante: 'sucesso', nomeIcone: 'check_circulo' }))}
        ${raw(selo({ texto: licitacao.modalidade, variante: 'neutro' }))}
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
                font-variant-numeric: tabular-nums">
                ${licitacao.valor === null ? 'Sigiloso' : moeda(licitacao.valor)}
              </div>
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

        <div style="flex: none; min-width: 260px; padding: var(--e-4);
          border: 1px solid var(--borda); border-radius: var(--r-lg);
          background: var(--score-${faixa.chave}-fundo)">
          <div class="linha" style="gap: var(--e-4)">
            ${raw(scoreAnel({ valor: licitacao.compatibilidade, tamanho: 68, comTexto: false }))}
            <div>
              <div style="font-weight: var(--p-extra); font-size: var(--t-h4);
                color: var(--score-${faixa.chave})">${faixa.rotulo} compatibilidade</div>
              <div class="suave" style="font-size: var(--t-micro)">
                ${pontuados} de ${licitacao.razoes.length} critérios pontuaram
              </div>
            </div>
          </div>
          <button class="btn -secundario -sm -cheio" data-acao="explicar" style="margin-top: var(--e-3)">
            ${raw(icone('info'))} Por que recomendamos?
          </button>
        </div>
      </div>

      <div class="linha" style="gap: var(--e-2); margin-top: var(--e-6); flex-wrap: wrap">
        ${raw(licitacao.linkSistemaOrigem || licitacao.linkPncp
          ? `<a class="btn -gradiente" href="${licitacao.linkSistemaOrigem ?? licitacao.linkPncp}"
                target="_blank" rel="noopener noreferrer">
               ${icone('externo')} Abrir o certame
             </a>`
          : '')}
        <button class="btn -secundario ${favorito ? '-ativo' : ''}" data-acao="favoritar-detalhe">
          ${raw(icone('coracao'))} <span id="rotulo-fav">${favorito ? 'Favoritada' : 'Favoritar'}</span>
        </button>
        <button class="btn -secundario" data-acao="registrar-part">
          ${raw(icone('balanca'))} Vou participar
        </button>
        <button class="btn -fantasma" data-acao="checklist">
          ${raw(icone('lista'))} O que conferir antes
        </button>
      </div>
    </div>
  </header>

  <div class="grade-conteudo-trilho">
    <div class="pilha-lg" style="min-width: 0">

      <section class="card">
        <div class="card-topo">
          <div>
            <div class="card-titulo">Por que essa licitação é relevante para você</div>
            <div class="card-sub">Comparação entre o edital e o perfil da sua empresa</div>
          </div>
        </div>
        <div class="card-corpo">${raw(listaRazoes(licitacao.razoes))}</div>
      </section>

      ${raw(licitacao.alertas.length ? `
      <section class="pilha-sm">
        ${licitacao.alertas.map((a) => alerta({
          variante: a.gravidade === 'critico' ? 'erro' : 'aviso',
          nomeIcone: 'alerta',
          texto: a.mensagem,
        })).join('')}
      </section>` : '')}

      <section class="card">
        <div style="padding: 0 var(--e-5)">
          ${raw(abas({
            ativa: 'resumo',
            itens: [
              { chave: 'resumo', rotulo: 'Resumo' },
              { chave: 'itens', rotulo: 'Itens', contagem: licitacao.itens.length },
              { chave: 'fontes', rotulo: 'Edital e disputa' },
              { chave: 'cronograma', rotulo: 'Cronograma' },
            ],
          }))}
        </div>
        <div class="card-corpo" id="painel-aba">
          <p style="line-height: 1.7; max-width: 72ch">${licitacao.resumo}</p>
        </div>
      </section>
    </div>

    <aside class="pilha">
      <div class="card">
        <div class="card-topo"><div class="card-titulo" style="font-size: var(--t-corpo)">Ficha técnica</div></div>
        <div class="card-corpo" style="padding-top: var(--e-3)">
          <dl style="display: grid; gap: var(--e-3); margin: 0">
            ${raw(infos.map(([chave, valor]) => `
              <div style="display: grid; gap: 1px">
                <dt class="rotulo">${chave}</dt>
                <dd style="margin: 0; font-size: var(--t-corpo-sm); font-weight: var(--p-medio);
                  color: var(--texto-forte); word-break: break-word">${valor}</dd>
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
    const painel = $('#painel-aba', raiz);
    if (!painel) return;

    // A página já tem o dado desenhado; buscar de novo só para
    // ligar as abas seria uma ida à rede sem resposta nova.
    let licitacao = null;
    const comLicitacao = async () => {
      licitacao ??= await obterOportunidade(ctx.params.id);
      return licitacao;
    };

    ativarAbas(raiz, async (chave) => {
      const l = await comLicitacao();
      const conteudos = {
        resumo: `<p style="line-height: 1.7; max-width: 72ch">${l.resumo}</p>`,
        itens: l.itens.length
          ? painelItens(l)
          : '<p class="tenue" style="line-height: 1.6; margin: 0">O órgão não detalhou os itens nesta publicação. A relação completa está no edital.</p>',
        fontes: painelFontes(l),
        cronograma: painelCronograma(l),
      };
      painel.innerHTML = conteudos[chave] ?? '';
    });

    aoClicarEm(raiz, '[data-acao="explicar"]', async () => {
      const l = await comLicitacao();
      abrirModal({
        titulo: 'Por que recomendamos esta oportunidade?',
        subtitulo: l.objeto,
        corpo: corpoExplicacao(l),
        rodape: '<button class="btn -primario" data-acao="fechar-modal">Entendi</button>',
      });
    });

    aoClicarEm(raiz, '[data-acao="favoritar-detalhe"]', async (_evento, alvo) => {
      if (alvo.disabled) return;
      alvo.disabled = true;

      try {
        const agora = await alternarFavoritoRemoto(ctx.params.id);
        $('#rotulo-fav', raiz).textContent = agora ? 'Favoritada' : 'Favoritar';
        alvo.classList.toggle('-ativo', agora);
        toast(agora ? 'Oportunidade adicionada aos favoritos.' : 'Oportunidade removida dos favoritos.', {
          variante: agora ? 'sucesso' : 'info',
        });
      } catch (erro) {
        toast('Não foi possível salvar o favorito', { variante: 'erro', sub: erro.message });
      } finally {
        alvo.disabled = false;
      }
    });

    // "Vou participar" abre o registro já preenchido com o que a
    // tela sabe. Pedir que o usuário redigite o número do pregão
    // e o nome do órgão seria trabalho que o sistema já fez.
    aoClicarEm(raiz, '[data-acao="registrar-part"]', async () => {
      const l = await comLicitacao();

      abrirModal({
        titulo: 'Registrar participação',
        subtitulo: l.objeto,
        corpo: html`<div class="pilha">
          <p class="suave" style="font-size: var(--t-corpo-sm); line-height: 1.6; margin: 0">
            O registro entra como <b>em análise</b>. Quando sair o resultado, você atualiza
            em Participações — é esse histórico que mostra em que faixa de preço a sua
            empresa costuma ganhar.
          </p>
          ${raw(campo({
            rotulo: 'Valor da sua proposta', id: 'det-valor', tipo: 'number',
            placeholder: 'R$ 0',
            ajuda: 'Opcional agora; dá para preencher depois.',
          }))}
          ${raw(campo({
            rotulo: 'Observação', id: 'det-obs',
            placeholder: 'O que pesou na decisão de participar',
          }))}
        </div>`,
        rodape: `<button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
                 <button class="btn -primario" data-acao="confirmar-part">Registrar</button>`,
      });
    });

    const desligar = [
      aoClicarEm(document.body, '[data-acao="confirmar-part"]', async (_evento, alvo) => {
        const l = await comLicitacao();
        alvo.disabled = true;

        try {
          await criarParticipacao({
            descricao: `${l.modalidade} ${l.numero} — ${l.objeto.slice(0, 120)}`,
            orgao: l.orgao.nome,
            valor: $('#det-valor')?.value ? Number($('#det-valor').value) : undefined,
            observacao: $('#det-obs')?.value?.trim() || undefined,
            situacao: 'analise',
            licitacaoId: l.id,
          });

          fecharModal();
          toast('Participação registrada', {
            variante: 'sucesso',
            sub: 'Atualize o resultado em Participações quando o certame for decidido.',
          });
        } catch (erro) {
          alvo.disabled = false;
          toast('Não foi possível registrar', { variante: 'erro', sub: erro.message });
        }
      }),
    ];

    aoClicarEm(raiz, '[data-acao="checklist"]', () => {
      abrirModal({
        titulo: 'O que conferir antes de disputar',
        subtitulo: 'O que mais elimina fornecedor não é preço — é documento.',
        corpo: html`<div class="pilha">
          ${raw(alerta({
            variante: 'aviso', nomeIcone: 'alerta',
            texto: 'Certidão vencida na habilitação desclassifica quem já tinha o menor preço. É a causa mais comum de perder um certame já ganho.',
          }))}

          <ul style="line-height: 1.8; padding-left: var(--e-5); margin: 0">
            <li><b>Certidões em dia</b> — federal, estadual, municipal, FGTS e trabalhista.</li>
            <li><b>Cadastro na plataforma da disputa</b>, não só no PNCP. São sistemas diferentes.</li>
            <li><b>Certificado digital e-CNPJ válido</b>, com o token à mão no dia da sessão.</li>
            <li><b>Atestado de capacidade técnica</b>, se o edital exigir — leia o item de habilitação.</li>
            <li><b>Prazo de entrega</b> que o seu fornecedor sustenta, não o que você espera dele.</li>
            <li><b>Cota ME/EPP</b>: veja se o edital reserva parte do quantitativo. Muda a conta.</li>
          </ul>

          <p class="tenue" style="font-size: var(--t-micro); line-height: 1.6">
            Esta lista é um lembrete geral, não a leitura do edital. As exigências que
            valem são as que estão escritas nele.
          </p>
        </div>`,
        rodape: '<button class="btn -primario" data-acao="fechar-modal">Entendi</button>',
      });
    });

    return () => desligar.forEach((cancelar) => cancelar?.());
  },
};

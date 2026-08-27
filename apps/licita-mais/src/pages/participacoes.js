/* =========================================================
   LICITA+ — Participações
   ---------------------------------------------------------
   Histórico do que a empresa disputou. Tabela em vez de
   cartão: são poucos campos por linha e o usuário compara
   entre linhas, que é exatamente onde a tabela ganha.

   O registro é manual, e isso é uma decisão, não uma
   pendência: o resultado de um certame aparece no PNCP com
   atraso e nem sempre de forma legível por máquina. Inventar
   um "ganhou/perdeu" automático a partir de dado incerto seria
   pior do que pedir dez segundos de quem esteve na sessão.

   A taxa de vitória some enquanto nada foi decidido. Mostrar
   0% diria que a empresa perdeu tudo — que é outra coisa.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { moeda, data } from '../lib/format.js';
import { cabecalhoPagina, cartaoIndicador } from '../ui/domain.js';
import {
  abas, ativarAbas, abrirModal, fecharModal, toast, campo, seletor, skeletonCartao,
} from '../ui/primitives.js';
import {
  listarParticipacoes, criarParticipacao, atualizarParticipacao, removerParticipacao,
} from '../dados/index.js';

const ESTADO = {
  ganha: { variante: 'sucesso', rotulo: 'Ganha', icone: 'check_circulo' },
  perdida: { variante: 'erro', rotulo: 'Perdida', icone: 'fechar' },
  analise: { variante: 'info', rotulo: 'Em análise', icone: 'relogio' },
  desistiu: { variante: 'neutro', rotulo: 'Desistiu', icone: 'menos' },
};

let itensEmTela = [];
let raizParticipacoes = null;
let abaAtual = 'todas';

/* ---------- Tabela ---------- */

function tabela(filtro = 'todas') {
  const itens = filtro === 'todas'
    ? itensEmTela
    : itensEmTela.filter((p) => p.situacao === filtro);

  if (itens.length === 0) {
    return `<div class="vazio" style="padding: var(--e-10) var(--e-5)">
      <h3>${filtro === 'todas' ? 'Nenhuma participação registrada' : 'Nenhuma participação nesta situação'}</h3>
      <p>${filtro === 'todas'
        ? 'Registre os certames que você disputou. É esse histórico que mostra em que faixa de preço a sua empresa costuma ganhar.'
        : 'Assim que houver, ela aparece aqui.'}</p>
      ${filtro === 'todas' ? '<button class="btn -primario" data-acao="nova-part" style="margin-top: var(--e-4)">Registrar participação</button>' : ''}
    </div>`;
  }

  return `<div class="tabela-rolagem"><table class="tabela">
    <thead><tr>
      <th>Certame</th><th>Órgão</th><th>Data</th><th class="-num">Valor</th>
      <th>Resultado</th><th></th>
    </tr></thead>
    <tbody>
      ${itens.map((p) => {
        const e = ESTADO[p.situacao] ?? ESTADO.analise;
        return `<tr data-part="${p.id}">
          <td class="tabela-titulo-celula">${p.descricao}</td>
          <td class="suave">${p.orgao}</td>
          <td class="num" style="white-space: nowrap">${data(p.data)}</td>
          <td class="-num">${p.valor === null || p.valor === undefined ? '—' : moeda(p.valor)}</td>
          <td><span class="selo -${e.variante}">${icone(e.icone)}${e.rotulo}</span></td>
          <td style="white-space: nowrap">
            <button class="btn -fantasma -sm" data-acao="editar-part" data-id="${p.id}"
              aria-label="Editar ${p.descricao}">${icone('engrenagem')}</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

/* ---------- Formulário ---------- */

function formularioParticipacao(p) {
  return html`<div class="pilha">
    ${raw(campo({
      rotulo: 'Certame', id: 'part-descricao', valor: p?.descricao ?? '',
      placeholder: 'Ex.: Pregão 044/2026 — Aquisição de notebooks',
      atributos: 'required',
    }))}
    ${raw(campo({
      rotulo: 'Órgão', id: 'part-orgao', valor: p?.orgao ?? '',
      placeholder: 'Quem abriu o certame',
      atributos: 'required',
    }))}

    <div class="grade grade-2" style="gap: var(--e-3)">
      ${raw(campo({
        rotulo: 'Valor da sua proposta', id: 'part-valor', tipo: 'number',
        valor: p?.valor ?? '', placeholder: 'R$ 0',
        ajuda: 'Opcional, mas é o que alimenta a leitura de preço.',
      }))}
      ${raw(campo({
        rotulo: 'Data', id: 'part-data', tipo: 'date',
        valor: (p?.data ?? new Date().toISOString()).slice(0, 10),
      }))}
    </div>

    ${raw(seletor({
      rotulo: 'Resultado', id: 'part-situacao', valor: p?.situacao ?? 'analise',
      opcoes: [
        { valor: 'analise', rotulo: 'Em análise — ainda sem resultado' },
        { valor: 'ganha', rotulo: 'Ganha' },
        { valor: 'perdida', rotulo: 'Perdida' },
        { valor: 'desistiu', rotulo: 'Desisti de participar' },
      ],
    }))}

    ${raw(campo({
      rotulo: 'Observação', id: 'part-obs', valor: p?.observacao ?? '',
      placeholder: 'O que aprendeu neste certame',
      ajuda: 'Onde o preço ficou, que documento faltou, quem venceu.',
    }))}
  </div>`;
}

const lerFormularioPart = () => ({
  descricao: ($('#part-descricao')?.value ?? '').trim(),
  orgao: ($('#part-orgao')?.value ?? '').trim(),
  valor: $('#part-valor')?.value ? Number($('#part-valor').value) : undefined,
  data: $('#part-data')?.value ? new Date($('#part-data').value).toISOString() : undefined,
  situacao: $('#part-situacao')?.value ?? 'analise',
  observacao: ($('#part-obs')?.value ?? '').trim() || undefined,
});

/* ---------- Repintura ---------- */

async function recarregarParticipacoes() {
  if (!raizParticipacoes) return;

  const { itens, resumo } = await listarParticipacoes();
  itensEmTela = itens;

  const painel = $('#painel-part', raizParticipacoes);
  if (painel) painel.innerHTML = tabela(abaAtual);

  const indicadores = $('#indicadores-part', raizParticipacoes);
  if (indicadores) indicadores.innerHTML = corpoIndicadores(resumo);

  const barra = $('#abas-part', raizParticipacoes);
  if (barra) {
    barra.innerHTML = corpoAbas(resumo, abaAtual);
    ativarAbas(raizParticipacoes, trocarAba);
  }
}

const trocarAba = (chave) => {
  abaAtual = chave;
  const painel = $('#painel-part', raizParticipacoes);
  if (painel) painel.innerHTML = tabela(chave);
};

function corpoIndicadores(resumo) {
  return `
    ${cartaoIndicador({
      rotulo: 'Total disputado', valor: resumo.total,
      nomeIcone: 'balanca', cor: 'azul', periodo: 'certames registrados',
    })}
    ${cartaoIndicador({
      rotulo: 'Ganhas', valor: resumo.ganhas,
      nomeIcone: 'check_circulo', cor: 'verde',
      periodo: resumo.taxaVitoria === null
        ? 'nenhum resultado ainda'
        : `${resumo.taxaVitoria}% dos decididos`,
    })}
    ${cartaoIndicador({
      rotulo: 'Em análise', valor: resumo.emAnalise,
      nomeIcone: 'relogio', cor: 'amarelo', periodo: 'aguardando resultado',
    })}
    ${cartaoIndicador({
      rotulo: 'Valor ganho', valor: moeda(resumo.valorGanho),
      nomeIcone: 'carteira', cor: 'verde', periodo: 'contratos firmados',
    })}`;
}

const corpoAbas = (resumo, ativa) => abas({
  ativa,
  itens: [
    { chave: 'todas', rotulo: 'Todas', contagem: resumo.total },
    { chave: 'ganha', rotulo: 'Ganhas', contagem: resumo.ganhas },
    { chave: 'analise', rotulo: 'Em análise', contagem: resumo.emAnalise },
    { chave: 'perdida', rotulo: 'Perdidas', contagem: resumo.perdidas },
  ],
});

/* ---------- Página ---------- */

export default {
  titulo: 'Participações',
  trilha: ['Início', 'Participações'],
  nav: 'participacoes',

  esqueleto: () => skeletonCartao(3),

  async render() {
    const { itens, resumo } = await listarParticipacoes();
    itensEmTela = itens;
    abaAtual = 'todas';

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Participações',
    subtitulo: 'Os certames que a sua empresa disputou e como cada um terminou.',
    acoes: `<button class="btn -primario" data-acao="nova-part">${icone('mais')} Registrar participação</button>`,
  }))}

  <section class="grade grade-4" id="indicadores-part">${raw(corpoIndicadores(resumo))}</section>

  <section class="card">
    <div style="padding: 0 var(--e-5)" id="abas-part">${raw(corpoAbas(resumo, 'todas'))}</div>
    <div id="painel-part">${raw(tabela('todas'))}</div>
  </section>
</div>`;
  },

  ativar(raiz) {
    raizParticipacoes = raiz;
    ativarAbas(raiz, trocarAba);

    let editando = null;

    const abrirFormulario = (p) => {
      editando = p;
      abrirModal({
        titulo: p ? 'Editar participação' : 'Registrar participação',
        subtitulo: p ? p.descricao : 'Um certame que a sua empresa disputou.',
        corpo: formularioParticipacao(p),
        rodape: `
          ${p ? `<button class="btn -fantasma" data-acao="excluir-part" data-id="${p.id}">Excluir</button>` : ''}
          <button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
          <button class="btn -primario" data-acao="salvar-part">${p ? 'Salvar' : 'Registrar'}</button>`,
      });
    };

    aoClicarEm(raiz, '[data-acao="nova-part"]', () => abrirFormulario(null));

    aoClicarEm(raiz, '[data-acao="editar-part"]', (_evento, alvo) => {
      abrirFormulario(itensEmTela.find((p) => p.id === alvo.dataset.id) ?? null);
    });

    // O modal vive fora da raiz: ouvinte no body, cancelado na saída.
    const desligar = [
      aoClicarEm(document.body, '[data-acao="salvar-part"]', async (_evento, alvo) => {
        const dados = lerFormularioPart();

        if (!dados.descricao || !dados.orgao) {
          toast('Informe o certame e o órgão', { variante: 'erro' });
          return;
        }

        alvo.disabled = true;

        try {
          if (editando) await atualizarParticipacao(editando.id, dados);
          else await criarParticipacao(dados);

          fecharModal();
          await recarregarParticipacoes();
          toast(editando ? 'Participação atualizada' : 'Participação registrada', { variante: 'sucesso' });
        } catch (erro) {
          alvo.disabled = false;
          toast('Não foi possível salvar', { variante: 'erro', sub: erro.message });
        }
      }),

      aoClicarEm(document.body, '[data-acao="excluir-part"]', async (_evento, alvo) => {
        alvo.disabled = true;
        try {
          await removerParticipacao(alvo.dataset.id);
          fecharModal();
          await recarregarParticipacoes();
          toast('Participação excluída', { variante: 'info' });
        } catch (erro) {
          alvo.disabled = false;
          toast('Não foi possível excluir', { variante: 'erro', sub: erro.message });
        }
      }),
    ];

    return () => {
      raizParticipacoes = null;
      desligar.forEach((cancelar) => cancelar?.());
    };
  },
};

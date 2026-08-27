/* =========================================================
   LICITA+ — Monitoramentos
   ---------------------------------------------------------
   Uma busca salva que trabalha sozinha. A tela precisa deixar
   claro o que cada monitoramento vigia, quanto ele já
   encontrou e o que chegou de novo — nessa ordem, porque
   "o que é novo" é a única razão de abrir a página.

   "Novas" é contado contra a última vez que o usuário olhou,
   não contra um contador que alguém teria de zerar. Abrir os
   resultados de um monitoramento marca essa visita: é o
   gesto que significa "já vi", e fazer disso um botão
   separado seria pedir ao usuário que administrasse o
   contador em vez de usar o produto.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { data, moeda } from '../lib/format.js';
import { cabecalhoPagina } from '../ui/domain.js';
import {
  abrirModal, fecharModal, toast, switchCampo, campo, seletor, vazio, skeletonCartao,
} from '../ui/primitives.js';
import { MODALIDADES_PNCP, UFS, nomeModalidade } from '../lib/tabelas.js';
import {
  listarMonitoramentos, criarMonitoramento, atualizarMonitoramento,
  removerMonitoramento, marcarMonitoramentoVisto,
} from '../dados/index.js';

/** Cópia local do que está em tela, para editar sem reconsultar. */
let emTela = [];
let raizAtual = null;

function cartao(m) {
  const novas = m.novas ?? 0;

  return html`<article class="card" data-mon="${m.id}">
    <div class="card-corpo">
      <div class="linha-entre" style="align-items: flex-start">
        <div style="min-width: 0; flex: 1">
          <div class="linha" style="gap: var(--e-2)">
            <h3 style="font-size: var(--t-h4)">${m.nome}</h3>
            ${raw(m.ativo ? '' : '<span class="selo -neutro">Pausado</span>')}
          </div>

          <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; margin-top: var(--e-3)">
            ${raw((m.termos ?? []).map((t) => `<span class="selo -contorno">${t}</span>`).join(''))}
            ${raw((m.estados ?? []).map((e) => `<span class="selo -info">${icone('pin')}${e}</span>`).join(''))}
            ${raw((m.municipios ?? []).map((c) => `<span class="selo -neutro">${c}</span>`).join(''))}
            ${raw((m.modalidades ?? []).map((c) => `<span class="selo -neutro">${nomeModalidade(c)}</span>`).join(''))}
            ${raw(m.valorMinimo ? `<span class="selo -neutro">acima de ${moeda(m.valorMinimo)}</span>` : '')}
            ${raw(semCriterio(m) ? '<span class="selo -aviso">Sem filtro — acompanha tudo</span>' : '')}
          </div>

          <p class="tenue" style="font-size: var(--t-micro); margin-top: var(--e-3)">
            Criado em ${data(m.criadoEm)} · ${m.total ?? 0} oportunidades no total
          </p>
        </div>

        <div style="flex: none; text-align: right">
          ${raw(
            novas > 0
              ? `<div class="linha" style="gap: 6px; justify-content: flex-end; color: var(--verde-600)">
                   ${icone('sino_ativo')}
                   <span style="font-size: var(--t-h3); font-weight: var(--p-extra);
                     font-variant-numeric: tabular-nums">${novas}</span>
                 </div>
                 <div class="suave" style="font-size: var(--t-micro)">desde a sua última visita</div>`
              : '<div class="tenue" style="font-size: var(--t-corpo-sm)">Nenhuma novidade</div>',
          )}
        </div>
      </div>
    </div>

    <div class="card-rodape linha-entre">
      ${raw(switchCampo({
        id: `sw-${m.id}`, rotulo: m.ativo ? 'Ativo' : 'Pausado',
        ligado: m.ativo, acao: 'alternar-mon',
      }))}
      <div class="linha" style="gap: var(--e-2)">
        <button class="btn -fantasma -sm" data-acao="excluir-mon" data-id="${m.id}">
          ${raw(icone('fechar'))} Excluir
        </button>
        <button class="btn -fantasma -sm" data-acao="editar-mon" data-id="${m.id}">
          ${raw(icone('engrenagem'))} Editar
        </button>
        <button class="btn -secundario -sm" data-acao="ver-resultados" data-id="${m.id}">
          Ver resultados ${raw(icone('chevron_dir'))}
        </button>
      </div>
    </div>
  </article>`;
}

const semCriterio = (m) =>
  !(m.termos ?? []).length && !(m.estados ?? []).length
  && !(m.municipios ?? []).length && !(m.modalidades ?? []).length && !m.valorMinimo;

/* ---------- Formulário ---------- */

function formulario(m) {
  return html`<div class="pilha">
    ${raw(campo({
      rotulo: 'Nome do monitoramento', id: 'mon-nome', valor: m?.nome ?? '',
      placeholder: 'Ex.: Equipamentos de informática em Salvador',
      atributos: 'required',
    }))}

    ${raw(campo({
      rotulo: 'Palavras-chave', id: 'mon-termos',
      valor: (m?.termos ?? []).join(', '),
      placeholder: 'notebook, monitor, impressora',
      ajuda: 'Separe por vírgula. Deixe vazio para acompanhar tudo o que se encaixar nos demais filtros.',
    }))}

    ${raw(campo({
      rotulo: 'Cidades', id: 'mon-municipios',
      valor: (m?.municipios ?? []).join(', '),
      placeholder: 'Salvador, Lauro de Freitas',
      ajuda: 'Nome como aparece no edital. Vazio = todas as cidades do estado escolhido.',
    }))}

    <div class="grade grade-2" style="gap: var(--e-3)">
      ${raw(seletor({
        rotulo: 'Estado', id: 'mon-uf', valor: m?.estados?.[0] ?? '',
        opcoes: [{ valor: '', rotulo: 'Todos os estados' }, ...UFS.map((u) => ({ valor: u, rotulo: u }))],
      }))}
      ${raw(seletor({
        rotulo: 'Modalidade', id: 'mon-modalidade',
        valor: String(m?.modalidades?.[0] ?? ''),
        opcoes: [
          { valor: '', rotulo: 'Todas' },
          ...MODALIDADES_PNCP.map((x) => ({ valor: String(x.codigo), rotulo: x.nome })),
        ],
      }))}
    </div>

    ${raw(campo({
      rotulo: 'Valor mínimo', id: 'mon-min', tipo: 'number',
      valor: m?.valorMinimo ?? '', placeholder: 'R$ 0',
      ajuda: 'Abaixo disso o monitoramento não avisa.',
    }))}

    ${raw(switchCampo({
      id: 'mon-alerta',
      rotulo: 'Receber alerta por e-mail quando surgir oportunidade nova',
      ligado: m?.alertaEmail ?? true,
    }))}
  </div>`;
}

function lerFormulario() {
  const lista = (id) =>
    ($(`#${id}`)?.value ?? '').split(',').map((t) => t.trim()).filter(Boolean);

  const uf = $('#mon-uf')?.value ?? '';
  const modalidade = $('#mon-modalidade')?.value ?? '';
  const minimo = $('#mon-min')?.value ?? '';

  return {
    nome: ($('#mon-nome')?.value ?? '').trim(),
    termos: lista('mon-termos'),
    municipios: lista('mon-municipios'),
    estados: uf ? [uf] : [],
    modalidades: modalidade ? [Number(modalidade)] : [],
    valorMinimo: minimo ? Number(minimo) : undefined,
    alertaEmail: Boolean($('#mon-alerta')?.checked),
  };
}

/* ---------- Repintura ---------- */

async function recarregar() {
  if (!raizAtual) return;
  emTela = await listarMonitoramentos().catch(() => emTela);

  const lista = $('#lista-mon', raizAtual);
  if (lista) lista.innerHTML = corpoLista(emTela);

  const sub = $('#sub-mon', raizAtual);
  if (sub) sub.textContent = subtitulo(emTela);
}

const subtitulo = (itens) => {
  const ativos = itens.filter((m) => m.ativo).length;
  const novas = itens.reduce((soma, m) => soma + (m.novas ?? 0), 0);
  return `${ativos} ativo${ativos === 1 ? '' : 's'} · ${novas} nova${novas === 1 ? '' : 's'} desde a sua última visita.`;
};

const corpoLista = (itens) => (itens.length
  ? `<div class="pilha">${itens.map(cartao).join('')}</div>`
  : vazio({
      nomeIcone: 'sino_ativo',
      titulo: 'Nenhum monitoramento ainda',
      texto: 'Um monitoramento guarda uma busca e avisa quando aparece algo novo que se encaixa nela. É o que faz o LICITA+ trabalhar enquanto você não está olhando.',
      acao: '<button class="btn -primario" data-acao="novo-mon">Criar o primeiro</button>',
    }));

/* ---------- Página ---------- */

export default {
  titulo: 'Monitoramentos',
  trilha: ['Início', 'Monitoramentos'],
  nav: 'monitoramentos',

  esqueleto: () => skeletonCartao(3),

  async render() {
    emTela = await listarMonitoramentos();

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Meus monitoramentos',
    subtitulo: '<span id="sub-mon">' + subtitulo(emTela) + '</span>',
    acoes: `<button class="btn -primario" data-acao="novo-mon">${icone('mais')} Novo monitoramento</button>`,
  }))}

  <div id="lista-mon">${raw(corpoLista(emTela))}</div>
</div>`;
  },

  ativar(raiz) {
    raizAtual = raiz;
    let editando = null;

    const abrirFormulario = (m) => {
      editando = m;
      abrirModal({
        titulo: m ? 'Editar monitoramento' : 'Novo monitoramento',
        subtitulo: m ? m.nome : 'O LICITA+ vigia estes critérios e avisa quando algo novo aparece.',
        corpo: formulario(m),
        rodape: `<button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
                 <button class="btn -primario" data-acao="salvar-mon">
                   ${m ? 'Salvar alterações' : 'Criar monitoramento'}
                 </button>`,
      });
    };

    aoClicarEm(raiz, '[data-acao="novo-mon"]', () => abrirFormulario(null));

    aoClicarEm(raiz, '[data-acao="editar-mon"]', (_evento, alvo) => {
      abrirFormulario(emTela.find((x) => x.id === alvo.dataset.id) ?? null);
    });

    // Abrir os resultados é o gesto que significa "já vi": zera o
    // "novas" e leva à lista filtrada pelo que o monitoramento vigia.
    aoClicarEm(raiz, '[data-acao="ver-resultados"]', async (_evento, alvo) => {
      const m = emTela.find((x) => x.id === alvo.dataset.id);
      await marcarMonitoramentoVisto(alvo.dataset.id).catch(() => null);

      const partes = new URLSearchParams();
      if (m?.termos?.[0]) partes.set('q', m.termos[0]);
      if (m?.estados?.[0]) partes.set('uf', m.estados[0]);
      if (m?.modalidades?.[0]) partes.set('modalidade', String(m.modalidades[0]));

      window.location.hash = `#/oportunidades${partes.toString() ? `?${partes}` : ''}`;
    });

    aoClicarEm(raiz, '[data-acao="excluir-mon"]', (_evento, alvo) => {
      const m = emTela.find((x) => x.id === alvo.dataset.id);
      abrirModal({
        titulo: 'Excluir monitoramento',
        subtitulo: m?.nome,
        corpo: `<p style="line-height: 1.6">
          O monitoramento deixa de vigiar e some da lista. As oportunidades que ele já
          trouxe continuam onde estão — só o alerta acaba.
        </p>`,
        rodape: `<button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
                 <button class="btn -perigo" data-acao="confirmar-exclusao" data-id="${m?.id}">
                   Excluir
                 </button>`,
      });
    });

    // Modal e switch vivem fora da raiz da página em parte dos
    // casos, então estes ouvintes ficam no body — e por isso
    // precisam ser desligados quando a página sai.
    const desligar = [
      aoClicarEm(document.body, '[data-acao="salvar-mon"]', async (_evento, alvo) => {
        const dados = lerFormulario();

        if (!dados.nome) {
          toast('Dê um nome ao monitoramento', {
            variante: 'erro',
            sub: 'É por ele que você vai reconhecê-lo na lista.',
          });
          return;
        }

        alvo.disabled = true;

        try {
          if (editando) await atualizarMonitoramento(editando.id, dados);
          else await criarMonitoramento(dados);

          fecharModal();
          await recarregar();
          toast(editando ? 'Monitoramento atualizado' : 'Monitoramento criado', {
            variante: 'sucesso',
            sub: `"${dados.nome}" está vigiando novas oportunidades.`,
          });
        } catch (erro) {
          alvo.disabled = false;
          toast('Não foi possível salvar', { variante: 'erro', sub: erro.message });
        }
      }),

      aoClicarEm(document.body, '[data-acao="confirmar-exclusao"]', async (_evento, alvo) => {
        alvo.disabled = true;
        try {
          await removerMonitoramento(alvo.dataset.id);
          fecharModal();
          await recarregar();
          toast('Monitoramento excluído', { variante: 'info' });
        } catch (erro) {
          alvo.disabled = false;
          toast('Não foi possível excluir', { variante: 'erro', sub: erro.message });
        }
      }),
    ];

    aoClicarEm(raiz, '[data-acao="alternar-mon"]', async (_evento, alvo) => {
      const id = alvo.closest('[data-mon]')?.dataset.mon;
      const m = emTela.find((x) => x.id === id);
      if (!m) return;

      const ligado = alvo.checked;
      alvo.closest('.switch').querySelector('span:last-child').textContent = ligado ? 'Ativo' : 'Pausado';

      try {
        await atualizarMonitoramento(id, {
          nome: m.nome,
          termos: m.termos ?? [],
          estados: m.estados ?? [],
          municipios: m.municipios ?? [],
          modalidades: m.modalidades ?? [],
          valorMinimo: m.valorMinimo ?? undefined,
          alertaEmail: m.alertaEmail ?? true,
          ativo: ligado,
        });
        m.ativo = ligado;
        toast(ligado ? 'Monitoramento retomado' : 'Monitoramento pausado', { variante: 'info' });
      } catch (erro) {
        alvo.checked = !ligado;
        alvo.closest('.switch').querySelector('span:last-child').textContent = ligado ? 'Pausado' : 'Ativo';
        toast('Não foi possível alterar', { variante: 'erro', sub: erro.message });
      }
    });

    return () => {
      raizAtual = null;
      desligar.forEach((cancelar) => cancelar?.());
    };
  },
};

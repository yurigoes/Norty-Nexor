/* =========================================================
   LICITA+ — Monitoramentos
   ---------------------------------------------------------
   Uma busca salva que trabalha sozinha. A tela precisa deixar
   claro o que cada monitoramento vigia, quanto ele já
   encontrou e o que chegou de novo — nessa ordem, porque
   "o que é novo" é a única razão de abrir a página.
   ========================================================= */

import { html, raw, $, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { data } from '../lib/format.js';
import { cabecalhoPagina } from '../ui/domain.js';
import { abrirModal, fecharModal, toast, switchCampo, campo, seletor, vazio } from '../ui/primitives.js';
import { monitoramentos, modalidades, categorias } from '../data/mock.js';

function cartao(m) {
  return html`<article class="card" data-mon="${m.id}">
    <div class="card-corpo">
      <div class="linha-entre" style="align-items: flex-start">
        <div style="min-width: 0; flex: 1">
          <div class="linha" style="gap: var(--e-2)">
            <h3 style="font-size: var(--t-h4)">${m.nome}</h3>
            ${raw(m.ativo ? '' : '<span class="selo -neutro">Pausado</span>')}
          </div>

          <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; margin-top: var(--e-3)">
            ${raw(m.termos.map((t) => `<span class="selo -contorno">${t}</span>`).join(''))}
            ${raw(m.estados.map((e) => `<span class="selo -info">${icone('pin')}${e}</span>`).join(''))}
            ${raw(m.cidades ? m.cidades.map((c) => `<span class="selo -neutro">${c}</span>`).join('') : '')}
            ${raw(m.valorMin ? `<span class="selo -neutro">acima de R$ ${(m.valorMin / 1000).toFixed(0)} mil</span>` : '')}
          </div>

          <p class="tenue" style="font-size: var(--t-micro); margin-top: var(--e-3)">
            Criado em ${data(m.criadoEm)} · ${m.total} oportunidades encontradas no total
          </p>
        </div>

        <div style="flex: none; text-align: right">
          ${raw(
            m.novas > 0
              ? `<div class="linha" style="gap: 6px; justify-content: flex-end; color: var(--verde-600)">
                   ${icone('sino_ativo')}
                   <span style="font-size: var(--t-h3); font-weight: var(--p-extra);
                     font-variant-numeric: tabular-nums">${m.novas}</span>
                 </div>
                 <div class="suave" style="font-size: var(--t-micro)">novas oportunidades</div>`
              : `<div class="tenue" style="font-size: var(--t-corpo-sm)">Nenhuma novidade</div>`,
          )}
        </div>
      </div>
    </div>

    <div class="card-rodape linha-entre">
      ${raw(switchCampo({ id: `sw-${m.id}`, rotulo: m.ativo ? 'Ativo' : 'Pausado', ligado: m.ativo, acao: 'alternar-mon' }))}
      <div class="linha" style="gap: var(--e-2)">
        <button class="btn -fantasma -sm" data-acao="editar-mon" data-id="${m.id}">
          ${raw(icone('engrenagem'))} Editar
        </button>
        <a class="btn -secundario -sm" href="#/oportunidades">
          Ver resultados ${raw(icone('chevron_dir'))}
        </a>
      </div>
    </div>
  </article>`;
}

function formulario(m) {
  return html`<div class="pilha">
    ${raw(campo({ rotulo: 'Nome do monitoramento', id: 'mon-nome', valor: m?.nome ?? '', placeholder: 'Ex.: Equipamentos de informática em Salvador' }))}
    ${raw(campo({
      rotulo: 'Palavras-chave', id: 'mon-termos',
      valor: m?.termos?.join(', ') ?? '',
      placeholder: 'notebook, monitor, impressora',
      ajuda: 'Separe por vírgula. Casamos por palavra inteira, sem acento e sem caixa.',
    }))}
    <div class="grade grade-2" style="gap: var(--e-3)">
      ${raw(seletor({
        rotulo: 'Estado', id: 'mon-uf', valor: m?.estados?.[0] ?? 'BA',
        opcoes: ['BA', 'SE', 'PE', 'AL', 'SP', 'Todos'],
      }))}
      ${raw(seletor({
        rotulo: 'Categoria', id: 'mon-categoria', valor: '',
        opcoes: [{ valor: '', rotulo: 'Todas' }, ...categorias.map((c) => ({ valor: c, rotulo: c }))],
      }))}
    </div>
    <div class="grade grade-2" style="gap: var(--e-3)">
      ${raw(campo({ rotulo: 'Valor mínimo', id: 'mon-min', tipo: 'number', valor: m?.valorMin ?? '', placeholder: 'R$ 0' }))}
      ${raw(seletor({
        rotulo: 'Modalidade', id: 'mon-modalidade', valor: '',
        opcoes: [{ valor: '', rotulo: 'Todas' }, ...modalidades.map((x) => ({ valor: x, rotulo: x }))],
      }))}
    </div>
    ${raw(switchCampo({ id: 'mon-alerta', rotulo: 'Receber alerta por e-mail quando surgir oportunidade nova', ligado: true }))}
  </div>`;
}

export default {
  titulo: 'Monitoramentos',
  trilha: ['Início', 'Monitoramentos'],
  nav: 'monitoramentos',

  render() {
    const totalNovas = monitoramentos.reduce((s, m) => s + m.novas, 0);

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Meus monitoramentos',
    subtitulo: `${monitoramentos.filter((m) => m.ativo).length} ativos · ${totalNovas} novas oportunidades desde a última visita.`,
    acoes: `<button class="btn -primario" data-acao="novo-mon">${icone('mais')} Novo monitoramento</button>`,
  }))}

  <div class="pilha">${raw(monitoramentos.map(cartao).join(''))}</div>
</div>`;
  },

  ativar(raiz) {
    aoClicarEm(raiz, '[data-acao="novo-mon"]', () => {
      abrirModal({
        titulo: 'Novo monitoramento',
        subtitulo: 'O LICITA+ vigia estes critérios e avisa quando algo novo aparece.',
        corpo: formulario(null),
        rodape: `<button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
                 <button class="btn -primario" data-acao="salvar-mon">Criar monitoramento</button>`,
      });
    });

    aoClicarEm(raiz, '[data-acao="editar-mon"]', (_evento, alvo) => {
      const m = monitoramentos.find((x) => x.id === alvo.dataset.id);
      abrirModal({
        titulo: 'Editar monitoramento',
        subtitulo: m?.nome,
        corpo: formulario(m),
        rodape: `<button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
                 <button class="btn -primario" data-acao="salvar-mon">Salvar alterações</button>`,
      });
    });

    // O modal vive fora da raiz da página, então o ouvinte é global.
    aoClicarEm(document.body, '[data-acao="salvar-mon"]', () => {
      const nome = $('#mon-nome')?.value?.trim();
      if (!nome) {
        toast('Dê um nome ao monitoramento', { variante: 'erro', sub: 'É por ele que você vai reconhecê-lo na lista.' });
        return;
      }
      fecharModal();
      toast('Monitoramento salvo', { variante: 'sucesso', sub: `"${nome}" já está vigiando novas oportunidades.` });
    });

    aoClicarEm(raiz, '[data-acao="alternar-mon"]', (_evento, alvo) => {
      const ligado = alvo.checked;
      alvo.closest('.switch').querySelector('span:last-child').textContent = ligado ? 'Ativo' : 'Pausado';
      toast(ligado ? 'Monitoramento retomado' : 'Monitoramento pausado', { variante: 'info' });
    });
  },
};

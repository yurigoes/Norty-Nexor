/* =========================================================
   LICITA+ — Minha empresa
   ---------------------------------------------------------
   O perfil é o insumo da recomendação, então a tela precisa
   deixar visível a relação entre uma coisa e outra: a barra
   de completude não é enfeite, é o argumento para o usuário
   preencher o que falta.
   ========================================================= */

import { html, raw, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { cnpj as fmtCnpj, data } from '../lib/format.js';
import { cabecalhoPagina } from '../ui/domain.js';
import { campo, seletor, progresso, selo, toast, abas, ativarAbas, alerta, botao } from '../ui/primitives.js';
import { empresa } from '../data/mock.js';

const PORTES = { mei: 'MEI', me: 'Microempresa', epp: 'Empresa de Pequeno Porte', demais: 'Demais' };

function painelDados() {
  return html`<div class="pilha">
    <div class="grade grade-2" style="gap: var(--e-4)">
      ${raw(campo({ rotulo: 'Razão social', id: 'e-razao', valor: empresa.razaoSocial }))}
      ${raw(campo({ rotulo: 'Nome fantasia', id: 'e-fantasia', valor: empresa.nomeFantasia }))}
      ${raw(campo({ rotulo: 'CNPJ', id: 'e-cnpj', valor: fmtCnpj(empresa.cnpj), atributos: 'readonly' }))}
      ${raw(seletor({
        rotulo: 'Porte', id: 'e-porte', valor: empresa.porte,
        opcoes: Object.entries(PORTES).map(([valor, rotulo]) => ({ valor, rotulo })),
      }))}
      ${raw(campo({ rotulo: 'Cidade', id: 'e-cidade', valor: empresa.cidade }))}
      ${raw(campo({ rotulo: 'Estado', id: 'e-uf', valor: empresa.uf }))}
    </div>

    ${raw(alerta({
      variante: 'info', nomeIcone: 'info',
      texto: `Empresa de pequeno porte tem acesso à cota exclusiva da LC 123/2006 —
        contratações de até <b>R$ 80 mil por item</b> reservadas a ME e EPP.
        O LICITA+ pontua essas oportunidades mais alto para você.`,
    }))}
  </div>`;
}

function painelAtuacao() {
  return html`<div class="pilha">
    <div>
      <div class="campo-rotulo" style="margin-bottom: var(--e-3)">CNAEs cadastrados</div>
      <div class="pilha-sm">
        ${raw(empresa.cnaes.map((c) => `
          <div class="linha" style="gap: var(--e-3); padding: var(--e-3);
            border: 1px solid var(--borda); border-radius: var(--r-md)">
            <span class="num" style="font-weight: var(--p-bold); color: var(--azul-600);
              flex: none">${c.codigo}</span>
            <span style="flex: 1; font-size: var(--t-corpo-sm)">${c.descricao}</span>
            ${c.principal ? '<span class="selo -info" style="flex:none">Principal</span>' : ''}
          </div>`).join(''))}
      </div>
      <button class="btn -secundario -sm" style="margin-top: var(--e-3)" data-acao="add-cnae">
        ${raw(icone('mais'))} Adicionar CNAE
      </button>
    </div>

    <div>
      <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Estados de atuação</div>
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap">
        ${raw(empresa.estadosAtuacao.map((uf) =>
          `<span class="filtro-chip">${icone('pin')}${uf}<button aria-label="Remover ${uf}">${icone('fechar')}</button></span>`,
        ).join(''))}
        <button class="filtro-pill" data-acao="add-uf">${raw(icone('mais'))} Adicionar estado</button>
      </div>
    </div>

    <div class="grade grade-2" style="gap: var(--e-4)">
      <div>
        <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Produtos</div>
        <div class="linha" style="gap: 6px; flex-wrap: wrap">
          ${raw(empresa.produtos.map((p) => `<span class="selo -neutro">${p}</span>`).join(''))}
        </div>
      </div>
      <div>
        <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Serviços</div>
        <div class="linha" style="gap: 6px; flex-wrap: wrap">
          ${raw(empresa.servicos.map((s) => `<span class="selo -sucesso">${s}</span>`).join(''))}
        </div>
      </div>
    </div>
  </div>`;
}

function painelPreferencias() {
  return html`<div class="pilha">
    <div class="grade grade-2" style="gap: var(--e-4)">
      ${raw(campo({ rotulo: 'Valor mínimo de interesse', id: 'e-min', tipo: 'number', valor: empresa.faixaMin,
        ajuda: 'Abaixo disso, participar não paga o esforço.' }))}
      ${raw(campo({ rotulo: 'Valor máximo de interesse', id: 'e-max', tipo: 'number', valor: empresa.faixaMax,
        ajuda: 'Lembre que em licitação você entrega antes de receber.' }))}
    </div>

    <div>
      <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Modalidades de interesse</div>
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap">
        ${raw(['Pregão Eletrônico', 'Dispensa Eletrônica', 'Credenciamento', 'Concorrência Eletrônica', 'Inexigibilidade']
          .map((m) => `<button class="filtro-pill ${empresa.modalidades.includes(m) ? '-ativo' : ''}"
            data-acao="alternar-modalidade">${empresa.modalidades.includes(m) ? icone('check') : ''}${m}</button>`)
          .join(''))}
      </div>
    </div>

    ${raw(alerta({
      variante: 'aviso', nomeIcone: 'alerta',
      texto: `<b>Faltam seus atestados de capacidade técnica.</b> Sem eles não conseguimos
        avaliar editais que exigem comprovação de experiência — e eles são a maior parte
        dos certames acima de R$ 200 mil.`,
    }))}
  </div>`;
}

export default {
  titulo: 'Minha empresa',
  trilha: ['Início', 'Minha empresa'],
  nav: 'empresa',

  render() {
    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Minha empresa',
    subtitulo: 'O perfil alimenta as recomendações. Quanto mais completo, mais precisa a análise.',
    acoes: `<button class="btn -primario" data-acao="salvar-empresa">${icone('salvar')} Salvar alterações</button>`,
  }))}

  <!-- Cabeçalho do perfil -->
  <section class="card" style="position: relative; overflow: hidden">
    <span class="geo geo-losango" style="width: 220px; height: 220px; right: -90px; top: -90px;
      background: linear-gradient(135deg, var(--azul-50), var(--verde-50))"></span>

    <div class="card-corpo" style="position: relative">
      <div class="linha" style="gap: var(--e-5); flex-wrap: wrap; align-items: flex-start">
        <span class="avatar -lg" style="width: 64px; height: 64px; font-size: var(--t-h4)">
          ${empresa.nomeFantasia.slice(0, 2).toUpperCase()}
        </span>

        <div style="flex: 1; min-width: 240px">
          <h2 style="font-size: var(--t-h3)">${empresa.nomeFantasia}</h2>
          <p class="suave" style="font-size: var(--t-corpo-sm)">${empresa.razaoSocial}</p>
          <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; margin-top: var(--e-3)">
            ${raw(selo({ texto: fmtCnpj(empresa.cnpj), variante: 'neutro' }))}
            ${raw(selo({ texto: PORTES[empresa.porte], variante: 'sucesso', nomeIcone: 'escudo' }))}
            ${raw(selo({ texto: `${empresa.cidade} — ${empresa.uf}`, variante: 'info', nomeIcone: 'pin' }))}
            ${raw(selo({ texto: `Desde ${new Date(empresa.fundacao).getFullYear()}`, variante: 'contorno' }))}
          </div>
        </div>

        <div style="flex: none; min-width: 230px">
          <div class="linha-entre" style="margin-bottom: 6px">
            <span class="rotulo">Perfil completo</span>
            <span style="font-weight: var(--p-extra); color: var(--azul-600);
              font-variant-numeric: tabular-nums">${empresa.perfilCompleto}%</span>
          </div>
          ${raw(progresso({ valor: empresa.perfilCompleto, rotuloAcessivel: 'Completude do perfil' }))}
          <p class="suave" style="font-size: var(--t-micro); margin-top: var(--e-2); line-height: 1.5">
            Faltam <b>atestados técnicos</b> e <b>faixa de valor por categoria</b>.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Abas do perfil -->
  <section class="card">
    <div style="padding: 0 var(--e-5)">
      ${raw(abas({
        ativa: 'dados',
        itens: [
          { chave: 'dados', rotulo: 'Dados cadastrais' },
          { chave: 'atuacao', rotulo: 'Atuação e catálogo' },
          { chave: 'preferencias', rotulo: 'Preferências' },
        ],
      }))}
    </div>
    <div class="card-corpo" id="painel-empresa">${raw(painelDados())}</div>
  </section>
</div>`;
  },

  ativar(raiz) {
    const painel = raiz.querySelector('#painel-empresa');

    ativarAbas(raiz, (chave) => {
      const paineis = { dados: painelDados, atuacao: painelAtuacao, preferencias: painelPreferencias };
      painel.innerHTML = (paineis[chave] ?? painelDados)();
    });

    aoClicarEm(raiz, '[data-acao="salvar-empresa"]', () => {
      toast('Perfil atualizado', {
        variante: 'sucesso',
        sub: 'As recomendações serão recalculadas na próxima varredura.',
      });
    });

    aoClicarEm(raiz, '[data-acao="add-cnae"], [data-acao="add-uf"]', () => {
      toast('Disponível na versão completa', { variante: 'info' });
    });

    aoClicarEm(raiz, '[data-acao="alternar-modalidade"]', (_evento, alvo) => {
      alvo.classList.toggle('-ativo');
    });
  },
};

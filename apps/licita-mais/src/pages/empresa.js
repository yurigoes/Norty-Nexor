/* =========================================================
   LICITA+ — Minha empresa
   ---------------------------------------------------------
   O perfil é o insumo da recomendação, então a tela precisa
   deixar visível a relação entre uma coisa e outra: a barra
   de completude não é enfeite, é o argumento para o usuário
   preencher o que falta.

   O centro da tela são as **linhas de fornecimento**, não uma
   lista de CNAEs. CNAE diz o que a empresa pode faturar;
   linha de fornecimento diz o que ela vende de fato, com as
   palavras que aparecem num edital. É por elas que a triagem
   casa "notebook" com "microcomputador portátil" — e é por
   isso que a tela pede palavra-chave, e não código.

   Salvar apaga as avaliações no servidor de propósito: com o
   perfil novo, as notas antigas viraram passado. Melhor a
   lista vir vazia até a próxima varredura do que mostrar
   compatibilidade de um perfil que já não vale.
   ========================================================= */

import { html, raw, $, $$, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { cnpj as fmtCnpj, moeda } from '../lib/format.js';
import { cabecalhoPagina } from '../ui/domain.js';
import {
  campo, seletor, progresso, selo, toast, abas, ativarAbas, alerta, skeletonCartao,
} from '../ui/primitives.js';
import { MODALIDADES_PNCP, UFS } from '../lib/tabelas.js';
import { obterEmpresa, salvarEmpresa, listarMunicipios } from '../dados/index.js';

const PORTES = {
  mei: 'MEI',
  me: 'Microempresa',
  epp: 'Empresa de Pequeno Porte',
  demais: 'Demais portes',
};

/** Perfil em edição. Só vai ao servidor quando o usuário salva. */
let perfil = null;
let raizEmpresa = null;

/* ---------- Aba: dados cadastrais ---------- */

function painelDados() {
  return html`<div class="pilha">
    <div class="grade grade-2" style="gap: var(--e-4)">
      ${raw(campo({ rotulo: 'Razão social', id: 'e-razao', valor: perfil.razaoSocial ?? '' }))}
      ${raw(campo({ rotulo: 'Nome fantasia', id: 'e-fantasia', valor: perfil.nomeFantasia ?? '' }))}
      ${raw(campo({
        rotulo: 'CNPJ', id: 'e-cnpj', valor: fmtCnpj(perfil.cnpj ?? ''),
        atributos: 'readonly',
        ajuda: 'O CNPJ identifica a conta e não pode ser trocado aqui.',
      }))}
      ${raw(seletor({
        rotulo: 'Porte', id: 'e-porte', valor: perfil.porte ?? 'me',
        opcoes: Object.entries(PORTES).map(([valor, rotulo]) => ({ valor, rotulo })),
      }))}
      ${raw(campo({ rotulo: 'Cidade sede', id: 'e-municipio', valor: perfil.municipio ?? '' }))}
      ${raw(seletor({
        rotulo: 'Estado', id: 'e-uf', valor: perfil.uf ?? '',
        opcoes: UFS.map((u) => ({ valor: u, rotulo: u })),
      }))}
    </div>

    <div>
      <div class="campo-rotulo" style="margin-bottom: 6px">Cidade na lista oficial</div>
      <div class="linha" style="gap: var(--e-3); flex-wrap: wrap; align-items: flex-end">
        <div style="flex: 1; min-width: 240px">
          <select class="select" id="e-ibge" aria-label="Município oficial">
            <option value="">Carregando municípios…</option>
          </select>
        </div>
        ${raw(perfil.municipioIbge
          ? '<span class="selo -sucesso" style="margin-bottom: 8px">Vinculada</span>'
          : '<span class="selo -aviso" style="margin-bottom: 8px">Não vinculada</span>')}
      </div>
      <span class="campo-ajuda">
        Vincular a cidade ao código oficial é o que permite pontuar "mesmo município" —
        o critério geográfico mais forte da triagem.
      </span>
    </div>

    ${raw(['me', 'epp', 'mei'].includes(perfil.porte)
      ? alerta({
          variante: 'info', nomeIcone: 'escudo',
          texto: `Como ${PORTES[perfil.porte]}, sua empresa tem acesso à cota exclusiva da
            LC 123/2006 — contratações de até <b>R$ 80 mil por item</b> reservadas a ME e EPP.
            O LICITA+ pontua essas oportunidades mais alto para você.`,
        })
      : alerta({
          variante: 'aviso', nomeIcone: 'info',
          texto: `Empresas fora do enquadramento ME/EPP não disputam a cota exclusiva da
            LC 123/2006. Se o seu faturamento se enquadra, corrigir o porte muda a
            pontuação de boa parte das oportunidades pequenas.`,
        }))}
  </div>`;
}

/* ---------- Aba: linhas de fornecimento ---------- */

function linhaEditor(linha, indice) {
  return `<div class="card" data-linha="${indice}">
    <div class="card-corpo pilha-sm">
      <div class="linha-entre" style="gap: var(--e-3)">
        <input class="input" data-campo="nome" value="${linha.nome ?? ''}"
          placeholder="Nome da linha — ex.: Equipamentos de informática"
          aria-label="Nome da linha" style="font-weight: var(--p-semi)">
        <button class="btn-icone" data-acao="remover-linha" data-indice="${indice}"
          aria-label="Remover linha">${icone('fechar')}</button>
      </div>

      <label class="campo">
        <span class="campo-rotulo">Palavras que aparecem no edital</span>
        <input class="input" data-campo="palavras" value="${(linha.palavrasChave ?? []).join(', ')}"
          placeholder="notebook, computador portátil, ultrabook">
        <span class="campo-ajuda">
          Separe por vírgula. Frases funcionam: "material de escritório".
        </span>
      </label>

      <label class="campo">
        <span class="campo-rotulo">Palavras que derrubam a oportunidade</span>
        <input class="input" data-campo="excluidas" value="${(linha.palavrasExcluidas ?? []).join(', ')}"
          placeholder="locação, comodato">
        <span class="campo-ajuda">
          Quem revende computador não quer "locação de impressora".
        </span>
      </label>
    </div>
  </div>`;
}

function painelLinhas() {
  const linhas = perfil.linhas ?? [];

  return html`<div class="pilha">
    <p class="suave" style="font-size: var(--t-corpo-sm); line-height: 1.6; margin: 0">
      Cada linha é uma coisa que a sua empresa vende. Separar em linhas — em vez de uma
      lista solta de palavras — é o que permite ao sistema dizer <i>por que</i> uma
      oportunidade apareceu.
    </p>

    <div class="pilha" id="lista-linhas">
      ${raw(linhas.length
        ? linhas.map(linhaEditor).join('')
        : `<div class="vazio" style="padding: var(--e-8) var(--e-4)">
             <span class="vazio-arte">${icone('maleta')}</span>
             <h3>Nenhuma linha declarada</h3>
             <p>Sem linha de fornecimento a triagem não tem com o que comparar o edital,
             e nenhuma oportunidade pontua aderência — que vale 45 dos 100 pontos.</p>
           </div>`)}
    </div>

    <button class="btn -secundario" data-acao="add-linha">
      ${raw(icone('mais'))} Adicionar linha
    </button>

    <div>
      <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Estados de atuação</div>
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap" id="chips-uf">
        ${raw((perfil.estadosAtuacao ?? []).map((uf) =>
          `<span class="filtro-chip">${icone('pin')}${uf}
            <button data-acao="remover-uf" data-uf="${uf}" aria-label="Remover ${uf}">${icone('fechar')}</button>
          </span>`).join(''))}
      </div>
      <div class="linha" style="gap: var(--e-2); margin-top: var(--e-3); max-width: 320px">
        ${raw(seletor({
          id: 'novo-uf', rotulo: '',
          valor: '',
          opcoes: [{ valor: '', rotulo: 'Adicionar estado…' }, ...UFS.map((u) => ({ valor: u, rotulo: u }))],
        }))}
      </div>
      <span class="campo-ajuda">
        Fora destes estados a oportunidade é descartada, não apenas rebaixada.
      </span>
    </div>

    <div>
      <div class="campo-rotulo" style="margin-bottom: var(--e-3)">
        Municípios da sua região
      </div>
      ${raw(campo({
        rotulo: '', id: 'e-regiao',
        valor: (perfil.municipiosRegiao ?? []).join(', '),
        placeholder: 'Salvador, Lauro de Freitas, Camaçari',
        ajuda: 'Cidades que você atende sem inviabilizar a entrega. Elas pontuam quase tanto quanto a sede.',
      }))}
    </div>
  </div>`;
}

/* ---------- Aba: preferências ---------- */

function painelPreferencias() {
  const escolhidas = perfil.modalidades ?? [];

  return html`<div class="pilha">
    <div class="grade grade-2" style="gap: var(--e-4)">
      ${raw(campo({
        rotulo: 'Valor mínimo de interesse', id: 'e-min', tipo: 'number',
        valor: perfil.valorMinimo ?? 0,
        ajuda: 'Abaixo disso, participar não paga o esforço.',
      }))}
      ${raw(campo({
        rotulo: 'Valor máximo de interesse', id: 'e-max', tipo: 'number',
        valor: perfil.valorMaximo ?? 0,
        ajuda: 'Lembre que em licitação você entrega antes de receber.',
      }))}
    </div>

    ${raw(campo({
      rotulo: 'Dias que você precisa para montar uma proposta', id: 'e-preparo',
      tipo: 'number', valor: perfil.diasMinimosPreparo ?? 3,
      ajuda: 'Oportunidade que encerra antes disso vem com alerta de prazo apertado.',
    }))}

    <div>
      <div class="campo-rotulo" style="margin-bottom: var(--e-3)">Modalidades de interesse</div>
      <div class="linha" style="gap: var(--e-2); flex-wrap: wrap">
        ${raw(MODALIDADES_PNCP.map((m) => `
          <button type="button" class="filtro-pill ${escolhidas.includes(m.codigo) ? '-ativo' : ''}"
            data-acao="alternar-modalidade" data-codigo="${m.codigo}"
            aria-pressed="${escolhidas.includes(m.codigo)}">
            ${escolhidas.includes(m.codigo) ? icone('check') : ''}${m.nome}
          </button>`).join(''))}
      </div>
      <span class="campo-ajuda" style="display: block; margin-top: var(--e-3)">
        Pregão Eletrônico, Dispensa e Credenciamento são as portas de entrada — ritos
        curtos e de valor baixo. As demais pedem estrutura documental que raramente
        compensa antes das primeiras vitórias.
      </span>
    </div>

    <div class="alerta-bloco -info">
      ${raw(icone('info'))}
      <div>
        A faixa de valor atual é de <b>${moeda(perfil.valorMinimo ?? 0)}</b> a
        <b>${moeda(perfil.valorMaximo ?? 0)}</b>. Fora dela a oportunidade não é
        descartada — ela apenas perde os 15 pontos do critério de valor.
      </div>
    </div>
  </div>`;
}

/* ---------- Leitura da tela ---------- */

const separarPorVirgula = (texto) =>
  (texto ?? '').split(',').map((t) => t.trim()).filter(Boolean);

/**
 * Recolhe o que estiver visível. Cada aba grava no `perfil` ao
 * sair, então trocar de aba não perde o que foi digitado — e o
 * salvamento envia o perfil inteiro, não só a aba atual.
 */
function recolherAbaVisivel() {
  if (!raizEmpresa) return;

  const ler = (id) => $(`#${id}`, raizEmpresa)?.value;

  if (ler('e-razao') !== undefined) {
    perfil.razaoSocial = ler('e-razao').trim();
    perfil.nomeFantasia = ler('e-fantasia').trim();
    perfil.porte = ler('e-porte');
    perfil.municipio = ler('e-municipio').trim();
    perfil.uf = ler('e-uf');
    const ibge = ler('e-ibge');
    if (ibge) perfil.municipioIbge = ibge;
  }

  if (ler('e-regiao') !== undefined) {
    perfil.municipiosRegiao = separarPorVirgula(ler('e-regiao'));
    perfil.linhas = $$('[data-linha]', raizEmpresa).map((no) => ({
      nome: $('[data-campo="nome"]', no).value.trim(),
      palavrasChave: separarPorVirgula($('[data-campo="palavras"]', no).value),
      palavrasExcluidas: separarPorVirgula($('[data-campo="excluidas"]', no).value),
    })).filter((l) => l.nome);
  }

  if (ler('e-min') !== undefined) {
    perfil.valorMinimo = Number(ler('e-min')) || 0;
    perfil.valorMaximo = Number(ler('e-max')) || 0;
    perfil.diasMinimosPreparo = Number(ler('e-preparo')) || 3;
  }
}

/* ---------- Página ---------- */

const PAINEIS = { dados: painelDados, linhas: painelLinhas, preferencias: painelPreferencias };

export default {
  titulo: 'Minha empresa',
  trilha: ['Início', 'Minha empresa'],
  nav: 'empresa',

  esqueleto: () => skeletonCartao(2),

  async render() {
    perfil = await obterEmpresa();

    const nome = perfil.nomeFantasia || perfil.razaoSocial || 'Sua empresa';

    return html`
<div class="pilha-lg">
  ${raw(cabecalhoPagina({
    titulo: 'Minha empresa',
    subtitulo: 'O perfil alimenta as recomendações. Quanto mais completo, mais precisa a análise.',
    acoes: `<button class="btn -primario" data-acao="salvar-empresa">${icone('salvar')} Salvar alterações</button>`,
  }))}

  <section class="card" style="position: relative; overflow: hidden">
    <span class="geo geo-losango" style="width: 220px; height: 220px; right: -90px; top: -90px;
      background: linear-gradient(135deg, var(--azul-50), var(--verde-50))"></span>

    <div class="card-corpo" style="position: relative">
      <div class="linha" style="gap: var(--e-5); flex-wrap: wrap; align-items: flex-start">
        <span class="avatar -lg" style="width: 64px; height: 64px; font-size: var(--t-h4)">
          ${nome.slice(0, 2).toUpperCase()}
        </span>

        <div style="flex: 1; min-width: 240px">
          <h2 style="font-size: var(--t-h3)">${nome}</h2>
          <p class="suave" style="font-size: var(--t-corpo-sm)">${perfil.razaoSocial ?? ''}</p>
          <div class="linha" style="gap: var(--e-2); flex-wrap: wrap; margin-top: var(--e-3)">
            ${raw(selo({ texto: fmtCnpj(perfil.cnpj ?? ''), variante: 'neutro' }))}
            ${raw(selo({ texto: PORTES[perfil.porte] ?? 'Porte não informado', variante: 'sucesso', nomeIcone: 'escudo' }))}
            ${raw(selo({
              texto: perfil.municipio ? `${perfil.municipio} — ${perfil.uf}` : (perfil.uf ?? '—'),
              variante: 'info', nomeIcone: 'pin',
            }))}
            ${raw(selo({
              texto: `${(perfil.linhas ?? []).length} linha${(perfil.linhas ?? []).length === 1 ? '' : 's'} de fornecimento`,
              variante: 'contorno',
            }))}
          </div>
        </div>

        <div style="flex: none; min-width: 230px">
          <div class="linha-entre" style="margin-bottom: 6px">
            <span class="rotulo">Perfil completo</span>
            <span style="font-weight: var(--p-extra); color: var(--azul-600);
              font-variant-numeric: tabular-nums" id="completude-num">${perfil.completude ?? 0}%</span>
          </div>
          ${raw(progresso({ valor: perfil.completude ?? 0, rotuloAcessivel: 'Completude do perfil' }))}
          <p class="suave" style="font-size: var(--t-micro); margin-top: var(--e-2); line-height: 1.5">
            Cada item declarado é um critério a mais que a triagem consegue avaliar.
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="card">
    <div style="padding: 0 var(--e-5)">
      ${raw(abas({
        ativa: 'dados',
        itens: [
          { chave: 'dados', rotulo: 'Dados cadastrais' },
          { chave: 'linhas', rotulo: 'O que você vende' },
          { chave: 'preferencias', rotulo: 'Preferências' },
        ],
      }))}
    </div>
    <div class="card-corpo" id="painel-empresa">${raw(painelDados())}</div>
  </section>
</div>`;
  },

  ativar(raiz) {
    raizEmpresa = raiz;
    const painel = $('#painel-empresa', raiz);

    const carregarMunicipios = async () => {
      const select = $('#e-ibge', raiz);
      if (!select) return;

      const lista = await listarMunicipios(perfil.uf).catch(() => []);

      select.innerHTML = lista.length
        ? ['<option value="">Selecione a cidade…</option>',
           ...lista.map((m) =>
             `<option value="${m.ibge}" ${m.ibge === perfil.municipioIbge ? 'selected' : ''}>${m.nome}</option>`)]
          .join('')
        : '<option value="">Nenhum município disponível ainda — aparece depois da primeira varredura</option>';
    };

    carregarMunicipios();

    ativarAbas(raiz, (chave) => {
      // Grava o que está em tela antes de trocar: a aba some do
      // DOM, e o que não foi recolhido some com ela.
      recolherAbaVisivel();
      painel.innerHTML = (PAINEIS[chave] ?? painelDados)();
      if (chave === 'dados') carregarMunicipios();
    });

    aoClicarEm(raiz, '[data-acao="add-linha"]', () => {
      recolherAbaVisivel();
      perfil.linhas = [...(perfil.linhas ?? []), { nome: '', palavrasChave: [], palavrasExcluidas: [] }];
      painel.innerHTML = painelLinhas();
    });

    aoClicarEm(raiz, '[data-acao="remover-linha"]', (_evento, alvo) => {
      recolherAbaVisivel();
      perfil.linhas = (perfil.linhas ?? []).filter((_l, i) => i !== Number(alvo.dataset.indice));
      painel.innerHTML = painelLinhas();
    });

    aoClicarEm(raiz, '[data-acao="remover-uf"]', (_evento, alvo) => {
      recolherAbaVisivel();
      perfil.estadosAtuacao = (perfil.estadosAtuacao ?? []).filter((u) => u !== alvo.dataset.uf);
      painel.innerHTML = painelLinhas();
    });

    aoClicarEm(raiz, '[data-acao="alternar-modalidade"]', (_evento, alvo) => {
      const codigo = Number(alvo.dataset.codigo);
      const atuais = perfil.modalidades ?? [];
      perfil.modalidades = atuais.includes(codigo)
        ? atuais.filter((c) => c !== codigo)
        : [...atuais, codigo];

      const ativo = perfil.modalidades.includes(codigo);
      alvo.classList.toggle('-ativo', ativo);
      alvo.setAttribute('aria-pressed', String(ativo));
    });

    aoClicarEm(raiz, '[data-acao="salvar-empresa"]', async (_evento, alvo) => {
      recolherAbaVisivel();

      if (!perfil.razaoSocial) {
        toast('A razão social não pode ficar vazia', { variante: 'erro' });
        return;
      }

      alvo.disabled = true;
      alvo.classList.add('-carregando');

      try {
        const salvo = await salvarEmpresa({
          razaoSocial: perfil.razaoSocial,
          nomeFantasia: perfil.nomeFantasia || undefined,
          porte: perfil.porte,
          municipio: perfil.municipio || undefined,
          municipioIbge: perfil.municipioIbge || undefined,
          uf: perfil.uf,
          municipiosRegiao: perfil.municipiosRegiao ?? [],
          estadosAtuacao: perfil.estadosAtuacao ?? [],
          valorMinimo: perfil.valorMinimo ?? 0,
          valorMaximo: perfil.valorMaximo ?? 0,
          modalidades: perfil.modalidades ?? [],
          diasMinimosPreparo: perfil.diasMinimosPreparo ?? 3,
          linhas: perfil.linhas ?? [],
        });

        perfil = { ...perfil, ...salvo };

        const numero = $('#completude-num', raiz);
        if (numero) numero.textContent = `${perfil.completude ?? 0}%`;

        toast('Perfil atualizado', {
          variante: 'sucesso',
          sub: 'As oportunidades serão reavaliadas na próxima varredura, de madrugada.',
        });
      } catch (erro) {
        toast('Não foi possível salvar', { variante: 'erro', sub: erro.message });
      } finally {
        alvo.disabled = false;
        alvo.classList.remove('-carregando');
      }
    });

    // O estado adicionado pelo select entra na lista sem recarregar.
    raiz.addEventListener('change', (evento) => {
      if (evento.target.id !== 'novo-uf' || !evento.target.value) return;
      recolherAbaVisivel();
      const uf = evento.target.value;
      if (!(perfil.estadosAtuacao ?? []).includes(uf)) {
        perfil.estadosAtuacao = [...(perfil.estadosAtuacao ?? []), uf];
      }
      painel.innerHTML = painelLinhas();
    });

    return () => { raizEmpresa = null; };
  },
};

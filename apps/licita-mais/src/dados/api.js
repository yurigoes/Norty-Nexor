/* =========================================================
   LICITA+ — Repositório sobre a API
   ---------------------------------------------------------
   Aqui a resposta da API vira a forma que as telas já
   desenham. A tradução mora num lugar só, de propósito: se
   cada página lesse `valorEstimado` e `encerramentoProposta`
   direto, trocar um nome de campo no servidor obrigaria a
   caçar quatorze arquivos.

   O que a API devolve é o dado do PNCP normalizado; o que a
   tela consome é um cartão de oportunidade. Não são a mesma
   coisa, e essa fronteira é o motivo deste arquivo.
   ========================================================= */

import { pedir, consulta } from '../lib/http.js';

/* ---------- Tabelas de tradução ---------- */

const NOME_MODALIDADE = {
  1: 'Leilão Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência Eletrônica',
  5: 'Concorrência Presencial',
  6: 'Pregão Eletrônico',
  7: 'Pregão Presencial',
  8: 'Dispensa Eletrônica',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão Presencial',
};

const NOME_ESFERA = { F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital' };

/**
 * Rótulo e peso máximo de cada critério da triagem. Os pesos
 * espelham `PESOS` de `@nexor/licitacoes-shared` — é o que
 * permite desenhar a barra "18 de 20" sem pedir mais um campo
 * à API.
 */
const CRITERIOS = {
  aderencia: { titulo: 'Aderência ao que você vende', maximo: 45 },
  geografia: { titulo: 'Distância e região de atuação', maximo: 20 },
  valor: { titulo: 'Faixa de valor adequada', maximo: 15 },
  modalidade: { titulo: 'Modalidade que você atende', maximo: 10 },
  exclusividade: { titulo: 'Exclusividade ou cota ME/EPP', maximo: 10 },
};

/* ---------- Tradução de uma oportunidade ---------- */

/** Sigla legível a partir da razão social do órgão. */
function siglaDoOrgao(razaoSocial = '') {
  const achou = razaoSocial.match(/\b[A-Z]{2,}\b/g);
  if (achou) return achou[0];

  return razaoSocial
    .split(/\s+/)
    .filter((p) => p.length > 3)
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Em qual sistema a proposta é de fato enviada. */
function plataformaDoLink(link) {
  if (!link) return 'Ver no PNCP';
  try {
    const host = new URL(link).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return 'Sistema do órgão';
  }
}

function razoesDaTriagem(motivos) {
  const lista = Array.isArray(motivos) ? motivos : [];

  return Object.entries(CRITERIOS).map(([chave, criterio]) => {
    const motivo = lista.find((m) => m.peso === chave);
    const pontos = motivo?.pontos ?? 0;

    return {
      chave,
      titulo: criterio.titulo,
      peso: criterio.maximo,
      pontos,
      // Um critério só conta como atendido se pontuou de fato.
      // Meia pontuação aparece na barra, não no "sim".
      ok: pontos >= criterio.maximo,
      parcial: pontos > 0 && pontos < criterio.maximo,
      detalhe: motivo?.explicacao ?? 'Sem pontuação neste critério.',
    };
  });
}

/** Resposta da API → cartão de oportunidade que as telas desenham. */
function paraCartao(bruta) {
  const orgao = bruta.orgao ?? {};

  return {
    id: bruta.id,
    referencia: bruta.numeroControlePncp,
    objeto: bruta.objeto,
    resumo: bruta.informacaoComplementar || bruta.objeto,

    orgao: {
      id: orgao.cnpj,
      nome: orgao.razaoSocial,
      sigla: siglaDoOrgao(orgao.razaoSocial),
      unidade: orgao.unidade ?? null,
      cidade: orgao.municipio,
      uf: orgao.uf,
      esfera: NOME_ESFERA[orgao.esfera] ?? 'Não informada',
    },

    modalidade: NOME_MODALIDADE[bruta.modalidadeCodigo] ?? `Modalidade ${bruta.modalidadeCodigo}`,
    modalidadeCodigo: bruta.modalidadeCodigo,
    categoria: bruta.linhasAtendidas?.[0] ?? 'Sem linha correspondente',

    numero: bruta.numeroCompra ?? '—',
    processo: bruta.processo ?? '—',
    valor: bruta.valorEstimado,
    srp: Boolean(bruta.registroDePrecos),

    abertura: bruta.aberturaProposta,
    encerramento: bruta.encerramentoProposta,
    situacao: 'Recebendo propostas',
    plataforma: plataformaDoLink(bruta.linkSistemaOrigem),
    linkPncp: bruta.linkPncp,
    linkSistemaOrigem: bruta.linkSistemaOrigem,

    compatibilidade: bruta.compatibilidade,
    razoes: razoesDaTriagem(bruta.motivos),
    alertas: Array.isArray(bruta.alertas) ? bruta.alertas : [],
    linhasAtendidas: bruta.linhasAtendidas ?? [],
    favorito: Boolean(bruta.favorito),

    itens: (bruta.itens ?? []).map((item) => ({
      n: item.numero,
      descricao: item.descricao,
      qtd: item.quantidade,
      un: item.unidade,
      unitario: item.valorUnitario,
    })),

    // O PNCP publica o edital como link, não como arquivo que
    // possamos listar. Prometer uma lista de anexos que não
    // temos seria pior do que apontar para a fonte.
    documentos: [],
  };
}

/* ---------- Oportunidades ---------- */

export async function apiListarOportunidades(filtros = {}) {
  const pagina = await pedir(`/oportunidades${consulta({
    q: filtros.termo,
    uf: filtros.uf,
    modalidade: filtros.modalidadeCodigo,
    valorMin: filtros.valorMin,
    valorMax: filtros.valorMax,
    compatMin: filtros.compatMin,
    ordem: filtros.ordem,
    pagina: filtros.pagina,
    tamanho: filtros.tamanho,
  })}`);

  return { ...pagina, itens: pagina.itens.map(paraCartao) };
}

export const apiObterOportunidade = (id) => pedir(`/oportunidades/${id}`).then(paraCartao);

export const apiResumoPainel = () => pedir('/oportunidades/resumo');

/* ---------- Favoritos ---------- */

export async function apiListarFavoritos() {
  const pagina = await pedir('/favoritos');
  return pagina.itens.map(paraCartao);
}

export const apiFavoritar = (id) => pedir(`/favoritos/${id}`, { metodo: 'PUT' });
export const apiDesfavoritar = (id) => pedir(`/favoritos/${id}`, { metodo: 'DELETE' });

/* ---------- Empresa ---------- */

export const apiObterEmpresa = () => pedir('/empresa');
export const apiSalvarEmpresa = (perfil) => pedir('/empresa', { metodo: 'PUT', corpo: perfil });

/* ---------- Monitoramentos ---------- */

export const apiListarMonitoramentos = () => pedir('/monitoramentos');
export const apiCriarMonitoramento = (dados) => pedir('/monitoramentos', { metodo: 'POST', corpo: dados });
export const apiAtualizarMonitoramento = (id, dados) =>
  pedir(`/monitoramentos/${id}`, { metodo: 'PUT', corpo: dados });
export const apiRemoverMonitoramento = (id) => pedir(`/monitoramentos/${id}`, { metodo: 'DELETE' });
export const apiMarcarVisto = (id) => pedir(`/monitoramentos/${id}/visto`, { metodo: 'POST' });

/* ---------- Participações ---------- */

export const apiListarParticipacoes = () => pedir('/participacoes');
export const apiCriarParticipacao = (dados) => pedir('/participacoes', { metodo: 'POST', corpo: dados });
export const apiAtualizarParticipacao = (id, dados) =>
  pedir(`/participacoes/${id}`, { metodo: 'PUT', corpo: dados });
export const apiRemoverParticipacao = (id) => pedir(`/participacoes/${id}`, { metodo: 'DELETE' });

/* ---------- Relatórios ---------- */

export const apiRelatorios = () => pedir('/relatorios');

/* ---------- Notificações ----------
   Não há tabela de notificações, e inventar uma só para
   preencher a gaveta seria trabalho a mais para dizer menos.
   O que interessa a quem abre esse painel já está no dado
   real: o que fecha em breve e o monitoramento que trouxe
   novidade. Então a lista é derivada, não armazenada. */

export async function apiNotificacoes() {
  const [urgentes, monitores] = await Promise.all([
    apiListarOportunidades({ ordem: 'prazo', tamanho: 5 }).catch(() => ({ itens: [] })),
    apiListarMonitoramentos().catch(() => []),
  ]);

  const agora = Date.now();
  const emDias = (iso) => (new Date(iso).getTime() - agora) / 86_400_000;

  const prazos = urgentes.itens
    .filter((o) => o.encerramento && emDias(o.encerramento) <= 3)
    .map((o) => ({
      id: `prazo-${o.id}`,
      tipo: emDias(o.encerramento) <= 1 ? 'aviso' : 'info',
      icone: 'relogio',
      titulo: 'Prazo se aproximando',
      texto: `"${o.objeto.slice(0, 90)}" encerra ${o.encerramento ? 'em breve' : ''}.`,
      quando: new Date().toISOString(),
      link: `#/oportunidade/${o.id}`,
    }));

  const novidades = monitores
    .filter((m) => (m.novas ?? 0) > 0)
    .map((m) => ({
      id: `mon-${m.id}`,
      tipo: 'sucesso',
      icone: 'radar',
      titulo: 'Novo resultado no monitoramento',
      texto: `${m.novas} nova(s) oportunidade(s) em "${m.nome}".`,
      quando: m.atualizadoEm ?? m.criadoEm,
      link: '#/monitoramentos',
    }));

  return [...novidades, ...prazos];
}

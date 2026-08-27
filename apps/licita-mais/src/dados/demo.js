/* =========================================================
   LICITA+ — Repositório de demonstração
   ---------------------------------------------------------
   A mesma interface do repositório da API, servida do banco
   fictício. Existe por um motivo prático: a prévia publicada
   roda sem servidor, e uma tela que só funciona conectada não
   pode ser mostrada a ninguém antes do deploy.

   Ele *escreve* de verdade — criar um monitoramento aqui
   muda a lista e sobrevive ao refresh. Demonstração em que o
   botão não faz nada não demonstra nada.
   ========================================================= */

import {
  licitacoes, monitoramentos, participacoes, empresa, notificacoes,
  serieMensal, porCategoria, porEstado, indicadores,
} from '../data/mock.js';
import { obter, definir, ehFavorito, alternarFavorito } from '../lib/store.js';

const CHAVE_ESCRITAS = 'licita-mais:demo-escritas';

/** Espera curta para que o esqueleto de carregamento apareça. */
const respirar = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- Escritas locais ---------- */

function lerEscritas() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ESCRITAS) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

function gravarEscritas(dados) {
  try {
    localStorage.setItem(CHAVE_ESCRITAS, JSON.stringify(dados));
  } catch {
    /* Sem persistência a demonstração ainda escreve, só não guarda. */
  }
}

const escritas = lerEscritas();

escritas.monitoramentos ??= monitoramentos.map((m) => ({ ...m }));
escritas.participacoes ??= participacoes.map((p) => ({ ...p }));
escritas.empresa ??= null;

const novoId = (prefixo) => `${prefixo}-${Math.random().toString(36).slice(2, 9)}`;

/* ---------- Normalização ---------- */

/**
 * O cartão de demonstração ganha os campos que a API traria.
 * Manter as duas fontes com a mesma forma é o que permite às
 * páginas não saberem qual delas está falando.
 */
function normalizarDemo(licitacao) {
  return {
    ...licitacao,
    referencia: licitacao.id,
    linkPncp: null,
    linkSistemaOrigem: null,
    alertas: licitacao.alertas ?? [],
    linhasAtendidas: [licitacao.categoria],
    favorito: ehFavorito(licitacao.id),
    razoes: licitacao.razoes.map((r) => ({
      ...r,
      pontos: r.ok ? r.peso : 0,
      parcial: false,
    })),
  };
}

const catalogo = () => licitacoes.map(normalizarDemo);

/* ---------- Oportunidades ---------- */

function ordenarDemo(lista, ordem) {
  const copia = lista.slice();
  const prazo = (l) => new Date(l.encerramento).getTime();

  switch (ordem) {
    case 'prazo': return copia.sort((a, b) => prazo(a) - prazo(b));
    case 'valor-desc': return copia.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    case 'valor-asc': return copia.sort((a, b) => (a.valor ?? 0) - (b.valor ?? 0));
    case 'recente': return copia.sort((a, b) => new Date(b.abertura) - new Date(a.abertura));
    default: return copia.sort((a, b) => b.compatibilidade - a.compatibilidade || prazo(a) - prazo(b));
  }
}

export async function demoListarOportunidades(filtros = {}) {
  await respirar();

  const termo = (filtros.termo ?? '').toLowerCase().trim();

  let lista = catalogo().filter((l) => {
    if (termo && !`${l.objeto} ${l.orgao.nome} ${l.orgao.cidade} ${l.numero}`.toLowerCase().includes(termo)) return false;
    if (filtros.uf && l.orgao.uf !== filtros.uf) return false;
    if (filtros.modalidade && l.modalidade !== filtros.modalidade) return false;
    if (filtros.categoria && l.categoria !== filtros.categoria) return false;
    if (filtros.valorMin && (l.valor ?? 0) < filtros.valorMin) return false;
    if (filtros.valorMax && (l.valor ?? 0) > filtros.valorMax) return false;
    if (filtros.compatMin && l.compatibilidade < filtros.compatMin) return false;
    return true;
  });

  lista = ordenarDemo(lista, filtros.ordem);

  const tamanho = filtros.tamanho ?? 20;
  const pagina = filtros.pagina ?? 1;
  const inicio = (pagina - 1) * tamanho;

  return {
    itens: lista.slice(inicio, inicio + tamanho),
    total: lista.length,
    pagina,
    tamanho,
    totalPaginas: Math.max(1, Math.ceil(lista.length / tamanho)),
  };
}

export async function demoObterOportunidade(id) {
  await respirar(120);
  const achada = licitacoes.find((l) => l.id === id);
  if (!achada) throw new Error('Oportunidade não encontrada.');
  return normalizarDemo(achada);
}

export async function demoResumoPainel() {
  await respirar(120);
  return {
    encontradas: indicadores.encontradas,
    altaCompatibilidade: indicadores.altaCompatibilidade,
    valorEstimado: indicadores.valorTotal,
    novasHoje: indicadores.novasHoje,
    descartadas: 0,
  };
}

/* ---------- Favoritos ---------- */

export async function demoListarFavoritos() {
  await respirar(120);
  const marcados = obter().favoritos;
  return catalogo().filter((l) => marcados.includes(l.id));
}

export async function demoFavoritar(id) {
  if (!ehFavorito(id)) alternarFavorito(id);
  return { favorito: true };
}

export async function demoDesfavoritar(id) {
  if (ehFavorito(id)) alternarFavorito(id);
  return { favorito: false };
}

/* ---------- Empresa ---------- */

export async function demoObterEmpresa() {
  await respirar(120);
  return escritas.empresa ?? {
    ...empresa,
    municipiosRegiao: ['Salvador', 'Lauro de Freitas', 'Camaçari', 'Simões Filho'],
    valorMinimo: empresa.faixaMin,
    valorMaximo: empresa.faixaMax,
    modalidades: [6, 8, 12],
    diasMinimosPreparo: 3,
    linhas: [
      { nome: 'Equipamentos de informática', palavrasChave: empresa.produtos, palavrasExcluidas: ['locação'] },
      { nome: 'Serviços de TI', palavrasChave: empresa.servicos, palavrasExcluidas: [] },
    ],
    completude: empresa.perfilCompleto,
  };
}

export async function demoSalvarEmpresa(perfil) {
  const atual = await demoObterEmpresa();
  escritas.empresa = { ...atual, ...perfil };
  gravarEscritas(escritas);
  return escritas.empresa;
}

/* ---------- Monitoramentos ---------- */

export async function demoListarMonitoramentos() {
  await respirar(120);
  return escritas.monitoramentos.map((m) => ({ ...m }));
}

export async function demoCriarMonitoramento(dados) {
  const criado = {
    id: novoId('mon'),
    novas: 0,
    total: 0,
    ativo: true,
    criadoEm: new Date().toISOString(),
    ...dados,
  };
  escritas.monitoramentos = [...escritas.monitoramentos, criado];
  gravarEscritas(escritas);
  return criado;
}

export async function demoAtualizarMonitoramento(id, dados) {
  escritas.monitoramentos = escritas.monitoramentos.map((m) => (m.id === id ? { ...m, ...dados } : m));
  gravarEscritas(escritas);
  return escritas.monitoramentos.find((m) => m.id === id);
}

export async function demoRemoverMonitoramento(id) {
  escritas.monitoramentos = escritas.monitoramentos.filter((m) => m.id !== id);
  gravarEscritas(escritas);
  return null;
}

export async function demoMarcarVisto(id) {
  return demoAtualizarMonitoramento(id, { novas: 0 });
}

/* ---------- Participações ---------- */

function resumirParticipacoes(itens) {
  const ganhas = itens.filter((p) => p.situacao === 'ganha');
  const perdidas = itens.filter((p) => p.situacao === 'perdida');
  const decididas = ganhas.length + perdidas.length;

  return {
    total: itens.length,
    ganhas: ganhas.length,
    perdidas: perdidas.length,
    emAnalise: itens.filter((p) => p.situacao === 'analise').length,
    valorGanho: ganhas.reduce((soma, p) => soma + (p.valor ?? 0), 0),
    taxaVitoria: decididas === 0 ? null : Math.round((ganhas.length / decididas) * 100),
  };
}

export async function demoListarParticipacoes() {
  await respirar(120);
  const itens = escritas.participacoes.map((p) => ({ ...p }));
  return { itens, resumo: resumirParticipacoes(itens) };
}

export async function demoCriarParticipacao(dados) {
  const criada = { id: novoId('p'), situacao: 'analise', data: new Date().toISOString(), ...dados };
  escritas.participacoes = [criada, ...escritas.participacoes];
  gravarEscritas(escritas);
  return criada;
}

export async function demoAtualizarParticipacao(id, dados) {
  escritas.participacoes = escritas.participacoes.map((p) => (p.id === id ? { ...p, ...dados } : p));
  gravarEscritas(escritas);
  return escritas.participacoes.find((p) => p.id === id);
}

export async function demoRemoverParticipacao(id) {
  escritas.participacoes = escritas.participacoes.filter((p) => p.id !== id);
  gravarEscritas(escritas);
  return null;
}

/* ---------- Relatórios ---------- */

export async function demoRelatorios() {
  await respirar(160);
  const { itens, resumo } = await demoListarParticipacoes();

  return {
    serieMensal,
    porCategoria,
    porEstado,
    participacoes: resumo,
    indicadores: {
      encontradas: indicadores.encontradas,
      altaCompatibilidade: indicadores.altaCompatibilidade,
      valorEstimado: indicadores.valorTotal,
      novasHoje: indicadores.novasHoje,
    },
    ultimas: itens.slice(0, 6),
  };
}

/* ---------- Notificações ---------- */

export async function demoNotificacoes() {
  await respirar(100);
  return notificacoes.map((n) => ({ ...n }));
}

/* ---------- Preferências que valem nos dois modos ---------- */

export const demoLerPreferencias = () => obter();
export const demoGravarPreferencias = (parcial) => definir(parcial);

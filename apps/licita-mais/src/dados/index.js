/* =========================================================
   LICITA+ — Porta única de dados
   ---------------------------------------------------------
   As páginas importam daqui e não sabem quem responde. Isso é
   o que permitiu ligar a API sem reescrever quatorze telas, e
   o que mantém a prévia navegável quando não há servidor.

   A escolha da fonte acontece uma vez, na subida
   (`resolverFonte()`), e não a cada chamada: uma tela que
   troque de fonte no meio da navegação mostraria metade real
   e metade fictícia — precisamente o que não pode acontecer.
   ========================================================= */

import { emDemonstracao } from '../lib/config.js';
import { alternarFavorito, ehFavorito } from '../lib/store.js';

import {
  apiListarOportunidades, apiObterOportunidade, apiResumoPainel,
  apiListarFavoritos, apiFavoritar, apiDesfavoritar,
  apiObterEmpresa, apiSalvarEmpresa,
  apiListarMonitoramentos, apiCriarMonitoramento, apiAtualizarMonitoramento,
  apiRemoverMonitoramento, apiMarcarVisto,
  apiListarParticipacoes, apiCriarParticipacao, apiAtualizarParticipacao, apiRemoverParticipacao,
  apiRelatorios, apiNotificacoes,
} from './api.js';

import {
  demoListarOportunidades, demoObterOportunidade, demoResumoPainel,
  demoListarFavoritos, demoFavoritar, demoDesfavoritar,
  demoObterEmpresa, demoSalvarEmpresa,
  demoListarMonitoramentos, demoCriarMonitoramento, demoAtualizarMonitoramento,
  demoRemoverMonitoramento, demoMarcarVisto,
  demoListarParticipacoes, demoCriarParticipacao, demoAtualizarParticipacao, demoRemoverParticipacao,
  demoRelatorios, demoNotificacoes,
} from './demo.js';

/** Escolhe a implementação na hora da chamada, sem ramo nas páginas. */
const escolher = (daApi, daDemo) => (...argumentos) =>
  (emDemonstracao() ? daDemo : daApi)(...argumentos);

/* ---------- Oportunidades ---------- */

export const listarOportunidades = escolher(apiListarOportunidades, demoListarOportunidades);
export const obterOportunidade = escolher(apiObterOportunidade, demoObterOportunidade);
export const resumoPainel = escolher(apiResumoPainel, demoResumoPainel);

/* ---------- Favoritos ----------
   O contador da sidebar lê a loja local, então favoritar
   precisa mexer nos dois lugares. A loja é atualizada antes da
   ida ao servidor: o coração acende na hora, e a falha desfaz.
   Esperar a resposta para pintar um ícone deixaria o clique com
   cara de quebrado numa conexão lenta. */

export async function favoritar(id) {
  if (!ehFavorito(id)) alternarFavorito(id);

  try {
    return await (emDemonstracao() ? demoFavoritar(id) : apiFavoritar(id));
  } catch (erro) {
    if (ehFavorito(id)) alternarFavorito(id);
    throw erro;
  }
}

export async function desfavoritar(id) {
  if (ehFavorito(id)) alternarFavorito(id);

  try {
    return await (emDemonstracao() ? demoDesfavoritar(id) : apiDesfavoritar(id));
  } catch (erro) {
    if (!ehFavorito(id)) alternarFavorito(id);
    throw erro;
  }
}

/** Alterna e devolve o novo estado, para quem chamou dar o retorno. */
export async function alternarFavoritoRemoto(id) {
  const ligando = !ehFavorito(id);
  await (ligando ? favoritar(id) : desfavoritar(id));
  return ligando;
}

export const listarFavoritos = escolher(apiListarFavoritos, demoListarFavoritos);

/* ---------- Empresa ---------- */

export const obterEmpresa = escolher(apiObterEmpresa, demoObterEmpresa);
export const salvarEmpresa = escolher(apiSalvarEmpresa, demoSalvarEmpresa);

/* ---------- Monitoramentos ---------- */

export const listarMonitoramentos = escolher(apiListarMonitoramentos, demoListarMonitoramentos);
export const criarMonitoramento = escolher(apiCriarMonitoramento, demoCriarMonitoramento);
export const atualizarMonitoramento = escolher(apiAtualizarMonitoramento, demoAtualizarMonitoramento);
export const removerMonitoramento = escolher(apiRemoverMonitoramento, demoRemoverMonitoramento);
export const marcarMonitoramentoVisto = escolher(apiMarcarVisto, demoMarcarVisto);

/* ---------- Participações ---------- */

export const listarParticipacoes = escolher(apiListarParticipacoes, demoListarParticipacoes);
export const criarParticipacao = escolher(apiCriarParticipacao, demoCriarParticipacao);
export const atualizarParticipacao = escolher(apiAtualizarParticipacao, demoAtualizarParticipacao);
export const removerParticipacao = escolher(apiRemoverParticipacao, demoRemoverParticipacao);

/* ---------- Relatórios ---------- */

export const relatorios = escolher(apiRelatorios, demoRelatorios);

/* ---------- Notificações ---------- */

export const listarNotificacoes = escolher(apiNotificacoes, demoNotificacoes);

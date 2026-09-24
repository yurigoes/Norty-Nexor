import type {
  AssetDetail,
  AssetView,
  DevolverAtivoRequest,
  EntregarAtivoRequest,
  PosseView,
  TrocaResponse,
  TrocarAtivoRequest,
  ComponenteView,
  EscreverComponenteRequest,
  SatisfacaoResumo,
  SurveyPublicView,
  SurveyView,
  WriteAssetRequest,
  AcessoRemotoView,
  EscreverAcessoRemotoRequest,
  SenhaRevelada,
} from '@norty-desk/shared';

import { buscarComoBlob, chamar } from './cliente';

function query(filtro: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtro)) {
    if (valor === undefined || valor === null || valor === '') continue;
    p.set(chave, String(valor));
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export const buscarAtivos = (filtro: {
  q?: string;
  kind?: string;
  status?: string;
  userId?: string;
  /** Só o parque desta empresa-cliente. */
  clientId?: string;
  /** Só o que é da casa. */
  semCliente?: boolean;
  limit?: number;
} = {}) => chamar<AssetView[]>(`/assets${query(filtro)}`);

/** O ativo com os componentes juntos — a tela de detalhe lê os dois. */
export const obterAtivo = (id: string) => chamar<AssetDetail>(`/assets/${id}`);

// --- Posse: quem está com o equipamento --------------------------------

export const possesDoAtivo = (id: string) => chamar<PosseView[]>(`/assets/${id}/posses`);

/**
 * Entrega a alguém, com o termo assinado.
 *
 * É a única porta que muda quem está com o equipamento — o `PATCH` do
 * ativo não tem mais `userId`.
 */
export const entregarAtivo = (id: string, dados: EntregarAtivoRequest) =>
  chamar<PosseView[]>(`/assets/${id}/posse`, { metodo: 'POST', corpo: dados });

export const devolverAtivo = (id: string, dados: DevolverAtivoRequest) =>
  chamar<PosseView[]>(`/assets/${id}/devolver`, { metodo: 'POST', corpo: dados });

/**
 * Sai um, entra outro — numa operação só.
 *
 * Não é devolver e depois entregar pela tela: se a segunda falhasse, a
 * pessoa ficaria sem nada. Do lado de lá as duas cabem na mesma
 * transação.
 */
export const trocarAtivo = (ticketId: string, dados: TrocarAtivoRequest) =>
  chamar<TrocaResponse>(`/tickets/${ticketId}/troca`, { metodo: 'POST', corpo: dados });

/**
 * O termo em PDF, como endereço local para abrir numa aba.
 *
 * A rota exige `Authorization`, e o navegador não o manda numa
 * navegação comum. Quem chamar devolve o endereço com
 * `URL.revokeObjectURL`.
 */
export const termoEmPdf = (termId: string) =>
  buscarComoBlob(`/termos/${termId}/pdf`, 'application/pdf');

// --- Componentes -------------------------------------------------------

export const componentesDoAtivo = (id: string) =>
  chamar<ComponenteView[]>(`/assets/${id}/components`);

export const adicionarComponente = (id: string, dados: EscreverComponenteRequest) =>
  chamar<ComponenteView[]>(`/assets/${id}/components`, { metodo: 'POST', corpo: dados });

export const editarComponente = (
  id: string,
  componentId: string,
  dados: Partial<EscreverComponenteRequest>,
) =>
  chamar<ComponenteView[]>(`/assets/${id}/components/${componentId}`, {
    metodo: 'PATCH',
    corpo: dados,
  });

export const removerComponente = (id: string, componentId: string) =>
  chamar<ComponenteView[]>(`/assets/${id}/components/${componentId}`, { metodo: 'DELETE' });

export type ChamadoDoAtivo = {
  id: string;
  number: number;
  subject: string;
  status: string;
  createdAt: string;
};

export const chamadosDoAtivo = (id: string) =>
  chamar<ChamadoDoAtivo[]>(`/assets/${id}/chamados`);

export const criarAtivo = (dados: WriteAssetRequest) =>
  chamar<AssetView>('/assets', { metodo: 'POST', corpo: dados });

export const editarAtivo = (id: string, dados: Partial<WriteAssetRequest>) =>
  chamar<AssetView>(`/assets/${id}`, { metodo: 'PATCH', corpo: dados });

// --- Vínculo com o chamado --------------------------------------------

export const ativosDoChamado = (ticketId: string) =>
  chamar<AssetView[]>(`/tickets/${ticketId}/ativos`);

export const vincularAtivo = (ticketId: string, assetId: string) =>
  chamar<AssetView[]>(`/tickets/${ticketId}/ativos`, { metodo: 'POST', corpo: { assetId } });

export const desvincularAtivo = (ticketId: string, assetId: string) =>
  chamar<AssetView[]>(`/tickets/${ticketId}/ativos/${assetId}`, { metodo: 'DELETE' });

// --- Satisfação --------------------------------------------------------

export const listarPesquisas = (respondidas = false) =>
  chamar<SurveyView[]>(`/surveys${respondidas ? '?respondidas=true' : ''}`);

export const resumoDeSatisfacao = (periodo = '30d') =>
  chamar<SatisfacaoResumo>(`/reports/satisfacao?periodo=${periodo}`);

/**
 * A pesquisa pública.
 *
 * Não passa por `chamar`: aquela função renova a sessão no 401 e leva ao
 * login. Quem abre este link não tem — e não precisa ter — conta.
 */
const BASE = import.meta.env.VITE_API_URL ?? '/v1';

export async function obterPesquisa(token: string): Promise<SurveyPublicView> {
  const resposta = await fetch(`${BASE}/pesquisa/${encodeURIComponent(token)}`);
  if (!resposta.ok) throw new Error(await mensagemDoErro(resposta));
  return (await resposta.json()) as SurveyPublicView;
}

export async function responderPesquisa(
  token: string,
  score: number,
  comment?: string,
): Promise<SurveyPublicView> {
  const resposta = await fetch(`${BASE}/pesquisa/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, ...(comment ? { comment } : {}) }),
  });

  if (!resposta.ok) throw new Error(await mensagemDoErro(resposta));
  return (await resposta.json()) as SurveyPublicView;
}

async function mensagemDoErro(resposta: Response): Promise<string> {
  try {
    const problema = (await resposta.json()) as { detail?: string; title?: string };
    return problema.detail ?? problema.title ?? 'Não foi possível abrir a pesquisa.';
  } catch {
    return 'Não foi possível abrir a pesquisa.';
  }
}

// --- Como se chega na máquina -----------------------------------------

export const acessoRemoto = (assetId: string) =>
  chamar<AcessoRemotoView>(`/assets/${assetId}/acesso-remoto`);

export const salvarAcessoRemoto = (assetId: string, dados: EscreverAcessoRemotoRequest) =>
  chamar<AcessoRemotoView>(`/assets/${assetId}/acesso-remoto`, { metodo: 'PATCH', corpo: dados });

/**
 * Revela a senha, uma vez.
 *
 * `POST` e não `GET`: revelar é um ato, não uma leitura. `GET` entraria
 * no histórico do navegador e em log de proxy — cada um deles uma cópia
 * da senha fora daqui. Cada chamada fica na auditoria.
 */
export const revelarSenhaRemota = (assetId: string) =>
  chamar<SenhaRevelada>(`/assets/${assetId}/acesso-remoto/revelar`, {
    metodo: 'POST',
    corpo: {},
  });

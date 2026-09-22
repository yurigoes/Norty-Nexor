import type {
  ArticleDetail,
  ArticleListItem,
  ArticleRevisionView,
  RegistrarResolucaoRequest,
  VerificacaoSugerida,
  WriteArticleRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

function query(filtro: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtro)) {
    if (valor === undefined || valor === null || valor === '') continue;
    p.set(chave, String(valor));
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export const buscarArtigos = (filtro: {
  q?: string;
  categoryId?: string;
  arquivados?: boolean;
  limit?: number;
} = {}) => chamar<ArticleListItem[]>(`/articles${query(filtro)}`);

export const obterArtigo = (id: string) => chamar<ArticleDetail>(`/articles/${id}`);

export const revisoesDoArtigo = (id: string) =>
  chamar<ArticleRevisionView[]>(`/articles/${id}/revisoes`);

export const criarArtigo = (dados: WriteArticleRequest) =>
  chamar<ArticleDetail>('/articles', { metodo: 'POST', corpo: dados });

export const editarArtigo = (id: string, dados: Partial<WriteArticleRequest>) =>
  chamar<ArticleDetail>(`/articles/${id}`, { metodo: 'PATCH', corpo: dados });

export const artigosSugeridos = (ticketId: string) =>
  chamar<ArticleListItem[]>(`/tickets/${ticketId}/artigos-sugeridos`);

/** As verificações propostas neste chamado, ordenadas pelo que resolve. */
export const verificacoesDoChamado = (ticketId: string) =>
  chamar<VerificacaoSugerida[]>(`/tickets/${ticketId}/verificacoes`);

export const confirmarResolucao = (ticketId: string, articleId: string) =>
  chamar<VerificacaoSugerida[]>(`/tickets/${ticketId}/verificacoes/${articleId}`, {
    metodo: 'POST',
    corpo: {},
  });

export const desconfirmarResolucao = (ticketId: string, articleId: string) =>
  chamar<VerificacaoSugerida[]>(`/tickets/${ticketId}/verificacoes/${articleId}`, {
    metodo: 'DELETE',
  });

/** Registra a resolução deste chamado no índice. */
export const registrarResolucao = (ticketId: string, dados: RegistrarResolucaoRequest) =>
  chamar<ArticleDetail>(`/tickets/${ticketId}/resolucao`, { metodo: 'POST', corpo: dados });

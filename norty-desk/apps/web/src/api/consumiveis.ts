import type {
  ConsumivelDetail,
  ConsumivelView,
  MovimentarRequest,
  SuprimentosDoAtivo,
  WriteConsumivelRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/** Consumíveis e cartuchos. Toda escrita devolve o item com saldo e histórico recalculados. */

export const listarConsumiveis = (
  filtro: { q?: string; kind?: string; abaixoDoMinimo?: boolean; incluirInativos?: boolean } = {},
) => {
  const p = new URLSearchParams();
  if (filtro.q) p.set('q', filtro.q);
  if (filtro.kind) p.set('kind', filtro.kind);
  if (filtro.abaixoDoMinimo) p.set('abaixoDoMinimo', 'true');
  if (filtro.incluirInativos) p.set('incluirInativos', 'true');
  const texto = p.toString();
  return chamar<ConsumivelView[]>(`/consumables${texto ? `?${texto}` : ''}`);
};

export const obterConsumivel = (id: string) => chamar<ConsumivelDetail>(`/consumables/${id}`);

export const criarConsumivel = (dados: WriteConsumivelRequest) =>
  chamar<ConsumivelDetail>('/consumables', { metodo: 'POST', corpo: dados });

export const editarConsumivel = (id: string, dados: Partial<WriteConsumivelRequest>) =>
  chamar<ConsumivelDetail>(`/consumables/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerConsumivel = (id: string) => chamar<void>(`/consumables/${id}`, { metodo: 'DELETE' });

export const movimentarConsumivel = (id: string, dados: MovimentarRequest) =>
  chamar<ConsumivelDetail>(`/consumables/${id}/movements`, { metodo: 'POST', corpo: dados });

export const suprimentosDoAtivo = (assetId: string) =>
  chamar<SuprimentosDoAtivo>(`/assets/${assetId}/consumables`);

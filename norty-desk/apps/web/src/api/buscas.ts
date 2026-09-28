import type {
  AtualizarBuscaSalvaRequest,
  BuscaSalvaView,
  CriarBuscaSalvaRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/**
 * As buscas salvas de quem está logado — sempre as próprias.
 *
 * Toda escrita devolve a lista inteira: as abas se releem a cada mudança,
 * e a posição das outras muda junto quando uma entra, sai ou passa a ser
 * a padrão.
 */
export const listarBuscasSalvas = () => chamar<BuscaSalvaView[]>('/saved-searches');

export const salvarBusca = (dados: CriarBuscaSalvaRequest) =>
  chamar<BuscaSalvaView[]>('/saved-searches', { metodo: 'POST', corpo: dados });

export const atualizarBusca = (id: string, dados: AtualizarBuscaSalvaRequest) =>
  chamar<BuscaSalvaView[]>(`/saved-searches/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerBusca = (id: string) =>
  chamar<BuscaSalvaView[]>(`/saved-searches/${id}`, { metodo: 'DELETE' });

/** A ordem vai inteira: ver `PUT /saved-searches/ordem`. */
export const reordenarBuscas = (ids: string[]) =>
  chamar<BuscaSalvaView[]>('/saved-searches/ordem', { metodo: 'PUT', corpo: { ids } });

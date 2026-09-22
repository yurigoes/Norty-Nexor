import type {
  CompartilharSegredoRequest,
  ConcessaoView,
  EscreverSegredoRequest,
  EstadoDoCofre,
  LeituraDoSegredoView,
  SegredoRevelado,
  SegredoView,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/**
 * O cofre de senhas.
 *
 * Nenhuma função aqui devolve senha, salvo `revelarSegredo` — que é
 * `POST` de propósito: revelar é um ato, e cada chamada fica
 * registrada. Ver `cofre.controller.ts`.
 */

export const cofreDisponivel = () => chamar<EstadoDoCofre>('/cofre/disponivel');

export const listarSegredos = () => chamar<SegredoView[]>('/cofre');

/** Todos os da organização, em metadado. Só quem administra o cofre. */
export const listarTodosOsSegredos = () => chamar<SegredoView[]>('/cofre/todos');

export const guardarSegredo = (corpo: EscreverSegredoRequest) =>
  chamar<SegredoView>('/cofre', { metodo: 'POST', corpo });

export const editarSegredo = (id: string, corpo: EscreverSegredoRequest) =>
  chamar<SegredoView>(`/cofre/${id}`, { metodo: 'PATCH', corpo });

export const removerSegredo = (id: string) =>
  chamar<void>(`/cofre/${id}`, { metodo: 'DELETE' });

/** A senha, uma vez. Fica registrado quem pediu. */
export const revelarSegredo = (id: string) =>
  chamar<SegredoRevelado>(`/cofre/${id}/revelar`, { metodo: 'POST', corpo: {} });

export const leiturasDoSegredo = (id: string) =>
  chamar<LeituraDoSegredoView[]>(`/cofre/${id}/leituras`);

export const compartilhamentosDoSegredo = (id: string) =>
  chamar<ConcessaoView[]>(`/cofre/${id}/compartilhamentos`);

export const compartilharSegredo = (id: string, corpo: CompartilharSegredoRequest) =>
  chamar<ConcessaoView[]>(`/cofre/${id}/compartilhamentos`, { metodo: 'POST', corpo });

export const revogarCompartilhamento = (id: string, grantId: string) =>
  chamar<ConcessaoView[]>(`/cofre/${id}/compartilhamentos/${grantId}`, { metodo: 'DELETE' });

/** Assumir o segredo de quem saiu. Fica na trilha. */
export const assumirSegredo = (id: string) =>
  chamar<SegredoView>(`/cofre/${id}/assumir`, { metodo: 'POST', corpo: {} });

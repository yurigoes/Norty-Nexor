import type { EscreverTimeRequest, TimeView } from '@norty-desk/shared';

import { chamar } from './cliente';

/**
 * Times.
 *
 * Toda rota devolve a lista inteira depois de escrever, e não o time
 * mexido: a tela mostra times e membros juntos, e devolver só o
 * alterado a obrigaria a uma segunda chamada para redesenhar. É a
 * mesma escolha do catálogo.
 */
export const listarTimes = () => chamar<TimeView[]>('/teams');

export const criarTime = (dados: EscreverTimeRequest) =>
  chamar<TimeView[]>('/teams', { metodo: 'POST', corpo: dados });

export const editarTime = (id: string, dados: Partial<EscreverTimeRequest>) =>
  chamar<TimeView[]>(`/teams/${id}`, { metodo: 'PATCH', corpo: dados });

export const incluirNoTime = (id: string, userId: string, isManager = false) =>
  chamar<TimeView[]>(`/teams/${id}/membros`, {
    metodo: 'POST',
    corpo: { userId, isManager },
  });

export const tirarDoTime = (id: string, userId: string) =>
  chamar<TimeView[]>(`/teams/${id}/membros/${userId}`, { metodo: 'DELETE' });

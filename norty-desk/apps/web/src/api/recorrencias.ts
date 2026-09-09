import type { EscreverRecorrenciaRequest, RecorrenciaView, TicketStatus } from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarRecorrencias = () => chamar<RecorrenciaView[]>('/recorrencias');

export const criarRecorrencia = (dados: EscreverRecorrenciaRequest) =>
  chamar<RecorrenciaView>('/recorrencias', { metodo: 'POST', corpo: dados });

export const editarRecorrencia = (id: string, dados: Partial<EscreverRecorrenciaRequest>) =>
  chamar<RecorrenciaView>(`/recorrencias/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerRecorrencia = (id: string) =>
  chamar<void>(`/recorrencias/${id}`, { metodo: 'DELETE' });

export type ChamadoDaAgenda = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  createdAt: string;
};

export const chamadosDaRecorrencia = (id: string) =>
  chamar<ChamadoDaAgenda[]>(`/recorrencias/${id}/chamados`);

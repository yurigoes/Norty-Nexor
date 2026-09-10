import type {
  ProjetoDetail,
  ProjetoView,
  WriteProjetoRequest,
  WriteTarefaDeProjetoRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/** Projetos. Toda escrita devolve o projeto inteiro de novo, com percentual e atraso recalculados. */

export const listarProjetos = (filtro: { q?: string; status?: string; incluirEncerrados?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (filtro.q) p.set('q', filtro.q);
  if (filtro.status) p.set('status', filtro.status);
  if (filtro.incluirEncerrados) p.set('incluirEncerrados', 'true');
  const texto = p.toString();
  return chamar<ProjetoView[]>(`/projects${texto ? `?${texto}` : ''}`);
};

export const obterProjeto = (id: string) => chamar<ProjetoDetail>(`/projects/${id}`);

export const criarProjeto = (dados: WriteProjetoRequest) =>
  chamar<ProjetoDetail>('/projects', { metodo: 'POST', corpo: dados });

export const editarProjeto = (id: string, dados: Partial<WriteProjetoRequest>) =>
  chamar<ProjetoDetail>(`/projects/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerProjeto = (id: string) => chamar<void>(`/projects/${id}`, { metodo: 'DELETE' });

export const criarTarefaDeProjeto = (id: string, dados: WriteTarefaDeProjetoRequest) =>
  chamar<ProjetoDetail>(`/projects/${id}/tasks`, { metodo: 'POST', corpo: dados });

export const editarTarefaDeProjeto = (id: string, taskId: string, dados: Partial<WriteTarefaDeProjetoRequest>) =>
  chamar<ProjetoDetail>(`/projects/${id}/tasks/${taskId}`, { metodo: 'PATCH', corpo: dados });

export const removerTarefaDeProjeto = (id: string, taskId: string) =>
  chamar<ProjetoDetail>(`/projects/${id}/tasks/${taskId}`, { metodo: 'DELETE' });

export const vincularChamadoAoProjeto = (id: string, number: number) =>
  chamar<ProjetoDetail>(`/projects/${id}/tickets`, { metodo: 'POST', corpo: { number } });

export const desvincularChamadoDoProjeto = (id: string, ticketId: string) =>
  chamar<ProjetoDetail>(`/projects/${id}/tickets/${ticketId}`, { metodo: 'DELETE' });

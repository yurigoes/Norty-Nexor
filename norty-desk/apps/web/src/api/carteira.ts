import type {
  ClienteDetail,
  ClienteView,
  EscreverClienteRequest,
  EscreverPessoaDoClienteRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarClientes = () => chamar<ClienteView[]>('/clients');

export const obterCliente = (id: string) => chamar<ClienteDetail>(`/clients/${id}`);

export const criarCliente = (dados: EscreverClienteRequest) =>
  chamar<ClienteDetail>('/clients', { metodo: 'POST', corpo: dados });

export const editarCliente = (id: string, dados: Partial<EscreverClienteRequest>) =>
  chamar<ClienteDetail>(`/clients/${id}`, { metodo: 'PATCH', corpo: dados });

export const desativarCliente = (id: string) =>
  chamar<void>(`/clients/${id}`, { metodo: 'DELETE' });

export const incluirPessoa = (id: string, dados: EscreverPessoaDoClienteRequest) =>
  chamar<ClienteDetail>(`/clients/${id}/people`, { metodo: 'POST', corpo: dados });

export const tirarPessoa = (id: string, userId: string) =>
  chamar<ClienteDetail>(`/clients/${id}/people/${userId}`, { metodo: 'DELETE' });

export const definirPin = (id: string, userId: string, pin: string) =>
  chamar<void>(`/clients/${id}/people/${userId}/pin`, { metodo: 'POST', corpo: { pin } });

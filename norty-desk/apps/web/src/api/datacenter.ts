import type {
  ColocarNoRackRequest,
  OndeEstaNoRack,
  RackDetail,
  RackView,
  SalaView,
  WriteRackRequest,
  WriteSalaRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/** Datacenter: salas, racks e onde cada equipamento está no rack. */

export const listarSalas = () => chamar<SalaView[]>('/dc-rooms');
export const criarSala = (dados: WriteSalaRequest) => chamar<SalaView[]>('/dc-rooms', { metodo: 'POST', corpo: dados });
export const editarSala = (id: string, dados: Partial<WriteSalaRequest>) =>
  chamar<SalaView[]>(`/dc-rooms/${id}`, { metodo: 'PATCH', corpo: dados });
export const removerSala = (id: string) => chamar<SalaView[]>(`/dc-rooms/${id}`, { metodo: 'DELETE' });

export const listarRacks = () => chamar<RackView[]>('/racks');
export const obterRack = (id: string) => chamar<RackDetail>(`/racks/${id}`);
export const criarRack = (dados: WriteRackRequest) => chamar<RackDetail>('/racks', { metodo: 'POST', corpo: dados });
export const editarRack = (id: string, dados: Partial<WriteRackRequest>) =>
  chamar<RackDetail>(`/racks/${id}`, { metodo: 'PATCH', corpo: dados });
export const removerRack = (id: string) => chamar<void>(`/racks/${id}`, { metodo: 'DELETE' });

export const colocarNoRack = (rackId: string, dados: ColocarNoRackRequest) =>
  chamar<RackDetail>(`/racks/${rackId}/items`, { metodo: 'POST', corpo: dados });
export const moverNoRack = (itemId: string, dados: Partial<Omit<ColocarNoRackRequest, 'assetId'>>) =>
  chamar<RackDetail>(`/rack-items/${itemId}`, { metodo: 'PATCH', corpo: dados });
export const retirarDoRack = (itemId: string) => chamar<RackDetail>(`/rack-items/${itemId}`, { metodo: 'DELETE' });

export const rackDoAtivo = (assetId: string) => chamar<OndeEstaNoRack>(`/assets/${assetId}/rack`);

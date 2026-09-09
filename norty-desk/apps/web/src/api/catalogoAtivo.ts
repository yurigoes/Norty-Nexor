import type {
  EscreverLocalizacaoRequest,
  EscreverModeloDeAtivoRequest,
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
} from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarLocalizacoes = () => chamar<LocalizacaoView[]>('/locations');

export const criarLocalizacao = (dados: EscreverLocalizacaoRequest) =>
  chamar<LocalizacaoView[]>('/locations', { metodo: 'POST', corpo: dados });

export const editarLocalizacao = (id: string, dados: EscreverLocalizacaoRequest) =>
  chamar<LocalizacaoView[]>(`/locations/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerLocalizacao = (id: string) =>
  chamar<LocalizacaoView[]>(`/locations/${id}`, { metodo: 'DELETE' });

export const listarFabricantes = () => chamar<FabricanteView[]>('/manufacturers');

export const criarFabricante = (name: string) =>
  chamar<FabricanteView[]>('/manufacturers', { metodo: 'POST', corpo: { name } });

export const listarModelosDeAtivo = () => chamar<ModeloDeAtivoView[]>('/asset-models');

export const criarModeloDeAtivo = (dados: EscreverModeloDeAtivoRequest) =>
  chamar<ModeloDeAtivoView[]>('/asset-models', { metodo: 'POST', corpo: dados });

export const editarFabricante = (id: string, name: string) =>
  chamar<FabricanteView[]>(`/manufacturers/${id}`, { metodo: 'PATCH', corpo: { name } });

export const removerFabricante = (id: string) =>
  chamar<FabricanteView[]>(`/manufacturers/${id}`, { metodo: 'DELETE' });

export const editarModeloDeAtivo = (id: string, dados: EscreverModeloDeAtivoRequest) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerModeloDeAtivo = (id: string) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}`, { metodo: 'DELETE' });

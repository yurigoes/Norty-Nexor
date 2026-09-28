import type {
  EscreverLocalizacaoRequest,
  EscreverModeloDeAtivoRequest,
  EscreverRegraDeSistemaRequest,
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
  ReclassificacaoView,
  RegraDeSistemaView,
  SistemasDoParqueView,
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

/** Um nome a mais pelo qual o fabricante atende na varredura. */
export const apelidarFabricante = (id: string, alias: string) =>
  chamar<FabricanteView[]>(`/manufacturers/${id}/apelidos`, { metodo: 'POST', corpo: { alias } });

export const removerApelidoDeFabricante = (id: string, aliasId: string) =>
  chamar<FabricanteView[]>(`/manufacturers/${id}/apelidos/${aliasId}`, { metodo: 'DELETE' });

/** O `absorvidoId` some dentro do `id`, levando modelos e ativos junto. */
export const juntarFabricantes = (id: string, absorvidoId: string) =>
  chamar<FabricanteView[]>(`/manufacturers/${id}/juntar`, {
    metodo: 'POST',
    corpo: { absorvidoId },
  });

export const editarModeloDeAtivo = (id: string, dados: EscreverModeloDeAtivoRequest) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerModeloDeAtivo = (id: string) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}`, { metodo: 'DELETE' });

/** Um nome a mais pelo qual o modelo atende na varredura. */
export const apelidarModelo = (id: string, alias: string) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}/apelidos`, { metodo: 'POST', corpo: { alias } });

export const removerApelidoDeModelo = (id: string, aliasId: string) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}/apelidos/${aliasId}`, { metodo: 'DELETE' });

/** O `absorvidoId` some dentro do `id`, levando os equipamentos junto. */
export const juntarModelos = (id: string, absorvidoId: string) =>
  chamar<ModeloDeAtivoView[]>(`/asset-models/${id}/juntar`, {
    metodo: 'POST',
    corpo: { absorvidoId },
  });

// ---------------------------------------------------------------------
// Dicionário de sistema operacional
// ---------------------------------------------------------------------

export const lerSistemasDoParque = () => chamar<SistemasDoParqueView>('/operating-systems');

export const listarRegrasDeSistema = () =>
  chamar<RegraDeSistemaView[]>('/operating-systems/regras');

export const escreverRegraDeSistema = (dados: EscreverRegraDeSistemaRequest) =>
  chamar<RegraDeSistemaView[]>('/operating-systems/regras', { metodo: 'POST', corpo: dados });

export const removerRegraDeSistema = (id: string) =>
  chamar<RegraDeSistemaView[]>(`/operating-systems/regras/${id}`, { metodo: 'DELETE' });

/** Reaplica o dicionário sobre o parque inteiro. */
export const reclassificarSistemas = () =>
  chamar<ReclassificacaoView>('/operating-systems/reclassificar', { metodo: 'POST' });

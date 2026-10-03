import type {
  EscreverPainelRequest,
  EscreverZonaRequest,
  FaceDoPainel,
  PainelDoAtivo,
  PainelDoModeloView,
  PainelNoRackView,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/**
 * O estêncil: onde cada porta fica no painel do equipamento.
 *
 * O painel é do **modelo** — trinta switches iguais têm um desenho só —,
 * e o equipamento o empresta. Por isso a edição vive em
 * `/asset-models/:id/paineis` e a consulta em `/assets/:id/painel`.
 */

export const paineisDoModelo = (assetModelId: string) =>
  chamar<PainelDoModeloView[]>(`/asset-models/${assetModelId}/paineis`);

/** `PUT`: há um painel por face, então a chamada descreve como a face é. */
export const escreverPainel = (
  assetModelId: string,
  face: FaceDoPainel,
  dados: EscreverPainelRequest,
) =>
  chamar<PainelDoModeloView[]>(`/asset-models/${assetModelId}/paineis/${face}`, {
    metodo: 'PUT',
    corpo: dados,
  });

export const removerPainel = (assetModelId: string, face: FaceDoPainel) =>
  chamar<PainelDoModeloView[]>(`/asset-models/${assetModelId}/paineis/${face}`, {
    metodo: 'DELETE',
  });

export const criarZonaDoPainel = (
  assetModelId: string,
  face: FaceDoPainel,
  dados: EscreverZonaRequest,
) =>
  chamar<PainelDoModeloView[]>(`/asset-models/${assetModelId}/paineis/${face}/zonas`, {
    metodo: 'POST',
    corpo: dados,
  });

export const editarZonaDoPainel = (
  assetModelId: string,
  face: FaceDoPainel,
  zonaId: string,
  dados: EscreverZonaRequest,
) =>
  chamar<PainelDoModeloView[]>(`/asset-models/${assetModelId}/paineis/${face}/zonas/${zonaId}`, {
    metodo: 'PATCH',
    corpo: dados,
  });

export const removerZonaDoPainel = (assetModelId: string, face: FaceDoPainel, zonaId: string) =>
  chamar<PainelDoModeloView[]>(`/asset-models/${assetModelId}/paineis/${face}/zonas/${zonaId}`, {
    metodo: 'DELETE',
  });

/**
 * Os painéis de um rack inteiro, numa consulta só.
 *
 * A elevação desenha quarenta e duas posições; pedir o painel de cada
 * equipamento seriam quarenta e duas idas ao servidor para montar uma
 * tela. Item sem painel não vem na lista.
 */
export const paineisDoRack = (rackId: string) =>
  chamar<PainelNoRackView[]>(`/racks/${rackId}/paineis`);

/** Nulo é "este equipamento não tem painel" — sem modelo, ou modelo sem estêncil. */
export const painelDoAtivo = (assetId: string) =>
  chamar<PainelDoAtivo>(`/assets/${assetId}/painel`);

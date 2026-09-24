import type {
  EscreverModeloDeTermoRequest,
  ModeloDeTermoView,
  TermKind,
} from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarModelosDeTermo = () => chamar<ModeloDeTermoView[]>('/config/termos');

export const salvarModeloDeTermo = (kind: TermKind, dados: EscreverModeloDeTermoRequest) =>
  chamar<ModeloDeTermoView[]>(`/config/termos/${kind}`, { metodo: 'PUT', corpo: dados });

/** Volta ao texto de fábrica: some a linha salva, e o padrão reaparece. */
export const restaurarModeloDeTermo = (kind: TermKind) =>
  chamar<ModeloDeTermoView[]>(`/config/termos/${kind}`, { metodo: 'DELETE' });

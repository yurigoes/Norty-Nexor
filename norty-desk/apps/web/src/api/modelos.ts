import type { EscreverModeloRequest, ModeloView, TemplateKind } from '@norty-desk/shared';

import { chamar } from './cliente';

function query(filtro: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtro)) {
    if (valor === undefined || valor === null || valor === '') continue;
    p.set(chave, String(valor));
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export const listarModelos = (
  filtro: { kind?: TemplateKind; categoryId?: string; incluirInativos?: boolean; q?: string } = {},
) => chamar<ModeloView[]>(`/modelos${query(filtro)}`);

export const criarModelo = (dados: EscreverModeloRequest) =>
  chamar<ModeloView>('/modelos', { metodo: 'POST', corpo: dados });

export const editarModelo = (id: string, dados: Partial<EscreverModeloRequest>) =>
  chamar<ModeloView>(`/modelos/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerModelo = (id: string) =>
  chamar<void>(`/modelos/${id}`, { metodo: 'DELETE' });

/** Conta o uso — é o que faz a lista se ordenar pelo que serve. */
export const registrarUsoDoModelo = (id: string) =>
  chamar<void>(`/modelos/${id}/uso`, { metodo: 'POST', corpo: {} });

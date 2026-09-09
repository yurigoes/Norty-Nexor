import type {
  EscreverFormularioRequest,
  FormularioResolvido,
  FormularioView,
} from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarFormularios = () => chamar<FormularioView[]>('/forms');

export const obterFormulario = (id: string) => chamar<FormularioView>(`/forms/${id}`);

/** O formulário que vale para uma categoria — a tela de abertura pergunta isto. */
export const resolverFormulario = (categoryId: string | null) =>
  chamar<FormularioResolvido>(
    `/forms/resolver${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`,
  );

export const criarFormulario = (dados: EscreverFormularioRequest) =>
  chamar<FormularioView>('/forms', { metodo: 'POST', corpo: dados });

export const editarFormulario = (id: string, dados: Partial<EscreverFormularioRequest>) =>
  chamar<FormularioView>(`/forms/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerFormulario = (id: string) =>
  chamar<void>(`/forms/${id}`, { metodo: 'DELETE' });

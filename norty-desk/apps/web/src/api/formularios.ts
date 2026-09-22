import type {
  EscreverFormularioRequest,
  FormularioResolvido,
  FormularioView,
  ModeloDeChamado,
} from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarFormularios = () => chamar<FormularioView[]>('/forms');

/**
 * Os modelos que a pessoa escolhe ao abrir chamado.
 *
 * Vem com o schema junto: clicar no cartão e ver os campos é um gesto
 * só, e buscá-los numa segunda chamada faria a tela piscar vazia entre
 * o clique e a resposta.
 */
export const modelosDeChamado = () => chamar<ModeloDeChamado[]>('/forms/modelos');

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

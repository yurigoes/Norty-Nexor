import type {
  EscreverRegraDeEntradaRequest,
  RegraDeEntradaView,
  SimulacaoDeEntradaView,
  SimularEntradaRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

export const listarRegrasDeEntrada = () => chamar<RegraDeEntradaView[]>('/intake-rules');

export const criarRegraDeEntrada = (dados: EscreverRegraDeEntradaRequest) =>
  chamar<RegraDeEntradaView>('/intake-rules', { metodo: 'POST', corpo: dados });

export const editarRegraDeEntrada = (
  id: string,
  dados: Partial<EscreverRegraDeEntradaRequest>,
) => chamar<RegraDeEntradaView>(`/intake-rules/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerRegraDeEntrada = (id: string) =>
  chamar<void>(`/intake-rules/${id}`, { metodo: 'DELETE' });

/**
 * O que aconteceria com esta mensagem agora.
 *
 * Roda no servidor de propósito: é o mesmo motor, sobre as mesmas
 * regras ativas. Simular no navegador seria uma segunda implementação,
 * e a segunda é a que mente justamente quando alguém precisa dela.
 */
export const simularEntrada = (dados: SimularEntradaRequest) =>
  chamar<SimulacaoDeEntradaView>('/intake-rules/simular', { metodo: 'POST', corpo: dados });

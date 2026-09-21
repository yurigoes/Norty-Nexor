import type { ConsultaPublica } from '@norty-desk/shared';

/**
 * A consulta pública por protocolo.
 *
 * Não passa por `chamar`: aquela função renova a sessão no 401 e leva
 * ao login. Quem digita um protocolo não tem — e não precisa ter —
 * conta. É a mesma razão pela qual a pesquisa de satisfação também usa
 * `fetch` direto.
 */
const BASE = import.meta.env.VITE_API_URL ?? '/v1';

export async function consultarProtocolo(codigo: string): Promise<ConsultaPublica> {
  const resposta = await fetch(`${BASE}/publico/protocolo/${encodeURIComponent(codigo)}`);
  if (!resposta.ok) throw new Error(await mensagemDoErro(resposta));
  return (await resposta.json()) as ConsultaPublica;
}

/** O endereço do comprovante. O download é do navegador, não nosso. */
export function urlDoComprovante(codigo: string): string {
  return `${BASE}/publico/protocolo/${encodeURIComponent(codigo)}/pdf`;
}

async function mensagemDoErro(resposta: Response): Promise<string> {
  try {
    const problema = (await resposta.json()) as { detail?: string; title?: string };
    return problema.detail ?? problema.title ?? 'Protocolo não encontrado.';
  } catch {
    return 'Protocolo não encontrado.';
  }
}

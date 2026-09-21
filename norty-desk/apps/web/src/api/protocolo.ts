import type {
  AberturaPublicaResposta,
  AbrirPublicoRequest,
  ConsultaPublica,
  EmpresaPublica,
} from '@norty-desk/shared';

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
    return problema.detail ?? problema.title ?? 'Não foi possível concluir.';
  } catch {
    return 'Não foi possível concluir.';
  }
}

// --- Abertura sem login ------------------------------------------------

/**
 * As empresas parecidas com o que a pessoa digitou.
 *
 * Devolve lista vazia — e não erro — quando o termo é curto demais: a
 * pessoa ainda está digitando, e piscar erro a cada tecla é ruído.
 */
export async function buscarEmpresas(termo: string): Promise<EmpresaPublica[]> {
  const resposta = await fetch(`${BASE}/publico/empresas?q=${encodeURIComponent(termo)}`);
  if (!resposta.ok) throw new Error(await mensagemDoErro(resposta));
  return (await resposta.json()) as EmpresaPublica[];
}

export async function abrirChamadoPublico(
  dados: AbrirPublicoRequest,
): Promise<AberturaPublicaResposta> {
  const resposta = await fetch(`${BASE}/publico/chamados`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  if (!resposta.ok) throw new Error(await mensagemDoErro(resposta));
  return (await resposta.json()) as AberturaPublicaResposta;
}

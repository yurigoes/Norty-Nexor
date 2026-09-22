import type {
  AberturaPublicaResposta,
  AbrirPublicoRequest,
  CategoriaPublica,
  ConsultaPublica,
  ConviteDeSenha,
  EmpresaPublica,
  ModeloDeChamado,
  PessoaReconhecida,
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

export async function tiposPublicos(clientId: string): Promise<CategoriaPublica[]> {
  const r = await fetch(`${BASE}/publico/empresas/${clientId}/tipos`);
  if (!r.ok) return [];
  return (await r.json()) as CategoriaPublica[];
}

export async function modelosPublicos(clientId: string): Promise<ModeloDeChamado[]> {
  const r = await fetch(`${BASE}/publico/empresas/${clientId}/modelos`);
  if (!r.ok) return [];
  return (await r.json()) as ModeloDeChamado[];
}

/**
 * Anexa depois de aberto, pelo protocolo.
 *
 * Duas chamadas e não uma: o corpo do chamado é JSON, e misturar
 * `multipart` ali faria toda abertura pagar o preço de um formulário de
 * arquivo para anexar nada.
 */
export async function anexarNoPublico(protocolo: string, arquivo: File): Promise<void> {
  const forma = new FormData();
  forma.append('file', arquivo);

  const r = await fetch(`${BASE}/publico/chamados/${encodeURIComponent(protocolo)}/anexos`, {
    method: 'POST',
    body: forma,
  });

  if (!r.ok) throw new Error(await mensagemDoErro(r));
}

/**
 * Quem é esta pessoa, para a tela preencher o resto.
 *
 * Devolve uma pessoa ou `null`. Só casa com o e-mail inteiro ou o nome
 * completo de alguém cadastrado nesta empresa — a API recusa prefixo de
 * propósito, e a tela não deve pedir mais do que isso.
 */
export async function reconhecerPessoa(
  clientId: string,
  q: string,
): Promise<PessoaReconhecida | null> {
  const r = await fetch(
    `${BASE}/publico/empresas/${clientId}/pessoa?q=${encodeURIComponent(q)}`,
  );
  if (!r.ok) return null;
  const texto = await r.text();
  return texto ? (JSON.parse(texto) as PessoaReconhecida | null) : null;
}

// ---------------------------------------------------------------------
// Troca de senha pelo link
// ---------------------------------------------------------------------

/**
 * O convite ainda vale?
 *
 * A tela pergunta antes de pedir a senha: digitar duas vezes uma senha e
 * só então descobrir que o link expirou é a forma mais irritante
 * possível de dar essa notícia.
 */
export async function conviteDeSenha(token: string): Promise<ConviteDeSenha> {
  const resposta = await fetch(`${BASE}/publico/definir-senha/${encodeURIComponent(token)}`);
  if (!resposta.ok) return { valido: false, nome: null };
  return (await resposta.json()) as ConviteDeSenha;
}

export async function definirSenha(token: string, nova: string): Promise<void> {
  const resposta = await fetch(`${BASE}/publico/definir-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, nova }),
  });
  if (!resposta.ok) throw new Error(await mensagemDoErro(resposta));
}

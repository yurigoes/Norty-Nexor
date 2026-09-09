import type { ProblemDetails } from '@norty-desk/shared';

const BASE = import.meta.env.VITE_API_URL ?? '/v1';

/**
 * Erro da API, já traduzido do RFC 7807.
 *
 * Guarda o `status` e os erros por campo para a tela decidir o que
 * fazer: 401 leva ao login, 409 é conflito de estado, 400 com `errors`
 * marca os campos do formulário.
 */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly problema: ProblemDetails,
  ) {
    super(problema.detail ?? problema.title);
    this.name = 'ErroDaApi';
  }

  get errosPorCampo(): Record<string, string[]> {
    return this.problema.errors ?? {};
  }
}

/**
 * O access token vive **em memória**, nunca em `localStorage`.
 *
 * Um XSS lê `localStorage`; não lê uma variável de módulo com a mesma
 * facilidade, e não lê o cookie `httpOnly` do refresh de jeito nenhum. O
 * custo é perder a sessão ao recarregar a página — pago pela renovação
 * silenciosa na subida.
 */
let accessToken: string | null = null;
let aoPerderSessao: (() => void) | null = null;

export function guardarToken(token: string | null): void {
  accessToken = token;
}

export function temToken(): boolean {
  return accessToken !== null;
}

export function aoExpirar(callback: () => void): void {
  aoPerderSessao = callback;
}

/**
 * Renovação em voo.
 *
 * Se três chamadas levarem 401 ao mesmo tempo, uma só renova e as outras
 * esperam essa. Sem isso, três refresh concorrentes rotacionam o token
 * três vezes — e a segunda rotação apresenta um token já revogado, o que
 * a API trata como reúso e derruba a sessão inteira.
 */
let renovacaoEmVoo: Promise<boolean> | null = null;

async function renovar(): Promise<boolean> {
  renovacaoEmVoo ??= (async () => {
    try {
      const resposta = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!resposta.ok) return false;

      const { accessToken: novo } = (await resposta.json()) as { accessToken: string };
      accessToken = novo;
      return true;
    } catch {
      return false;
    } finally {
      // Libera a próxima tentativa só depois de esta terminar.
      queueMicrotask(() => {
        renovacaoEmVoo = null;
      });
    }
  })();

  return renovacaoEmVoo;
}

type Opcoes = {
  metodo?: string;
  corpo?: unknown;
  /** Uso interno da própria função, para não repetir a renovação em laço. */
  jaRenovou?: boolean;
};

export async function chamar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, jaRenovou = false } = opcoes;

  const ehFormulario = corpo instanceof FormData;

  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    credentials: 'include',
    headers: {
      ...(corpo && !ehFormulario ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(corpo ? { body: ehFormulario ? corpo : JSON.stringify(corpo) } : {}),
  });

  // O access token dura 15 minutos; encontrá-lo vencido é rotina, não
  // erro. Renova uma vez e repete a chamada — o usuário não vê nada.
  if (resposta.status === 401 && !jaRenovou) {
    if (await renovar()) {
      return chamar<T>(caminho, { ...opcoes, jaRenovou: true });
    }

    accessToken = null;
    aoPerderSessao?.();
  }

  if (!resposta.ok) {
    let problema: ProblemDetails;
    try {
      problema = (await resposta.json()) as ProblemDetails;
    } catch {
      problema = {
        type: 'sobre:em-branco',
        title: 'Não foi possível falar com o servidor.',
        status: resposta.status,
      };
    }
    throw new ErroDaApi(resposta.status, problema);
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

/**
 * Baixa um arquivo da API.
 *
 * Não dá para apontar um `<a download>` para a rota: a autorização é o
 * `Bearer` que vive em memória, e o navegador não o manda numa
 * navegação. Busca-se com o token, e o que volta vira um blob local.
 */
export async function baixar(caminho: string, nomeDoArquivo: string): Promise<void> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!resposta.ok) {
    throw new ErroDaApi(resposta.status, {
      type: 'sobre:em-branco',
      title: 'Não foi possível exportar.',
      status: resposta.status,
    });
  }

  // BOM: sem ele o Excel em pt-BR lê o CSV como Latin-1 e "Solução"
  // vira "SoluÃ§Ã£o".
  const texto = await resposta.text();
  const blob = new Blob([`\ufeff${texto}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = nomeDoArquivo;
  link.click();

  URL.revokeObjectURL(url);
}

/** Tenta recuperar a sessão pelo cookie, na subida do aplicativo. */
export async function recuperarSessao(): Promise<boolean> {
  return renovar();
}

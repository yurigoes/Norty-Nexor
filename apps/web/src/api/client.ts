/* =========================================================
   my Home — Cliente HTTP da API
   ---------------------------------------------------------
   Único ponto do aplicativo que fala com api-myhome.norty.com.br.
   Cuida de três coisas que ninguém deveria repetir em cada tela:
   o token, a renovação da sessão e o formato de erro.
   ========================================================= */

import type { ApiError, LoginResponse, SessionResponse } from '@myhome/shared';

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333/v1').replace(/\/$/, '');

/**
 * O access token vive em memória, não no localStorage.
 *
 * É a diferença que importa num app com conteúdo de terceiros: um XSS
 * consegue ler localStorage, mas não alcança uma variável de módulo. O
 * refresh token, esse, nem chega ao JavaScript — fica em cookie httpOnly.
 * O preço é que recarregar a página exige um /auth/refresh, o que é
 * exatamente o que `bootstrapSession` faz.
 */
let accessToken: string | null = null;
let condominiumId: string | null = null;

/** Renovação em andamento: várias requisições em paralelo esperam a mesma. */
let refreshing: Promise<boolean> | null = null;

type Listener = (authenticated: boolean) => void;
const listeners = new Set<Listener>();

export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(authenticated: boolean): void {
  listeners.forEach((listener) => listener(authenticated));
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  announce(Boolean(token));
}

export function setCondominium(id: string | null): void {
  condominiumId = id;
}

export function currentCondominium(): string | null {
  return condominiumId;
}

/* ---------------- Erro tipado ---------------- */

export class ApiRequestError extends Error {
  readonly statusCode: number;
  readonly code: ApiError['code'];
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.statusCode = error.statusCode;
    this.code = error.code;
    this.fields = error.fields;
    this.requestId = error.requestId;
  }

  /** Erro de rede ou servidor fora do ar — vale sugerir nova tentativa. */
  get isOffline(): boolean {
    return this.statusCode === 0;
  }
}

/* ---------------- Requisição ---------------- */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Uso interno: impede laço infinito de renovação. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (condominiumId) headers['x-condominium-id'] = condominiumId;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      // Necessário para o cookie do refresh token atravessar de
      // myhome para api-myhome.
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiRequestError({
      statusCode: 0,
      code: 'internal_error',
      message: 'Sem conexão com o servidor. Verifique sua internet.',
    });
  }

  // Sessão expirada: renova uma vez e repete a requisição original. Do
  // ponto de vista da tela, nada aconteceu.
  if (response.status === 401 && !options.skipRefresh) {
    const renewed = await refreshSession();
    if (renewed) return request<T>(path, { ...options, skipRefresh: true });
    setAccessToken(null);
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(
      (payload as ApiError | null) ?? {
        statusCode: response.status,
        code: 'internal_error',
        message: 'Não foi possível concluir a operação.',
      },
    );
  }

  return payload as T;
}

/**
 * Renova o access token. Chamadas simultâneas compartilham a mesma
 * promessa: sem isso, dez requisições que expiram juntas dispararam dez
 * renovações, e a rotação de token invalidaria nove delas.
 */
async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/* ---------------- Sessão ---------------- */

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipRefresh: true,
  });
  setAccessToken(result.accessToken);
  setCondominium(result.user.condominiumIds[0] ?? null);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST', skipRefresh: true });
  } finally {
    setAccessToken(null);
    setCondominium(null);
  }
}

export function session(): Promise<SessionResponse> {
  return request<SessionResponse>('/auth/session');
}

/**
 * Restaura a sessão ao abrir o aplicativo.
 *
 * Como o access token só existe em memória, todo recarregamento começa
 * deslogado; o cookie de refresh é o que prova que a sessão continua
 * válida. Devolve `null` quando não há sessão — e aí a tela de login é
 * a resposta correta, não um erro.
 */
export async function bootstrapSession(): Promise<SessionResponse | null> {
  const renewed = await refreshSession();
  if (!renewed) return null;
  try {
    const current = await session();
    setCondominium(current.condominium.id);
    return current;
  } catch {
    setAccessToken(null);
    return null;
  }
}

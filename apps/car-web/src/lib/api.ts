/* =========================================================
   Cliente HTTP da API do Norty Car.
   Único ponto do aplicativo que fala com o servidor. Cuida do
   token, da renovação da sessão e do formato de erro.
   ========================================================= */

import type { ApiError, Paginated } from '@nortycar/shared';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3334/v1').replace(/\/$/, '');
export const API_ORIGIN = API_URL.replace(/\/v1$/, '');

/**
 * O access token vive em memória, não no localStorage: um XSS consegue
 * ler localStorage, mas não uma variável de módulo. O refresh token nem
 * chega ao JavaScript — fica em cookie httpOnly.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
type Listener = (authenticated: boolean) => void;
const listeners = new Set<Listener>();

export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((l) => l(Boolean(token)));
}

export function hasToken(): boolean {
  return Boolean(accessToken);
}

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

  get isOffline(): boolean {
    return this.statusCode === 0;
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  skipRefresh?: boolean;
  signal?: AbortSignal;
  raw?: boolean;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiRequestError({ statusCode: 0, code: 'internal_error', message: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' });
  }

  // Token expirado: renova uma vez e repete. Para a tela, nada aconteceu.
  if (response.status === 401 && !options.skipRefresh && accessToken) {
    if (await refreshSession()) return request<T>(path, { ...options, skipRefresh: true });
    setAccessToken(null);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body ?? { statusCode: response.status, code: 'internal_error', message: 'Erro inesperado. Tente novamente.' });
  }
  if (options.raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}

/** Renova o access token pelo cookie. Várias chamadas paralelas esperam a mesma renovação. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await request<{ accessToken: string }>('/auth/refresh', { method: 'POST', skipRefresh: true });
      setAccessToken(res.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', body: body ?? {}, headers }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ?? {} }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  page: <T>(path: string, query?: Query, signal?: AbortSignal) => request<Paginated<T>>(path, { query, signal }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  /** Download autenticado (CSV, PDF, anexos): devolve o Blob e o nome sugerido. */
  async download(path: string, query?: Query): Promise<{ blob: Blob; filename: string }> {
    const res = await request<Response>(path, { query, raw: true });
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/.exec(disposition);
    const filename = decodeURIComponent(match?.[1] ?? match?.[2] ?? 'arquivo');
    return { blob: await res.blob(), filename };
  },
};

/** Gera chave de idempotência por operação: o mesmo clique repetido não duplica. */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Erro inesperado.';
}

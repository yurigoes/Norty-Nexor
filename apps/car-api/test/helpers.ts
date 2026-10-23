/**
 * Bancada dos testes de integração.
 *
 * Sobe a API compilada (dist/) dentro do processo de teste, contra o
 * banco de teste (TEST_DATABASE_URL), e fala com ela por HTTP de verdade —
 * guards, validação, RLS e restrições do banco inclusos.
 *
 *   npm run build -w @nortycar/api && npm test -w @nortycar/api
 *
 * Cada arquivo de teste cria as próprias empresas com nomes únicos:
 * os testes não dependem de dado prévio nem uns dos outros.
 */
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://nortycar:nortycar_dev_only@127.0.0.1:5432/nortycar_test?schema=public';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET ??= 'teste-'.repeat(8);
process.env.SECRETS_KEY ??= 'a'.repeat(64);
process.env.STORAGE_DIR ??= resolve(ROOT, 'storage-test');
process.env.JOBS_ENABLED = 'false';
process.env.RATE_LIMIT = '100000';
process.env.AUTH_RATE_LIMIT = '100000';
process.env.MFA_REQUIRED_PLATFORM = 'true';

export const PASSWORD = 'Senha#Teste2026';

let migrated = false;
export function migrate(): void {
  if (migrated) return;
  execSync('npx prisma migrate deploy', { cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: 'pipe' });
  migrated = true;
}

type App = { listen: (port: number, host: string) => Promise<unknown>; close: () => Promise<void>; getHttpServer: () => { address: () => { port: number } } };
let app: App | null = null;
let base = '';

export async function startApi(): Promise<string> {
  migrate();
  if (app) return base;
  // Importa o build: o tsx não emite metadados de decorators, e a injeção de
  // dependência do Nest precisa deles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createApp } = require(resolve(ROOT, 'dist/main.js')) as { createApp: () => Promise<App> };
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/v1`;
  return base;
}

export async function stopApi(): Promise<void> {
  await app?.close();
  app = null;
  const { db } = await import('./db');
  await db.$disconnect();
}

export interface Res<T = any> {
  status: number;
  data: T;
  headers: Headers;
}

export class Client {
  token: string | null = null;
  cookie: string | null = null;
  constructor(public label = 'cliente') {}

  async req<T = any>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...extra };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${base}${path}`, {
      method, headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) if (c.startsWith('nortycar_refresh=')) this.cookie = c.split(';')[0]!;
    const type = res.headers.get('content-type') ?? '';
    const data = res.status === 204 ? null : type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data: data as T, headers: res.headers };
  }

  get<T = any>(path: string) { return this.req<T>('GET', path); }
  post<T = any>(path: string, body?: unknown, extra?: Record<string, string>) { return this.req<T>('POST', path, body ?? {}, extra); }
  patch<T = any>(path: string, body?: unknown) { return this.req<T>('PATCH', path, body ?? {}); }
  put<T = any>(path: string, body?: unknown) { return this.req<T>('PUT', path, body ?? {}); }
  del<T = any>(path: string, body?: unknown) { return this.req<T>('DELETE', path, body); }

  /** Login completo: senha → (contexto) → token. */
  async login(email: string, contextMatch?: (c: any) => boolean, password = PASSWORD): Promise<Res> {
    this.token = null;
    const res = await this.post('/auth/login', { email, password });
    if (res.status !== 200) return res;
    if (res.data.step === 'ready') {
      this.token = res.data.session.accessToken;
      return res;
    }
    if (res.data.step === 'context') {
      this.token = res.data.ticket;
      const chosen = (res.data.contexts as any[]).find(contextMatch ?? (() => true));
      const sel = await this.post('/auth/context', { key: chosen.key });
      if (sel.status === 200) this.token = sel.data.accessToken;
      return sel;
    }
    this.token = res.data.ticket;
    return res;
  }
}

export const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

/** CPF sintético com dígitos verificadores válidos (não pertence a ninguém). */
export function fakeCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (new Set(n).size === 1) n[0] = (n[0]! + 1) % 10;
  const dv = (arr: number[]) => {
    const sum = arr.reduce((acc, d, i) => acc + d * (arr.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

/** Placa Mercosul sintética. */
export function fakePlate(): string {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const r = (s: string) => s[Math.floor(Math.random() * s.length)]!;
  return `T${r(L)}${r(L)}${Math.floor(Math.random() * 10)}${r(L)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`;
}

/** RENAVAM sintético com dígito verificador válido. */
export function fakeRenavam(): string {
  const base = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3];
  const sum = base.split('').reverse().reduce((acc, d, i) => acc + Number(d) * w[i]!, 0);
  const c = (sum * 10) % 11;
  return base + (c === 10 ? 0 : c);
}

export function fakeVin(): string {
  const A = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  return '9TS' + Array.from({ length: 14 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

export const iso = (d: Date) => d.toISOString();
export const inDays = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

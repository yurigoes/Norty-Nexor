/* =========================================================
   NEXOR — Autenticação (provisória)
   ---------------------------------------------------------
   Fase 1: validação contra o dataset de demonstração e
   sessão persistida no navegador.
   Fase 2: este arquivo passa a falar com o provedor real
   (JWT/OAuth) — a interface pública não muda.
   ========================================================= */

import { all, find } from '../data/repositories';
import type { User } from '../data/types';

const SESSION_KEY = 'nexor.mvp.session.v1';

export interface Session {
  userId: string;
  condominiumId: string;
  startedAt: string;
}

export class AuthError extends Error {}

export function authenticate(email: string, password: string): User {
  const user = find('users', (u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) throw new AuthError('E-mail não encontrado. Verifique as contas de demonstração.');
  if (user.password !== password) throw new AuthError('Senha incorreta.');
  return user;
}

export function startSession(user: User): Session {
  const condominiumId = user.condominiumIds[0]
    ?? all('condominiums').find((c) => c.tenantId === user.tenantId)?.id
    ?? '';
  const session: Session = { userId: user.id, condominiumId, startedAt: new Date().toISOString() };
  persist(session);
  return session;
}

export function persist(session: Session): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* modo privado */ }
}

export function restoreSession(): { session: Session; user: User } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    const user = find('users', (u) => u.id === session.userId);
    if (!user) return null;
    return { session, user };
  } catch {
    return null;
  }
}

export function endSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function demoAccounts(): User[] {
  return all('users');
}

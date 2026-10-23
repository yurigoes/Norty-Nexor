/* =========================================================
   Sessão no aplicativo: quem está logado, em qual contexto e
   com quais permissões. Tudo vem de /auth/session — a tela
   esconde o que o usuário não pode usar, e a API recusa.
   ========================================================= */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ContextOption, LoginStep, Permission, SessionInfo, ModuleKey } from '@nortycar/shared';
import { api, onAuthChange, refreshSession, setAccessToken } from './api';

interface SessionValue {
  status: 'loading' | 'anonymous' | 'authenticated';
  session: SessionInfo | null;
  /** Etapa intermediária do login (MFA ou escolha de contexto). */
  pending: LoginStep | null;
  login: (email: string, password: string) => Promise<LoginStep>;
  verifyMfa: (code: string) => Promise<LoginStep>;
  chooseContext: (key: string) => Promise<void>;
  listContexts: () => Promise<ContextOption[]>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (permission: Permission | string) => boolean;
  canAny: (permissions: (Permission | string)[]) => boolean;
  hasModule: (module: ModuleKey) => boolean;
  /** Incrementa a cada troca de contexto: telas usam para recarregar. */
  version: number;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pending, setPending] = useState<LoginStep | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const info = await api.get<SessionInfo>('/auth/session');
      setSession(info);
      setStatus('authenticated');
    } catch {
      setSession(null);
      setStatus('anonymous');
    }
  }, []);

  // Ao abrir a página, tenta retomar a sessão pelo cookie de refresh.
  useEffect(() => {
    let alive = true;
    refreshSession().then((ok) => {
      if (!alive) return;
      if (ok) void load();
      else setStatus('anonymous');
    });
    const off = onAuthChange((authenticated) => {
      if (!authenticated) {
        setSession(null);
        setStatus((s) => (s === 'loading' ? s : 'anonymous'));
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [load]);

  const finish = useCallback(async (step: LoginStep) => {
    if (step.step === 'ready' && step.session) {
      setAccessToken(step.session.accessToken);
      setPending(null);
      await load();
      setVersion((v) => v + 1);
    } else {
      if (step.ticket) setAccessToken(step.ticket);
      setPending(step);
    }
    return step;
  }, [load]);

  const login = useCallback(async (email: string, password: string) => {
    setAccessToken(null);
    const step = await api.post<LoginStep>('/auth/login', { email, password });
    return finish(step);
  }, [finish]);

  const verifyMfa = useCallback(async (code: string) => finish(await api.post<LoginStep>('/auth/mfa', { code })), [finish]);

  const chooseContext = useCallback(async (key: string) => {
    const tokens = await api.post<{ accessToken: string }>('/auth/context', { key });
    setAccessToken(tokens.accessToken);
    setPending(null);
    await load();
    setVersion((v) => v + 1);
  }, [load]);

  const listContexts = useCallback(() => api.get<ContextOption[]>('/auth/contexts'), []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setPending(null);
      setSession(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<SessionValue>(() => {
    const granted = new Set(session?.permissions ?? []);
    const modules = new Set(session?.context.enabledModules ?? []);
    return {
      status, session, pending, login, verifyMfa, chooseContext, listContexts, logout, reload: load, version,
      can: (p) => granted.has(p),
      canAny: (list) => list.some((p) => granted.has(p)),
      hasModule: (m) => modules.has(m),
    };
  }, [status, session, pending, login, verifyMfa, chooseContext, listContexts, logout, load, version]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora do SessionProvider');
  return value;
}

/** Home de cada tipo de contexto. */
export function homeFor(session: SessionInfo | null): string {
  switch (session?.context.kind) {
    case 'PLATFORM':
      return '/master';
    case 'CUSTOMER':
      return '/cliente';
    case 'STAFF':
    case 'SUPPORT':
      return '/painel';
    default:
      return '/entrar';
  }
}

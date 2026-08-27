import {
  createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Condominium, ID, Permission, Unit, User } from '../data/types';
import { getVersion, subscribe } from '../data/db';
import * as auth from '../services/auth';
import { can as hasPermission } from '../services/permissions';
import { condominiumsFor, unit as findUnit } from '../services/directory';

interface SessionValue {
  user: User | null;
  condominium: Condominium | null;
  condominiums: Condominium[];
  unit: Unit | null;
  /** Muda a cada alteração no banco: força a UI a recalcular consultas. */
  dataVersion: number;
  login: (email: string, password: string) => User;
  logout: () => void;
  switchCondominium: (id: ID) => void;
  can: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  /**
   * A sessão é restaurada de forma SÍNCRONA no primeiro render.
   * Restaurar em `useEffect` faria o primeiro render ocorrer sem usuário,
   * disparando o guard de rota e descartando o link profundo que o
   * usuário acabou de abrir (ou recarregar).
   */
  const restored = useMemo(() => auth.restoreSession(), []);
  const [user, setUser] = useState<User | null>(restored?.user ?? null);
  const [condominiumId, setCondominiumId] = useState<string>(restored?.session.condominiumId ?? '');

  const dataVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  const login = useCallback((email: string, password: string) => {
    const authenticated = auth.authenticate(email, password);
    const session = auth.startSession(authenticated);
    setUser(authenticated);
    setCondominiumId(session.condominiumId);
    return authenticated;
  }, []);

  const logout = useCallback(() => {
    auth.endSession();
    setUser(null);
    setCondominiumId('');
  }, []);

  const switchCondominium = useCallback((id: ID) => {
    setCondominiumId(id);
    if (user) auth.persist({ userId: user.id, condominiumId: id, startedAt: new Date().toISOString() });
  }, [user]);

  const condominiums = useMemo(
    () => (user ? condominiumsFor(user) : []),
    [user, dataVersion],
  );

  const condominium = useMemo(
    () => condominiums.find((c) => c.id === condominiumId) ?? condominiums[0] ?? null,
    [condominiums, condominiumId],
  );

  const unit = useMemo(
    () => (user?.unitId ? findUnit(user.unitId) ?? null : null),
    [user, dataVersion],
  );

  const value = useMemo<SessionValue>(() => ({
    user,
    condominium,
    condominiums,
    unit,
    dataVersion,
    login,
    logout,
    switchCondominium,
    can: (permission) => hasPermission(user, permission),
  }), [user, condominium, condominiums, unit, dataVersion, login, logout, switchCondominium]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return ctx;
}

/** Sessão garantida — para uso dentro de rotas protegidas. */
export function useAuthenticated() {
  const session = useSession();
  if (!session.user || !session.condominium) {
    throw new Error('Rota protegida usada fora de contexto autenticado');
  }
  return {
    ...session,
    user: session.user,
    condominium: session.condominium,
    condominiumId: session.condominium.id,
  };
}

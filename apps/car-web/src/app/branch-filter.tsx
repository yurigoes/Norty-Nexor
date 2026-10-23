/* Filtro global de filial. Vazio = todas as filiais autorizadas. A API
   recusa filial fora do escopo do usuário, então o filtro só restringe. */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { usePreference } from '../lib/theme';
import { useSession } from '../lib/session';

interface BranchFilter { branchId: string; setBranchId: (id: string) => void }
const Ctx = createContext<BranchFilter>({ branchId: '', setBranchId: () => undefined });

export function BranchFilterProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const key = `branch:${session?.context.organizationId ?? 'none'}`;
  const [branchId, setBranchId] = usePreference<string>(key, '');
  const branches = session?.context.branches ?? [];
  // Filial guardada que não está mais autorizada é descartada.
  useEffect(() => {
    if (branchId && !branches.some((b) => b.id === branchId)) setBranchId('');
  }, [branchId, branches, setBranchId]);
  return <Ctx.Provider value={{ branchId, setBranchId }}>{children}</Ctx.Provider>;
}

export function useBranchFilter(): BranchFilter {
  return useContext(Ctx);
}

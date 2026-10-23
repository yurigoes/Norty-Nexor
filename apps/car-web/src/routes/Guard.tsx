import type { ReactNode } from 'react';
import type { Permission, PlatformPermission } from '@nortycar/shared';
import { useSession } from '../lib/session';
import { ForbiddenPage } from '../modules/shared/StatusPages';

/** Rota protegida por permissão. Esconder o menu não basta: a rota também confere. */
export function Guard({ permissions, children }: { permissions?: (Permission | PlatformPermission)[]; children: ReactNode }) {
  const { canAny } = useSession();
  if (permissions?.length && !canAny(permissions)) return <ForbiddenPage />;
  return <>{children}</>;
}

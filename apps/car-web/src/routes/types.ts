import type { ReactNode } from 'react';
import type { Permission } from '@nortycar/shared';

/** Rota de uma área do aplicativo. `permissions` = basta ter uma delas. */
export interface AppRoute {
  path: string;
  element: ReactNode;
  permissions?: Permission[];
}

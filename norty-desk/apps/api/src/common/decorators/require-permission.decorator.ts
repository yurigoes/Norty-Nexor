import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@norty-desk/shared';

export const PERMISSION_KEY = 'permissao-exigida';

/**
 * Exige uma permissão nomeada da matriz de `packages/shared`.
 *
 * Esconder o botão no aplicativo é conveniência; este decorador é a
 * proteção (CLAUDE.md, regra 2).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

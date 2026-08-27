import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@myhome/shared';
import { REQUIRED_PERMISSIONS } from '../decorators';
import type { RequestUser } from '../types';

/** Aplica a matriz RBAC compartilhada com o aplicativo. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user) throw new ForbiddenException('Sem permissão.');

    const granted = new Set(user.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length) {
      throw new ForbiddenException(
        `Seu perfil não tem permissão para esta ação (${missing.join(', ')}).`,
      );
    }
    return true;
  }
}

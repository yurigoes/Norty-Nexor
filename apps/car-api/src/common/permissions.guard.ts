import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS, type RequestContext } from './context';

/** Aplica a matriz de permissões compartilhada com o aplicativo. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const ctx = context.switchToHttp().getRequest().ctx as RequestContext | undefined;
    if (!ctx) throw new ForbiddenException('Sem permissão.');
    const missing = required.filter((p) => !ctx.permissions.has(p));
    if (missing.length) {
      throw new ForbiddenException(`Seu perfil não tem permissão para esta ação (${missing.join(', ')}).`);
    }
    return true;
  }
}

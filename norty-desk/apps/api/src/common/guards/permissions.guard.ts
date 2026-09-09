import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, canAll } from '@norty-desk/shared';

import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { UsuarioAutenticado } from '../decorators/current-user.decorator';

/**
 * Lê a permissão exigida pela rota e consulta a mesma matriz que o
 * aplicativo usa para esconder o menu.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const exigidas = this.reflector.getAllAndOverride<Permission[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!exigidas?.length) return true;

    const usuario: UsuarioAutenticado | undefined = context.switchToHttp().getRequest().user;
    if (!usuario) throw new ForbiddenException('Sem vínculo com a organização.');

    if (!canAll(usuario.role, exigidas)) {
      throw new ForbiddenException(
        `O perfil ${usuario.role} não tem a permissão exigida por esta rota.`,
      );
    }

    return true;
  }
}

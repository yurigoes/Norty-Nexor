import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@myhome/shared';
import type { RequestUser } from '../types';

export const IS_PUBLIC = 'myhome:public';
export const REQUIRED_PERMISSIONS = 'myhome:permissions';

/** Rota aberta: sem token. Use com parcimônia — login e saúde, só. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Exige uma permissão da mesma matriz que monta o menu do aplicativo.
 * Esconder o botão no frontend é conveniência; esta linha é a proteção.
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Usuário autenticado, resolvido pelo JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as RequestUser;
    return field ? user?.[field] : user;
  },
);

/**
 * Condomínio ativo da requisição. Vem do cabeçalho `x-condominium-id`
 * quando o usuário atende mais de um (o caso da administradora) e cai
 * no primeiro vínculo quando não vem.
 */
export const CondominiumId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.condominiumId as string;
});

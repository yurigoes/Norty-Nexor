import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Role } from '@norty-desk/shared';

/** O que o `JwtAuthGuard` deixa na requisição. */
export type UsuarioAutenticado = {
  userId: string;
  /** Resolvida uma vez pelo guard, validando o vínculo. Nunca vem do corpo. */
  organizationId: string;
  role: Role;
  teamIds: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado =>
    ctx.switchToHttp().getRequest().user,
);

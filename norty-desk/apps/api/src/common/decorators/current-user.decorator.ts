import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Role } from '@norty-desk/shared';

/** O que o `JwtAuthGuard` deixa na requisição. */
export type UsuarioAutenticado = {
  userId: string;
  /** Resolvida uma vez pelo guard, validando o vínculo. Nunca vem do corpo. */
  organizationId: string;
  role: Role;
  teamIds: string[];
  /**
   * De qual empresa-cliente a pessoa é, quando é de alguma.
   *
   * Vem do vínculo, como a organização — nunca do corpo da requisição.
   * É o que recorta o escopo de leitura por cliente, e é por isso que
   * um cliente não enxerga o chamado de outro.
   */
  clientId: string | null;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado =>
    ctx.switchToHttp().getRequest().user,
);

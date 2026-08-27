import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioRequisicao } from './types';

/** Rota que não exige token. Tudo o mais exige, por padrão. */
export const PUBLICA = 'rota_publica';
export const Publica = () => SetMetadata(PUBLICA, true);

export const Usuario = createParamDecorator(
  (_dados: unknown, ctx: ExecutionContext): UsuarioRequisicao => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.usuario) {
      throw new Error('Usuario acessado em rota sem JwtAuthGuard — erro de programação.');
    }
    return req.usuario;
  },
);

/**
 * Atalho para o caso mais comum. Toda consulta começa por
 * `empresaId`, então vale ter o parâmetro direto.
 */
export const EmpresaId = createParamDecorator((_dados: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.usuario) {
    throw new Error('EmpresaId acessado em rota sem JwtAuthGuard — erro de programação.');
  }
  return req.usuario.empresaId;
});

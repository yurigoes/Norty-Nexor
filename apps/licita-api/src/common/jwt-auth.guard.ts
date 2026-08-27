import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from './prisma/prisma.service';
import { PUBLICA } from './decorators';
import type { CargaJwt, UsuarioRequisicao } from './types';

/**
 * Resolve a identidade uma vez por requisição e a injeta em
 * `request.usuario`.
 *
 * O guard não confia só na assinatura do token. Ele confere a
 * sessão no banco a cada chamada, porque um access token válido
 * de 15 minutos continuaria funcionando depois de o usuário sair
 * ou de a conta ser desativada — e "sair" precisa ter efeito
 * imediato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(PUBLICA, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publica) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const cabecalho = req.headers.authorization ?? '';

    if (!cabecalho.startsWith('Bearer ')) {
      throw new UnauthorizedException('Autenticação necessária.');
    }

    let carga: CargaJwt;
    try {
      carga = await this.jwt.verifyAsync<CargaJwt>(cabecalho.slice(7));
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    const sessao = await this.prisma.sessao.findUnique({
      where: { id: carga.ses },
      include: { usuario: { include: { empresa: { select: { ativa: true } } } } },
    });

    if (!sessao || sessao.revogadaEm || sessao.expiraEm < new Date()) {
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }
    if (!sessao.usuario.ativo || !sessao.usuario.empresa.ativa) {
      throw new UnauthorizedException('Conta desativada.');
    }
    if (!sessao.usuario.emailConfirmadoEm) {
      throw new UnauthorizedException('Confirme seu e-mail para continuar.');
    }

    const usuario: UsuarioRequisicao = {
      id: sessao.usuario.id,
      empresaId: sessao.usuario.empresaId,
      email: sessao.usuario.email,
      nome: sessao.usuario.nome,
      papel: sessao.usuario.papel,
      sessaoId: sessao.id,
    };

    req.usuario = usuario;
    return true;
  }
}

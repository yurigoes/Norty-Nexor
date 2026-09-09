import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';

/** O que a chave deixa na requisição. */
export type AplicacaoAutenticada = {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
};

/**
 * Autenticação por chave de aplicação.
 *
 * A chave é guardada como SHA-256, e o valor cru só existe uma vez, na
 * criação. Sem hash rápido aqui de propósito: diferente de senha de
 * gente, a chave tem entropia alta e é apresentada a cada requisição —
 * Argon2 em toda chamada seria custo sem ganho.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest();
    const cabecalho: string | undefined = requisicao.headers.authorization;

    if (!cabecalho?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Chave de aplicação ausente.');
    }

    const hash = createHash('sha256').update(cabecalho.slice(7)).digest('hex');

    const chave = await this.prisma.apiKey.findUnique({
      where: { keyHash: hash },
      select: { id: true, organizationId: true, scopes: true, revokedAt: true },
    });

    if (!chave || chave.revokedAt) throw new UnauthorizedException('Chave inválida ou revogada.');

    // O último uso serve para achar chave esquecida em produção — é a
    // informação que falta na hora de decidir se pode revogar.
    await this.prisma.apiKey.update({
      where: { id: chave.id },
      data: { lastUsedAt: new Date() },
    });

    const aplicacao: AplicacaoAutenticada = {
      apiKeyId: chave.id,
      organizationId: chave.organizationId,
      scopes: chave.scopes,
    };

    requisicao.aplicacao = aplicacao;
    return true;
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { CryptoService } from '../../common/crypto.service';
import { parseApiKey } from './integrations.service';

export const API_SCOPE = 'nortycar:api-scope';
export const RequireScope = (scope: string) => SetMetadata(API_SCOPE, scope);

export interface IntegrationContext {
  organizationId: string;
  apiKeyId: string;
  prefix: string;
  scopes: string[];
}

/**
 * Autenticação da API de integração: `Authorization: ApiKey nc_live_…`.
 * Busca pelo prefixo e compara o hash em tempo constante. Chave revogada,
 * expirada ou de empresa suspensa não entra — e a empresa vem da chave,
 * nunca de um parâmetro.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const [scheme, raw] = typeof header === 'string' ? header.split(' ') : [];
    const parsed = scheme?.toLowerCase() === 'apikey' && raw ? parseApiKey(raw) : null;
    const denied = new UnauthorizedException('Chave de API inválida, revogada ou expirada.');
    if (!parsed || !raw) throw denied;

    const key = await this.prisma.platform((tx) => tx.apiKey.findUnique({ where: { prefix: parsed.prefix }, include: { organization: true } }));
    if (!key) throw denied;
    const expected = Buffer.from(key.keyHash);
    const given = Buffer.from(CryptoService.sha256(raw));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw denied;
    if (key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) throw denied;
    if (!['ACTIVE', 'TRIAL'].includes(key.organization.status)) throw new ForbiddenException('Empresa sem acesso à API.');
    if (!key.organization.extraModules.includes('api')) {
      const sub = await this.prisma.platform((tx) => tx.subscription.findUnique({ where: { organizationId: key.organizationId }, include: { plan: true } }));
      if (!sub?.plan.modules.includes('api')) throw new ForbiddenException('O plano da empresa não inclui a API de integração.');
    }

    const scope = this.reflector.getAllAndOverride<string>(API_SCOPE, [context.getHandler(), context.getClass()]);
    if (scope && !key.scopes.includes(scope)) throw new ForbiddenException(`A chave não tem o escopo ${scope}.`);

    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      await this.prisma.platform((tx) => tx.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }));
    }
    const integration: IntegrationContext = { organizationId: key.organizationId, apiKeyId: key.id, prefix: key.prefix, scopes: key.scopes };
    request.integration = integration;
    return true;
  }
}

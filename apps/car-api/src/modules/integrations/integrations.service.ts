import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import type { OrgContext } from '../../common/context';
import { loadConfig } from '../../config/env';

export const API_SCOPES = {
  'vehicles:read': 'Ler frota (sem valores patrimoniais)',
  'availability:read': 'Consultar disponibilidade por período',
  'reservations:read': 'Ler reservas (sem dados pessoais além do nome)',
} as const;
export type ApiScope = keyof typeof API_SCOPES;

/** Eventos que um webhook de saída pode assinar ('*' = todos). */
export const WEBHOOK_EVENTS = ['*', 'notification', 'test'] as const;

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomId(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Formato da chave: nc_live_<prefixo>_<segredo>. Só o prefixo e o hash ficam no banco. */
export function parseApiKey(raw: string): { prefix: string } | null {
  const m = /^nc_live_([A-Za-z0-9]{10})_([A-Za-z0-9]{32})$/.exec(raw ?? '');
  return m ? { prefix: m[1]! } : null;
}

export function signWebhook(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/**
 * Integrações da empresa: chaves de API, webhooks de saída e provedores.
 * Segredos aparecem uma única vez, na criação. Situação "verificada" só
 * existe depois de comunicação real bem-sucedida.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly crypto: CryptoService) {}

  /* ---------------- Chaves de API ---------------- */

  async apiKeys(ctx: OrgContext) {
    const rows = await this.prisma.tenant(ctx, (tx) => tx.apiKey.findMany({ orderBy: { createdAt: 'desc' } }));
    return rows.map(({ keyHash: _hash, ...k }) => ({ ...k, active: !k.revokedAt && (!k.expiresAt || k.expiresAt > new Date()) }));
  }

  async createApiKey(ctx: OrgContext, name: string, scopes: string[], expiresAt?: string) {
    const invalid = scopes.filter((s) => !(s in API_SCOPES));
    if (!scopes.length || invalid.length) throw new BadRequestException(`Escopos inválidos${invalid.length ? `: ${invalid.join(', ')}` : ''}.`);
    const expires = expiresAt ? new Date(expiresAt) : null;
    if (expires && expires <= new Date()) throw new BadRequestException('A expiração precisa ser futura.');
    const prefix = randomId(10);
    const key = `nc_live_${prefix}_${randomId(32)}`;
    const record = await this.prisma.tenant(ctx, async (tx) => {
      const created = await tx.apiKey.create({
        data: { organizationId: ctx.organizationId, name, prefix, keyHash: CryptoService.sha256(key), scopes: [...new Set(scopes)], expiresAt: expires, createdById: ctx.userId },
      });
      await this.audit.record(tx, ctx, { action: 'integration.api_key_created', entityType: 'ApiKey', entityId: created.id, after: { name, prefix, scopes: created.scopes, expiresAt: expires } });
      return created;
    });
    // A chave completa só existe nesta resposta.
    return { id: record.id, name: record.name, prefix, scopes: record.scopes, expiresAt: record.expiresAt, key };
  }

  async revokeApiKey(ctx: OrgContext, id: string) {
    await this.prisma.tenant(ctx, async (tx) => {
      const key = await tx.apiKey.findUnique({ where: { id } });
      if (!key) throw new NotFoundException('Chave não encontrada.');
      if (key.revokedAt) throw new ConflictException('Chave já revogada.');
      await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'integration.api_key_revoked', entityType: 'ApiKey', entityId: id, before: { prefix: key.prefix } });
    });
  }

  /* ---------------- Webhooks de saída ---------------- */

  async webhooks(ctx: OrgContext) {
    const rows = await this.prisma.tenant(ctx, (tx) => tx.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } }));
    return rows.map(({ secretEnc: _s, ...w }) => w);
  }

  async createWebhook(ctx: OrgContext, url: string, events: string[]) {
    this.assertUrl(url);
    this.assertEvents(events);
    const secret = `whsec_${randomId(40)}`;
    const record = await this.prisma.tenant(ctx, async (tx) => {
      const created = await tx.webhookEndpoint.create({ data: { organizationId: ctx.organizationId, url, events: [...new Set(events)], secretEnc: this.crypto.encrypt(secret) } });
      await this.audit.record(tx, ctx, { action: 'integration.webhook_created', entityType: 'WebhookEndpoint', entityId: created.id, after: { url, events } });
      return created;
    });
    return { id: record.id, url: record.url, events: record.events, active: record.active, secret };
  }

  async updateWebhook(ctx: OrgContext, id: string, dto: { url?: string; events?: string[]; active?: boolean }) {
    if (dto.url) this.assertUrl(dto.url);
    if (dto.events) this.assertEvents(dto.events);
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.webhookEndpoint.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Webhook não encontrado.');
      const { secretEnc: _s, ...updated } = await tx.webhookEndpoint.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'integration.webhook_updated', entityType: 'WebhookEndpoint', entityId: id, before: { url: before.url, events: before.events, active: before.active }, after: dto });
      return updated;
    });
  }

  async deleteWebhook(ctx: OrgContext, id: string) {
    await this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.webhookEndpoint.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Webhook não encontrado.');
      await tx.webhookEndpoint.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'integration.webhook_deleted', entityType: 'WebhookEndpoint', entityId: id, before: { url: before.url } });
    });
  }

  /**
   * Teste de entrega de verdade: POST assinado para a URL cadastrada. Falha
   * de rede ou resposta fora de 2xx é registrada como falha.
   */
  async testWebhook(ctx: OrgContext, id: string) {
    const endpoint = await this.prisma.tenant(ctx, (tx) => tx.webhookEndpoint.findUnique({ where: { id } }));
    if (!endpoint) throw new NotFoundException('Webhook não encontrado.');
    const secret = this.crypto.decrypt(endpoint.secretEnc);
    const deliveryId = randomUUID();
    const body = JSON.stringify({ id: deliveryId, type: 'test', createdAt: new Date().toISOString(), organization: ctx.organizationName, data: { message: 'Teste de entrega do Norty Car.' } });
    let status = 0;
    let error: string | null = null;
    const started = Date.now();
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'NortyCar-Webhooks/1.0', 'X-NortyCar-Event': 'test', 'X-NortyCar-Delivery': deliveryId, 'X-NortyCar-Signature': signWebhook(secret, body) },
        body,
        signal: AbortSignal.timeout(10_000),
        redirect: 'manual',
      });
      status = res.status;
      if (!res.ok) error = `Resposta HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? (e.name === 'TimeoutError' ? 'Tempo esgotado (10 s)' : e.message) : String(e);
    }
    await this.prisma.tenant(ctx, async (tx) => {
      await tx.webhookEndpoint.update({ where: { id }, data: { lastStatus: status, lastDeliveryAt: new Date() } });
      await this.audit.record(tx, ctx, { action: 'integration.webhook_tested', entityType: 'WebhookEndpoint', entityId: id, after: { status, ok: !error, error } });
    });
    return { ok: !error, status, error, durationMs: Date.now() - started };
  }

  private assertEvents(events: string[]) {
    const allowed = new Set<string>(WEBHOOK_EVENTS);
    const invalid = events.filter((e) => !allowed.has(e) && !/^[a-z]+(\.[a-z_]+)+$/.test(e));
    if (!events.length || invalid.length) throw new BadRequestException('Eventos inválidos. Use "*" ou tipos como "contract.expiring".');
  }

  /**
   * Em produção, só HTTPS público: um webhook apontado para a rede interna
   * transformaria o servidor numa porta de entrada (SSRF).
   */
  private assertUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('URL inválida.');
    }
    const prod = loadConfig().isProd;
    if (prod && url.protocol !== 'https:') throw new BadRequestException('Use uma URL HTTPS.');
    if (!['https:', 'http:'].includes(url.protocol)) throw new BadRequestException('Use uma URL HTTP(S).');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const internal = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
      (isIP(host) && /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(host));
    if (prod && internal) throw new BadRequestException('Endereços internos não são permitidos.');
  }

  /* ---------------- Provedores ---------------- */

  async providers(ctx: OrgContext, apiPublicUrl: string) {
    const rows = await this.prisma.tenant(ctx, (tx) => tx.integrationConfig.findMany({ where: { organizationId: ctx.organizationId } }));
    const payments = rows.filter((r) => r.provider.startsWith('payment:'));
    return {
      payments: payments.map((p) => ({
        id: p.id, name: p.provider.slice('payment:'.length), status: p.status, lastTestAt: p.lastTestAt, lastTestResult: p.lastTestResult,
        webhookUrl: `${apiPublicUrl}/webhooks/payments/${encodeURIComponent(p.provider.slice('payment:'.length))}`,
        hasSecret: Boolean(p.secretEnc), updatedAt: p.updatedAt,
      })),
      esign: { status: 'NOT_CONFIGURED', detail: 'Provedor de assinatura eletrônica não configurado. Contratos podem ser assinados em papel e digitalizados.' },
      whatsapp: { status: 'NOT_CONFIGURED', detail: 'WhatsApp Business não configurado. Nenhuma mensagem é enviada por este canal.' },
    };
  }

  /**
   * Cadastra o segredo com que o provedor assina os webhooks de pagamento.
   * Fica "configurado"; só passa a "verificado" com um evento real aceito.
   */
  async savePaymentProvider(ctx: OrgContext, name: string, webhookSecret: string) {
    const provider = `payment:${name}`;
    return this.prisma.tenant(ctx, async (tx) => {
      const existing = await tx.integrationConfig.findFirst({ where: { organizationId: ctx.organizationId, provider } });
      const data = { status: 'CONFIGURED' as const, secretEnc: this.crypto.encrypt(webhookSecret), config: { name } };
      const saved = existing
        ? await tx.integrationConfig.update({ where: { id: existing.id }, data })
        : await tx.integrationConfig.create({ data: { ...data, organizationId: ctx.organizationId, provider } });
      await this.audit.record(tx, ctx, { action: existing ? 'integration.payment_secret_rotated' : 'integration.payment_configured', entityType: 'IntegrationConfig', entityId: saved.id, after: { provider } });
      return { id: saved.id, name, status: saved.status };
    });
  }

  async removeProvider(ctx: OrgContext, id: string) {
    await this.prisma.tenant(ctx, async (tx) => {
      const row = await tx.integrationConfig.findUnique({ where: { id } });
      if (!row || row.organizationId !== ctx.organizationId) throw new NotFoundException('Integração não encontrada.');
      await tx.integrationConfig.delete({ where: { id } });
      await this.audit.record(tx, ctx, { action: 'integration.provider_removed', entityType: 'IntegrationConfig', entityId: id, before: { provider: row.provider } });
    });
  }
}

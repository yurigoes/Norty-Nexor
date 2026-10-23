import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { loadConfig } from '../../config/env';
import type { OrgContext, RequestContext } from '../../common/context';
import { VERIFY_PREFIX, applyCheck } from './domains.jobs';

const HOST_RE = /^(?=.{4,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Normaliza o que a pessoa digitou: tira esquema, caminho, porta e ponto final. */
export function normalizeHostname(raw: string): string {
  return (raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
}

/**
 * Domínios do site público. O hostname é único na plataforma inteira:
 * um domínio nunca serve duas empresas, e só entra em funcionamento
 * depois da prova de propriedade por DNS.
 */
@Injectable()
export class DomainsService {
  private readonly config = loadConfig();

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  instructions(d: { hostname: string; verificationToken: string; kind: string }) {
    if (d.kind === 'SUBDOMAIN') return null;
    return {
      txt: { type: 'TXT', name: `${VERIFY_PREFIX}.${d.hostname}`, value: d.verificationToken },
      pointer: { type: 'CNAME', name: d.hostname, value: this.config.siteCnameTarget, note: 'Em domínio raiz (sem www), use ALIAS/ANAME ou os mesmos IPs do destino.' },
    };
  }

  async list(ctx: OrgContext) {
    const rows = await this.prisma.platform((tx) => tx.domain.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }));
    return rows.map((d) => ({ ...d, instructions: this.instructions(d) }));
  }

  async add(ctx: OrgContext, raw: string) {
    const hostname = normalizeHostname(raw);
    if (!HOST_RE.test(hostname)) throw new BadRequestException('Domínio inválido. Use algo como www.sualocadora.com.br.');
    if (hostname === this.config.siteBaseDomain || hostname.endsWith(`.${this.config.siteBaseDomain}`)) {
      throw new BadRequestException('Subdomínios Norty são criados automaticamente ao publicar o site.');
    }
    return this.prisma.platform(async (tx) => {
      const existing = await tx.domain.findUnique({ where: { hostname } });
      if (existing) throw new ConflictException('Este domínio já está associado a uma conta.');
      const domain = await tx.domain.create({
        data: { organizationId: ctx.organizationId, hostname, kind: 'CUSTOM', verificationToken: `nc-${CryptoService.randomToken(18)}` },
      });
      await this.audit.record(tx, ctx, { action: 'domain.added', entityType: 'Domain', entityId: domain.id, organizationId: ctx.organizationId, after: { hostname } });
      return { ...domain, instructions: this.instructions(domain) };
    });
  }

  async verify(ctx: RequestContext, id: string, organizationId?: string) {
    return this.prisma.platform(async (tx) => {
      const domain = await tx.domain.findUnique({ where: { id } });
      if (!domain || (organizationId && domain.organizationId !== organizationId) || domain.status === 'REMOVED') throw new NotFoundException('Domínio não encontrado.');
      if (domain.kind === 'SUBDOMAIN') return { ...domain, instructions: null };
      const updated = await applyCheck(tx, domain);
      await this.audit.record(tx, ctx, {
        action: 'domain.checked', entityType: 'Domain', entityId: id, organizationId: domain.organizationId,
        after: { status: updated.status, error: updated.lastCheckError },
      });
      return { ...updated, instructions: this.instructions(updated) };
    });
  }

  async setPrimary(ctx: OrgContext, id: string) {
    return this.prisma.platform(async (tx) => {
      const domain = await tx.domain.findUnique({ where: { id } });
      if (!domain || domain.organizationId !== ctx.organizationId) throw new NotFoundException('Domínio não encontrado.');
      if (domain.status !== 'ACTIVE') throw new ConflictException('Só um domínio ativo pode ser o principal.');
      await tx.domain.updateMany({ where: { organizationId: ctx.organizationId }, data: { isPrimary: false } });
      await this.audit.record(tx, ctx, { action: 'domain.primary', entityType: 'Domain', entityId: id, organizationId: ctx.organizationId });
      return tx.domain.update({ where: { id }, data: { isPrimary: true } });
    });
  }

  /**
   * Remoção libera o hostname para outra conta (o registro sai da tabela;
   * a trilha de auditoria guarda quem removeu, quando e por quê).
   */
  async remove(ctx: RequestContext, id: string, reason: string, organizationId?: string) {
    await this.prisma.platform(async (tx) => {
      const domain = await tx.domain.findUnique({ where: { id } });
      if (!domain || (organizationId && domain.organizationId !== organizationId)) throw new NotFoundException('Domínio não encontrado.');
      await tx.domain.delete({ where: { id } });
      await this.audit.record(tx, ctx, {
        action: 'domain.removed', entityType: 'Domain', entityId: id, organizationId: domain.organizationId, reason,
        before: { hostname: domain.hostname, status: domain.status },
      });
    });
  }

  /** Subdomínio Norty da empresa, criado já ativo na primeira publicação do site. */
  async ensureSubdomain(tx: Tx, organizationId: string, slug: string) {
    const hostname = `${slug}.${this.config.siteBaseDomain}`;
    const existing = await tx.domain.findUnique({ where: { hostname } });
    if (existing) return existing;
    return tx.domain.create({
      data: { organizationId, hostname, kind: 'SUBDOMAIN', status: 'ACTIVE', verificationToken: '-', verifiedAt: new Date() },
    });
  }

  /** Pergunta do Caddy (on_demand_tls): só emite certificado para domínio nosso e ativo. */
  async tlsAllowed(raw: string): Promise<boolean> {
    const hostname = normalizeHostname(raw);
    if (!hostname) return false;
    const domain = await this.prisma.platform((tx) => tx.domain.findUnique({ where: { hostname }, include: { organization: true } }));
    return Boolean(domain && domain.status === 'ACTIVE' && ['ACTIVE', 'TRIAL'].includes(domain.organization.status));
  }

  allDomains(status?: string) {
    return this.prisma.platform((tx) => tx.domain.findMany({
      where: status ? { status: status as never } : {},
      include: { organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }));
  }
}

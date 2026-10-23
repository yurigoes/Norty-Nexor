import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { pageArgs, paginated } from '../../common/pagination';
import type { OrgContext } from '../../common/context';
import { loadConfig } from '../../config/env';
import { DomainsService } from '../domains/domains.service';

export interface SiteConfigInput {
  brandName?: string;
  logoFileId?: string | null;
  bannerFileId?: string | null;
  primaryColor?: string;
  accentColor?: string;
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  about?: string | null;
  faq?: { question: string; answer: string }[];
  terms?: string | null;
  privacy?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  citiesServed?: string[];
  featuredModelIds?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}

/** Personalização do site e atendimento dos pedidos recebidos por ele. */
@Injectable()
export class SiteAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly domains: DomainsService) {}

  async get(ctx: OrgContext) {
    const [config, org] = await Promise.all([
      this.prisma.tenant(ctx, (tx) => tx.siteConfig.findUnique({ where: { organizationId: ctx.organizationId } })),
      this.prisma.platform((tx) => tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { slug: true, name: true } })),
    ]);
    return {
      ...(config ?? { brandName: org.name, published: false }),
      slug: org.slug,
      previewPath: `/site/${org.slug}`,
      subdomain: `${org.slug}.${loadConfig().siteBaseDomain}`,
    };
  }

  async update(ctx: OrgContext, dto: SiteConfigInput) {
    return this.prisma.tenant(ctx, async (tx) => {
      for (const fileId of [dto.logoFileId, dto.bannerFileId].filter(Boolean) as string[]) {
        const file = await tx.fileAsset.findUnique({ where: { id: fileId } });
        if (!file || file.entityType !== 'SiteConfig' || !file.mimeType.startsWith('image/')) throw new BadRequestException('Imagem inválida: envie a imagem pelo próprio painel do site.');
      }
      if (dto.featuredModelIds?.length) {
        const count = await tx.vehicleModel.count({ where: { id: { in: dto.featuredModelIds } } });
        if (count !== new Set(dto.featuredModelIds).size) throw new BadRequestException('Modelo em destaque inválido.');
      }
      const before = await tx.siteConfig.findUnique({ where: { organizationId: ctx.organizationId } });
      const data = { ...dto, faq: dto.faq as unknown as Prisma.InputJsonValue | undefined };
      const saved = before
        ? await tx.siteConfig.update({ where: { organizationId: ctx.organizationId }, data })
        : await tx.siteConfig.create({ data: { ...data, brandName: dto.brandName ?? ctx.organizationName ?? 'Locadora', organizationId: ctx.organizationId } });
      await this.audit.record(tx, ctx, { action: 'site.updated', entityType: 'SiteConfig', entityId: ctx.organizationId, ...AuditService.diff((before ?? {}) as never, dto as never) });
      return saved;
    });
  }

  /** Publicar cria o subdomínio Norty na primeira vez; despublicar tira o site do ar na hora. */
  async publish(ctx: OrgContext, published: boolean) {
    const org = await this.prisma.platform((tx) => tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }));
    await this.prisma.tenant(ctx, async (tx) => {
      const config = await tx.siteConfig.findUnique({ where: { organizationId: ctx.organizationId } });
      if (!config) throw new NotFoundException('Configure o site antes de publicar.');
      if (published && !config.brandName.trim()) throw new ConflictException('Informe o nome da marca antes de publicar.');
      await tx.siteConfig.update({ where: { organizationId: ctx.organizationId }, data: { published } });
      await this.audit.record(tx, ctx, { action: published ? 'site.published' : 'site.unpublished', entityType: 'SiteConfig', entityId: ctx.organizationId });
    });
    if (published) await this.prisma.platform((tx) => this.domains.ensureSubdomain(tx, org.id, org.slug));
    return this.get(ctx);
  }

  async leads(ctx: OrgContext, query: { page?: number; pageSize?: number; status?: string; kind?: string; q?: string }) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.kind ? { kind: query.kind as never } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }] } : {}),
      ...(ctx.allBranches ? {} : { OR: [{ branchId: null }, { branchId: { in: ctx.branchIds } }] }),
    };
    return this.prisma.tenant(ctx, async (tx) => {
      const [rows, total, categories, models] = await Promise.all([
        tx.lead.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        tx.lead.count({ where }),
        tx.vehicleCategory.findMany({ select: { id: true, name: true } }),
        tx.vehicleModel.findMany({ select: { id: true, name: true, make: { select: { name: true } } } }),
      ]);
      const cat = new Map(categories.map((c) => [c.id, c.name]));
      const mod = new Map(models.map((m) => [m.id, `${m.make.name} ${m.name}`]));
      return paginated(rows.map((l) => ({ ...l, categoryName: l.categoryId ? cat.get(l.categoryId) ?? null : null, modelName: l.modelId ? mod.get(l.modelId) ?? null : null })), total, page, pageSize);
    });
  }

  async updateLead(ctx: OrgContext, id: string, status: 'IN_PROGRESS' | 'DISCARDED' | 'NEW', reason?: string) {
    if (status === 'DISCARDED' && !reason) throw new BadRequestException('Informe o motivo do descarte.');
    return this.prisma.tenant(ctx, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundException('Pedido não encontrado.');
      if (lead.status === 'CONVERTED') throw new ConflictException('Pedido já convertido em reserva.');
      const updated = await tx.lead.update({ where: { id }, data: { status, handledById: ctx.userId } });
      await this.audit.record(tx, ctx, { action: 'site.lead_status', entityType: 'Lead', entityId: id, reason: reason ?? null, before: { status: lead.status }, after: { status } });
      return updated;
    });
  }
}

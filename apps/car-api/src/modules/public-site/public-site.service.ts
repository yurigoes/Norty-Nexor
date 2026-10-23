import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isValidEmail, onlyDigits, type LeadKind } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AvailabilityService } from '../../common/availability.service';
import { NotifyService } from '../../common/notify.service';
import { AuditService } from '../../common/audit.service';
import { num, numOrNull } from '../../common/serialize.interceptor';
import { loadConfig } from '../../config/env';
import { PricingService } from '../pricing/pricing.service';
import { normalizeHostname } from '../domains/domains.service';

export interface PublicLeadInput {
  kind: LeadKind;
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  categoryId?: string;
  modelId?: string;
  branchId?: string;
  startAt?: string;
  endAt?: string;
  consent: boolean;
  /** Campo-isca: invisível para pessoas, preenchido por robôs. */
  website?: string;
}

/**
 * Site público de cada locadora.
 *
 * Tudo aqui é anônimo, então a regra é de vitrine: modelos, fotos, tarifas
 * públicas e contagens de disponibilidade. Nunca placa, id de unidade,
 * cliente ou contrato. A empresa é resolvida pelo slug (ou pelo domínio)
 * antes de qualquer consulta, e todas as consultas seguintes usam esse id.
 */
@Injectable()
export class PublicSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
  ) {}

  /** Host → slug: domínio próprio verificado ou subdomínio Norty. */
  async resolveHost(raw: string): Promise<{ slug: string }> {
    const hostname = normalizeHostname(raw);
    const base = loadConfig().siteBaseDomain;
    const result = await this.prisma.platform(async (tx) => {
      const domain = await tx.domain.findUnique({ where: { hostname }, include: { organization: { select: { slug: true } } } });
      if (domain && ['ACTIVE', 'VERIFIED'].includes(domain.status)) return domain.organization.slug;
      if (hostname.endsWith(`.${base}`)) {
        const slug = hostname.slice(0, -base.length - 1);
        if (!slug.includes('.')) return slug;
      }
      return null;
    });
    if (!result) throw new NotFoundException('Site não encontrado.');
    await this.site(result);
    return { slug: result };
  }

  /** Empresa do site, se ativa e com o site publicado. Senão, 404 — sem dizer por quê. */
  async site(slug: string) {
    const found = await this.prisma.platform((tx) => tx.organization.findUnique({ where: { slug }, include: { siteConfig: true } }));
    if (!found || !['ACTIVE', 'TRIAL'].includes(found.status) || !found.siteConfig?.published) throw new NotFoundException('Site não encontrado.');
    return { organization: found, config: found.siteConfig };
  }

  private scope<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.tenant({ organizationId }, fn);
  }

  async home(slug: string) {
    const { organization, config } = await this.site(slug);
    return this.scope(organization.id, async (tx) => {
      const [branches, categories, rates, extras, domain] = await Promise.all([
        tx.branch.findMany({ where: { active: true, publicVisible: true }, orderBy: { name: 'asc' } }),
        tx.vehicleCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
        tx.rateTable.findMany({ where: { active: true, publicVisible: true, branchId: null } }),
        tx.extraService.findMany({ where: { active: true, publicVisible: true }, orderBy: { name: 'asc' } }),
        this.prisma.platform((p) => p.domain.findFirst({ where: { organizationId: organization.id, status: 'ACTIVE', isPrimary: true } })),
      ]);
      return {
        slug: organization.slug,
        name: config.brandName || organization.name,
        legalName: organization.legalName,
        document: organization.document,
        logoFileId: config.logoFileId,
        bannerFileId: config.bannerFileId,
        primaryColor: config.primaryColor,
        accentColor: config.accentColor,
        heroTitle: config.heroTitle,
        heroSubtitle: config.heroSubtitle,
        about: config.about,
        faq: Array.isArray(config.faq) ? config.faq : [],
        terms: config.terms,
        privacy: config.privacy,
        whatsapp: config.whatsapp ? onlyDigits(config.whatsapp) : null,
        phone: config.phone,
        email: config.email,
        citiesServed: config.citiesServed,
        featuredModelIds: config.featuredModelIds,
        seoTitle: config.seoTitle,
        seoDescription: config.seoDescription,
        primaryDomain: domain?.hostname ?? null,
        branches: branches.map((b) => ({ id: b.id, name: b.name, city: b.city, state: b.state, street: b.street, number: b.number, district: b.district, phone: b.phone })),
        categories: categories.map((c) => {
          const rate = rates.find((r) => r.categoryId === c.id);
          return {
            id: c.id, name: c.name,
            fromDaily: rate ? num(rate.dailyRate) : null,
            weekly: rate ? numOrNull(rate.weeklyRate) : null,
            longTermMonthly: rate ? numOrNull(rate.longTermMonthly) : null,
            longTermKmPerMonth: rate?.longTermKmPerMonth ?? null,
            includedKmPerDay: rate?.includedKmPerDay ?? null,
            extraKmRate: rate ? numOrNull(rate.extraKmRate) : null,
            depositAmount: rate ? num(rate.depositAmount) : null,
            lateGraceMinutes: rate?.lateGraceMinutes ?? null,
          };
        }),
        extras: extras.map((e) => ({ id: e.id, name: e.name, description: e.description, pricing: e.pricing, price: num(e.price) })),
      };
    });
  }

  /**
   * Catálogo. Com período, cada modelo e cada cor dizem se há unidade
   * livre — quantas, no máximo. As placas nunca saem daqui.
   */
  async models(slug: string, q: { startAt?: string; endAt?: string; categoryId?: string; branchId?: string }) {
    const { organization } = await this.site(slug);
    const period = parsePeriod(q.startAt, q.endAt);
    return this.scope(organization.id, async (tx) => {
      const models = await tx.vehicleModel.findMany({
        where: { publicVisible: true, active: true, ...(q.categoryId ? { categoryId: q.categoryId } : {}) },
        include: { make: true, category: true, versions: { orderBy: { name: 'asc' } } },
        orderBy: [{ make: { name: 'asc' } }, { name: 'asc' }],
      });
      const units = await tx.vehicleUnit.findMany({
        where: { publicVisible: true, deletedAt: null, commercialStatus: { notIn: ['SOLD', 'FOR_SALE'] }, ...(q.branchId ? { branchId: q.branchId } : {}) },
        select: { id: true, modelId: true, color: true, branch: { select: { publicVisible: true } } },
      });
      const visibleUnits = units.filter((u) => u.branch.publicVisible);
      const free = period
        ? new Set((await this.availability.findAvailable(tx, organization.id, { startAt: period.start, endAt: period.end, branchId: q.branchId, categoryId: q.categoryId })).map((u) => u.id))
        : null;
      const rates = await tx.rateTable.findMany({ where: { active: true, publicVisible: true, branchId: null } });
      return models.map((m) => {
        const mine = visibleUnits.filter((u) => u.modelId === m.id);
        const colors = [...new Set(mine.map((u) => u.color))].sort();
        const rate = rates.find((r) => r.categoryId === m.categoryId);
        return {
          id: m.id, name: m.name, make: m.make.name, category: { id: m.category.id, name: m.category.name },
          bodyType: m.bodyType, seats: m.seats, doors: m.doors, trunkLiters: m.trunkLiters,
          coverFileId: m.coverFileId, hasModel3d: Boolean(m.model3dFileId),
          versions: m.versions.map((v) => ({ id: v.id, name: v.name, engine: v.engine, fuel: v.fuel, transmission: v.transmission })),
          fromDaily: rate ? num(rate.dailyRate) : null,
          fleetSize: mine.length > 0,
          colors: colors.map((color) => ({
            color,
            available: free ? mine.some((u) => u.color === color && free.has(u.id)) : null,
          })),
          available: free ? mine.some((u) => free.has(u.id)) : null,
          availableCount: free ? mine.filter((u) => free.has(u.id)).length : null,
        };
      });
    });
  }

  async model(slug: string, id: string, q: { startAt?: string; endAt?: string }) {
    const list = await this.models(slug, { startAt: q.startAt, endAt: q.endAt });
    const summary = list.find((m) => m.id === id);
    if (!summary) throw new NotFoundException('Modelo não encontrado.');
    const { organization } = await this.site(slug);
    return this.scope(organization.id, async (tx) => {
      const m = await tx.vehicleModel.findUniqueOrThrow({ where: { id } });
      const photos = await tx.fileAsset.findMany({ where: { entityType: 'VehicleModel', entityId: id, category: 'photo', deletedAt: null }, orderBy: { createdAt: 'asc' } });
      return {
        ...summary,
        description: m.description,
        tankLiters: m.tankLiters,
        specs: m.specs,
        hotspots: Array.isArray(m.hotspots) ? m.hotspots : [],
        model3dFileId: m.model3dFileId,
        photoFileIds: [...(m.coverFileId ? [m.coverFileId] : []), ...photos.map((p) => p.id).filter((pid) => pid !== m.coverFileId)],
      };
    });
  }

  async quote(slug: string, input: { categoryId: string; branchId?: string; startAt: string; endAt: string; extras?: { extraServiceId: string; quantity: number }[]; additionalDrivers?: number }) {
    const { organization } = await this.site(slug);
    const period = parsePeriod(input.startAt, input.endAt);
    if (!period) throw new BadRequestException('Informe retirada e devolução.');
    if (period.start.getTime() < Date.now() - 3_600_000) throw new BadRequestException('A retirada precisa ser no futuro.');
    return this.scope(organization.id, (tx) => this.pricing.quote(tx, organization.id, {
      categoryId: input.categoryId, branchId: input.branchId, startAt: period.start, endAt: period.end,
      extras: input.extras, additionalDrivers: input.additionalDrivers, publicOnly: true,
    }));
  }

  /**
   * Pedido do site. Não é reserva: entra como pedido para a equipe
   * conferir disponibilidade e confirmar. O valor anexado é a cotação
   * calculada aqui, nunca um número vindo do navegador.
   */
  async createLead(slug: string, input: PublicLeadInput): Promise<{ received: true }> {
    // Robô preencheu o campo invisível: responde igual, não grava nada.
    if (input.website) return { received: true };
    if (!input.consent) throw new BadRequestException('É preciso concordar com o uso dos dados para atendimento (LGPD).');
    if (!input.email && !input.phone) throw new BadRequestException('Informe e-mail ou telefone para contato.');
    if (input.email && !isValidEmail(input.email)) throw new BadRequestException('E-mail inválido.');
    const { organization } = await this.site(slug);
    const period = parsePeriod(input.startAt, input.endAt);
    let quote: Prisma.InputJsonValue | undefined;
    if (period && input.categoryId) {
      try {
        quote = (await this.quote(slug, { categoryId: input.categoryId, branchId: input.branchId, startAt: input.startAt!, endAt: input.endAt! })) as unknown as Prisma.InputJsonValue;
      } catch {
        quote = undefined;
      }
    }
    await this.scope(organization.id, async (tx) => {
      if (input.categoryId && !(await tx.vehicleCategory.findUnique({ where: { id: input.categoryId } }))) throw new BadRequestException('Categoria inválida.');
      if (input.modelId && !(await tx.vehicleModel.findFirst({ where: { id: input.modelId, publicVisible: true } }))) throw new BadRequestException('Modelo inválido.');
      if (input.branchId && !(await tx.branch.findFirst({ where: { id: input.branchId, publicVisible: true } }))) throw new BadRequestException('Filial inválida.');
      const lead = await tx.lead.create({
        data: {
          organizationId: organization.id, branchId: input.branchId ?? null, kind: input.kind, name: input.name.trim(),
          email: input.email?.trim().toLowerCase() ?? null, phone: input.phone?.trim() ?? null, message: input.message?.trim() ?? null,
          categoryId: input.categoryId ?? null, modelId: input.modelId ?? null,
          startAt: period?.start ?? null, endAt: period?.end ?? null, quote, consent: true,
        },
      });
      await this.notify.notify(tx, organization.id, {
        type: 'site.lead', severity: input.kind === 'RESERVATION_REQUEST' ? 'WARNING' : 'INFO',
        title: input.kind === 'RESERVATION_REQUEST' ? 'Novo pedido de reserva pelo site' : 'Novo contato pelo site',
        body: `${lead.name}${period ? ` · ${period.start.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}`,
        link: `/locacoes/pedidos-site?id=${lead.id}`, audiencePermission: 'leads.manage', branchId: lead.branchId, dedupeKey: `lead:${lead.id}`,
      });
      await this.audit.record(tx, null, { action: 'site.lead_received', entityType: 'Lead', entityId: lead.id, organizationId: organization.id, actorType: 'PUBLIC', after: { kind: lead.kind } });
    });
    return { received: true };
  }

  async shareData(slug: string, modelId?: string) {
    const home = await this.home(slug);
    if (!modelId) return { title: home.seoTitle ?? home.name, description: home.seoDescription ?? home.heroSubtitle ?? `Aluguel de carros com ${home.name}.`, imageFileId: home.bannerFileId ?? home.logoFileId, path: '' };
    const m = await this.model(slug, modelId, {});
    return { title: `${m.make} ${m.name} — ${home.name}`, description: m.description ?? `Alugue o ${m.make} ${m.name} com ${home.name}.`, imageFileId: m.coverFileId, path: `/modelos/${m.id}` };
  }
}

function parsePeriod(startAt?: string, endAt?: string): { start: Date; end: Date } | null {
  if (!startAt || !endAt) return null;
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Período inválido.');
  if (end <= start) throw new BadRequestException('A devolução precisa ser posterior à retirada.');
  if (end.getTime() - start.getTime() > 400 * 86_400_000) throw new BadRequestException('Período longo demais para consulta.');
  return { start, end };
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { computeQuote, PricingError, type Quote, type QuoteExtra } from '@nortycar/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { num, numOrNull } from '../../common/serialize.interceptor';
import type { OrgContext } from '../../common/context';
import type { ExtraServiceDto, RateTableDto, UpdateExtraServiceDto, UpdateRateTableDto } from './dto';

export interface QuoteInput {
  categoryId: string;
  branchId?: string | null;
  startAt: Date;
  endAt: Date;
  extras?: { extraServiceId: string; quantity: number }[];
  additionalDrivers?: number;
  discountPercent?: number;
  /** Site público: só tarifas e extras marcados como públicos. */
  publicOnly?: boolean;
}

export interface QuoteResult extends Quote {
  rateTableId: string;
  categoryId: string;
  extras: (QuoteExtra & { extraServiceId: string })[];
  computedAt: string;
}

/**
 * Tarifas e cotação. A cotação é sempre calculada aqui, com as regras
 * gravadas no banco — reserva, contrato e site público usam este mesmo
 * método, e nenhum deles aceita um preço vindo do navegador.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Tarifa da filial, se houver; senão a tarifa geral da categoria. */
  async resolveRate(tx: Tx, organizationId: string, categoryId: string, branchId?: string | null, publicOnly = false) {
    const where = { organizationId, categoryId, active: true, ...(publicOnly ? { publicVisible: true } : {}) };
    const specific = branchId ? await tx.rateTable.findFirst({ where: { ...where, branchId } }) : null;
    const rate = specific ?? (await tx.rateTable.findFirst({ where: { ...where, branchId: null } }));
    if (!rate) throw new BadRequestException('Não há tarifa ativa configurada para esta categoria.');
    return rate;
  }

  async quote(tx: Tx, organizationId: string, input: QuoteInput): Promise<QuoteResult> {
    const rate = await this.resolveRate(tx, organizationId, input.categoryId, input.branchId, input.publicOnly);
    const requested = input.extras ?? [];
    const services = requested.length
      ? await tx.extraService.findMany({ where: { organizationId, id: { in: requested.map((e) => e.extraServiceId) }, active: true, ...(input.publicOnly ? { publicVisible: true } : {}) } })
      : [];
    if (services.length !== new Set(requested.map((e) => e.extraServiceId)).size) throw new BadRequestException('Serviço adicional inválido ou inativo.');
    const extras = requested.map((e) => {
      const s = services.find((x) => x.id === e.extraServiceId)!;
      return { extraServiceId: s.id, name: s.name, pricing: s.pricing, price: num(s.price), quantity: e.quantity };
    });
    try {
      const quote = computeQuote({
        startAt: input.startAt,
        endAt: input.endAt,
        rate: {
          dailyRate: num(rate.dailyRate),
          weeklyRate: numOrNull(rate.weeklyRate),
          monthlyRate: numOrNull(rate.monthlyRate),
          includedKmPerDay: rate.includedKmPerDay,
          extraKmRate: numOrNull(rate.extraKmRate),
          additionalDriverDaily: num(rate.additionalDriverDaily),
          lateGraceMinutes: rate.lateGraceMinutes,
          depositAmount: num(rate.depositAmount),
        },
        extras,
        additionalDrivers: input.additionalDrivers ?? 0,
        discountPercent: input.discountPercent ?? 0,
      });
      return { ...quote, rateTableId: rate.id, categoryId: input.categoryId, extras, computedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof PricingError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /* ---------------- Cadastro de tarifas ---------------- */

  rates(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.rateTable.findMany({ include: { category: true }, orderBy: [{ category: { name: 'asc' } }, { branchId: 'asc' }] }));
  }

  async createRate(ctx: OrgContext, dto: RateTableDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      await this.assertRefs(tx, ctx, dto.categoryId, dto.branchId);
      if (dto.weeklyRate && dto.weeklyRate > dto.dailyRate * 7) throw new BadRequestException('O pacote semanal não pode custar mais que 7 diárias.');
      const existing = await tx.rateTable.findFirst({ where: { categoryId: dto.categoryId, branchId: dto.branchId ?? null } });
      if (existing) throw new ConflictException('Já existe tarifa para esta categoria nesta filial. Edite a existente.');
      const rate = await tx.rateTable.create({ data: { ...dto, branchId: dto.branchId ?? null, organizationId: ctx.organizationId } as Prisma.RateTableUncheckedCreateInput });
      await this.audit.record(tx, ctx, { action: 'pricing.rate_created', entityType: 'RateTable', entityId: rate.id, branchId: rate.branchId, after: dto });
      return rate;
    });
  }

  async updateRate(ctx: OrgContext, id: string, dto: UpdateRateTableDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.rateTable.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Tarifa não encontrada.');
      const daily = dto.dailyRate ?? num(before.dailyRate);
      const weekly = dto.weeklyRate === undefined ? numOrNull(before.weeklyRate) : dto.weeklyRate;
      if (weekly && weekly > daily * 7) throw new BadRequestException('O pacote semanal não pode custar mais que 7 diárias.');
      const rate = await tx.rateTable.update({ where: { id }, data: dto as Prisma.RateTableUpdateInput });
      // Mudança de preço é sensível: guarda antes e depois.
      await this.audit.record(tx, ctx, { action: 'pricing.rate_updated', entityType: 'RateTable', entityId: id, branchId: before.branchId, ...AuditService.diff(before as never, dto as never) });
      return rate;
    });
  }

  extras(ctx: OrgContext) {
    return this.prisma.tenant(ctx, (tx) => tx.extraService.findMany({ orderBy: { name: 'asc' } }));
  }

  async createExtra(ctx: OrgContext, dto: ExtraServiceDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const extra = await tx.extraService.create({ data: { ...dto, organizationId: ctx.organizationId } });
      await this.audit.record(tx, ctx, { action: 'pricing.extra_created', entityType: 'ExtraService', entityId: extra.id, after: dto });
      return extra;
    });
  }

  async updateExtra(ctx: OrgContext, id: string, dto: UpdateExtraServiceDto) {
    return this.prisma.tenant(ctx, async (tx) => {
      const before = await tx.extraService.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Serviço adicional não encontrado.');
      const extra = await tx.extraService.update({ where: { id }, data: dto });
      await this.audit.record(tx, ctx, { action: 'pricing.extra_updated', entityType: 'ExtraService', entityId: id, ...AuditService.diff(before as never, dto as never) });
      return extra;
    });
  }

  private async assertRefs(tx: Tx, ctx: OrgContext, categoryId: string, branchId?: string | null) {
    if (!(await tx.vehicleCategory.findUnique({ where: { id: categoryId } }))) throw new BadRequestException('Categoria inválida.');
    if (branchId) {
      if (!(await tx.branch.findUnique({ where: { id: branchId } }))) throw new BadRequestException('Filial inválida.');
      if (!ctx.allBranches && !ctx.branchIds.includes(branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
    }
  }
}

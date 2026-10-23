import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { formatPlate, onlyDigits, maskDocument, formatDocument } from '@nortycar/shared';
import { PrismaService } from '../../common/prisma.service';
import { OrgCtx, type OrgContext } from '../../common/context';
import { date } from '../reports/format';

export interface SearchHit {
  type: 'vehicle' | 'customer' | 'contract' | 'work_order' | 'reservation';
  id: string;
  title: string;
  subtitle?: string;
  link: string;
}

const LIMIT = 5;

/**
 * Busca global. Cada tipo só entra se o usuário tem a permissão de ver
 * aquele cadastro, e sempre dentro das filiais autorizadas. A transação
 * escopada (RLS) garante que nada de outra empresa aparece.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(ctx: OrgContext, raw: string): Promise<SearchHit[]> {
    const q = raw.trim();
    if (q.length < 2) return [];
    const plate = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const digits = onlyDigits(q);
    const branch = ctx.allBranches ? {} : { branchId: { in: ctx.branchIds } };
    const can = (p: string) => ctx.permissions.has(p);

    return this.prisma.tenant(ctx, async (tx) => {
      const hits: SearchHit[] = [];
      if (can('fleet.view')) {
        const vehicles = await tx.vehicleUnit.findMany({
          where: {
            ...branch, deletedAt: null,
            OR: [
              ...(plate.length >= 2 ? [{ plate: { contains: plate } }] : []),
              { internalCode: { contains: q, mode: 'insensitive' } },
              ...(digits.length >= 4 ? [{ renavam: { contains: digits } }] : []),
              { model: { name: { contains: q, mode: 'insensitive' } } },
            ],
          },
          include: { model: { select: { name: true, make: { select: { name: true } } } } },
          take: LIMIT,
        });
        hits.push(...vehicles.map((v) => ({
          type: 'vehicle' as const, id: v.id, title: formatPlate(v.plate), subtitle: `${v.model.make.name} ${v.model.name} · ${v.internalCode}`, link: `/frota/veiculos/${v.id}`,
        })));
      }
      if (can('customers.view')) {
        const customers = await tx.customer.findMany({
          where: {
            deletedAt: null, anonymizedAt: null,
            OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ document: { contains: digits } }] : []), { email: { contains: q, mode: 'insensitive' } }],
          },
          take: LIMIT,
        });
        const full = can('customers.sensitive');
        hits.push(...customers.map((c) => ({
          type: 'customer' as const, id: c.id, title: c.name, subtitle: full ? formatDocument(c.document) : maskDocument(c.document), link: `/pessoas/clientes/${c.id}`,
        })));
      }
      if (can('contracts.view')) {
        const contracts = await tx.rentalContract.findMany({
          where: {
            ...branch,
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
              ...(plate.length >= 3 ? [{ vehicles: { some: { vehicle: { plate: { contains: plate } } } } }] : []),
            ],
          },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
        });
        hits.push(...contracts.map((c) => ({
          type: 'contract' as const, id: c.id, title: c.number, subtitle: `${c.customer.name} · até ${date(c.endAt)}`, link: `/locacoes/contratos/${c.id}`,
        })));
      }
      if (can('reservations.view')) {
        const reservations = await tx.reservation.findMany({
          where: { ...branch, OR: [{ code: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] },
          include: { customer: { select: { name: true } } },
          orderBy: { startAt: 'desc' },
          take: LIMIT,
        });
        hits.push(...reservations.map((r) => ({
          type: 'reservation' as const, id: r.id, title: r.code, subtitle: `${r.customer.name} · retirada ${date(r.startAt)}`, link: `/locacoes/reservas?id=${r.id}`,
        })));
      }
      if (can('maintenance.view')) {
        const orders = await tx.workOrder.findMany({
          where: { ...branch, OR: [{ number: { contains: q, mode: 'insensitive' } }, ...(plate.length >= 3 ? [{ vehicle: { plate: { contains: plate } } }] : [])] },
          include: { vehicle: { select: { plate: true } } },
          orderBy: { openedAt: 'desc' },
          take: LIMIT,
        });
        hits.push(...orders.map((w) => ({
          type: 'work_order' as const, id: w.id, title: w.number, subtitle: `${formatPlate(w.vehicle.plate)} · ${w.description.slice(0, 60)}`, link: `/operacao/ordens-servico/${w.id}`,
        })));
      }
      return hits;
    });
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@OrgCtx() ctx: OrgContext, @Query('q') q?: string) {
    if (q && q.length > 120) throw new BadRequestException('Busca longa demais.');
    return this.search.search(ctx, q ?? '');
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}

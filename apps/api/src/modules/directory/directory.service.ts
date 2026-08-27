import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async towers(condominiumId: string) {
    const towers = await this.prisma.tower.findMany({
      where: { condominiumId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { units: true } } },
    });
    return towers.map((t) => ({
      id: t.id,
      condominiumId: t.condominiumId,
      name: t.name,
      floors: t.floors,
      unitsPerFloor: t.unitsPerFloor,
      unitsCount: t._count.units,
    }));
  }

  async units(condominiumId: string, query: PageQueryDto, towerId?: string) {
    const where = {
      condominiumId,
      ...(towerId ? { towerId } : {}),
      ...(query.q
        ? {
            OR: [
              { label: { contains: query.q, mode: 'insensitive' as const } },
              { ownerName: { contains: query.q, mode: 'insensitive' as const } },
              { block: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        orderBy: [{ block: 'asc' }, { label: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.unit.count({ where }),
    ]);

    return paginated(rows.map(serializeUnit), total, query);
  }

  async unit(condominiumId: string, id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, condominiumId },
      include: {
        tower: true,
        residents: { where: { active: true }, orderBy: { isMainContact: 'desc' } },
        vehicles: true,
      },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    return {
      ...serializeUnit(unit),
      tower: unit.tower.name,
      residents: unit.residents,
      vehicles: unit.vehicles,
    };
  }

  async residents(condominiumId: string, query: PageQueryDto, unitId?: string) {
    const where = {
      condominiumId,
      ...(unitId ? { unitId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { document: { contains: query.q } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.resident.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.pageSize,
        include: { unit: { select: { label: true, block: true } } },
      }),
      this.prisma.resident.count({ where }),
    ]);

    return paginated(items, total, query);
  }

  /** Busca única da portaria: morador, unidade, placa ou visitante. */
  async search(condominiumId: string, term: string) {
    const q = term.trim();
    if (q.length < 2) return { residents: [], units: [], vehicles: [], visitors: [] };

    const like = { contains: q, mode: 'insensitive' as const };
    const [residents, units, vehicles, visitors] = await Promise.all([
      this.prisma.resident.findMany({
        where: { condominiumId, OR: [{ name: like }, { document: { contains: q } }, { phone: { contains: q } }] },
        take: 8,
        include: { unit: { select: { label: true, block: true } } },
      }),
      this.prisma.unit.findMany({
        where: { condominiumId, OR: [{ label: like }, { ownerName: like }] },
        take: 8,
      }),
      this.prisma.vehicle.findMany({
        where: { condominiumId, OR: [{ plate: like }, { ownerName: like }, { model: like }] },
        take: 8,
      }),
      this.prisma.visitor.findMany({
        where: { condominiumId, OR: [{ name: like }, { document: { contains: q } }, { code: like }] },
        take: 8,
        include: { unit: { select: { label: true, block: true } } },
      }),
    ]);

    return { residents, units: units.map(serializeUnit), vehicles, visitors };
  }
}

function serializeUnit(unit: {
  id: string; condominiumId: string; towerId: string; label: string; floor: number;
  block: string; bedrooms: number; area: number; status: string; ownerName: string;
  parkingSpots: string[]; monthlyFee: unknown;
}) {
  return {
    id: unit.id,
    condominiumId: unit.condominiumId,
    towerId: unit.towerId,
    label: unit.label,
    floor: unit.floor,
    block: unit.block,
    bedrooms: unit.bedrooms,
    area: unit.area,
    status: unit.status,
    ownerName: unit.ownerName,
    parkingSpots: unit.parkingSpots,
    // Decimal do Prisma não é serializável em JSON; vira número aqui,
    // uma vez, em vez de espalhar `Number(...)` por toda a interface.
    monthlyFee: Number(unit.monthlyFee),
  };
}

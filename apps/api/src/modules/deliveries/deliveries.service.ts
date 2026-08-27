import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';
import type { RequestUser } from '../../common/types';
import type { CreateDeliveryDto, PickupDeliveryDto } from './dto';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, condominiumId: string, query: PageQueryDto, status?: string) {
    const where = {
      condominiumId,
      ...(user.role === 'morador' && user.unitId ? { unitId: user.unitId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(query.q
        ? {
            OR: [
              { carrier: { contains: query.q, mode: 'insensitive' as const } },
              { trackingCode: { contains: query.q, mode: 'insensitive' as const } },
              { shelf: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.delivery.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: { unit: { select: { label: true, block: true } } },
      }),
      this.prisma.delivery.count({ where }),
    ]);

    return paginated(items, total, query);
  }

  async create(user: RequestUser, condominiumId: string, dto: CreateDeliveryDto) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, condominiumId },
      include: { residents: { where: { active: true, isMainContact: true }, take: 1 } },
    });
    if (!unit) throw new BadRequestException('Unidade não encontrada neste condomínio.');

    const delivery = await this.prisma.delivery.create({
      data: {
        condominiumId,
        unitId: unit.id,
        residentId: unit.residents[0]?.id,
        carrier: dto.carrier.trim(),
        trackingCode: dto.trackingCode.trim(),
        size: dto.size,
        shelf: dto.shelf.trim(),
        requiresSignature: dto.requiresSignature ?? false,
        notes: dto.notes,
        status: 'notificada',
        receivedBy: user.name,
      },
    });

    await this.notifications.push({
      condominiumId,
      unitId: unit.id,
      kind: 'encomenda',
      title: 'Encomenda na portaria',
      body: `${delivery.carrier} · prateleira ${delivery.shelf}. Retire quando puder.`,
      link: '/app/encomendas',
      refId: delivery.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Registrou encomenda',
      target: `${delivery.carrier} · ${unit.block}-${unit.label}`,
      module: 'Encomendas',
    });

    return delivery;
  }

  async pickup(user: RequestUser, condominiumId: string, id: string, dto: PickupDeliveryDto) {
    const delivery = await this.prisma.delivery.findFirst({ where: { id, condominiumId } });
    if (!delivery) throw new NotFoundException('Encomenda não encontrada.');
    if (delivery.status === 'retirada') throw new BadRequestException('Encomenda já foi retirada.');

    const updated = await this.prisma.delivery.update({
      where: { id },
      data: { status: 'retirada', pickedUpAt: new Date(), pickedUpBy: dto.pickedUpBy.trim() },
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Registrou retirada de encomenda',
      target: delivery.carrier,
      detail: `Retirada por ${dto.pickedUpBy}`,
      module: 'Encomendas',
    });

    return updated;
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';
import type { RequestUser } from '../../common/types';
import type { CreateReservationDto } from './dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  areas(condominiumId: string) {
    return this.prisma.commonArea.findMany({
      where: { condominiumId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Horários livres de uma área numa data. */
  async availability(condominiumId: string, areaId: string, date: string) {
    const area = await this.prisma.commonArea.findFirst({ where: { id: areaId, condominiumId } });
    if (!area) throw new NotFoundException('Área não encontrada.');

    const day = new Date(date);
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Data inválida.');

    // Dia fechado é diferente de dia lotado: a resposta distingue os
    // dois para a tela poder explicar o motivo ao morador.
    if (!area.openDays.includes(day.getUTCDay())) {
      return { areaId, date, closed: true, slots: [] };
    }

    const taken = await this.prisma.reservation.findMany({
      where: {
        areaId,
        date: day,
        status: { in: ['pendente', 'confirmada'] },
      },
      select: { slot: true },
    });
    const busy = new Set(taken.map((r) => r.slot));

    return {
      areaId,
      date,
      closed: false,
      slots: area.slots.map((slot) => ({ slot, available: !busy.has(slot) })),
    };
  }

  async list(user: RequestUser, condominiumId: string, query: PageQueryDto, status?: string) {
    const where = {
      condominiumId,
      ...(user.role === 'morador' && user.unitId ? { unitId: user.unitId } : {}),
      ...(status ? { status: status as never } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          area: { select: { name: true, kind: true } },
          unit: { select: { label: true, block: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return paginated(items.map(serialize), total, query);
  }

  async create(user: RequestUser, condominiumId: string, dto: CreateReservationDto) {
    const unitId = user.role === 'morador' ? user.unitId : (dto.unitId ?? user.unitId);
    if (!unitId) throw new BadRequestException('Informe a unidade da reserva.');

    const area = await this.prisma.commonArea.findFirst({
      where: { id: dto.areaId, condominiumId, active: true },
    });
    if (!area) throw new NotFoundException('Área não encontrada.');
    if (dto.guests > area.capacity) {
      throw new BadRequestException(`A ${area.name} comporta até ${area.capacity} pessoas.`);
    }

    const day = new Date(dto.date);
    if (!area.openDays.includes(day.getUTCDay())) {
      throw new BadRequestException(`A ${area.name} não abre neste dia da semana.`);
    }
    if (!area.slots.includes(dto.slot)) {
      throw new BadRequestException('Horário indisponível para esta área.');
    }

    const resident = await this.prisma.resident.findFirst({
      where: { condominiumId, unitId, active: true },
      orderBy: { isMainContact: 'desc' },
    });
    if (!resident) throw new BadRequestException('A unidade não tem morador ativo cadastrado.');

    try {
      const reservation = await this.prisma.reservation.create({
        data: {
          condominiumId,
          areaId: area.id,
          unitId,
          residentId: resident.id,
          date: day,
          slot: dto.slot,
          guests: dto.guests,
          fee: area.fee,
          notes: dto.notes,
          // Área com aprovação automática confirma na hora; as demais
          // entram como pendentes e esperam o síndico.
          status: area.autoApprove ? 'confirmada' : 'pendente',
        },
        include: { area: { select: { name: true, kind: true } } },
      });

      if (!area.autoApprove) {
        await this.notifications.push({
          condominiumId,
          role: 'sindico',
          kind: 'reserva',
          title: 'Reserva aguardando aprovação',
          body: `${area.name} · ${dto.date} ${dto.slot} — ${resident.name}.`,
          link: '/gestao/reservas',
          refId: reservation.id,
        });
      }

      await this.audit.record({
        condominiumId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'Criou reserva',
        target: area.name,
        detail: `${dto.date} · ${dto.slot}`,
        module: 'Reservas',
      });

      return serialize(reservation);
    } catch (error) {
      // A unicidade (área, data, horário) vive no banco. Duas
      // requisições simultâneas para o mesmo horário chegam aqui — e é
      // o banco, não a aplicação, que decide qual das duas vence.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este horário acabou de ser reservado. Escolha outro.');
      }
      throw error;
    }
  }

  async decide(
    user: RequestUser,
    condominiumId: string,
    id: string,
    status: 'confirmada' | 'recusada',
    reason?: string,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, condominiumId },
      include: { area: { select: { name: true } } },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada.');

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status, notes: reason ?? reservation.notes },
      include: { area: { select: { name: true, kind: true } } },
    });

    await this.notifications.push({
      condominiumId,
      unitId: reservation.unitId,
      kind: 'reserva',
      title: status === 'confirmada' ? 'Reserva confirmada' : 'Reserva recusada',
      body: `${reservation.area.name} · ${reservation.date.toISOString().slice(0, 10)} ${reservation.slot}`,
      link: '/app/reservas',
      refId: reservation.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: status === 'confirmada' ? 'Confirmou reserva' : 'Recusou reserva',
      target: reservation.area.name,
      detail: reason,
      module: 'Reservas',
    });

    return serialize(updated);
  }

  async cancel(user: RequestUser, condominiumId: string, id: string) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id, condominiumId } });
    if (!reservation) throw new NotFoundException('Reserva não encontrada.');
    if (user.role === 'morador' && reservation.unitId !== user.unitId) {
      throw new ForbiddenException('Esta reserva não é da sua unidade.');
    }

    // O registro é cancelado, não apagado: a unicidade de horário
    // continua valendo só para reservas vivas, e o histórico permanece.
    return this.prisma.reservation.update({
      where: { id },
      data: { status: 'cancelada' },
    });
  }
}

function serialize<T extends { fee: unknown; date: Date }>(reservation: T) {
  return {
    ...reservation,
    fee: Number(reservation.fee),
    date: reservation.date.toISOString().slice(0, 10),
  };
}

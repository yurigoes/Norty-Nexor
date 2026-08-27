import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';
import type { RequestUser } from '../../common/types';
import type { AddTicketUpdateDto, CreateTicketDto } from './dto';

@Injectable()
export class TicketsService {
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
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { code: { contains: query.q, mode: 'insensitive' as const } },
              { category: { contains: query.q, mode: 'insensitive' as const } },
              { location: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: { unit: { select: { label: true, block: true } } },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return paginated(items, total, query);
  }

  async detail(user: RequestUser, condominiumId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, condominiumId },
      include: {
        updates: { orderBy: { at: 'asc' } },
        unit: { select: { label: true, block: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    if (user.role === 'morador' && ticket.unitId !== user.unitId) {
      throw new ForbiddenException('Este chamado não é da sua unidade.');
    }
    return ticket;
  }

  async create(user: RequestUser, condominiumId: string, dto: CreateTicketDto) {
    const unitId = user.role === 'morador' ? user.unitId : (dto.unitId ?? user.unitId);
    const code = await this.nextCode(condominiumId);

    const ticket = await this.prisma.ticket.create({
      data: {
        condominiumId,
        unitId,
        code,
        category: dto.category,
        location: dto.location,
        title: dto.title.trim(),
        description: dto.description.trim(),
        priority: dto.priority,
        openedBy: user.name,
        openedById: user.id,
        updates: {
          create: { author: user.name, message: 'Chamado aberto.', status: 'aberto' },
        },
      },
      include: { updates: true },
    });

    await this.notifications.push({
      condominiumId,
      role: 'sindico',
      kind: 'chamado',
      title: 'Novo chamado aberto',
      body: `${ticket.code} · ${ticket.title} — ${ticket.location}`,
      link: '/gestao/chamados',
      refId: ticket.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Abriu chamado',
      target: `${ticket.code} · ${ticket.title}`,
      module: 'Chamados',
    });

    return ticket;
  }

  async addUpdate(user: RequestUser, condominiumId: string, id: string, dto: AddTicketUpdateDto) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id, condominiumId } });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');

    const closing = dto.status === 'resolvido' || dto.status === 'cancelado';
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        status: dto.status ?? ticket.status,
        assignedTo: dto.assignedTo ?? ticket.assignedTo,
        closedAt: closing ? new Date() : ticket.closedAt,
        updates: { create: { author: user.name, message: dto.message.trim(), status: dto.status } },
      },
      include: { updates: { orderBy: { at: 'asc' } } },
    });

    if (ticket.unitId) {
      await this.notifications.push({
        condominiumId,
        unitId: ticket.unitId,
        kind: 'chamado',
        title: closing ? 'Chamado encerrado' : 'Chamado atualizado',
        body: `${ticket.code} · ${dto.message.slice(0, 120)}`,
        link: '/app/chamados',
        refId: ticket.id,
      });
    }

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: closing ? 'Encerrou chamado' : 'Atualizou chamado',
      target: ticket.code,
      detail: dto.message,
      module: 'Chamados',
    });

    return updated;
  }

  /**
   * Sequência por condomínio. Conta os existentes em vez de manter um
   * contador porque a numeração é informativa: um buraco eventual não
   * quebra nada, e um contador separado poderia dessincronizar.
   */
  private async nextCode(condominiumId: string): Promise<string> {
    const count = await this.prisma.ticket.count({ where: { condominiumId } });
    return `CH-${String(count + 1).padStart(5, '0')}`;
  }
}

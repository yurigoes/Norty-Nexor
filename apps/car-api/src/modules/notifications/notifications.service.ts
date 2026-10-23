import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma.service';
import { pageArgs, paginated } from '../../common/pagination';
import type { OrgContext } from '../../common/context';

/**
 * Leitura de notificações. Uma notificação é visível para:
 *  - o usuário destinatário (userId);
 *  - quem tem a permissão da audiência, se a filial for nula ou autorizada;
 *  - no portal, só o cliente destinatário (customerId).
 * A leitura é por usuário (notification_reads): marcar como lida não
 * some a notificação para o resto da equipe.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  visibility(ctx: OrgContext): Prisma.NotificationWhereInput {
    if (ctx.kind === 'CUSTOMER') return { customerId: ctx.customerId ?? '__nenhum__' };
    const permissions = [...ctx.permissions];
    return {
      customerId: null,
      OR: [
        { userId: ctx.userId },
        {
          userId: null,
          audiencePermission: { in: permissions },
          ...(ctx.allBranches ? {} : { OR: [{ branchId: null }, { branchId: { in: ctx.branchIds } }] }),
        },
      ],
    };
  }

  async list(ctx: OrgContext, query: { page?: number; pageSize?: number; unread?: boolean; severity?: string }) {
    const { skip, take, page, pageSize } = pageArgs(query);
    const where: Prisma.NotificationWhereInput = {
      AND: [
        this.visibility(ctx),
        query.unread ? { reads: { none: { userId: ctx.userId } } } : {},
        query.severity ? { severity: query.severity as never } : {},
      ],
    };
    const [rows, total] = await this.prisma.tenant(ctx, (tx) => Promise.all([
      tx.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { reads: { where: { userId: ctx.userId }, select: { readAt: true } } } }),
      tx.notification.count({ where }),
    ]));
    const items = rows.map(({ reads, ...n }) => ({ ...n, readAt: reads[0]?.readAt ?? null }));
    return paginated(items, total, page, pageSize);
  }

  async unreadCount(ctx: OrgContext): Promise<{ unread: number }> {
    const unread = await this.prisma.tenant(ctx, (tx) => tx.notification.count({
      where: { AND: [this.visibility(ctx), { reads: { none: { userId: ctx.userId } } }] },
    }));
    return { unread };
  }

  async markRead(ctx: OrgContext, id: string): Promise<void> {
    await this.prisma.tenant(ctx, async (tx) => {
      const n = await tx.notification.findFirst({ where: { id, ...this.visibility(ctx) } });
      if (!n) throw new NotFoundException('Notificação não encontrada.');
      await tx.notificationRead.createMany({ data: [{ notificationId: id, userId: ctx.userId, organizationId: ctx.organizationId }], skipDuplicates: true });
    });
  }

  async markAllRead(ctx: OrgContext): Promise<{ marked: number }> {
    return this.prisma.tenant(ctx, async (tx) => {
      const pending = await tx.notification.findMany({
        where: { AND: [this.visibility(ctx), { reads: { none: { userId: ctx.userId } } }] }, select: { id: true }, take: 5000,
      });
      if (pending.length) {
        await tx.notificationRead.createMany({
          data: pending.map((n) => ({ notificationId: n.id, userId: ctx.userId, organizationId: ctx.organizationId })), skipDuplicates: true,
        });
      }
      return { marked: pending.length };
    });
  }
}

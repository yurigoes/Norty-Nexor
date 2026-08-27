import { Injectable } from '@nestjs/common';
import type { NotificationKind, UserRole } from '@myhome/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/types';

export interface PushNotificationInput {
  condominiumId: string;
  userId?: string;
  role?: UserRole;
  unitId?: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  refId?: string;
  actions?: { id: string; label: string; tone: 'primary' | 'danger' | 'secondary' }[];
}

/**
 * Notificações da plataforma.
 *
 * Hoje só persistem e o aplicativo busca por polling. O ponto de troca
 * para push real (WebSocket ou serviço de push do celular) é o método
 * `push`: a assinatura não muda, só o que acontece depois do insert.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  push(input: PushNotificationInput) {
    return this.prisma.notification.create({
      data: {
        condominiumId: input.condominiumId,
        userId: input.userId,
        role: input.role,
        unitId: input.unitId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        refId: input.refId,
        actions: input.actions ?? undefined,
      },
    });
  }

  /**
   * O que um usuário pode ver: o que é dele, o que é da unidade dele e
   * o que foi disparado para o papel que ele exerce.
   */
  private visibilityFilter(user: RequestUser, condominiumId: string) {
    return {
      condominiumId,
      OR: [
        { userId: user.id },
        ...(user.unitId ? [{ unitId: user.unitId, userId: null }] : []),
        { role: user.role, userId: null },
      ],
    };
  }

  list(user: RequestUser, condominiumId: string, limit = 60) {
    return this.prisma.notification.findMany({
      where: this.visibilityFilter(user, condominiumId),
      orderBy: { at: 'desc' },
      take: limit,
    });
  }

  unreadCount(user: RequestUser, condominiumId: string) {
    return this.prisma.notification.count({
      where: { ...this.visibilityFilter(user, condominiumId), read: false },
    });
  }

  /**
   * A marcação passa pelo mesmo filtro de visibilidade: sem isso, um id
   * adivinhado deixaria qualquer usuário marcar a notificação de outro.
   */
  async markRead(user: RequestUser, condominiumId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { ...this.visibilityFilter(user, condominiumId), id },
      data: { read: true },
    });
  }

  async markAllRead(user: RequestUser, condominiumId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...this.visibilityFilter(user, condominiumId), read: false },
      data: { read: true },
    });
    return { updated: count };
  }
}

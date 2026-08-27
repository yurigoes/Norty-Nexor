/* Notificações da plataforma. No MVP são geradas pelos próprios
   fluxos; na Fase 2 passam a chegar por push/websocket. */

import { all, insert, nextId, update, where } from '../data/repositories';
import type { AppNotification, ID, User } from '../data/types';

export interface PushNotificationInput {
  condominiumId: ID;
  userId?: ID;
  role?: AppNotification['role'];
  unitId?: ID;
  kind: AppNotification['kind'];
  title: string;
  body: string;
  link?: string;
  refId?: ID;
  actions?: AppNotification['actions'];
}

export function pushNotification(input: PushNotificationInput): AppNotification {
  const notification: AppNotification = {
    id: nextId('ntf'),
    at: new Date().toISOString(),
    read: false,
    ...input,
  };
  return insert('notifications', notification);
}

/** Notificações visíveis para um usuário: pessoais, da unidade e do papel. */
export function notificationsFor(user: User, condominiumId: ID): AppNotification[] {
  return where('notifications', (n) =>
    n.condominiumId === condominiumId
    && (n.userId === user.id
      || (!!user.unitId && n.unitId === user.unitId && !n.userId)
      || (!!n.role && n.role === user.role)))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function unreadCount(user: User, condominiumId: ID): number {
  return notificationsFor(user, condominiumId).filter((n) => !n.read).length;
}

export function markRead(id: ID): void {
  update('notifications', id, { read: true });
}

export function markAllRead(user: User, condominiumId: ID): void {
  notificationsFor(user, condominiumId)
    .filter((n) => !n.read)
    .forEach((n) => update('notifications', n.id, { read: true }));
}

export function totalNotifications(): number {
  return all('notifications').length;
}

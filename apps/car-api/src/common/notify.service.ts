import { Injectable } from '@nestjs/common';
import type { NotificationSeverity, Permission } from '@nortycar/shared';
import type { Tx } from './prisma.service';
import { orgSettings } from './org-settings';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  link?: string;
  /** Quem vê: todos com esta permissão (respeitando a filial). */
  audiencePermission?: Permission;
  userId?: string;
  customerId?: string;
  branchId?: string | null;
  /** Mesma chave = mesmo alerta. Repetir não duplica. */
  dedupeKey: string;
  /** E-mail para canal externo, quando a empresa habilitou. */
  emailTo?: string | null;
}

/**
 * Cria notificações internas e enfileira os canais externos que a
 * empresa habilitou. A unicidade (empresa, dedupeKey) impede que a
 * mesma rotina agendada gere o mesmo alerta duas vezes.
 */
@Injectable()
export class NotifyService {
  async notify(tx: Tx, organizationId: string, input: NotifyInput): Promise<boolean> {
    const created = await tx.notification.createManyAndReturn({
      data: [{
        organizationId,
        type: input.type,
        title: input.title,
        body: input.body,
        severity: input.severity ?? 'INFO',
        link: input.link ?? null,
        audiencePermission: input.audiencePermission ?? null,
        userId: input.userId ?? null,
        customerId: input.customerId ?? null,
        branchId: input.branchId ?? null,
        dedupeKey: input.dedupeKey,
      }],
      skipDuplicates: true,
    });
    const notification = created[0];
    if (!notification) return false;

    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const channels = orgSettings(org?.settings).notificationChannels;
    if (channels.email && input.emailTo) {
      await tx.notificationDelivery.create({
        data: { organizationId, notificationId: notification.id, channel: 'EMAIL', target: input.emailTo },
      });
    }
    if (channels.webhook) {
      await tx.notificationDelivery.create({
        data: { organizationId, notificationId: notification.id, channel: 'WEBHOOK', target: 'endpoints' },
      });
    }
    return true;
  }
}

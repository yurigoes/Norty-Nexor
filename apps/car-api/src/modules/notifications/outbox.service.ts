import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { MailService } from '../../common/mail.service';
import { CryptoService } from '../../common/crypto.service';

const MAX_ATTEMPTS = 5;

export interface OutboxResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Entrega por canais externos (fila em notification_deliveries).
 *
 * A rede nunca é chamada dentro de transação: lê a fila, entrega, e grava
 * o resultado em seguida. Falha volta para a fila com espera exponencial
 * (2, 4, 8, 16 min) até 5 tentativas; depois fica FAILED com o último erro.
 * Canal sem configuração não é simulado: vira SKIPPED_NOT_CONFIGURED.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly crypto: CryptoService,
  ) {}

  async processDue(limit = 100): Promise<OutboxResult> {
    const due = await this.prisma.platform((tx) => tx.notificationDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      include: { notification: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    }));
    const result: OutboxResult = { processed: due.length, sent: 0, failed: 0, skipped: 0 };

    for (const delivery of due) {
      let outcome: { status: 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED' | 'RETRY'; error?: string };
      try {
        outcome = delivery.channel === 'EMAIL'
          ? await this.email(delivery.target, delivery.notification.title, delivery.notification.body)
          : delivery.channel === 'WEBHOOK'
            ? await this.webhook(delivery.organizationId, delivery.notification)
            : { status: 'SKIPPED_NOT_CONFIGURED', error: 'Canal sem integração autorizada configurada.' };
      } catch (error) {
        outcome = { status: 'RETRY', error: error instanceof Error ? error.message : String(error) };
      }

      const attempts = delivery.attempts + 1;
      const finalStatus = outcome.status === 'RETRY' ? (attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING') : outcome.status;
      await this.prisma.tenant({ organizationId: delivery.organizationId }, (tx) => tx.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          status: finalStatus,
          lastError: outcome.error?.slice(0, 500) ?? null,
          sentAt: finalStatus === 'SENT' ? new Date() : null,
          nextAttemptAt: finalStatus === 'PENDING' ? new Date(Date.now() + 2 ** attempts * 60_000) : delivery.nextAttemptAt,
        },
      }));
      if (finalStatus === 'SENT') result.sent += 1;
      else if (finalStatus === 'SKIPPED_NOT_CONFIGURED') result.skipped += 1;
      else if (finalStatus === 'FAILED') result.failed += 1;
    }
    return result;
  }

  private async email(to: string, subject: string, body: string) {
    const sent = await this.mail.send(to, `Norty Car — ${subject}`, body);
    if (sent.status === 'SENT') return { status: 'SENT' as const };
    if (sent.status === 'NOT_CONFIGURED') return { status: 'SKIPPED_NOT_CONFIGURED' as const, error: 'SMTP não configurado.' };
    return { status: 'RETRY' as const, error: sent.error };
  }

  /**
   * Webhook assinado: corpo JSON com HMAC-SHA256 do segredo do endpoint em
   * `X-NortyCar-Signature`. Todos os endpoints inscritos precisam aceitar;
   * se algum falhar, a entrega volta para a fila.
   */
  private async webhook(organizationId: string, notification: { id: string; type: string; title: string; body: string; severity: string; link: string | null; createdAt: Date }) {
    const endpoints = await this.prisma.tenant({ organizationId }, (tx) => tx.webhookEndpoint.findMany({
      where: { active: true, OR: [{ events: { has: notification.type } }, { events: { has: '*' } }] },
    }));
    if (!endpoints.length) return { status: 'SKIPPED_NOT_CONFIGURED' as const, error: 'Nenhum endpoint ativo inscrito neste evento.' };

    const body = JSON.stringify({
      id: notification.id, type: notification.type, severity: notification.severity, title: notification.title,
      body: notification.body, link: notification.link, createdAt: notification.createdAt.toISOString(),
    });
    const errors: string[] = [];
    for (const endpoint of endpoints) {
      const signature = createHmac('sha256', this.crypto.decrypt(endpoint.secretEnc)).update(body).digest('hex');
      let status = 0;
      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-NortyCar-Event': notification.type,
            'X-NortyCar-Signature': `sha256=${signature}`,
            'X-NortyCar-Delivery': randomUUID(),
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        status = res.status;
        if (!res.ok) errors.push(`${endpoint.url}: HTTP ${res.status}`);
      } catch (error) {
        errors.push(`${endpoint.url}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await this.prisma.tenant({ organizationId }, (tx) => tx.webhookEndpoint.update({
        where: { id: endpoint.id }, data: { lastStatus: status || null, lastDeliveryAt: new Date() },
      }));
    }
    if (errors.length) {
      this.logger.warn(`Webhook com falha (${organizationId}): ${errors.join('; ')}`);
      return { status: 'RETRY' as const, error: errors.join('; ') };
    }
    return { status: 'SENT' as const };
  }
}

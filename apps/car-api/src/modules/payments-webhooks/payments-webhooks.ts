import {
  BadRequestException, Body, Controller, HttpCode, HttpStatus, Injectable, Logger, Module, NotFoundException, Param, Post, Req,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { PaymentMethod } from '@nortycar/shared';
import { PrismaService } from '../../common/prisma.service';
import { CryptoService } from '../../common/crypto.service';
import { AuditService } from '../../common/audit.service';
import { NotifyService } from '../../common/notify.service';
import { Public } from '../../common/context';
import { FinanceModule } from '../finance/finance.module';
import { LedgerService } from '../finance/ledger.service';

/**
 * Contrato de um provedor de pagamento (Pix, boleto, cartão).
 *
 * A emissão de cobrança no provedor (`createCharge`) depende de
 * credenciais reais e só será ligada quando houver um provedor
 * configurado e testado — até lá a interface existe, a tela mostra
 * "pendente de configuração" e nada é simulado.
 *
 * O recebimento de eventos já funciona com o formato normalizado abaixo:
 * cada adaptador de provedor (Asaas, Mercado Pago, Pagar.me…) traduz o
 * payload dele para `NormalizedPaymentEvent` em `parseWebhook`.
 */
export interface PaymentProvider {
  readonly name: string;
  createCharge(input: { receivableId: string; amount: number; dueDate: string; method: PaymentMethod; customer: { name: string; document: string; email?: string } }): Promise<{ chargeId: string; url?: string; pixCode?: string }>;
  parseWebhook(body: unknown): NormalizedPaymentEvent;
}

export interface NormalizedPaymentEvent {
  eventId: string;
  type: 'payment.confirmed' | 'payment.failed' | 'payment.refunded';
  organizationId: string;
  receivableId: string;
  amount?: number;
  paidAt?: string;
  method?: PaymentMethod;
  chargeId?: string;
  reason?: string;
}

const METHODS: PaymentMethod[] = ['PIX', 'BOLETO', 'CARD', 'TRANSFER', 'CASH'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Formato genérico (o adaptador padrão): o próprio corpo já é o evento normalizado. */
function parseGeneric(body: unknown): NormalizedPaymentEvent {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = {
    eventId: String(b.eventId ?? ''),
    type: b.type as NormalizedPaymentEvent['type'],
    organizationId: String(b.organizationId ?? ''),
    receivableId: String(b.receivableId ?? ''),
    amount: typeof b.amount === 'number' ? b.amount : undefined,
    paidAt: typeof b.paidAt === 'string' ? b.paidAt : undefined,
    method: METHODS.includes(b.method as PaymentMethod) ? (b.method as PaymentMethod) : undefined,
    chargeId: typeof b.chargeId === 'string' ? b.chargeId : undefined,
    reason: typeof b.reason === 'string' ? b.reason.slice(0, 300) : undefined,
  };
  if (!/^[\w:.-]{4,120}$/.test(event.eventId)) throw new BadRequestException('eventId inválido.');
  if (!['payment.confirmed', 'payment.failed', 'payment.refunded'].includes(event.type)) throw new BadRequestException('Tipo de evento desconhecido.');
  if (!UUID.test(event.organizationId) || !UUID.test(event.receivableId)) throw new BadRequestException('Referências inválidas.');
  return event;
}

/**
 * Webhooks dos provedores de pagamento.
 *
 * Três garantias:
 *  1. Autenticação pela assinatura HMAC-SHA256 do corpo com o segredo da
 *     integração da empresa — sem assinatura válida, nada é gravado.
 *  2. Idempotência pelo eventId: o mesmo evento entregue de novo é aceito
 *     e ignorado; o pagamento usa providerEventId único no banco.
 *  3. Pagamento recusado vira registro e alerta — nunca muda o contrato.
 */
@Injectable()
export class PaymentWebhooksService {
  private readonly logger = new Logger(PaymentWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  async handle(providerName: string, body: unknown, rawBody: string, signatureHeader: string | undefined) {
    if (!/^[a-z0-9_-]{2,40}$/.test(providerName)) throw new NotFoundException('Provedor desconhecido.');
    const provider = `payment:${providerName}`;
    const event = parseGeneric(body);

    const integration = await this.prisma.platform((tx) => tx.integrationConfig.findFirst({
      where: { organizationId: event.organizationId, provider, status: { in: ['CONFIGURED', 'VERIFIED'] }, secretEnc: { not: null } },
    }));
    if (!integration?.secretEnc) {
      throw new ServiceUnavailableException({ code: 'not_configured', message: 'Provedor de pagamento não configurado para esta empresa.' });
    }
    const expected = createHmac('sha256', this.crypto.decrypt(integration.secretEnc)).update(rawBody).digest('hex');
    const given = (signatureHeader ?? '').replace(/^sha256=/, '');
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }

    // Registro do evento: a unicidade provider+eventId absorve reentregas.
    const stored = await this.prisma.platform(async (tx) => {
      const existing = await tx.inboundWebhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: event.eventId } } });
      if (existing) return existing;
      return tx.inboundWebhookEvent.create({
        data: {
          provider, eventId: event.eventId, organizationId: event.organizationId, eventType: event.type,
          payload: JSON.parse(JSON.stringify(body)), signatureValid: true,
        },
      });
    });
    if (stored.processedAt) return { received: true, duplicate: true };

    try {
      const result = await this.prisma.tenant({ organizationId: event.organizationId }, async (tx) => {
        const receivable = await tx.receivable.findUnique({ where: { id: event.receivableId } });
        if (!receivable) throw new NotFoundException('Título não encontrado nesta empresa.');
        if (event.type === 'payment.confirmed') {
          if (!event.amount || event.amount <= 0) throw new BadRequestException('Valor do pagamento ausente.');
          const { payment, duplicate } = await this.ledger.applyPayment(tx, null, event.organizationId, {
            target: 'receivable', titleId: receivable.id, amount: event.amount, method: event.method ?? 'PIX',
            paidAt: event.paidAt ? new Date(event.paidAt) : new Date(), idempotencyKey: `${provider}:${event.eventId}`,
            provider, providerEventId: event.eventId, providerChargeId: event.chargeId ?? null,
          });
          return { paymentId: payment.id, duplicate };
        }
        // Falha ou estorno no provedor: registra e avisa o financeiro. O
        // contrato segue como está — inadimplência se trata por cobrança.
        await this.notify.notify(tx, event.organizationId, {
          type: event.type === 'payment.failed' ? 'payment.failed' : 'payment.refunded',
          severity: 'WARNING',
          title: event.type === 'payment.failed' ? 'Pagamento recusado' : 'Pagamento estornado no provedor',
          body: `${receivable.description}${event.reason ? ` — ${event.reason}` : ''}`,
          link: `/financeiro/receber?id=${receivable.id}`,
          audiencePermission: 'finance.view',
          branchId: receivable.branchId,
          dedupeKey: `${provider}:${event.eventId}`,
        });
        await this.audit.record(tx, null, {
          action: `finance.webhook_${event.type.replace('payment.', '')}`, entityType: 'Receivable', entityId: receivable.id,
          organizationId: event.organizationId, branchId: receivable.branchId, after: { provider, eventId: event.eventId, reason: event.reason ?? null },
        });
        return { notified: true };
      });
      await this.prisma.platform((tx) => tx.inboundWebhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null } }));
      return { received: true, ...result };
    } catch (error) {
      // Sem processedAt: a reentrega do provedor processa de novo.
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.platform((tx) => tx.inboundWebhookEvent.update({ where: { id: stored.id }, data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) } }));
      this.logger.warn(`Webhook ${provider}/${event.eventId} falhou: ${message}`);
      throw error;
    }
  }
}

@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly webhooks: PaymentWebhooksService) {}

  @Public()
  @SkipThrottle()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  receive(@Param('provider') provider: string, @Body() body: unknown, @Req() req: Request & { rawBody?: Buffer }) {
    // Com `rawBody: true` no NestFactory a assinatura confere os bytes
    // exatos; sem ele, o corpo é reserializado (válido para JSON compacto).
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body ?? {});
    const signature = req.headers['x-nortycar-signature'];
    return this.webhooks.handle(provider, body, raw, typeof signature === 'string' ? signature : undefined);
  }
}

@Module({ imports: [FinanceModule], controllers: [PaymentWebhooksController], providers: [PaymentWebhooksService] })
export class PaymentWebhooksModule {}

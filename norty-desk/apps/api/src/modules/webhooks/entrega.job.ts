import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma/prisma.service';
import { assinar } from './assinatura';
import { WebhooksService } from './webhooks.service';

/**
 * Backoff: 1 min, 5 min, 15 min, 1 h, 6 h. Cinco tentativas e para.
 *
 * Depois de seis horas fora do ar, o problema é do assinante — e a
 * entrega fica no log, de onde ele pode reenviá-la quando voltar.
 */
const ESPERA_MINUTOS = [1, 5, 15, 60, 360];

/** Um destino lento não pode segurar a fila inteira. */
const TEMPO_LIMITE_MS = 10_000;

@Injectable()
export class EntregaJob {
  private readonly logger = new Logger(EntregaJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async entregar(): Promise<void> {
    const pendentes = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDENTE', scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: 50,
    });

    for (const entrega of pendentes) {
      await this.entregarUma(entrega.id);
    }
  }

  /** Exposto para a suíte não depender do relógio do cron. */
  async entregarUma(id: string): Promise<void> {
    const entrega = await this.prisma.webhookDelivery.findUnique({
      where: { id },
      include: { webhook: true },
    });

    if (!entrega || entrega.status !== 'PENDENTE') return;

    if (!entrega.webhook.isActive) {
      await this.prisma.webhookDelivery.update({
        where: { id },
        data: { status: 'FALHOU', lastError: 'Webhook desativado.' },
      });
      return;
    }

    const corpo = JSON.stringify(entrega.payload);
    const { timestamp, assinatura } = assinar(
      corpo,
      this.webhooks.segredoDe(entrega.webhook),
    );

    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);

    try {
      const resposta = await fetch(entrega.webhook.url, {
        method: 'POST',
        signal: controle.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Norty-Desk-Webhook/1',
          'X-Desk-Event': entrega.event,
          // O id da entrega é estável entre as tentativas: é por ele
          // que o assinante descarta a repetição de uma entrega que
          // chegou mas cuja resposta se perdeu.
          'X-Desk-Delivery': entrega.id,
          'X-Desk-Timestamp': timestamp,
          'X-Desk-Signature': assinatura,
        },
        body: corpo,
      });

      if (resposta.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id },
          data: {
            status: 'ENVIADO',
            deliveredAt: new Date(),
            attempts: { increment: 1 },
            responseCode: resposta.status,
            lastError: null,
          },
        });
        return;
      }

      // 4xx que não é 408 nem 429 é erro de contrato: repetir não
      // conserta um payload que o assinante recusa.
      const definitivo =
        resposta.status >= 400 &&
        resposta.status < 500 &&
        resposta.status !== 408 &&
        resposta.status !== 429;

      await this.marcarFalha(
        entrega.id,
        entrega.attempts,
        `HTTP ${resposta.status}`,
        resposta.status,
        definitivo,
      );
    } catch (erro) {
      const motivo =
        (erro as Error).name === 'AbortError'
          ? `Sem resposta em ${TEMPO_LIMITE_MS / 1000}s.`
          : (erro as Error).message;

      await this.marcarFalha(entrega.id, entrega.attempts, motivo, null, false);
    } finally {
      clearTimeout(alarme);
    }
  }

  private async marcarFalha(
    id: string,
    tentativasAnteriores: number,
    erro: string,
    responseCode: number | null,
    definitivo: boolean,
  ): Promise<void> {
    const tentativas = tentativasAnteriores + 1;
    const espera = definitivo ? undefined : ESPERA_MINUTOS[tentativas - 1];

    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts: tentativas,
        lastError: erro.slice(0, 500),
        ...(responseCode !== null ? { responseCode } : {}),
        ...(espera === undefined
          ? { status: 'FALHOU' }
          : { scheduledFor: new Date(Date.now() + espera * 60_000) }),
      },
    });

    if (espera === undefined) {
      this.logger.warn(
        `Entrega ${id} desistiu após ${tentativas} tentativa(s): ${erro}` +
          (definitivo ? ' (erro de contrato, não adianta repetir)' : ''),
      );
    }
  }

  /**
   * Limpa entregas antigas.
   *
   * O log é para diagnosticar, não para arquivar: sem poda, a tabela
   * cresce para sempre com o payload inteiro de cada evento.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async podar(): Promise<number> {
    const dias = Number(this.config.get<string>('WEBHOOK_RETENCAO_DIAS') ?? 30);
    const corte = new Date(Date.now() - dias * 24 * 3600 * 1000);

    const { count } = await this.prisma.webhookDelivery.deleteMany({
      where: { createdAt: { lt: corte }, status: { in: ['ENVIADO', 'FALHOU'] } },
    });

    if (count > 0) this.logger.log(`${count} entrega(s) de webhook podadas.`);
    return count;
  }
}

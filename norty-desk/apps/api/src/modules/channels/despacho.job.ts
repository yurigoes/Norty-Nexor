import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTAS_DE_ENVIO, type PortasDeEnvio } from './canais.tokens';

/**
 * Backoff da retentativa: 1 min, 5 min, 15 min, 1 h.
 *
 * Quatro tentativas e para. Um endereço que não existe não passa a
 * existir na quinta, e um SMTP fora do ar por mais de uma hora é
 * problema de operação, não de fila — e aparece no painel de canais.
 */
const ESPERA_MINUTOS = [1, 5, 15, 60];

@Injectable()
export class DespachoJob {
  private readonly logger = new Logger(DespachoJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTAS_DE_ENVIO) private readonly portas: PortasDeEnvio,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async despachar(): Promise<void> {
    const pendentes = await this.prisma.outboundMessage.findMany({
      where: { status: 'PENDENTE', scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: 50,
    });

    for (const mensagem of pendentes) {
      await this.despacharUma(mensagem.id);
    }
  }

  /** Exposto para a suíte não depender do relógio do cron. */
  async despacharUma(id: string): Promise<void> {
    const mensagem = await this.prisma.outboundMessage.findUnique({ where: { id } });
    if (!mensagem || mensagem.status !== 'PENDENTE') return;

    // Segunda verificação da nota interna. A primeira está em
    // `SaidaService`; esta existe porque o custo de um comentário
    // interno chegar ao cliente é alto demais para um cinto só.
    if (mensagem.eventId) {
      const evento = await this.prisma.ticketEvent.findUnique({
        where: { id: mensagem.eventId },
        select: { visibility: true },
      });

      if (evento?.visibility === 'INTERNA') {
        this.logger.error(
          `Mensagem ${id} aponta para um evento interno e foi descartada na saída. ` +
            'Isto não deveria acontecer: investigue quem a enfileirou.',
        );
        await this.prisma.outboundMessage.update({
          where: { id },
          data: { status: 'FALHOU', lastError: 'Evento interno: envio bloqueado.' },
        });
        return;
      }
    }

    const porta = this.portas[mensagem.channel];
    if (!porta) {
      await this.prisma.outboundMessage.update({
        where: { id },
        data: { status: 'FALHOU', lastError: `Sem transporte para o canal ${mensagem.channel}.` },
      });
      return;
    }

    const remetente = await this.remetenteDoChamado(mensagem.ticketId);
    const emRespostaA = await this.ultimaSaidaAntes(mensagem);

    try {
      const resultado = await porta.enviar({
        para: mensagem.toAddress,
        assunto: mensagem.subject ?? undefined,
        corpo: mensagem.body,
        externalId: mensagem.externalId ?? '',
        emRespostaA,
        remetente,
      });

      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          status: 'ENVIADO',
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          ...(resultado.externalId ? { externalId: resultado.externalId } : {}),
        },
      });
    } catch (erro) {
      const tentativas = mensagem.attempts + 1;
      const espera = ESPERA_MINUTOS[tentativas - 1];

      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          attempts: tentativas,
          lastError: erro instanceof Error ? erro.message.slice(0, 500) : String(erro),
          ...(espera === undefined
            ? { status: 'FALHOU' }
            : { scheduledFor: new Date(Date.now() + espera * 60_000) }),
        },
      });

      if (espera === undefined) {
        this.logger.error(`Mensagem ${id} falhou nas ${tentativas} tentativas. Desisti.`);
      }
    }
  }

  /**
   * O remetente é o e-mail do time atribuído.
   *
   * Assim a resposta do cliente volta para a caixa do time, e não para
   * a caixa geral — que é onde ela se perde.
   */
  private async remetenteDoChamado(ticketId: string | null): Promise<string | undefined> {
    if (!ticketId) return undefined;

    const ator = await this.prisma.ticketActor.findFirst({
      where: { ticketId, role: 'ATRIBUIDO', teamId: { not: null } },
      include: { team: { select: { name: true, email: true } } },
    });

    if (!ator?.team?.email) return undefined;
    return `${ator.team.name} <${ator.team.email}>`;
  }

  /** O `Message-ID` da última mensagem nossa neste chamado. */
  private async ultimaSaidaAntes(mensagem: {
    id: string;
    ticketId: string | null;
    channel: string;
    createdAt: Date;
  }): Promise<string | undefined> {
    if (!mensagem.ticketId || mensagem.channel !== 'EMAIL') return undefined;

    const anterior = await this.prisma.outboundMessage.findFirst({
      where: {
        ticketId: mensagem.ticketId,
        channel: 'EMAIL',
        status: 'ENVIADO',
        externalId: { not: null },
        createdAt: { lt: mensagem.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { externalId: true },
    });

    return anterior?.externalId ?? undefined;
  }
}

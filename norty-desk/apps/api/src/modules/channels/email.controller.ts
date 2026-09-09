import { BadRequestException, Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import type { InboundAcceptedResponse, InboundEmailRequest } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { assinaturaConfere } from './assinatura';
import { EntradaService } from './entrada.service';

/**
 * Entrada de e-mail por webhook.
 *
 * A coleta IMAP (`ColetaEmailJob`) chega na mesma `EntradaService`; este
 * controller existe para provedor que entrega por HTTP, sem esperar o
 * ciclo do cron. Ver `docs/07-api.md`, seção 5.1.
 */
@Controller('channels/email')
export class EmailController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entrada: EntradaService,
  ) {}

  @Post('inbound/:channelAccountId')
  @HttpCode(202)
  async receber(
    @Param('channelAccountId', ParseUUIDPipe) channelAccountId: string,
    @Headers('x-desk-signature') assinatura: string | undefined,
    @Body() corpo: InboundEmailRequest,
  ): Promise<InboundAcceptedResponse> {
    const conta = await this.prisma.channelAccount.findUnique({
      where: { id: channelAccountId },
      select: { id: true, organizationId: true, isActive: true, config: true },
    });

    if (!conta?.isActive) throw new UnauthorizedException('Canal desconhecido ou inativo.');

    const segredo = (conta.config as { webhookSecret?: string }).webhookSecret;
    if (segredo) {
      if (!assinatura || !assinaturaConfere(JSON.stringify(corpo), assinatura, segredo)) {
        throw new UnauthorizedException('Assinatura inválida.');
      }
    }

    if (!corpo.messageId || !corpo.from?.email) {
      throw new BadRequestException('messageId e from.email são obrigatórios.');
    }

    return this.entrada.receber({
      organizationId: conta.organizationId,
      channelAccountId: conta.id,
      channel: 'EMAIL',
      externalId: corpo.messageId,
      inReplyTo: corpo.inReplyTo,
      references: corpo.references,
      fromAddress: corpo.from.email,
      fromName: corpo.from.name,
      subject: corpo.subject,
      bodyText: corpo.text,
      bodyHtml: corpo.html,
      rawHeaders: { to: corpo.to, cc: corpo.cc ?? [] },
      receivedAt: corpo.receivedAt ? new Date(corpo.receivedAt) : undefined,
    });
  }
}

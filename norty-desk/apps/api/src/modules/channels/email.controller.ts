import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import type { AnexoRecebido, InboundAcceptedResponse, InboundEmailRequest } from '@norty-desk/shared';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
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
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
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

    // Os anexos chegam em base64 e já estão na memória: gravá-los
    // agora é mais barato que pedi-los de volta ao provedor depois. O
    // processamento só os aponta.
    const anexos = await this.guardarAnexos(conta.organizationId, corpo.attachments);

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
      rawHeaders: {
        to: corpo.to,
        cc: corpo.cc ?? [],
        references: corpo.references ?? [],
        fromName: corpo.from.name ?? null,
      },
      anexos,
      receivedAt: corpo.receivedAt ? new Date(corpo.receivedAt) : undefined,
    });
  }

  private async guardarAnexos(
    organizationId: string,
    anexos: InboundEmailRequest['attachments'],
  ): Promise<AnexoRecebido[]> {
    const guardados: AnexoRecebido[] = [];

    for (const anexo of anexos ?? []) {
      const conteudo = Buffer.from(anexo.content, 'base64');
      if (conteudo.length === 0) continue;

      const nome = (anexo.filename || 'anexo').replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'anexo';
      const chave = `${organizationId}/entrada/${randomUUID()}-${nome}`;

      await this.armazenamento.guardar(chave, conteudo, anexo.contentType);

      guardados.push({
        storageKey: chave,
        filename: nome,
        contentType: anexo.contentType || 'application/octet-stream',
        sizeBytes: conteudo.length,
        checksum: `sha256:${createHash('sha256').update(conteudo).digest('hex')}`,
      });
    }

    return guardados;
  }
}

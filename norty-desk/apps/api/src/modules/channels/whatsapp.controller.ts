import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { type EvolutionWebhookRequest, type InboundAcceptedResponse, normalizePhone } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { assinaturaConfere } from './assinatura';
import { EntradaService } from './entrada.service';

/**
 * Entrada de WhatsApp pela Evolution API.
 *
 * Ver `docs/06-canais.md`, seção 3, e `docs/07-api.md`, seção 5.2.
 */
@Controller('channels/whatsapp')
export class WhatsappController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entrada: EntradaService,
  ) {}

  @Post('inbound/:channelAccountId')
  @HttpCode(202)
  async receber(
    @Param('channelAccountId', ParseUUIDPipe) channelAccountId: string,
    @Headers('x-evolution-signature') assinatura: string | undefined,
    @Body() corpo: EvolutionWebhookRequest,
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

    if (corpo.event !== 'messages.upsert') {
      return { resultado: 'DESCARTADO', motivo: `Evento ${corpo.event} não é tratado.` };
    }

    // A própria resposta do agente volta como evento. Se virasse
    // mensagem, o chamado conversaria sozinho.
    if (corpo.data?.key?.fromMe) {
      return { resultado: 'DESCARTADO', motivo: 'Eco da própria resposta.' };
    }

    const telefone = normalizePhone(corpo.data.key.remoteJid);
    if (!telefone) {
      return { resultado: 'DESCARTADO', motivo: 'Remetente sem telefone reconhecível.' };
    }

    return this.entrada.receber({
      organizationId: conta.organizationId,
      channelAccountId: conta.id,
      channel: 'WHATSAPP',
      externalId: corpo.data.key.id,
      fromAddress: telefone,
      fromName: corpo.data.pushName,
      bodyText: extrairTexto(corpo.data.message),
      rawHeaders: {
        messageType: corpo.data.messageType ?? null,
        remoteJid: corpo.data.key.remoteJid,
      },
      receivedAt: corpo.data.messageTimestamp
        ? new Date(corpo.data.messageTimestamp * 1000)
        : undefined,
    });
  }
}

/**
 * O texto de uma mensagem da Evolution muda de lugar conforme o tipo.
 * Mídia entra sem texto: a legenda vira o corpo, e o binário é buscado
 * no processamento (`EvolutionClient.baixarMidia`).
 */
function extrairTexto(mensagem: Record<string, unknown> | undefined): string | undefined {
  if (!mensagem) return undefined;

  const conversa = mensagem.conversation;
  if (typeof conversa === 'string') return conversa;

  const estendida = mensagem.extendedTextMessage as { text?: string } | undefined;
  if (estendida?.text) return estendida.text;

  for (const chave of ['imageMessage', 'documentMessage', 'videoMessage'] as const) {
    const midia = mensagem[chave] as { caption?: string } | undefined;
    if (midia?.caption) return midia.caption;
  }

  return undefined;
}

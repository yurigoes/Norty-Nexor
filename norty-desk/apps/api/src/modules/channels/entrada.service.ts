import { Injectable, Logger } from '@nestjs/common';
import { type Channel, normalizePhone, parseTicketNumberFromSubject } from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

export type MensagemNormalizada = {
  organizationId: string;
  channelAccountId: string;
  channel: Channel;
  /** `Message-ID` do e-mail ou id da mensagem na Evolution. */
  externalId: string;
  inReplyTo?: string;
  references?: string[];
  /** E-mail do remetente ou telefone em E.164. */
  fromAddress: string;
  fromName?: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  rawHeaders?: Prisma.InputJsonValue;
  receivedAt?: Date;
};

export type ResultadoEntrada = {
  resultado: 'ACEITO' | 'DUPLICADO' | 'DESCARTADO';
  inboundMessageId?: string;
  motivo?: string;
};

/**
 * A fronteira de idempotência dos canais externos.
 *
 * Nenhuma mensagem vira evento direto: ela primeiro grava em
 * `InboundMessage`, cuja unicidade `(organizationId, channel,
 * externalId)` é o que impede chamado duplicado quando dois polls IMAP
 * concorrem ou a Evolution reentrega um webhook — coisa que ela faz.
 *
 * O GLPI não tem essa unicidade. Ver `docs/06-canais.md`, seção 1.
 */
@Injectable()
export class EntradaService {
  private readonly logger = new Logger(EntradaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fase 1: receber. Grava e devolve rápido, para o provedor não
   * reentregar. O processamento acontece depois, em job.
   */
  async receber(mensagem: MensagemNormalizada): Promise<ResultadoEntrada> {
    try {
      const gravada = await this.prisma.inboundMessage.create({
        data: {
          organizationId: mensagem.organizationId,
          channelAccountId: mensagem.channelAccountId,
          channel: mensagem.channel,
          externalId: mensagem.externalId,
          inReplyTo: mensagem.inReplyTo,
          fromAddress: mensagem.fromAddress,
          subject: mensagem.subject,
          bodyText: mensagem.bodyText,
          bodyHtml: mensagem.bodyHtml,
          rawHeaders: mensagem.rawHeaders,
          receivedAt: mensagem.receivedAt ?? new Date(),
        },
        select: { id: true },
      });

      return { resultado: 'ACEITO', inboundMessageId: gravada.id };
    } catch (erro) {
      // P2002 = violação de unicidade. Duplicata não é erro: é o
      // mecanismo funcionando.
      if ((erro as { code?: string }).code === 'P2002') {
        this.logger.debug(`Mensagem ${mensagem.externalId} já recebida; ignorando.`);
        return { resultado: 'DUPLICADO' };
      }
      throw erro;
    }
  }

  /**
   * Resolve o chamado de uma mensagem de e-mail.
   *
   * Reproduz `MailCollector::getItemFromHeaders()` do GLPI, na mesma
   * ordem: In-Reply-To, References, `[#id]` no assunto, e por fim
   * chamado novo (`docs/06-canais.md`, seção 2.2).
   */
  async resolverChamadoPorEmail(
    organizationId: string,
    mensagem: Pick<MensagemNormalizada, 'inReplyTo' | 'references' | 'subject'>,
  ): Promise<string | null> {
    const referencias = [mensagem.inReplyTo, ...(mensagem.references ?? [])]
      .filter((r): r is string => Boolean(r))
      // Da direita para a esquerda: a referência mais recente primeiro.
      .reverse();

    for (const referencia of referencias) {
      const saida = await this.prisma.outboundMessage.findFirst({
        where: { organizationId, externalId: referencia },
        select: { ticketId: true },
      });
      if (saida?.ticketId) return saida.ticketId;
    }

    if (mensagem.subject) {
      const numero = parseTicketNumberFromSubject(mensagem.subject);
      if (numero !== null) {
        const chamado = await this.prisma.ticket.findUnique({
          where: { organizationId_number: { organizationId, number: numero } },
          select: { id: true },
        });
        if (chamado) return chamado.id;
      }
    }

    return null;
  }

  /**
   * Resolve o chamado de uma mensagem de WhatsApp.
   *
   * O WhatsApp não tem assunto nem `In-Reply-To`, então a regra é janela
   * de conversa: o último chamado aberto do contato, se a última
   * movimentação foi há menos de `janelaHoras`
   * (`docs/06-canais.md`, seção 3.3).
   *
   * Devolve `AMBIGUO` quando o contato tem mais de um chamado aberto na
   * janela — aí o bot pergunta de qual se trata, em vez de adivinhar.
   */
  async resolverChamadoPorWhatsapp(
    organizationId: string,
    telefone: string,
    janelaHoras = 24,
  ): Promise<{ tipo: 'CHAMADO'; ticketId: string } | { tipo: 'AMBIGUO'; ticketIds: string[] } | { tipo: 'NOVO' }> {
    const contato = await this.prisma.contact.findUnique({
      where: { organizationId_phone: { organizationId, phone: normalizePhone(telefone) } },
      select: { id: true },
    });

    if (!contato) return { tipo: 'NOVO' };

    const desde = new Date(Date.now() - janelaHoras * 3600 * 1000);
    const abertos = await this.prisma.ticket.findMany({
      where: {
        organizationId,
        status: { not: 'FECHADO' },
        updatedAt: { gte: desde },
        actors: { some: { contactId: contato.id, role: 'REQUERENTE' } },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (abertos.length === 0) return { tipo: 'NOVO' };
    if (abertos.length === 1) return { tipo: 'CHAMADO', ticketId: abertos[0]!.id };
    return { tipo: 'AMBIGUO', ticketIds: abertos.map((t) => t.id) };
  }
}

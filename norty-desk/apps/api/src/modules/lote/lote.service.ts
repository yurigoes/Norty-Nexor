import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { BulkResult, BulkResultItem, Scale, TicketStatus } from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TicketsService } from '../tickets/tickets.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type { LoteDto } from './dto';

/**
 * Ação em lote.
 *
 * Duas decisões que definem esta tela:
 *
 * 1. **Cada item passa pelo caso de uso normal.** Nada de `updateMany`:
 *    um `UPDATE` em massa pularia a matriz de prioridade, a linha do
 *    tempo, o SLA e a saída por canal. O lote é laço, não atalho — e é
 *    mais lento de propósito.
 *
 * 2. **O resultado vem por item.** "23 de 40 concluídos" sem dizer
 *    quais 17 falharam obriga o agente a conferir os quarenta à mão, e
 *    ele não vai conferir.
 */
@Injectable()
export class LoteService {
  private readonly logger = new Logger(LoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async executar(usuario: UsuarioAutenticado, dto: LoteDto, ip?: string): Promise<BulkResult> {
    LoteService.exigirAcaoCompleta(dto);

    // O escopo de leitura vale aqui como em qualquer listagem: o lote
    // não é porta lateral para agir sobre chamado que não é seu.
    const visiveis = await this.prisma.ticket.findMany({
      where: { AND: [escopoDeLeitura(usuario), { id: { in: dto.ticketIds } }] },
      select: { id: true, number: true },
    });

    const porId = new Map(visiveis.map((v) => [v.id, v.number]));
    const itens: BulkResultItem[] = [];

    for (const ticketId of dto.ticketIds) {
      const number = porId.get(ticketId);

      if (number === undefined) {
        itens.push({ ticketId, ok: false, motivo: 'Chamado não encontrado no seu escopo.' });
        continue;
      }

      try {
        await this.aplicar(usuario, ticketId, dto);
        itens.push({ ticketId, number, ok: true });
      } catch (erro) {
        // Um chamado que recusa a transição não pode interromper os
        // outros 199: o motivo entra no resultado e o laço segue.
        itens.push({
          ticketId,
          number,
          ok: false,
          motivo: (erro as { response?: { detail?: string }; message: string }).response?.detail
            ?? (erro as Error).message,
        });
      }
    }

    const concluidos = itens.filter((i) => i.ok).length;

    await this.auditoria.registrar(usuario, {
      action: `lote.${dto.acao.tipo.toLowerCase()}`,
      entity: 'Ticket',
      ip,
      depois: {
        pedidos: dto.ticketIds.length,
        concluidos,
        falhas: itens.length - concluidos,
        acao: dto.acao,
      },
    });

    return {
      total: itens.length,
      concluidos,
      falhas: itens.length - concluidos,
      itens,
    };
  }

  private async aplicar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: LoteDto,
  ): Promise<void> {
    switch (dto.acao.tipo) {
      case 'ATRIBUIR':
        await this.tickets.atribuir(usuario, ticketId, {
          teamId: dto.acao.teamId,
          userId: dto.acao.userId,
        });
        return;

      case 'CLASSIFICAR':
        await this.tickets.classificar(usuario, ticketId, {
          categoryId: dto.acao.categoryId,
          urgency: dto.acao.urgency as Scale | undefined,
          impact: dto.acao.impact as Scale | undefined,
        });
        return;

      case 'MUDAR_STATUS':
        await this.tickets.mudarStatus(
          usuario,
          ticketId,
          dto.acao.status as TicketStatus,
          dto.acao.body,
        );
        return;
    }
  }

  /** Ação sem alvo é ação que não faz nada em duzentos chamados. */
  private static exigirAcaoCompleta(dto: LoteDto): void {
    const { acao } = dto;

    if (acao.tipo === 'ATRIBUIR' && !acao.teamId && !acao.userId) {
      throw new BadRequestException('Atribuir a quem? Informe `teamId` ou `userId`.');
    }

    if (
      acao.tipo === 'CLASSIFICAR' &&
      !acao.categoryId &&
      acao.urgency === undefined &&
      acao.impact === undefined
    ) {
      throw new BadRequestException(
        'Classificar o quê? Informe `categoryId`, `urgency` ou `impact`.',
      );
    }

    if (acao.tipo === 'MUDAR_STATUS' && !acao.status) {
      throw new BadRequestException('Informe o `status` de destino.');
    }
  }
}

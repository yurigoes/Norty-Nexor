import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PRIORITY_MATRIX,
  type PriorityMatrix,
  type Scale,
  type TicketStatus,
  canTransition,
  computePriority,
} from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { escopoDeLeitura } from './tickets.escopo';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aloca o próximo número da organização.
   *
   * `MAX(number) + 1` corre sob concorrência: duas aberturas simultâneas
   * pegam o mesmo número e uma delas viola `@@unique`. O bloqueio de
   * linha resolve, e a transação é curta o bastante para não pesar.
   */
  private async proximoNumero(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
    const [linha] = await tx.$queryRaw<{ proximo: number }[]>`
      SELECT COALESCE(MAX(number), 0) + 1 AS proximo
      FROM tickets
      WHERE "organizationId" = ${organizationId}::uuid
      FOR UPDATE
    `;
    return linha?.proximo ?? 1;
  }

  /**
   * Prioridade é derivada, nunca digitada (CLAUDE.md, regra 7).
   * Este é o único ponto do sistema que escreve em `Ticket.priority`.
   */
  async derivarPrioridade(organizationId: string, urgency: Scale, impact: Scale): Promise<Scale> {
    const organizacao = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { priorityMatrix: true },
    });

    const matriz = (organizacao.priorityMatrix as PriorityMatrix | null) ?? DEFAULT_PRIORITY_MATRIX;
    return computePriority(urgency, impact, matriz);
  }

  /** Lista aplicando o escopo do perfil por cima dos filtros pedidos. */
  async listar(usuario: UsuarioAutenticado, filtros: Prisma.TicketWhereInput, limite = 50) {
    return this.prisma.ticket.findMany({
      where: { AND: [escopoDeLeitura(usuario), filtros] },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limite,
    });
  }

  /** 404 em vez de 403 quando o chamado existe mas está fora do escopo. */
  async obter(usuario: UsuarioAutenticado, id: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id }] },
      include: { actors: true, commitments: true, category: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  /**
   * Muda o status validando a transição.
   *
   * O GLPI permite quase tudo e deixa a coerência para o operador. Aqui
   * a transição inválida é 409, não um chamado em estado impossível.
   */
  async mudarStatus(usuario: UsuarioAutenticado, id: string, destino: TicketStatus) {
    const chamado = await this.obter(usuario, id);
    const origem = chamado.status as TicketStatus;

    if (origem === destino) return chamado;

    if (!canTransition(origem, destino)) {
      throw new ConflictException(
        `Um chamado ${origem} não pode ir direto para ${destino}.` +
          (origem === 'FECHADO' ? ' Reabra o chamado primeiro.' : ''),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.ticket.update({
        where: { id },
        data: {
          status: destino,
          solvedAt: destino === 'SOLUCIONADO' ? new Date() : chamado.solvedAt,
          closedAt: destino === 'FECHADO' ? new Date() : chamado.closedAt,
        },
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: 'MUDANCA_STATUS',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: { type: 'MUDANCA_STATUS', from: origem, to: destino },
        },
      });

      return atualizado;
    });
  }

  /** Valida a escala 1..5 na fronteira, antes de qualquer cálculo. */
  static exigirEscala(valor: number, campo: string): Scale {
    if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
      throw new BadRequestException(`${campo} deve ser um inteiro de 1 a 5.`);
    }
    return valor as Scale;
  }

  /** Reserva o número e cria o chamado numa transação só. */
  async abrir(
    organizationId: string,
    dados: Omit<Prisma.TicketUncheckedCreateInput, 'number' | 'organizationId' | 'priority'> & {
      urgency: Scale;
      impact: Scale;
    },
  ) {
    const priority = await this.derivarPrioridade(organizationId, dados.urgency, dados.impact);

    return this.prisma.$transaction(async (tx) => {
      const number = await this.proximoNumero(tx, organizationId);
      return tx.ticket.create({ data: { ...dados, organizationId, number, priority } });
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PartyRef, TaskPayload, TicketTaskView } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';

const INCLUDE = {
  author: true,
} satisfies Prisma.TicketEventInclude;

type EventoDeTarefa = Prisma.TicketEventGetPayload<{ include: typeof INCLUDE }>;

/**
 * Tarefas do chamado.
 *
 * Uma tarefa é um `TicketEvent` do tipo `TAREFA`, com os campos próprios
 * em `payload` — não uma tabela à parte. É a regra 8 do CLAUDE.md e a
 * correção do maior defeito estrutural do GLPI: lá, acompanhamento,
 * tarefa e solução vivem em três tabelas, e a tela do chamado tem de
 * costurar as três em ordem cronológica na mão
 * (`docs/02-gap-analysis.md`, item 4).
 *
 * `Ticket.spentSeconds` é a soma dos apontamentos, recalculada a cada
 * mudança. Guardar o total e incrementá-lo daria dois números para a
 * mesma coisa, e eles divergem na primeira tarefa apagada.
 */
@Injectable()
export class TarefasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuario: UsuarioAutenticado, ticketId: string): Promise<TicketTaskView[]> {
    await this.exigirChamado(usuario, ticketId);

    const eventos = await this.prisma.ticketEvent.findMany({
      where: { ticketId, type: 'TAREFA' },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    // Uma consulta para todos os responsáveis. O id mora no `payload`,
    // então não há relação que o Prisma resolva sozinho — e uma consulta
    // por tarefa seria o N+1 clássico numa tela que sempre lista todas.
    const ids = [
      ...new Set(
        eventos.flatMap((e) => {
          const payload = e.payload as unknown as TaskPayload | null;
          return payload?.assigneeId ? [payload.assigneeId] : [];
        }),
      ),
    ];

    const pessoas = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const porId = new Map(pessoas.map((p) => [p.id, p]));

    return eventos.map((e) => TarefasService.paraView(e, porId));
  }

  async criar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: {
      body: string;
      assigneeId?: string | null;
      plannedStart?: string | null;
      plannedEnd?: string | null;
      spentSeconds?: number;
    },
  ): Promise<TicketTaskView[]> {
    const chamado = await this.exigirChamado(usuario, ticketId);

    if (chamado.status === 'FECHADO') {
      throw new ConflictException('Chamado fechado. Reabra antes de escrever nele.');
    }

    await this.exigirResponsavel(usuario, dto.assigneeId);
    TarefasService.exigirJanelaCoerente(dto.plannedStart, dto.plannedEnd);

    const payload: TaskPayload = {
      type: 'TAREFA',
      spentSeconds: dto.spentSeconds ?? 0,
      done: false,
      ...(dto.assigneeId ? { assigneeId: dto.assigneeId } : {}),
      ...(dto.plannedStart ? { plannedStart: dto.plannedStart } : {}),
      ...(dto.plannedEnd ? { plannedEnd: dto.plannedEnd } : {}),
    };

    await this.prisma.ticketEvent.create({
      data: {
        ticketId,
        type: 'TAREFA',
        // Tarefa é organização do atendimento, não conversa com quem
        // pediu: o solicitante não precisa ver "conferir o log do
        // servidor" na linha do tempo dele.
        visibility: 'INTERNA',
        authorId: usuario.userId,
        channel: 'WEB',
        body: dto.body,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.recalcularTempo(ticketId);
    return this.listar(usuario, ticketId);
  }

  async editar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    tarefaId: string,
    dto: {
      body?: string;
      done?: boolean;
      assigneeId?: string | null;
      plannedStart?: string | null;
      plannedEnd?: string | null;
      addSpentSeconds?: number;
    },
  ): Promise<TicketTaskView[]> {
    await this.exigirChamado(usuario, ticketId);
    await this.exigirResponsavel(usuario, dto.assigneeId);

    const evento = await this.prisma.ticketEvent.findFirst({
      where: { id: tarefaId, ticketId, type: 'TAREFA' },
    });

    if (!evento) throw new NotFoundException('Tarefa não encontrada.');

    const atual = evento.payload as unknown as TaskPayload;

    const plannedStart =
      dto.plannedStart === undefined ? atual.plannedStart : (dto.plannedStart ?? undefined);
    const plannedEnd =
      dto.plannedEnd === undefined ? atual.plannedEnd : (dto.plannedEnd ?? undefined);
    TarefasService.exigirJanelaCoerente(plannedStart, plannedEnd);

    const assigneeId =
      dto.assigneeId === undefined ? atual.assigneeId : (dto.assigneeId ?? undefined);

    const payload: TaskPayload = {
      type: 'TAREFA',
      // Apontar tempo é acrescentar: quem trabalhou mais meia hora
      // informa a meia hora, não o total.
      spentSeconds: atual.spentSeconds + (dto.addSpentSeconds ?? 0),
      done: dto.done ?? atual.done,
      ...(assigneeId ? { assigneeId } : {}),
      ...(plannedStart ? { plannedStart } : {}),
      ...(plannedEnd ? { plannedEnd } : {}),
    };

    await this.prisma.ticketEvent.update({
      where: { id: tarefaId },
      data: {
        ...(dto.body === undefined ? {} : { body: dto.body, editedAt: new Date() }),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.recalcularTempo(ticketId);
    return this.listar(usuario, ticketId);
  }

  async remover(
    usuario: UsuarioAutenticado,
    ticketId: string,
    tarefaId: string,
  ): Promise<TicketTaskView[]> {
    await this.exigirChamado(usuario, ticketId);

    const { count } = await this.prisma.ticketEvent.deleteMany({
      where: { id: tarefaId, ticketId, type: 'TAREFA' },
    });

    if (count === 0) throw new NotFoundException('Tarefa não encontrada.');

    await this.recalcularTempo(ticketId);
    return this.listar(usuario, ticketId);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * `Ticket.spentSeconds` é a soma, não um contador.
   *
   * Recalcular custa uma consulta e não pode divergir. Incrementar
   * custa nada e diverge na primeira tarefa apagada — e ninguém
   * descobre, porque o número continua parecendo plausível.
   */
  private async recalcularTempo(ticketId: string): Promise<void> {
    const [linha] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM((payload->>'spentSeconds')::int), 0)::int AS total
      FROM "ticket_events"
      WHERE "ticketId" = ${ticketId}::uuid AND "type" = 'TAREFA'
    `;

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { spentSeconds: Number(linha?.total ?? 0) },
    });
  }

  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, status: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  private async exigirResponsavel(
    usuario: UsuarioAutenticado,
    assigneeId: string | null | undefined,
  ): Promise<void> {
    if (!assigneeId) return;

    const existe = await this.prisma.user.count({
      where: {
        id: assigneeId,
        memberships: { some: { organizationId: usuario.organizationId } },
      },
    });

    if (!existe) throw new BadRequestException('Responsável não encontrado nesta organização.');
  }

  /** Responsável que saiu da organização vira `null`, não um id cru na tela. */
  private static responsavel(
    id: string | undefined,
    pessoas: Map<string, { id: string; name: string; email: string | null }>,
  ): PartyRef | null {
    if (!id) return null;
    const pessoa = pessoas.get(id);
    return pessoa ? { kind: 'USER', id: pessoa.id, name: pessoa.name, email: pessoa.email } : null;
  }

  private static exigirJanelaCoerente(
    inicio: string | null | undefined,
    fim: string | null | undefined,
  ): void {
    if (inicio && fim && new Date(fim) <= new Date(inicio)) {
      throw new BadRequestException('A tarefa termina antes de começar.');
    }
  }

  private static paraView(
    evento: EventoDeTarefa,
    pessoas: Map<string, { id: string; name: string; email: string | null }>,
  ): TicketTaskView {
    const payload = evento.payload as unknown as TaskPayload | null;

    const autor: PartyRef | null = evento.author
      ? {
          kind: 'USER',
          id: evento.author.id,
          name: evento.author.name,
          email: evento.author.email,
        }
      : null;

    return {
      id: evento.id,
      body: evento.body ?? '',
      done: payload?.done ?? false,
      spentSeconds: payload?.spentSeconds ?? 0,
      assignee: TarefasService.responsavel(payload?.assigneeId, pessoas),
      author: autor,
      plannedStart: payload?.plannedStart ?? null,
      plannedEnd: payload?.plannedEnd ?? null,
      createdAt: evento.createdAt.toISOString(),
    };
  }
}

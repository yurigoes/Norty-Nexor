import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  agendamentoInvalido,
  canTransition,
  type AppointmentView,
  type PartyRef,
  type TicketStatus,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaService } from '../sla/sla.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type { AgendarDto } from './dto';

/** Duração de visita quando ninguém disse quanto dura. */
const DURACAO_PADRAO_MINUTOS = 60;

const INCLUDE = {
  technician: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AppointmentInclude;

type Agendamento = Prisma.AppointmentGetPayload<{ include: typeof INCLUDE }>;

/**
 * Atendimento marcado para uma data e hora.
 *
 * O ponto todo deste módulo é o encontro entre duas coisas que o GLPI
 * mantém separadas: a visita marcada no calendário e o prazo do chamado.
 * Lá, marcar a visita não toca o prazo — e o chamado estoura o SLA
 * esperando a data que o próprio cliente escolheu. Aqui a data marcada
 * empurra o vencimento, e quanto ela empurrou fica gravado à parte do
 * tempo de pendência, para que o relatório continue sabendo responder
 * por que aquele prazo esticou.
 */
@Injectable()
export class AgendamentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
  ) {}

  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, status: true, organizationId: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  /**
   * O técnico vem do corpo da requisição, então não se confia nele.
   *
   * Sem esta checagem, marcar a visita com o id de alguém de outra
   * organização colocaria aquela pessoa na agenda de um chamado que ela
   * não pode nem abrir.
   */
  private async validarTecnico(
    organizationId: string,
    technicianId: string | undefined,
  ): Promise<string | null> {
    if (!technicianId) return null;

    const vinculo = await this.prisma.membership.findFirst({
      where: { userId: technicianId, organizationId },
      select: { userId: true },
    });
    if (!vinculo) throw new BadRequestException('Técnico não encontrado nesta organização.');
    return vinculo.userId;
  }

  async listar(usuario: UsuarioAutenticado, ticketId: string): Promise<AppointmentView[]> {
    await this.exigirChamado(usuario, ticketId);

    const agendamentos = await this.prisma.appointment.findMany({
      where: { ticketId },
      include: INCLUDE,
      orderBy: { scheduledFor: 'asc' },
    });

    return agendamentos.map(paraVista);
  }

  /**
   * Marca ou remarca o atendimento.
   *
   * Remarcar não edita a linha: cancela a anterior (devolvendo o prazo
   * que ela esticou) e abre outra. "Quantas vezes esta visita foi
   * remarcada" é pergunta que se faz, e uma linha editada no lugar não
   * a responde.
   */
  async agendar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: AgendarDto,
  ): Promise<AppointmentView> {
    const chamado = await this.exigirChamado(usuario, ticketId);

    if (chamado.status === 'FECHADO') {
      throw new ConflictException('Chamado fechado. Reabra antes de marcar atendimento.');
    }

    const quando = new Date(dto.scheduledFor);
    const duracao = dto.durationMinutes ?? DURACAO_PADRAO_MINUTOS;

    const problema = agendamentoInvalido(quando, duracao);
    if (problema) throw new BadRequestException(problema);

    const technicianId = await this.validarTecnico(chamado.organizationId, dto.technicianId);

    const anterior = await this.prisma.appointment.findFirst({
      where: { ticketId, status: 'AGENDADO' },
      orderBy: { createdAt: 'desc' },
    });

    if (anterior) {
      // Devolve o prazo que ela esticou e fecha a linha. Sem fechar, o
      // chamado ficaria com duas visitas marcadas ao mesmo tempo — e a
      // próxima remarcação devolveria o prazo duas vezes.
      await this.devolverPrazo(anterior);
      await this.prisma.appointment.update({
        where: { id: anterior.id },
        data: { status: 'CANCELADO', postponedSeconds: 0, previousDueAt: Prisma.JsonNull },
      });
    }

    const { adiadoSegundos, vencimentosAnteriores } = await this.sla.adiarPorAtendimento(
      ticketId,
      quando,
      duracao,
    );

    const agendamento = await this.prisma.appointment.create({
      data: {
        ticketId,
        scheduledFor: quando,
        durationMinutes: duracao,
        technicianId,
        note: dto.note,
        postponedSeconds: adiadoSegundos,
        previousDueAt: vencimentosAnteriores,
        createdById: usuario.userId,
      },
      include: INCLUDE,
    });

    // `PLANEJADO` é o status que o GLPI chama de "Planejado" e que este
    // produto herdou: o chamado não está parado nem sendo atendido — tem
    // hora marcada. Chamado que não aceita a transição (em aprovação,
    // por exemplo) fica onde está; a visita marcada não é motivo para
    // atropelar a máquina de estados.
    if (canTransition(chamado.status as TicketStatus, 'PLANEJADO')) {
      await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: 'PLANEJADO' } });
    }

    await this.registrar(usuario, agendamento, anterior ? 'REMARCADO' : 'MARCADO');

    return paraVista(agendamento);
  }

  async cancelar(
    usuario: UsuarioAutenticado,
    id: string,
    motivo?: string,
  ): Promise<AppointmentView> {
    const agendamento = await this.carregarPorId(usuario, id);

    if (agendamento.status !== 'AGENDADO') {
      throw new ConflictException(`Este atendimento já está ${agendamento.status.toLowerCase()}.`);
    }

    await this.devolverPrazo(agendamento);

    const cancelado = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELADO', postponedSeconds: 0, previousDueAt: Prisma.JsonNull },
      include: INCLUDE,
    });

    await this.voltarParaAtribuido(agendamento.ticketId);
    await this.registrar(usuario, cancelado, 'CANCELADO', motivo);

    return paraVista(cancelado);
  }

  /**
   * O atendimento aconteceu.
   *
   * O prazo esticado **não** volta: a visita foi feita na data
   * combinada, e cobrar do técnico o prazo original seria cobrar um
   * acordo que o cliente mesmo mudou.
   */
  async concluir(usuario: UsuarioAutenticado, id: string): Promise<AppointmentView> {
    const agendamento = await this.carregarPorId(usuario, id);

    if (agendamento.status !== 'AGENDADO') {
      throw new ConflictException(`Este atendimento já está ${agendamento.status.toLowerCase()}.`);
    }

    const realizado = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'REALIZADO' },
      include: INCLUDE,
    });

    await this.voltarParaAtribuido(agendamento.ticketId);
    await this.registrar(usuario, realizado, 'REALIZADO');

    return paraVista(realizado);
  }

  // -------------------------------------------------------------------

  private async carregarPorId(usuario: UsuarioAutenticado, id: string) {
    const agendamento = await this.prisma.appointment.findFirst({
      where: { id, ticket: escopoDeLeitura(usuario) },
      include: INCLUDE,
    });
    if (!agendamento) throw new NotFoundException('Atendimento não encontrado.');
    return agendamento;
  }

  private async devolverPrazo(agendamento: {
    postponedSeconds: number;
    previousDueAt: Prisma.JsonValue;
  }): Promise<void> {
    const anteriores = agendamento.previousDueAt;
    if (!anteriores || typeof anteriores !== 'object' || Array.isArray(anteriores)) return;

    await this.sla.desfazerAdiamento(
      anteriores as Record<string, string>,
      agendamento.postponedSeconds,
    );
  }

  /**
   * Sai de `PLANEJADO` quando não há mais visita marcada.
   *
   * Só mexe se o chamado ainda estiver planejado: se alguém já o
   * resolveu ou pôs em pendência no meio do caminho, esse status é mais
   * recente que este gesto e manda.
   */
  private async voltarParaAtribuido(ticketId: string): Promise<void> {
    const restantes = await this.prisma.appointment.count({
      where: { ticketId, status: 'AGENDADO' },
    });
    if (restantes > 0) return;

    await this.prisma.ticket.updateMany({
      where: { id: ticketId, status: 'PLANEJADO' },
      data: { status: 'ATRIBUIDO' },
    });
  }

  private async registrar(
    usuario: UsuarioAutenticado,
    agendamento: Agendamento,
    action: 'MARCADO' | 'REMARCADO' | 'CANCELADO' | 'REALIZADO',
    corpo?: string,
  ): Promise<void> {
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: agendamento.ticketId,
        type: 'AGENDAMENTO',
        visibility: 'PUBLICA',
        authorId: usuario.userId,
        channel: 'WEB',
        body: corpo,
        payload: {
          type: 'AGENDAMENTO',
          action,
          scheduledFor: agendamento.scheduledFor.toISOString(),
          durationMinutes: agendamento.durationMinutes,
          postponedSeconds: agendamento.postponedSeconds,
        },
      },
    });
  }
}

function parte(u: { id: string; name: string; email: string | null } | null): PartyRef | null {
  return u ? { kind: 'USER', id: u.id, name: u.name, email: u.email } : null;
}

function paraVista(a: Agendamento): AppointmentView {
  return {
    id: a.id,
    ticketId: a.ticketId,
    scheduledFor: a.scheduledFor.toISOString(),
    durationMinutes: a.durationMinutes,
    technician: parte(a.technician),
    note: a.note,
    status: a.status,
    postponedSeconds: a.postponedSeconds,
    createdAt: a.createdAt.toISOString(),
  };
}

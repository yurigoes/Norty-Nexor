import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type Recorrencia,
  type RecorrenciaView,
  type Scale,
  type TicketType,
  descreverRecorrencia,
  recorrenciaValida,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TicketsService } from '../tickets/tickets.service';
import { proximaOcorrencia } from './agenda';
import type { EditarRecorrenciaDto, EscreverRecorrenciaDto, RecorrenciaDto } from './dto';

const INCLUDE = {
  category: true,
  assignedTeam: true,
  requester: true,
} satisfies Prisma.RecurringTicketInclude;

type ComRelacoes = Prisma.RecurringTicketGetPayload<{ include: typeof INCLUDE }>;

/**
 * Chamado recorrente.
 *
 * Substitui `glpi_ticketrecurrents`. Duas diferenças que importam:
 *
 * 1. **A agenda descreve o calendário, não o intervalo.** Periodicidade
 *    em segundos não diz "toda segunda e quinta" nem "todo dia 1º" — e
 *    derrapa para outro dia assim que alguém edita a agenda.
 * 2. **A próxima ocorrência é coluna, não cálculo de tela.** O ciclo
 *    procura por `nextRunAt`, e a tela mostra a mesma data que o ciclo
 *    vai usar. No GLPI a tela recalcula e às vezes discorda.
 */
@Injectable()
export class RecorrenciasService {
  private readonly logger = new Logger(RecorrenciasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------

  async listar(usuario: UsuarioAutenticado): Promise<RecorrenciaView[]> {
    const agendas = await this.prisma.recurringTicket.findMany({
      where: { organizationId: usuario.organizationId },
      include: INCLUDE,
      // A que dispara primeiro vem primeiro: é o que se quer conferir
      // ao abrir a tela. As desligadas vão para o fim.
      orderBy: [{ isActive: 'desc' }, { nextRunAt: { sort: 'asc', nulls: 'last' } }],
    });

    return agendas.map((a) => RecorrenciasService.paraView(a));
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<RecorrenciaView> {
    return RecorrenciasService.paraView(await this.exigir(usuario, id));
  }

  /** Os chamados que esta agenda já abriu. É a prova de que ela funciona. */
  async chamados(usuario: UsuarioAutenticado, id: string) {
    await this.exigir(usuario, id);

    const chamados = await this.prisma.ticket.findMany({
      where: { recurringTicketId: id },
      select: { id: true, number: true, subject: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return chamados.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));
  }

  // -------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------

  async criar(
    usuario: UsuarioAutenticado,
    dto: EscreverRecorrenciaDto,
  ): Promise<RecorrenciaView> {
    const schedule = RecorrenciasService.exigirRecorrencia(dto.schedule);
    const timezone = RecorrenciasService.exigirFuso(dto.timezone);
    await this.exigirReferencias(usuario, dto);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    RecorrenciasService.exigirVigenciaCoerente(startsAt, endsAt);

    const agenda = await this.criarLinha({
      organizationId: usuario.organizationId,
      name: dto.name,
      subject: dto.subject,
      description: dto.description,
      ticketType: dto.ticketType ?? 'REQUISICAO',
      urgency: dto.urgency ?? 3,
      impact: dto.impact ?? 3,
      categoryId: dto.categoryId ?? null,
      assignedTeamId: dto.assignedTeamId ?? null,
      // Sem requerente informado, quem criou a agenda responde por ela.
      requesterId: dto.requesterId ?? usuario.userId,
      schedule: schedule as unknown as Prisma.InputJsonValue,
      timezone,
      createBeforeSeconds: dto.createBeforeSeconds ?? 0,
      startsAt,
      endsAt,
      isActive: dto.isActive ?? true,
      nextRunAt: proximaOcorrencia(
        schedule,
        timezone,
        RecorrenciasService.pontoDePartida(startsAt),
        endsAt,
      ),
    });

    await this.auditoria.registrar(usuario, {
      action: 'recorrencia.criada',
      entity: 'RecurringTicket',
      entityId: agenda.id,
      depois: { name: dto.name, schedule: descreverRecorrencia(schedule) },
    });

    return RecorrenciasService.paraView(agenda);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarRecorrenciaDto,
  ): Promise<RecorrenciaView> {
    const antes = await this.exigir(usuario, id);
    await this.exigirReferencias(usuario, dto);

    const schedule = dto.schedule
      ? RecorrenciasService.exigirRecorrencia(dto.schedule)
      : (antes.schedule as unknown as Recorrencia);
    const timezone = dto.timezone ? RecorrenciasService.exigirFuso(dto.timezone) : antes.timezone;

    const startsAt =
      dto.startsAt === undefined ? antes.startsAt : dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt =
      dto.endsAt === undefined ? antes.endsAt : dto.endsAt ? new Date(dto.endsAt) : null;
    RecorrenciasService.exigirVigenciaCoerente(startsAt, endsAt);

    // A próxima ocorrência é recalculada sempre que a agenda muda: um
    // `nextRunAt` velho é a diferença entre "mudei para as 8h" e o
    // chamado continuar nascendo às 18h.
    const nextRunAt = proximaOcorrencia(
      schedule,
      timezone,
      RecorrenciasService.pontoDePartida(startsAt),
      endsAt,
    );

    const agenda = await this.atualizarLinha(id, dto.name ?? antes.name, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.subject === undefined ? {} : { subject: dto.subject }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
      ...(dto.ticketType === undefined ? {} : { ticketType: dto.ticketType }),
      ...(dto.urgency === undefined ? {} : { urgency: dto.urgency }),
      ...(dto.impact === undefined ? {} : { impact: dto.impact }),
      ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
      ...(dto.assignedTeamId === undefined ? {} : { assignedTeamId: dto.assignedTeamId }),
      ...(dto.requesterId ? { requesterId: dto.requesterId } : {}),
      schedule: schedule as unknown as Prisma.InputJsonValue,
      timezone,
      ...(dto.createBeforeSeconds === undefined
        ? {}
        : { createBeforeSeconds: dto.createBeforeSeconds }),
      startsAt,
      endsAt,
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      nextRunAt,
    });

    await this.auditoria.registrar(usuario, {
      action: 'recorrencia.editada',
      entity: 'RecurringTicket',
      entityId: id,
      antes: {
        schedule: descreverRecorrencia(antes.schedule as unknown as Recorrencia),
        isActive: antes.isActive,
      },
      depois: { schedule: descreverRecorrencia(schedule), isActive: agenda.isActive },
    });

    return RecorrenciasService.paraView(agenda);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const antes = await this.exigir(usuario, id);

    // Os chamados já abertos ficam: `Ticket.recurringTicketId` é
    // `SET NULL`. Apagar a agenda não pode apagar o histórico de
    // trabalho que ela gerou.
    await this.prisma.recurringTicket.delete({ where: { id } });

    await this.auditoria.registrar(usuario, {
      action: 'recorrencia.removida',
      entity: 'RecurringTicket',
      entityId: id,
      antes: { name: antes.name },
    });
  }

  // -------------------------------------------------------------------
  // Ciclo
  // -------------------------------------------------------------------

  /**
   * Abre o que já venceu.
   *
   * Exposto para o ciclo e para o teste. Devolve quantos chamados
   * nasceram.
   *
   * A antecedência entra aqui: a ocorrência é dia 20, mas com
   * `createBeforeSeconds` de três dias o chamado nasce no dia 17 — que
   * é o que dá tempo de preparar a manutenção.
   */
  async materializarVencidas(agora = new Date()): Promise<number> {
    const candidatas = await this.prisma.recurringTicket.findMany({
      where: { isActive: true, nextRunAt: { not: null } },
      include: INCLUDE,
    });

    let abertos = 0;

    for (const agenda of candidatas) {
      if (!agenda.nextRunAt) continue;

      const abrirEm = agenda.nextRunAt.getTime() - agenda.createBeforeSeconds * 1000;
      if (abrirEm > agora.getTime()) continue;
      if (agenda.startsAt && agenda.startsAt.getTime() > agora.getTime()) continue;

      try {
        if (await this.materializar(agenda, agora)) abertos += 1;
      } catch (erro) {
        // Uma agenda quebrada não pode impedir as outras de rodar: o
        // ciclo é um só, e a falha de uma paralisaria a manutenção
        // preventiva inteira.
        this.logger.error(
          `Agenda "${agenda.name}" falhou ao abrir chamado: ${(erro as Error).message}`,
        );
      }
    }

    return abertos;
  }

  /**
   * Uma ocorrência.
   *
   * O avanço de `nextRunAt` acontece **antes** de o chamado nascer, e
   * condicionado ao valor que foi lido. Se outro processo já avançou,
   * o `updateMany` afeta zero linhas e esta passada desiste — que é o
   * que impede dois ciclos concorrentes de abrirem o mesmo chamado
   * duas vezes. Trocar a ordem abriria a porta para o contrário: dois
   * chamados e um só avanço.
   */
  private async materializar(agenda: ComRelacoes, agora: Date): Promise<boolean> {
    const schedule = agenda.schedule as unknown as Recorrencia;
    const ocorrencia = agenda.nextRunAt;
    if (!ocorrencia) return false;

    const seguinte = proximaOcorrencia(schedule, agenda.timezone, ocorrencia, agenda.endsAt);

    const { count } = await this.prisma.recurringTicket.updateMany({
      where: { id: agenda.id, nextRunAt: ocorrencia },
      data: { nextRunAt: seguinte, lastRunAt: agora, runCount: { increment: 1 } },
    });

    if (count === 0) return false;

    const chamado = await this.tickets.abrirRecorrente({
      organizationId: agenda.organizationId,
      recurringTicketId: agenda.id,
      requesterId: agenda.requesterId,
      subject: agenda.subject,
      description: agenda.description,
      ticketType: agenda.ticketType as TicketType,
      urgency: agenda.urgency as Scale,
      impact: agenda.impact as Scale,
      categoryId: agenda.categoryId,
      teamId: agenda.assignedTeamId,
    });

    // De qual agenda o chamado nasceu, e para quando ela o marcava. Sem
    // isso, quem abre o chamado três dias antes da manutenção não
    // entende por que ele apareceu hoje.
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'NOTA_INTERNA',
        visibility: 'INTERNA',
        channel: 'SISTEMA',
        body:
          `Aberto pela agenda "${agenda.name}" (${descreverRecorrencia(schedule)}). ` +
          `Ocorrência de ${ocorrencia.toISOString()}.`,
      },
    });

    this.logger.log(`Agenda "${agenda.name}" abriu o chamado #${chamado.number}.`);
    return true;
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * Cria a linha traduzindo a colisão de nome.
   *
   * O nome é único por organização porque ele é o que aparece na nota
   * interna do chamado — duas agendas "Backup" e ninguém sabe qual
   * abriu qual. Sem esta tradução, o segundo cadastro devolve 500 e a
   * mensagem genérica de produção.
   */
  private async criarLinha(
    data: Prisma.RecurringTicketUncheckedCreateInput,
  ): Promise<ComRelacoes> {
    try {
      return await this.prisma.recurringTicket.create({ data, include: INCLUDE });
    } catch (erro) {
      throw RecorrenciasService.traduzirDuplicidade(erro, data.name);
    }
  }

  private async atualizarLinha(
    id: string,
    nome: string,
    data: Prisma.RecurringTicketUncheckedUpdateInput,
  ): Promise<ComRelacoes> {
    try {
      return await this.prisma.recurringTicket.update({ where: { id }, data, include: INCLUDE });
    } catch (erro) {
      throw RecorrenciasService.traduzirDuplicidade(erro, nome);
    }
  }

  private static traduzirDuplicidade(erro: unknown, nome: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(`Já existe uma agenda chamada "${nome}".`);
    }
    return erro;
  }

  private async exigir(usuario: UsuarioAutenticado, id: string): Promise<ComRelacoes> {
    const agenda = await this.prisma.recurringTicket.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });

    if (!agenda) throw new NotFoundException('Agenda não encontrada.');
    return agenda;
  }

  /**
   * A varredura começa do começo da vigência, não de agora.
   *
   * Uma agenda criada hoje para começar dia 1º do mês que vem tem de
   * apontar para o dia 1º — e não para a próxima ocorrência a partir de
   * hoje, que seria um chamado aberto antes da hora.
   */
  private static pontoDePartida(startsAt: Date | null): Date {
    const agora = new Date();
    return startsAt && startsAt.getTime() > agora.getTime() ? startsAt : agora;
  }

  private static exigirRecorrencia(dto: RecorrenciaDto): Recorrencia {
    const base = { hora: dto.hora, minuto: dto.minuto };

    const recorrencia: Recorrencia =
      dto.tipo === 'DIARIA'
        ? { tipo: 'DIARIA', ...base }
        : dto.tipo === 'SEMANAL'
          ? { tipo: 'SEMANAL', diasDaSemana: dto.diasDaSemana ?? [], ...base }
          : dto.tipo === 'MENSAL'
            ? { tipo: 'MENSAL', diaDoMes: dto.diaDoMes ?? 0, ...base }
            : { tipo: 'ANUAL', mes: dto.mes ?? 0, diaDoMes: dto.diaDoMes ?? 0, ...base };

    if (!recorrenciaValida(recorrencia)) {
      throw new BadRequestException(
        dto.tipo === 'SEMANAL'
          ? 'Escolha ao menos um dia da semana: uma agenda que nunca dispara é pior que nenhuma.'
          : 'Recorrência incompleta para o tipo escolhido.',
      );
    }

    return recorrencia;
  }

  /** Fuso que o `Intl` não conhece faria todo cálculo cair no UTC em silêncio. */
  private static exigirFuso(timezone?: string): string {
    const fuso = timezone ?? 'America/Sao_Paulo';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: fuso });
      return fuso;
    } catch {
      throw new BadRequestException(`Fuso horário desconhecido: ${fuso}.`);
    }
  }

  private static exigirVigenciaCoerente(inicio: Date | null, fim: Date | null): void {
    if (inicio && fim && fim.getTime() <= inicio.getTime()) {
      throw new BadRequestException('A vigência termina antes de começar.');
    }
  }

  private async exigirReferencias(
    usuario: UsuarioAutenticado,
    dto: { categoryId?: string | null; assignedTeamId?: string | null; requesterId?: string | null },
  ): Promise<void> {
    const organizationId = usuario.organizationId;

    if (dto.categoryId) {
      const existe = await this.prisma.category.count({
        where: { id: dto.categoryId, organizationId },
      });
      if (!existe) throw new BadRequestException('Categoria não encontrada nesta organização.');
    }

    if (dto.assignedTeamId) {
      const existe = await this.prisma.team.count({
        where: { id: dto.assignedTeamId, organizationId },
      });
      if (!existe) throw new BadRequestException('Time não encontrado nesta organização.');
    }

    if (dto.requesterId) {
      const existe = await this.prisma.user.count({
        where: { id: dto.requesterId, memberships: { some: { organizationId } } },
      });
      if (!existe) throw new BadRequestException('Requerente não encontrado nesta organização.');
    }
  }

  private static paraView(a: ComRelacoes): RecorrenciaView {
    const schedule = a.schedule as unknown as Recorrencia;

    return {
      id: a.id,
      name: a.name,
      isActive: a.isActive,
      subject: a.subject,
      description: a.description,
      ticketType: a.ticketType,
      urgency: a.urgency as Scale,
      impact: a.impact as Scale,
      category: a.category ? { id: a.category.id, name: a.category.name } : null,
      assignedTeam: a.assignedTeam
        ? {
            kind: 'TEAM',
            id: a.assignedTeam.id,
            name: a.assignedTeam.name,
            email: a.assignedTeam.email ?? undefined,
          }
        : null,
      requester: {
        kind: 'USER',
        id: a.requester.id,
        name: a.requester.name,
        email: a.requester.email,
      },
      schedule,
      timezone: a.timezone,
      createBeforeSeconds: a.createBeforeSeconds,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      nextRunAt: a.nextRunAt?.toISOString() ?? null,
      lastRunAt: a.lastRunAt?.toISOString() ?? null,
      runCount: a.runCount,
      descricao: descreverRecorrencia(schedule),
    };
  }
}

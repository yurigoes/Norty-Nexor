import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { can, type AgendaItem } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { BuscarAgendaDto, EditarEventoDto, EventoDto } from './dto';

const DIA = 24 * 3600 * 1000;
/** Janela máxima de uma consulta: dois meses bastam para qualquer visão. */
const MAX_DIAS = 62;
const MAX_PESSOAS = 50;

type TarefaDeChamado = {
  id: string;
  ticketId: string;
  number: number;
  subject: string;
  body: string | null;
  payload: { assigneeId?: string; plannedStart?: string; plannedEnd?: string; done?: boolean } | null;
};

/**
 * A agenda junta três fontes, sem copiar nenhuma:
 * - compromissos avulsos (`agenda_events`);
 * - tarefas de chamado com início previsto (moram no `payload` do evento);
 * - tarefas de projeto com datas.
 *
 * Privacidade: compromisso privado de outra pessoa aparece só como
 * "Ocupado"; tarefa de chamado alheia não mostra o assunto a quem não lê
 * todos os chamados — a agenda não é porta lateral para a fila.
 */
@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuario: UsuarioAutenticado, filtro: BuscarAgendaDto): Promise<AgendaItem[]> {
    const de = new Date(filtro.from);
    const ate = new Date(filtro.to);
    if (ate <= de) throw new BadRequestException('O fim do período tem de ser depois do início.');
    if (ate.getTime() - de.getTime() > MAX_DIAS * DIA) {
      throw new BadRequestException(`Consulte no máximo ${MAX_DIAS} dias de cada vez.`);
    }

    const pessoas = await this.pessoasDaConsulta(usuario, filtro);
    const ids = [...pessoas.keys()];
    if (ids.length === 0) return [];

    const [eventos, tarefasDeChamado, tarefasDeProjeto] = await Promise.all([
      this.prisma.agendaEvent.findMany({
        where: {
          organizationId: usuario.organizationId,
          ownerId: { in: ids },
          startsAt: { lt: ate },
          endsAt: { gte: de },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.$queryRaw<TarefaDeChamado[]>(Prisma.sql`
        SELECT e.id, e."ticketId", t.number, t.subject, e.body, e.payload
          FROM ticket_events e
          JOIN tickets t ON t.id = e."ticketId"
         WHERE t."organizationId" = ${usuario.organizationId}::uuid
           AND e.type = 'TAREFA'
           AND e.payload->>'assigneeId' = ANY(${ids}::text[])
           AND e.payload->>'plannedStart' IS NOT NULL
           AND (e.payload->>'plannedStart')::timestamptz < ${ate}
           AND COALESCE((e.payload->>'plannedEnd')::timestamptz, (e.payload->>'plannedStart')::timestamptz) >= ${de}
      `),
      this.prisma.projectTask.findMany({
        where: {
          assigneeId: { in: ids },
          project: { organizationId: usuario.organizationId },
          plannedStart: { not: null, lt: ate },
          OR: [{ plannedEnd: { gte: de } }, { plannedEnd: null, plannedStart: { gte: de } }],
        },
        include: { project: { select: { id: true, name: true, code: true } } },
      }),
    ]);

    const leTodosOsChamados = can(usuario.role, 'chamado:ler:todos');
    const pessoa = (id: string | null | undefined) => (id ? { id, name: pessoas.get(id) ?? '' } : null);

    const itens: AgendaItem[] = [
      ...eventos.map((e): AgendaItem => {
        const alheioPrivado = e.isPrivate && e.ownerId !== usuario.userId;
        return {
          kind: 'EVENTO',
          id: e.id,
          title: alheioPrivado ? 'Ocupado' : e.title,
          start: e.startsAt.toISOString(),
          end: e.endsAt.toISOString(),
          allDay: e.allDay,
          user: pessoa(e.ownerId),
          link: alheioPrivado || !e.ticketId ? null : `/chamados/${e.ticketId}`,
          done: false,
          private: alheioPrivado,
          editable: e.ownerId === usuario.userId || e.createdById === usuario.userId,
          location: alheioPrivado ? null : e.location,
          description: alheioPrivado ? null : e.description,
        };
      }),
      ...tarefasDeChamado.map((t): AgendaItem => {
        const inicio = new Date(t.payload!.plannedStart!);
        const fim = t.payload?.plannedEnd ? new Date(t.payload.plannedEnd) : new Date(inicio.getTime() + 3600 * 1000);
        const minha = t.payload?.assigneeId === usuario.userId;
        const podeVer = minha || leTodosOsChamados;
        return {
          kind: 'TAREFA_CHAMADO',
          id: t.id,
          title: podeVer ? `#${t.number} ${t.subject}` : `Tarefa do chamado #${t.number}`,
          start: inicio.toISOString(),
          end: fim.toISOString(),
          allDay: false,
          user: pessoa(t.payload?.assigneeId),
          link: `/chamados/${t.ticketId}`,
          done: Boolean(t.payload?.done),
          private: !podeVer,
          editable: false,
          location: null,
          description: podeVer ? (t.body?.slice(0, 300) ?? null) : null,
        };
      }),
      ...tarefasDeProjeto.map((t): AgendaItem => ({
        kind: 'TAREFA_PROJETO',
        id: t.id,
        title: `${t.project.code ?? t.project.name}: ${t.name}`,
        start: t.plannedStart!.toISOString(),
        end: (t.plannedEnd ?? t.plannedStart!).toISOString(),
        allDay: true,
        user: pessoa(t.assigneeId),
        link: `/projetos/${t.project.id}`,
        done: t.status === 'CONCLUIDA',
        private: false,
        editable: false,
        location: null,
        description: t.description,
      })),
    ];

    return itens.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }

  async criar(usuario: UsuarioAutenticado, dto: EventoDto): Promise<AgendaItem> {
    const dono = dto.ownerId ?? usuario.userId;
    await this.exigirPessoa(usuario, dono);
    AgendaService.exigirDatas(dto.startsAt, dto.endsAt);

    const e = await this.prisma.agendaEvent.create({
      data: {
        organizationId: usuario.organizationId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        location: dto.location ?? null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        allDay: dto.allDay ?? false,
        isPrivate: dto.isPrivate ?? false,
        ownerId: dono,
        createdById: usuario.userId,
      },
      include: { owner: { select: { id: true, name: true } } },
    });
    return AgendaService.eventoParaItem(e, usuario);
  }

  async editar(usuario: UsuarioAutenticado, id: string, dto: EditarEventoDto): Promise<AgendaItem> {
    const e = await this.exigirEditavel(usuario, id);
    AgendaService.exigirDatas(dto.startsAt ?? e.startsAt.toISOString(), dto.endsAt ?? e.endsAt.toISOString());
    const depois = await this.prisma.agendaEvent.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        location: dto.location,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        allDay: dto.allDay,
        isPrivate: dto.isPrivate,
      },
      include: { owner: { select: { id: true, name: true } } },
    });
    return AgendaService.eventoParaItem(depois, usuario);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.exigirEditavel(usuario, id);
    await this.prisma.agendaEvent.delete({ where: { id } });
  }

  // -------------------------------------------------------------------

  /** De quem é a agenda pedida: um time, uma lista de pessoas, ou só quem pede. */
  private async pessoasDaConsulta(usuario: UsuarioAutenticado, filtro: BuscarAgendaDto): Promise<Map<string, string>> {
    let pedidos: string[];
    if (filtro.teamId) {
      const time = await this.prisma.team.findFirst({
        where: { id: filtro.teamId, organizationId: usuario.organizationId },
        select: { members: { select: { userId: true } } },
      });
      if (!time) throw new NotFoundException('Time não encontrado.');
      pedidos = time.members.map((m) => m.userId);
    } else if (filtro.userIds) {
      pedidos = [...new Set(filtro.userIds.split(',').map((s) => s.trim()).filter(Boolean))];
    } else {
      pedidos = [usuario.userId];
    }
    if (pedidos.length > MAX_PESSOAS) throw new BadRequestException(`No máximo ${MAX_PESSOAS} pessoas por consulta.`);
    if (pedidos.some((p) => !/^[0-9a-f-]{36}$/i.test(p))) throw new BadRequestException('Lista de pessoas inválida.');

    // Só gente desta organização entra: id de outra empresa some calado.
    const vinculos = await this.prisma.membership.findMany({
      where: { organizationId: usuario.organizationId, userId: { in: pedidos } },
      select: { user: { select: { id: true, name: true } } },
    });
    return new Map(vinculos.map((v) => [v.user.id, v.user.name]));
  }

  private async exigirPessoa(usuario: UsuarioAutenticado, userId: string) {
    const existe = await this.prisma.membership.count({ where: { userId, organizationId: usuario.organizationId } });
    if (!existe) throw new NotFoundException('Pessoa não encontrada nesta organização.');
  }

  private async exigirEditavel(usuario: UsuarioAutenticado, id: string) {
    const e = await this.prisma.agendaEvent.findFirst({ where: { id, organizationId: usuario.organizationId } });
    if (!e) throw new NotFoundException('Compromisso não encontrado.');
    if (e.ownerId !== usuario.userId && e.createdById !== usuario.userId) {
      throw new ForbiddenException('Só quem é dono do compromisso, ou quem o marcou, pode mudá-lo.');
    }
    return e;
  }

  private static exigirDatas(inicio: string, fim: string) {
    if (new Date(fim) < new Date(inicio)) throw new BadRequestException('O compromisso não pode terminar antes de começar.');
  }

  private static eventoParaItem(
    e: {
      id: string;
      title: string;
      description: string | null;
      location: string | null;
      startsAt: Date;
      endsAt: Date;
      allDay: boolean;
      isPrivate: boolean;
      ownerId: string;
      createdById: string | null;
      ticketId: string | null;
      owner: { id: string; name: string };
    },
    usuario: UsuarioAutenticado,
  ): AgendaItem {
    return {
      kind: 'EVENTO',
      id: e.id,
      title: e.title,
      start: e.startsAt.toISOString(),
      end: e.endsAt.toISOString(),
      allDay: e.allDay,
      user: e.owner,
      link: e.ticketId ? `/chamados/${e.ticketId}` : null,
      done: false,
      private: false,
      editable: e.ownerId === usuario.userId || e.createdById === usuario.userId,
      location: e.location,
      description: e.description,
    };
  }
}

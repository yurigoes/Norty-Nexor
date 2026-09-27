import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  CapacidadeView,
  Channel,
  FatiaDeContagem,
  LinhaDeCapacidade,
  Indicador,
  LinhaDeSla,
  PainelView,
  RelatorioSlaView,
  Scale,
  TicketStatus,
} from '@norty-desk/shared';
import {
  CHANNELS,
  OPEN_STATUSES,
  ROTULO_CANAL,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  TICKET_STATUSES,
  can,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { segundosDeExpediente } from '../sla/calendario';
import { inicioDoPeriodo, type PainelDto, type Periodo, type RelatorioSlaDto } from './dto';

/**
 * O fuso em que o dia do relatório começa.
 *
 * O mesmo padrão de `Calendar.timezone`. Um dia contado em UTC empurra
 * para amanhã tudo que aconteceu depois das 21h de Brasília.
 */
const FUSO_PADRAO = 'America/Sao_Paulo';

/**
 * Painéis e relatórios.
 *
 * Duas decisões que valem para tudo aqui:
 *
 * 1. **O relatório de SLA lê `achievedAt` e `breachedAt`**, gravados no
 *    momento do fato. Nunca recalcula prazo histórico: mudar o acordo
 *    hoje não pode reescrever o desempenho de ontem
 *    (`docs/05-sla.md`, seção 7).
 *
 * 2. **Todo indicador carrega o filtro que o reproduz.** Um número sem
 *    caminho de volta para as linhas que o formaram é um número que
 *    ninguém confere — e o painel do GLPI é exatamente isso.
 */
@Injectable()
export class PaineisService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Painéis
  // -------------------------------------------------------------------

  async doAgente(usuario: UsuarioAutenticado, dto: PainelDto): Promise<PainelView> {
    const de = inicioDoPeriodo(dto.periodo);

    const meus: Prisma.TicketWhereInput = {
      organizationId: usuario.organizationId,
      actors: { some: { role: 'ATRIBUIDO', userId: usuario.userId } },
    };

    return this.montar('AGENTE', meus, de, usuario);
  }

  async doTime(usuario: UsuarioAutenticado, dto: PainelDto): Promise<PainelView> {
    const de = inicioDoPeriodo(dto.periodo);

    // Sem `teamId`, os times de que a pessoa faz parte. Deixar em branco
    // significa "o meu time", não "todos os times".
    const times = dto.teamId ? [dto.teamId] : usuario.teamIds;

    if (dto.teamId && !usuario.teamIds.includes(dto.teamId) && !can(usuario.role, 'painel:organizacao')) {
      throw new ForbiddenException('Você não faz parte deste time.');
    }

    const doTime: Prisma.TicketWhereInput = {
      organizationId: usuario.organizationId,
      ...(times.length > 0
        ? { actors: { some: { role: 'ATRIBUIDO', teamId: { in: times } } } }
        : {}),
    };

    return this.montar('TIME', doTime, de, usuario);
  }

  async daOrganizacao(usuario: UsuarioAutenticado, dto: PainelDto): Promise<PainelView> {
    const de = inicioDoPeriodo(dto.periodo);
    return this.montar('ORGANIZACAO', { organizationId: usuario.organizationId }, de, usuario);
  }

  private async montar(
    escopo: PainelView['escopo'],
    base: Prisma.TicketWhereInput,
    de: Date,
    usuario: UsuarioAutenticado,
  ): Promise<PainelView> {
    const ate = new Date();
    const noPeriodo: Prisma.TicketWhereInput = { ...base, createdAt: { gte: de, lte: ate } };

    const [abertos, resolvidos, emAberto, estourados, porStatus, porPrioridade, porCanal] =
      await Promise.all([
        this.prisma.ticket.count({ where: noPeriodo }),
        this.prisma.ticket.count({
          where: { ...base, solvedAt: { gte: de, lte: ate } },
        }),
        this.prisma.ticket.count({
          where: { ...base, status: { in: OPEN_STATUSES as TicketStatus[] } },
        }),
        this.prisma.ticket.count({
          where: {
            ...base,
            status: { in: OPEN_STATUSES as TicketStatus[] },
            commitments: { some: { breachedAt: { not: null } } },
          },
        }),
        this.prisma.ticket.groupBy({
          by: ['status'],
          where: { ...base, status: { in: OPEN_STATUSES as TicketStatus[] } },
          _count: { _all: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { ...base, status: { in: OPEN_STATUSES as TicketStatus[] } },
          _count: { _all: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['originChannel'],
          where: noPeriodo,
          _count: { _all: true },
        }),
      ]);

    const primeiraResposta = await this.medianaDeMinutos(noPeriodo, 'firstResponseAt');
    const resolucao = await this.medianaDeMinutos(noPeriodo, 'solvedAt');
    const cumprimento = await this.cumprimentoDeSla(base, de, ate);

    const indicadores: Indicador[] = [
      { rotulo: 'Abertos no período', valor: abertos },
      { rotulo: 'Resolvidos no período', valor: resolvidos },
      {
        rotulo: 'Em aberto agora',
        valor: emAberto,
        filtro: this.filtroDoEscopo(escopo, usuario),
      },
      {
        rotulo: 'Com SLA estourado',
        valor: estourados,
        filtro: `${this.filtroDoEscopo(escopo, usuario)}&slaBreached=true`,
      },
      { rotulo: 'Cumprimento de SLA', valor: cumprimento, unidade: '%' },
      // Mediana, não média: um chamado esquecido por três semanas
      // desloca a média e some com a realidade dos outros duzentos.
      { rotulo: 'Primeira resposta (mediana)', valor: primeiraResposta, unidade: 'min' },
      { rotulo: 'Resolução (mediana)', valor: resolucao, unidade: 'min' },
    ];

    return {
      escopo,
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      indicadores,
      porStatus: TICKET_STATUSES.filter((s) => OPEN_STATUSES.includes(s)).map((status) => ({
        chave: status,
        rotulo: ROTULO_STATUS[status],
        total: porStatus.find((p) => p.status === status)?._count._all ?? 0,
      })),
      porPrioridade: [5, 4, 3, 2, 1].map((prioridade) => ({
        chave: String(prioridade),
        rotulo: ROTULO_PRIORIDADE[prioridade as Scale],
        total: porPrioridade.find((p) => p.priority === prioridade)?._count._all ?? 0,
      })),
      porCanal: CHANNELS.map((canal) => ({
        chave: canal,
        rotulo: ROTULO_CANAL[canal],
        total: porCanal.find((p) => p.originChannel === canal)?._count._all ?? 0,
      })).filter((f) => f.total > 0),
      porDia: await this.porDia(base, de, ate),
    };
  }

  /** O filtro da fila que reproduz o número clicado. */
  private filtroDoEscopo(escopo: PainelView['escopo'], usuario: UsuarioAutenticado): string {
    if (escopo === 'AGENTE') return `?assignedUserId=${usuario.userId}`;
    return '?';
  }

  /**
   * Mediana em minutos entre a abertura e um marco.
   *
   * `percentile_cont` no banco: trazer todas as linhas para calcular
   * mediana em JavaScript funciona com duzentos chamados e para de
   * funcionar com duzentos mil.
   */
  private async medianaDeMinutos(
    onde: Prisma.TicketWhereInput,
    coluna: 'firstResponseAt' | 'solvedAt',
  ): Promise<number> {
    const criadoDe = (onde.createdAt as { gte?: Date } | undefined)?.gte ?? new Date(0);
    const criadoAte = (onde.createdAt as { lte?: Date } | undefined)?.lte ?? new Date();

    const linhas = await this.prisma.$queryRawUnsafe<{ mediana: number | null }[]>(
      `
      SELECT percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM ("${coluna}" - "createdAt")) / 60
             ) AS mediana
      FROM "tickets" t
      WHERE t."organizationId" = $1::uuid
        AND t."${coluna}" IS NOT NULL
        AND t."createdAt" BETWEEN $2 AND $3
        ${this.recorteDeAtores(onde)}
      `,
      onde.organizationId as string,
      criadoDe,
      criadoAte,
    );

    return Math.round(linhas[0]?.mediana ?? 0);
  }

  /**
   * O recorte de atores como SQL.
   *
   * O `where` do Prisma não atravessa `$queryRaw`. Em vez de montar
   * texto a partir de dado do usuário — que seria injeção esperando
   * acontecer —, só os ids que já vieram validados do token entram, e
   * entram como literal UUID conferido pelo próprio Postgres.
   */
  private recorteDeAtores(onde: Prisma.TicketWhereInput): string {
    const atores = onde.actors as
      | { some?: { role?: string; userId?: string; teamId?: { in?: string[] } } }
      | undefined;

    if (!atores?.some) return '';

    const papel = atores.some.role === 'ATRIBUIDO' ? 'ATRIBUIDO' : null;
    if (!papel) return '';

    if (atores.some.userId) {
      return `AND EXISTS (SELECT 1 FROM "ticket_actors" a
                          WHERE a."ticketId" = t."id" AND a."role" = 'ATRIBUIDO'
                            AND a."userId" = '${PaineisService.exigirUuid(atores.some.userId)}'::uuid)`;
    }

    const times = atores.some.teamId?.in ?? [];
    if (times.length === 0) return '';

    const lista = times.map((t) => `'${PaineisService.exigirUuid(t)}'::uuid`).join(', ');
    return `AND EXISTS (SELECT 1 FROM "ticket_actors" a
                        WHERE a."ticketId" = t."id" AND a."role" = 'ATRIBUIDO'
                          AND a."teamId" IN (${lista}))`;
  }

  /** Um id que não é UUID nunca chega ao SQL — nem sequer entre aspas. */
  private static exigirUuid(valor: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) {
      throw new Error(`Identificador inválido no recorte do painel: ${valor}`);
    }
    return valor;
  }

  /**
   * Abertos e resolvidos por dia, para o gráfico de linha.
   *
   * Duas subconsultas escalares, não dois `LEFT JOIN`: juntar as duas
   * tabelas pelo dia faz produto cartesiano e multiplica as contagens —
   * seis chamados abertos e dois resolvidos no mesmo dia virariam doze e
   * doze.
   *
   * O dia é o dia **local**. `createdAt` é UTC; recortar por
   * `::date` direto jogaria tudo que aconteceu depois das 21h de Brasília
   * para o dia seguinte, e o gráfico mentiria toda noite.
   */
  private async porDia(
    base: Prisma.TicketWhereInput,
    de: Date,
    ate: Date,
    fuso = FUSO_PADRAO,
  ): Promise<{ dia: string; abertos: number; resolvidos: number }[]> {
    const recorte = this.recorteDeAtores(base);

    const linhas = await this.prisma.$queryRawUnsafe<
      { dia: string; abertos: bigint; resolvidos: bigint }[]
    >(
      `
      SELECT to_char(d, 'YYYY-MM-DD') AS dia,
             (SELECT count(*) FROM "tickets" t
               WHERE t."organizationId" = $1::uuid
                 AND (t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date = d::date
                 ${recorte}) AS abertos,
             (SELECT count(*) FROM "tickets" t
               WHERE t."organizationId" = $1::uuid
                 AND t."solvedAt" IS NOT NULL
                 AND (t."solvedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4)::date = d::date
                 ${recorte}) AS resolvidos
      FROM generate_series(
             ($2::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $4)::date,
             ($3::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $4)::date,
             interval '1 day'
           ) AS d
      ORDER BY d
      `,
      base.organizationId as string,
      de,
      ate,
      fuso,
    );

    return linhas.map((l) => ({
      dia: l.dia,
      abertos: Number(l.abertos),
      resolvidos: Number(l.resolvidos),
    }));
  }

  private async cumprimentoDeSla(
    base: Prisma.TicketWhereInput,
    de: Date,
    ate: Date,
  ): Promise<number> {
    const compromissos = await this.prisma.slaCommitment.groupBy({
      by: ['kind'],
      where: {
        ticket: { ...base, createdAt: { gte: de, lte: ate } },
        kind: 'SLA',
        OR: [{ achievedAt: { not: null } }, { breachedAt: { not: null } }],
      },
      _count: { _all: true },
    });

    const violados = await this.prisma.slaCommitment.count({
      where: {
        ticket: { ...base, createdAt: { gte: de, lte: ate } },
        kind: 'SLA',
        breachedAt: { not: null },
      },
    });

    const decididos = compromissos.reduce((soma, c) => soma + c._count._all, 0);
    if (decididos === 0) return 100;

    return Math.round(((decididos - violados) / decididos) * 1000) / 10;
  }

  // -------------------------------------------------------------------
  // Relatório de SLA
  // -------------------------------------------------------------------

  async relatorioDeSla(
    usuario: UsuarioAutenticado,
    dto: RelatorioSlaDto,
  ): Promise<RelatorioSlaView> {
    const de = inicioDoPeriodo(dto.periodo);
    const ate = new Date();
    const agrupamento = dto.agrupar ?? 'categoria';

    const compromissos = await this.prisma.slaCommitment.findMany({
      where: {
        kind: 'SLA',
        ticket: {
          organizationId: usuario.organizationId,
          createdAt: { gte: de, lte: ate },
          ...(dto.teamId
            ? { actors: { some: { role: 'ATRIBUIDO', teamId: dto.teamId } } }
            : {}),
        },
      },
      select: {
        achievedAt: true,
        breachedAt: true,
        agreement: { select: { id: true, name: true } },
        ticket: {
          select: {
            priority: true,
            category: { select: { id: true, name: true } },
            actors: {
              where: { role: 'ATRIBUIDO', teamId: { not: null } },
              select: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const grupos = new Map<string, LinhaDeSla>();
    const geral: LinhaDeSla = {
      chave: 'geral',
      rotulo: 'Geral',
      total: 0,
      cumpridos: 0,
      violados: 0,
      emAberto: 0,
      percentual: 100,
    };

    for (const c of compromissos) {
      const { chave, rotulo } = PaineisService.chaveDoGrupo(agrupamento, c);
      const linha =
        grupos.get(chave) ??
        { chave, rotulo, total: 0, cumpridos: 0, violados: 0, emAberto: 0, percentual: 100 };

      for (const alvo of [linha, geral]) {
        alvo.total += 1;
        if (c.breachedAt) alvo.violados += 1;
        else if (c.achievedAt) alvo.cumpridos += 1;
        else alvo.emAberto += 1;
      }

      grupos.set(chave, linha);
    }

    // O que ainda corre não entra na conta: contá-lo como cumprido
    // inflaria o número, e como violado o depreciaria. Ele é `emAberto`,
    // e a coluna existe para isso ficar visível.
    for (const linha of [...grupos.values(), geral]) {
      const decididos = linha.cumpridos + linha.violados;
      linha.percentual = decididos === 0 ? 100 : Math.round((linha.cumpridos / decididos) * 1000) / 10;
    }

    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      agrupamento,
      geral,
      linhas: [...grupos.values()].sort((a, b) => b.total - a.total),
    };
  }

  private static chaveDoGrupo(
    agrupamento: RelatorioSlaView['agrupamento'],
    c: {
      agreement: { id: string; name: string };
      ticket: {
        priority: number;
        category: { id: string; name: string } | null;
        actors: { team: { id: string; name: string } | null }[];
      };
    },
  ): { chave: string; rotulo: string } {
    switch (agrupamento) {
      case 'categoria':
        return c.ticket.category
          ? { chave: c.ticket.category.id, rotulo: c.ticket.category.name }
          : { chave: 'sem-categoria', rotulo: 'Sem categoria' };

      case 'time': {
        const time = c.ticket.actors.find((a) => a.team)?.team;
        return time
          ? { chave: time.id, rotulo: time.name }
          : { chave: 'sem-time', rotulo: 'Sem time' };
      }

      case 'prioridade':
        return {
          chave: String(c.ticket.priority),
          rotulo: ROTULO_PRIORIDADE[c.ticket.priority as Scale] ?? String(c.ticket.priority),
        };

      case 'acordo':
        return { chave: c.agreement.id, rotulo: c.agreement.name };
    }
  }

  // -------------------------------------------------------------------
  // Volume
  // -------------------------------------------------------------------

  async volume(
    usuario: UsuarioAutenticado,
    agrupar: 'categoria' | 'canal' | 'time' | 'dia',
    periodo: PainelDto['periodo'],
    limite = 50,
  ): Promise<FatiaDeContagem[]> {
    const de = inicioDoPeriodo(periodo);
    const onde: Prisma.TicketWhereInput = {
      organizationId: usuario.organizationId,
      createdAt: { gte: de },
    };

    if (agrupar === 'canal') {
      const grupos = await this.prisma.ticket.groupBy({
        by: ['originChannel'],
        where: onde,
        _count: { _all: true },
      });

      return grupos
        .map((g) => ({
          chave: g.originChannel,
          rotulo: ROTULO_CANAL[g.originChannel as Channel],
          total: g._count._all,
        }))
        .sort((a, b) => b.total - a.total);
    }

    if (agrupar === 'dia') {
      const dias = await this.porDia(onde, de, new Date());
      return dias.map((d) => ({ chave: d.dia, rotulo: d.dia, total: d.abertos }));
    }

    if (agrupar === 'categoria') {
      const grupos = await this.prisma.ticket.groupBy({
        by: ['categoryId'],
        where: onde,
        _count: { _all: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: limite,
      });

      const categorias = await this.prisma.category.findMany({
        where: { id: { in: grupos.map((g) => g.categoryId).filter(Boolean) as string[] } },
        select: { id: true, name: true },
      });
      const porId = new Map(categorias.map((c) => [c.id, c.name]));

      return grupos
        .map((g) => ({
          chave: g.categoryId ?? 'sem-categoria',
          rotulo: g.categoryId ? (porId.get(g.categoryId) ?? '—') : 'Sem categoria',
          total: g._count._all,
        }))
        .sort((a, b) => b.total - a.total);
    }

    const atores = await this.prisma.ticketActor.groupBy({
      by: ['teamId'],
      where: {
        role: 'ATRIBUIDO',
        teamId: { not: null },
        ticket: onde,
      },
      _count: { _all: true },
      orderBy: { _count: { teamId: 'desc' } },
      take: limite,
    });

    const times = await this.prisma.team.findMany({
      where: { id: { in: atores.map((a) => a.teamId).filter(Boolean) as string[] } },
      select: { id: true, name: true },
    });
    const porId = new Map(times.map((t) => [t.id, t.name]));

    return atores
      .map((a) => ({
        chave: a.teamId!,
        rotulo: porId.get(a.teamId!) ?? '—',
        total: a._count._all,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /** CSV com ponto e vírgula: é o que o Excel em pt-BR abre sem perguntar. */
  static paraCsv(cabecalho: readonly string[], linhas: readonly (string | number)[][]): string {
    const escapar = (v: string | number) => {
      const texto = String(v);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    return [cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\r\n');
  }
  // -------------------------------------------------------------------
  // Capacidade
  // -------------------------------------------------------------------

  /**
   * Quanto trabalho entra contra quanto o time dá conta.
   *
   * A pergunta é a de antes de contratar: "o time está no limite?". Ela
   * se responde por time, e com quatro números que dizem coisas
   * diferentes — o que entrou, o que saiu, o que sobrou e quanto tempo
   * foi apontado.
   *
   * **A ocupação é um piso, não a verdade.** Ela só conta o tempo que
   * alguém apontou, e ninguém aponta tudo. Por isso a resposta carrega
   * `semApontamento`: com metade dos chamados sem tempo lançado, a
   * ocupação é ficção, e quem lê precisa saber disso **antes** de
   * decidir contratação. Um relatório que esconde a própria margem de
   * erro é pior que nenhum.
   *
   * As horas disponíveis saem do expediente do calendário, não de "8
   * por dia": feriado e fim de semana não são capacidade. Férias e
   * afastamento não entram — o sistema não os conhece, e chutar seria
   * inventar precisão.
   */
  async capacidade(
    usuario: UsuarioAutenticado,
    dto: { periodo?: Periodo; calendarId?: string },
  ): Promise<CapacidadeView> {
    const organizationId = usuario.organizationId;
    const ate = new Date();
    const de = inicioDoPeriodo(dto.periodo, ate);

    const calendario = await this.calendarioDoRelatorio(organizationId, dto.calendarId);

    const horasDoExpediente = calendario
      ? segundosDeExpediente(de, ate, {
          timezone: calendario.timezone,
          segments: calendario.segments,
          holidays: calendario.holidays,
        }) / 3600
      : (ate.getTime() - de.getTime()) / 3_600_000;

    const times = await this.prisma.team.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });

    const [abertos, fechados, backlog, apontado, semApontamento, totalNoPeriodo] =
      await Promise.all([
        this.porTime(organizationId, Prisma.sql`t."createdAt" >= ${de} AND t."createdAt" <= ${ate}`),
        this.porTime(
          organizationId,
          Prisma.sql`COALESCE(t."closedAt", t."solvedAt") >= ${de} AND COALESCE(t."closedAt", t."solvedAt") <= ${ate}`,
        ),
        this.porTime(organizationId, Prisma.sql`t."status" NOT IN ('SOLUCIONADO', 'FECHADO')`),
        this.horasApontadasPorTime(organizationId, de, ate),
        this.chamadosSemApontamento(organizationId, de, ate),
        this.prisma.ticket.count({
          where: { organizationId, createdAt: { gte: de, lte: ate } },
        }),
      ]);

    const linha = (id: string | null, nome: string, pessoas: number): LinhaDeCapacidade => {
      const horasApontadas = apontado.get(id) ?? 0;
      const horasDisponiveis = pessoas * horasDoExpediente;

      return {
        time: id ? { id, name: nome } : null,
        pessoas,
        abertos: abertos.get(id) ?? 0,
        fechados: fechados.get(id) ?? 0,
        backlog: backlog.get(id) ?? 0,
        horasApontadas: Math.round(horasApontadas * 10) / 10,
        horasDisponiveis: Math.round(horasDisponiveis * 10) / 10,
        // Sem gente no time não há do que dividir, e infinito na tela
        // não diz nada.
        ocupacao: horasDisponiveis > 0 ? horasApontadas / horasDisponiveis : null,
      };
    };

    const linhas = times.map((t) => linha(t.id, t.name, t._count.members));

    // O que entrou e não foi para time nenhum é o número que ninguém
    // olha e que explica a fila que não anda.
    const semTime = linha(null, 'Sem time', 0);
    if (semTime.abertos > 0 || semTime.backlog > 0) linhas.push(semTime);

    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      calendario: calendario ? { id: calendario.id, name: calendario.name } : null,
      linhas,
      semApontamento,
      totalNoPeriodo,
    };
  }

  /**
   * O calendário que conta expediente no relatório.
   *
   * Sem pedido, o mais usado pelos acordos: é o que a casa de fato
   * trabalha. Nenhum calendário cadastrado vira 24x7, que é o mesmo
   * que o SLA faz — e é o único palpite honesto quando ninguém disse
   * qual é o expediente.
   */
  private async calendarioDoRelatorio(organizationId: string, calendarId?: string) {
    if (calendarId) {
      return this.prisma.calendar.findFirst({
        where: { id: calendarId, organizationId },
        include: { segments: true, holidays: true },
      });
    }

    const [maisUsado] = await this.prisma.calendar.findMany({
      where: { organizationId },
      include: {
        segments: true,
        holidays: true,
        _count: { select: { agreements: true } },
      },
      orderBy: { agreements: { _count: 'desc' } },
      take: 1,
    });

    return maisUsado ?? null;
  }

  /** Contagem de chamados por time atribuído, com o recorte dado. */
  private async porTime(
    organizationId: string,
    recorte: Prisma.Sql,
  ): Promise<Map<string | null, number>> {
    const linhas = await this.prisma.$queryRaw<{ teamid: string | null; total: bigint }[]>(
      Prisma.sql`
        SELECT ta."teamId" AS teamid, COUNT(DISTINCT t."id") AS total
        FROM "tickets" t
        LEFT JOIN "ticket_actors" ta
          ON ta."ticketId" = t."id" AND ta."role" = 'ATRIBUIDO' AND ta."teamId" IS NOT NULL
        WHERE t."organizationId" = ${organizationId}::uuid AND ${recorte}
        GROUP BY ta."teamId"
      `,
    );

    return new Map(linhas.map((l) => [l.teamid, Number(l.total)]));
  }

  /**
   * Horas apontadas por time no período.
   *
   * O tempo vive no `payload` do evento de tarefa, em segundos — a
   * tarefa é um `TicketEvent` e não tabela própria (regra 8), então a
   * soma sai do Json. Em segundos e não em horas fracionadas porque foi
   * assim que ele foi gravado.
   */
  private async horasApontadasPorTime(
    organizationId: string,
    de: Date,
    ate: Date,
  ): Promise<Map<string | null, number>> {
    const linhas = await this.prisma.$queryRaw<{ teamid: string | null; segundos: bigint }[]>`
      SELECT ta."teamId" AS teamid,
             COALESCE(SUM((e."payload"->>'spentSeconds')::bigint), 0) AS segundos
      FROM "ticket_events" e
      JOIN "tickets" t ON t."id" = e."ticketId"
      LEFT JOIN "ticket_actors" ta
        ON ta."ticketId" = t."id" AND ta."role" = 'ATRIBUIDO' AND ta."teamId" IS NOT NULL
      WHERE t."organizationId" = ${organizationId}::uuid
        AND e."type" = 'TAREFA'
        AND e."createdAt" >= ${de} AND e."createdAt" <= ${ate}
        AND (e."payload"->>'spentSeconds') IS NOT NULL
      GROUP BY ta."teamId"
    `;

    return new Map(linhas.map((l) => [l.teamid, Number(l.segundos) / 3600]));
  }

  /** Quantos chamados do período não têm tempo apontado nenhum. */
  private async chamadosSemApontamento(
    organizationId: string,
    de: Date,
    ate: Date,
  ): Promise<number> {
    const [linha] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total
      FROM "tickets" t
      WHERE t."organizationId" = ${organizationId}::uuid
        AND t."createdAt" >= ${de} AND t."createdAt" <= ${ate}
        AND NOT EXISTS (
          SELECT 1 FROM "ticket_events" e
           WHERE e."ticketId" = t."id"
             AND e."type" = 'TAREFA'
             AND COALESCE((e."payload"->>'spentSeconds')::bigint, 0) > 0
        )
    `;

    return Number(linha?.total ?? 0);
  }

}

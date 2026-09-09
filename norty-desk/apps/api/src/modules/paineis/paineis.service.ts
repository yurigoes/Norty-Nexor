import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  Channel,
  FatiaDeContagem,
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
import { inicioDoPeriodo, type PainelDto, type RelatorioSlaDto } from './dto';

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
}

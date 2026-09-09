import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ErroConhecidoSugerido,
  type ProblemaChamadoRef,
  type ProblemaDetalhe,
  type ProblemaResumo,
  type ProblemStatus,
  type Scale,
  type TicketEventView,
  OPEN_PROBLEM_STATUSES,
  canTransitionProblem,
  podeSerErroConhecido,
  problemTag,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { derivarPrioridade } from '../../common/prioridade';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import { INCLUDE_EVENTO, paraEvento } from '../tickets/tickets.serializador';
import { WebhooksService } from '../webhooks/webhooks.service';
import type {
  BuscarProblemasDto,
  CriarProblemaDto,
  EditarProblemaDto,
  NotaDoProblemaDto,
} from './dto';

const INCLUDE = {
  category: true,
  assignedTeam: true,
  assignedUser: true,
  article: { select: { id: true, title: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.ProblemInclude;

type ProblemaComRelacoes = Prisma.ProblemGetPayload<{ include: typeof INCLUDE }>;

/**
 * Problema.
 *
 * O que o GLPI chama de problema é um chamado com outra tabela: mesmos
 * status, mesma tela, e a causa raiz num campo de texto que ninguém
 * preenche. O que falta lá é justamente o que faz gestão de problema
 * valer a pena — o **erro conhecido**: causa e contorno publicados
 * juntos, achados pela busca na hora em que o décimo chamado igual
 * chega.
 *
 * Por isso aqui o status conta a investigação (`INVESTIGANDO`,
 * `CAUSA_IDENTIFICADA`, `CONTORNO_PUBLICADO`) e `isKnownError` só pode
 * ser ligado com as duas coisas escritas — regra que também é CHECK no
 * banco (CLAUDE.md, regra 4).
 */
@Injectable()
export class ProblemasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly webhooks: WebhooksService,
  ) {}

  // -------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------

  async buscar(usuario: UsuarioAutenticado, filtro: BuscarProblemasDto): Promise<ProblemaResumo[]> {
    const limite = filtro.limit ?? 50;
    const termo = filtro.q?.trim();

    const onde: Prisma.ProblemWhereInput = {
      organizationId: usuario.organizationId,
      // `status` e `abertos` decidem a mesma coluna: o pedido explícito
      // manda. Espalhar os dois deixaria o segundo apagar o primeiro em
      // silêncio, conforme a ordem das chaves.
      ...(filtro.status
        ? { status: filtro.status }
        : filtro.abertos
          ? { status: { in: [...OPEN_PROBLEM_STATUSES] } }
          : {}),
      ...(filtro.isKnownError === undefined ? {} : { isKnownError: filtro.isKnownError }),
      ...(filtro.assignedTeamId ? { assignedTeamId: filtro.assignedTeamId } : {}),
      ...(filtro.assignedUserId ? { assignedUserId: filtro.assignedUserId } : {}),
      ...(termo ? { id: { in: await this.idsPorTexto(usuario.organizationId, termo, limite) } } : {}),
    };

    const problemas = await this.prisma.problem.findMany({
      where: onde,
      include: INCLUDE,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: limite,
    });

    return problemas.map((p) => ProblemasService.paraResumo(p));
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<ProblemaDetalhe> {
    const problema = await this.exigir(usuario, id);

    const chamados = await this.prisma.ticket.findMany({
      where: { problemId: id },
      select: { id: true, number: true, subject: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return ProblemasService.paraDetalhe(problema, chamados);
  }

  /** A linha do tempo do problema: as mesmas peças da do chamado. */
  async eventos(usuario: UsuarioAutenticado, id: string): Promise<TicketEventView[]> {
    await this.exigir(usuario, id);

    const eventos = await this.prisma.ticketEvent.findMany({
      where: { problemId: id },
      include: INCLUDE_EVENTO,
      orderBy: { createdAt: 'asc' },
    });

    return eventos.map(paraEvento);
  }

  /**
   * Erros conhecidos que se parecem com este chamado.
   *
   * É o gesto que devolve o investimento da gestão de problema: quem
   * abre o chamado número dez vê o contorno antes de escalar. A busca é
   * a mesma da base de conhecimento — lexemas em `OU` e `ts_rank` —,
   * porque assunto de chamado nunca casa com todos os termos.
   */
  async errosConhecidosParaChamado(
    usuario: UsuarioAutenticado,
    ticketId: string,
  ): Promise<ErroConhecidoSugerido[]> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { subject: true, description: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    return this.errosConhecidosPorTexto(
      usuario.organizationId,
      `${chamado.subject} ${chamado.description}`,
      5,
    );
  }

  /** A base de erros conhecidos, buscada por texto livre. */
  async errosConhecidos(
    usuario: UsuarioAutenticado,
    termo: string | undefined,
    limite: number,
  ): Promise<ErroConhecidoSugerido[]> {
    const texto = termo?.trim();

    if (!texto) {
      const recentes = await this.prisma.problem.findMany({
        where: { organizationId: usuario.organizationId, isKnownError: true },
        select: { id: true, number: true, title: true, workaround: true, status: true },
        orderBy: { knownErrorAt: 'desc' },
        take: limite,
      });

      return recentes.map((p) => ({ ...p, score: 0 }));
    }

    return this.errosConhecidosPorTexto(usuario.organizationId, texto, limite);
  }

  // -------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------

  async criar(usuario: UsuarioAutenticado, dto: CriarProblemaDto): Promise<ProblemaDetalhe> {
    await this.exigirClassificacaoDaOrganizacao(usuario, dto);

    const urgency = (dto.urgency ?? 3) as Scale;
    const impact = (dto.impact ?? 3) as Scale;
    const priority = await derivarPrioridade(this.prisma, usuario.organizationId, urgency, impact);

    const erroConhecido = dto.isKnownError ?? false;
    if (erroConhecido && !podeSerErroConhecido(dto)) {
      throw new BadRequestException(
        'Erro conhecido exige causa raiz e solução de contorno preenchidas.',
      );
    }

    const chamados = await this.exigirChamadosLegiveis(usuario, dto.ticketIds ?? []);

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await ProblemasService.proximoNumero(tx, usuario.organizationId);

      const problema = await tx.problem.create({
        data: {
          organizationId: usuario.organizationId,
          number,
          title: dto.title,
          description: dto.description,
          status: dto.status ?? 'NOVO',
          urgency,
          impact,
          priority,
          categoryId: dto.categoryId ?? null,
          assignedTeamId: dto.assignedTeamId ?? null,
          assignedUserId: dto.assignedUserId ?? null,
          rootCause: dto.rootCause ?? null,
          workaround: dto.workaround ?? null,
          isKnownError: erroConhecido,
          knownErrorAt: erroConhecido ? new Date() : null,
          articleId: dto.articleId ?? null,
        },
        select: { id: true },
      });

      if (chamados.length > 0) {
        await tx.ticket.updateMany({
          where: { id: { in: chamados.map((c) => c.id) } },
          data: { problemId: problema.id },
        });
      }

      await tx.ticketEvent.create({
        data: {
          problemId: problema.id,
          type: 'NOTA_INTERNA',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          body: `Problema ${problemTag(number)} aberto.`,
        },
      });

      return problema.id;
    });

    await this.auditoria.registrar(usuario, {
      action: 'problema.criado',
      entity: 'Problem',
      entityId: id,
      depois: { title: dto.title, status: dto.status ?? 'NOVO' },
    });

    await this.webhooks.emitir(usuario.organizationId, 'problema.criado', {
      problemId: id,
      titulo: dto.title,
      chamados: chamados.map((c) => c.id),
    });

    return this.obter(usuario, id);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarProblemaDto,
  ): Promise<ProblemaDetalhe> {
    const antes = await this.exigir(usuario, id);
    await this.exigirClassificacaoDaOrganizacao(usuario, dto);

    if (dto.status && dto.status !== antes.status && !canTransitionProblem(antes.status, dto.status)) {
      throw new ConflictException(
        `Um problema ${antes.status} não vai para ${dto.status}.`,
      );
    }

    // A regra do erro conhecido lê o estado **depois** da edição: quem
    // escreve causa, contorno e `isKnownError` na mesma requisição não
    // deve ser recusado por causa do estado anterior.
    const rootCause = dto.rootCause === undefined ? antes.rootCause : dto.rootCause;
    const workaround = dto.workaround === undefined ? antes.workaround : dto.workaround;
    const erroConhecido = dto.isKnownError ?? antes.isKnownError;

    if (erroConhecido && !podeSerErroConhecido({ rootCause, workaround })) {
      throw new BadRequestException(
        'Erro conhecido exige causa raiz e solução de contorno preenchidas. ' +
          'Para limpar uma das duas, desmarque o erro conhecido na mesma edição.',
      );
    }

    const urgency = (dto.urgency ?? antes.urgency) as Scale;
    const impact = (dto.impact ?? antes.impact) as Scale;
    const priority =
      urgency === antes.urgency && impact === antes.impact
        ? (antes.priority as Scale)
        : await derivarPrioridade(this.prisma, usuario.organizationId, urgency, impact);

    const status = dto.status ?? antes.status;
    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.problem.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          status,
          urgency,
          impact,
          priority,
          ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
          ...(dto.assignedTeamId === undefined ? {} : { assignedTeamId: dto.assignedTeamId }),
          ...(dto.assignedUserId === undefined ? {} : { assignedUserId: dto.assignedUserId }),
          rootCause,
          workaround,
          isKnownError: erroConhecido,
          // O carimbo marca quando virou erro conhecido, e é por ele que
          // a base ordena. Reescrevê-lo a cada edição faria um erro
          // documentado em janeiro parecer descoberto hoje.
          knownErrorAt: erroConhecido ? (antes.knownErrorAt ?? agora) : null,
          ...(dto.articleId === undefined ? {} : { articleId: dto.articleId }),
          resolvedAt: ProblemasService.carimboDeResolucao(status, antes.resolvedAt, agora),
          closedAt: status === 'FECHADO' ? (antes.closedAt ?? agora) : null,
        },
      });

      if (status !== antes.status) {
        await tx.ticketEvent.create({
          data: {
            problemId: id,
            type: 'MUDANCA_STATUS_PROBLEMA',
            visibility: 'INTERNA',
            authorId: usuario.userId,
            channel: 'WEB',
            payload: {
              type: 'MUDANCA_STATUS_PROBLEMA',
              from: antes.status,
              to: status,
            },
          },
        });
      }

      if (erroConhecido && !antes.isKnownError) {
        await tx.ticketEvent.create({
          data: {
            problemId: id,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            authorId: usuario.userId,
            channel: 'WEB',
            body: 'Publicado como erro conhecido: causa raiz e contorno documentados.',
          },
        });
      }
    });

    await this.auditoria.registrar(usuario, {
      action: 'problema.editado',
      entity: 'Problem',
      entityId: id,
      antes: {
        status: antes.status,
        isKnownError: antes.isKnownError,
        rootCause: antes.rootCause,
        workaround: antes.workaround,
      },
      depois: { status, isKnownError: erroConhecido, rootCause, workaround },
    });

    if (erroConhecido && !antes.isKnownError) {
      await this.webhooks.emitir(usuario.organizationId, 'problema.erro-conhecido', {
        problemId: id,
        numero: antes.number,
        titulo: dto.title ?? antes.title,
        contorno: workaround,
      });
    }

    return this.obter(usuario, id);
  }

  /** Uma nota na linha do tempo do problema. Sempre interna: problema não tem portal. */
  async anotar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: NotaDoProblemaDto,
  ): Promise<TicketEventView[]> {
    await this.exigir(usuario, id);

    await this.prisma.ticketEvent.create({
      data: {
        problemId: id,
        type: 'NOTA_INTERNA',
        visibility: 'INTERNA',
        authorId: usuario.userId,
        channel: 'WEB',
        body: dto.body,
      },
    });

    return this.eventos(usuario, id);
  }

  // -------------------------------------------------------------------
  // Vínculo com chamados
  // -------------------------------------------------------------------

  async vincularChamado(
    usuario: UsuarioAutenticado,
    id: string,
    ticketId: string,
  ): Promise<ProblemaDetalhe> {
    const problema = await this.exigir(usuario, id);
    const [chamado] = await this.exigirChamadosLegiveis(usuario, [ticketId]);

    if (chamado.problemId === id) return this.obter(usuario, id);

    await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id: ticketId }, data: { problemId: id } }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'NOTA_INTERNA',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          body: `Vinculado ao problema ${problemTag(problema.number)} ${problema.title}.`,
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          problemId: id,
          type: 'NOTA_INTERNA',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          body: `Chamado #${chamado.number} vinculado.`,
        },
      }),
    ]);

    return this.obter(usuario, id);
  }

  async desvincularChamado(
    usuario: UsuarioAutenticado,
    id: string,
    ticketId: string,
  ): Promise<ProblemaDetalhe> {
    await this.exigir(usuario, id);

    // `updateMany` com o `problemId` no `where`: desvincular um chamado
    // que pertence a outro problema seria apagar o vínculo alheio.
    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticketId, organizationId: usuario.organizationId, problemId: id },
      data: { problemId: null },
    });

    if (count === 0) throw new NotFoundException('Este chamado não está vinculado ao problema.');

    return this.obter(usuario, id);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async exigir(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<ProblemaComRelacoes> {
    const problema = await this.prisma.problem.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });

    if (!problema) throw new NotFoundException('Problema não encontrado.');
    return problema;
  }

  /**
   * Os chamados existem, são da organização e o usuário pode lê-los.
   *
   * O escopo de leitura vale aqui como em qualquer outro lugar: vincular
   * não pode virar a porta lateral que revela o número e o assunto de um
   * chamado que a pessoa não veria na fila.
   */
  private async exigirChamadosLegiveis(
    usuario: UsuarioAutenticado,
    ticketIds: readonly string[],
  ): Promise<{ id: string; number: number; problemId: string | null }[]> {
    if (ticketIds.length === 0) return [];

    const chamados = await this.prisma.ticket.findMany({
      where: { AND: [escopoDeLeitura(usuario), { id: { in: [...ticketIds] } }] },
      select: { id: true, number: true, problemId: true },
    });

    if (chamados.length !== new Set(ticketIds).size) {
      throw new NotFoundException('Chamado não encontrado.');
    }

    return chamados;
  }

  /** Categoria, time, responsável e artigo têm de ser da organização. */
  private async exigirClassificacaoDaOrganizacao(
    usuario: UsuarioAutenticado,
    dto: { categoryId?: string | null; assignedTeamId?: string | null; assignedUserId?: string | null; articleId?: string | null },
  ): Promise<void> {
    const organizationId = usuario.organizationId;

    if (dto.categoryId) {
      const existe = await this.prisma.category.count({ where: { id: dto.categoryId, organizationId } });
      if (!existe) throw new BadRequestException('Categoria não encontrada nesta organização.');
    }

    if (dto.assignedTeamId) {
      const existe = await this.prisma.team.count({ where: { id: dto.assignedTeamId, organizationId } });
      if (!existe) throw new BadRequestException('Time não encontrado nesta organização.');
    }

    if (dto.assignedUserId) {
      const existe = await this.prisma.user.count({
        where: { id: dto.assignedUserId, memberships: { some: { organizationId } } },
      });
      if (!existe) throw new BadRequestException('Responsável não encontrado nesta organização.');
    }

    if (dto.articleId) {
      const existe = await this.prisma.article.count({ where: { id: dto.articleId, organizationId } });
      if (!existe) throw new BadRequestException('Artigo não encontrado nesta organização.');
    }
  }

  /**
   * Aloca o próximo número da organização.
   *
   * Mesmo bloqueio consultivo do chamado, com chave própria: problema e
   * chamado numeram em sequências separadas, e um lock só faria as duas
   * aberturas esperarem uma pela outra sem motivo.
   */
  private static async proximoNumero(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('problem'), hashtext(${organizationId}))`;
    const [linha] = await tx.$queryRaw<{ proximo: number }[]>`
      SELECT COALESCE(MAX(number), 0) + 1 AS proximo
      FROM problems WHERE "organizationId" = ${organizationId}::uuid
    `;
    return Number(linha?.proximo ?? 1);
  }

  /**
   * Busca por texto no título e na descrição.
   *
   * Os lexemas do termo viram um `OU` citado — `plainto_tsquery`
   * exigiria todos e não casaria nada com um assunto de chamado inteiro.
   * A expressão do `to_tsvector` é a mesma do índice `problems_busca`;
   * mudar uma sem a outra faz a busca deixar de usar o índice.
   */
  private async idsPorTexto(
    organizationId: string,
    termo: string,
    limite: number,
  ): Promise<string[]> {
    const linhas = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH consulta AS (
        SELECT to_tsquery(
                 'portuguese',
                 nullif(string_agg(quote_literal(lexeme), ' | '), '')
               ) AS q
        FROM unnest(to_tsvector('portuguese', ${termo})) AS t(lexeme, positions, weights)
      )
      SELECT p."id"
      FROM "problems" p, consulta
      WHERE p."organizationId" = ${organizationId}::uuid
        AND consulta.q IS NOT NULL
        AND to_tsvector('portuguese', p."title" || ' ' || p."description") @@ consulta.q
      ORDER BY ts_rank(
                 to_tsvector('portuguese', p."title" || ' ' || p."description"),
                 consulta.q
               ) DESC
      LIMIT ${limite}
    `;

    return linhas.map((l) => l.id);
  }

  private async errosConhecidosPorTexto(
    organizationId: string,
    termo: string,
    limite: number,
  ): Promise<ErroConhecidoSugerido[]> {
    return this.prisma.$queryRaw<ErroConhecidoSugerido[]>`
      WITH consulta AS (
        SELECT to_tsquery(
                 'portuguese',
                 nullif(string_agg(quote_literal(lexeme), ' | '), '')
               ) AS q
        FROM unnest(to_tsvector('portuguese', ${termo})) AS t(lexeme, positions, weights)
      )
      SELECT p."id",
             p."number",
             p."title",
             p."workaround",
             p."status",
             ts_rank(
               to_tsvector('portuguese', p."title" || ' ' || p."description"),
               consulta.q
             )::float8 AS score
      FROM "problems" p, consulta
      WHERE p."organizationId" = ${organizationId}::uuid
        AND p."isKnownError" = true
        AND consulta.q IS NOT NULL
        AND to_tsvector('portuguese', p."title" || ' ' || p."description") @@ consulta.q
      ORDER BY score DESC, p."knownErrorAt" DESC
      LIMIT ${limite}
    `;
  }

  /**
   * `resolvedAt` sobrevive ao fechamento.
   *
   * Fechar depois de resolver não é resolver de novo: apagar o carimbo
   * ali faria o tempo médio de resolução perder justamente os problemas
   * que chegaram ao fim.
   */
  private static carimboDeResolucao(
    status: ProblemStatus,
    anterior: Date | null,
    agora: Date,
  ): Date | null {
    if (status === 'RESOLVIDO') return anterior ?? agora;
    if (status === 'FECHADO') return anterior;
    return null;
  }

  // -------------------------------------------------------------------
  // Serialização
  // -------------------------------------------------------------------

  private static paraResumo(p: ProblemaComRelacoes): ProblemaResumo {
    return {
      id: p.id,
      number: p.number,
      title: p.title,
      status: p.status,
      urgency: p.urgency as Scale,
      impact: p.impact as Scale,
      priority: p.priority as Scale,
      category: p.category ? { id: p.category.id, name: p.category.name } : null,
      assignedTeam: p.assignedTeam
        ? {
            kind: 'TEAM',
            id: p.assignedTeam.id,
            name: p.assignedTeam.name,
            email: p.assignedTeam.email ?? undefined,
          }
        : null,
      assignedUser: p.assignedUser
        ? {
            kind: 'USER',
            id: p.assignedUser.id,
            name: p.assignedUser.name,
            email: p.assignedUser.email,
          }
        : null,
      isKnownError: p.isKnownError,
      ticketCount: p._count.tickets,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private static paraDetalhe(
    p: ProblemaComRelacoes,
    chamados: { id: string; number: number; subject: string; status: ProblemaChamadoRef['status']; createdAt: Date }[],
  ): ProblemaDetalhe {
    return {
      ...ProblemasService.paraResumo(p),
      description: p.description,
      rootCause: p.rootCause,
      workaround: p.workaround,
      knownErrorAt: p.knownErrorAt?.toISOString() ?? null,
      article: p.article,
      resolvedAt: p.resolvedAt?.toISOString() ?? null,
      closedAt: p.closedAt?.toISOString() ?? null,
      tickets: chamados.map((c) => ({
        id: c.id,
        number: c.number,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}

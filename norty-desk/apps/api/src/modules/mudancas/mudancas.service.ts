import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ApprovalView,
  type ChangeStatus,
  type MudancaDetalhe,
  type MudancaResumo,
  type ProblemaChamadoRef,
  type TicketEventView,
  OPEN_CHANGE_STATUSES,
  canTransitionChange,
  changeTag,
  exigeAprovacaoAntesDeExecutar,
  exigeJanela,
  podeSairDoRascunho,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AprovacoesService } from '../aprovacoes/aprovacoes.service';
import type { SolicitarAprovacaoDto } from '../aprovacoes/dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import { INCLUDE_EVENTO, paraEvento } from '../tickets/tickets.serializador';
import { WebhooksService } from '../webhooks/webhooks.service';
import type {
  BuscarMudancasDto,
  CriarMudancaDto,
  EditarMudancaDto,
  ExecutarMudancaDto,
  NotaDaMudancaDto,
} from './dto';

const INCLUDE = {
  category: true,
  assignedTeam: true,
  assignedUser: true,
  problem: { select: { id: true, number: true, title: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.ChangeInclude;

type MudancaComRelacoes = Prisma.ChangeGetPayload<{ include: typeof INCLUDE }>;

/** Status a partir dos quais a mudança já saiu do papel. */
const JA_EXECUTANDO: readonly ChangeStatus[] = ['EM_EXECUCAO', 'CONCLUIDA', 'REVERTIDA'];

/**
 * Mudança.
 *
 * O GLPI tem a tabela e a tela; o que ele não tem é a regra. Lá, uma
 * mudança sem plano de recuo entra em produção do mesmo jeito que uma
 * com — e a diferença entre as duas é justamente o que a gestão de
 * mudança existe para garantir.
 *
 * As três regras que este serviço sustenta, e que o GLPI deixa como
 * convenção de processo:
 *
 * 1. **Sem plano de implementação e de recuo, não sai do rascunho.**
 * 2. **Mudança normal não executa sem aval.** A padrão é pré-aprovada
 *    por definição; a emergencial executa primeiro e aprova depois — e
 *    o registro da aprovação atrasada é o que impede "emergencial" de
 *    virar o caminho de fuga de todo mundo.
 * 3. **Agendada exige janela.** "Agendada para quando?" precisa de
 *    resposta antes de virar status.
 */
@Injectable()
export class MudancasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aprovacoes: AprovacoesService,
    private readonly auditoria: AuditoriaService,
    private readonly webhooks: WebhooksService,
  ) {}

  // -------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------

  async buscar(usuario: UsuarioAutenticado, filtro: BuscarMudancasDto): Promise<MudancaResumo[]> {
    const limite = filtro.limit ?? 50;
    const termo = filtro.q?.trim();

    const onde: Prisma.ChangeWhereInput = {
      organizationId: usuario.organizationId,
      ...(filtro.status
        ? { status: filtro.status }
        : filtro.abertas
          ? { status: { in: [...OPEN_CHANGE_STATUSES] } }
          : {}),
      ...(filtro.kind ? { kind: filtro.kind } : {}),
      ...(filtro.risk ? { risk: filtro.risk } : {}),
      // A agenda pergunta "o que passa nesta semana": a janela que
      // *começa* dentro do intervalo é o recorte que responde isso sem
      // trazer a mudança de três meses que ainda não terminou.
      ...(filtro.de || filtro.ate
        ? {
            windowStart: {
              ...(filtro.de ? { gte: new Date(filtro.de) } : {}),
              ...(filtro.ate ? { lte: new Date(filtro.ate) } : {}),
            },
          }
        : {}),
      ...(termo
        ? { id: { in: await this.idsPorTexto(usuario.organizationId, termo, limite) } }
        : {}),
    };

    const mudancas = await this.prisma.change.findMany({
      where: onde,
      include: INCLUDE,
      // A janela manda na ordem: quem abre esta tela quer saber o que
      // vem primeiro, não o que foi cadastrado por último.
      orderBy: [{ windowStart: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: limite,
    });

    return mudancas.map((m) => MudancasService.paraResumo(m));
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<MudancaDetalhe> {
    const mudanca = await this.exigir(usuario, id);

    const [chamados, aprovacoes] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { changeId: id },
        select: { id: true, number: true, subject: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.aprovacoes.listarDaMudanca(id),
    ]);

    return MudancasService.paraDetalhe(mudanca, chamados, aprovacoes);
  }

  async eventos(usuario: UsuarioAutenticado, id: string): Promise<TicketEventView[]> {
    await this.exigir(usuario, id);

    const eventos = await this.prisma.ticketEvent.findMany({
      where: { changeId: id },
      include: INCLUDE_EVENTO,
      orderBy: { createdAt: 'asc' },
    });

    return eventos.map(paraEvento);
  }

  // -------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------

  async criar(usuario: UsuarioAutenticado, dto: CriarMudancaDto): Promise<MudancaDetalhe> {
    await this.exigirClassificacaoDaOrganizacao(usuario, dto);
    MudancasService.exigirJanelaCoerente(dto.windowStart, dto.windowEnd);

    const chamados = await this.exigirChamadosLegiveis(usuario, dto.ticketIds ?? []);

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await MudancasService.proximoNumero(tx, usuario.organizationId);

      const mudanca = await tx.change.create({
        data: {
          organizationId: usuario.organizationId,
          number,
          title: dto.title,
          description: dto.description,
          kind: dto.kind ?? 'NORMAL',
          risk: dto.risk ?? 'MEDIO',
          categoryId: dto.categoryId ?? null,
          assignedTeamId: dto.assignedTeamId ?? null,
          assignedUserId: dto.assignedUserId ?? null,
          implementationPlan: dto.implementationPlan ?? null,
          testPlan: dto.testPlan ?? null,
          rollbackPlan: dto.rollbackPlan ?? null,
          windowStart: dto.windowStart ? new Date(dto.windowStart) : null,
          windowEnd: dto.windowEnd ? new Date(dto.windowEnd) : null,
          problemId: dto.problemId ?? null,
        },
        select: { id: true },
      });

      if (chamados.length > 0) {
        await tx.ticket.updateMany({
          where: { id: { in: chamados.map((c) => c.id) } },
          data: { changeId: mudanca.id },
        });
      }

      await tx.ticketEvent.create({
        data: {
          changeId: mudanca.id,
          type: 'NOTA_INTERNA',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          body: `Mudança ${changeTag(number)} aberta como rascunho.`,
        },
      });

      return mudanca.id;
    });

    await this.auditoria.registrar(usuario, {
      action: 'mudanca.criada',
      entity: 'Change',
      entityId: id,
      depois: { title: dto.title, kind: dto.kind ?? 'NORMAL', risk: dto.risk ?? 'MEDIO' },
    });

    return this.obter(usuario, id);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarMudancaDto,
  ): Promise<MudancaDetalhe> {
    const antes = await this.exigir(usuario, id);
    await this.exigirClassificacaoDaOrganizacao(usuario, dto);

    const windowStart =
      dto.windowStart === undefined
        ? antes.windowStart
        : dto.windowStart
          ? new Date(dto.windowStart)
          : null;
    const windowEnd =
      dto.windowEnd === undefined
        ? antes.windowEnd
        : dto.windowEnd
          ? new Date(dto.windowEnd)
          : null;

    MudancasService.exigirJanelaCoerente(windowStart, windowEnd);

    const status = dto.status ?? antes.status;

    if (status !== antes.status) {
      this.exigirTransicaoValida(antes, dto, status, { windowStart, windowEnd });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.change.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(dto.kind === undefined ? {} : { kind: dto.kind }),
          ...(dto.risk === undefined ? {} : { risk: dto.risk }),
          status,
          ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
          ...(dto.assignedTeamId === undefined ? {} : { assignedTeamId: dto.assignedTeamId }),
          ...(dto.assignedUserId === undefined ? {} : { assignedUserId: dto.assignedUserId }),
          ...(dto.implementationPlan === undefined
            ? {}
            : { implementationPlan: dto.implementationPlan }),
          ...(dto.testPlan === undefined ? {} : { testPlan: dto.testPlan }),
          ...(dto.rollbackPlan === undefined ? {} : { rollbackPlan: dto.rollbackPlan }),
          windowStart,
          windowEnd,
          ...(dto.outcome === undefined ? {} : { outcome: dto.outcome }),
          ...(dto.problemId === undefined ? {} : { problemId: dto.problemId }),
        },
      });

      if (status !== antes.status) {
        await MudancasService.registrarMudancaDeStatus(tx, id, usuario, antes.status, status);
      }
    });

    await this.auditoria.registrar(usuario, {
      action: 'mudanca.editada',
      entity: 'Change',
      entityId: id,
      antes: { status: antes.status, kind: antes.kind, risk: antes.risk },
      depois: { status, kind: dto.kind ?? antes.kind, risk: dto.risk ?? antes.risk },
    });

    return this.obter(usuario, id);
  }

  /**
   * Pede aprovação.
   *
   * Sem plano não se pede aval: mandar um comitê olhar um rascunho vazio
   * é o jeito mais rápido de o comitê parar de olhar.
   */
  async solicitarAprovacao(
    usuario: UsuarioAutenticado,
    id: string,
    dto: SolicitarAprovacaoDto,
  ): Promise<ApprovalView[]> {
    const mudanca = await this.exigir(usuario, id);

    if (!podeSairDoRascunho(mudanca)) {
      throw new BadRequestException(
        'Escreva o plano de implementação e o plano de recuo antes de pedir aprovação.',
      );
    }

    return this.aprovacoes.solicitarDaMudanca(usuario, mudanca, dto);
  }

  /**
   * Executa: iniciar, concluir, reverter.
   *
   * Rota própria porque os três carimbam horário e escrevem o desfecho —
   * e porque a permissão é outra: quem passa a madrugada aplicando é
   * quem sabe dizer se deu certo, mas não é quem dá o aval.
   */
  async executar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: ExecutarMudancaDto,
  ): Promise<MudancaDetalhe> {
    const antes = await this.exigir(usuario, id);
    const agora = new Date();

    const destino: ChangeStatus =
      dto.acao === 'INICIAR' ? 'EM_EXECUCAO' : dto.acao === 'CONCLUIR' ? 'CONCLUIDA' : 'REVERTIDA';

    if (!canTransitionChange(antes.status, destino)) {
      throw new ConflictException(`Uma mudança ${antes.status} não vai para ${destino}.`);
    }

    if (dto.acao === 'INICIAR') {
      if (!podeSairDoRascunho(antes)) {
        throw new BadRequestException(
          'Sem plano de implementação e plano de recuo, a mudança não vai a campo.',
        );
      }

      // A regra que o GLPI não tem. A padrão é pré-aprovada; a
      // emergencial aprova depois — e o "depois" fica registrado.
      //
      // `AGENDADA` passa porque só se chega nela vindo de `APROVADA`: o
      // aval já aconteceu.
      if (
        exigeAprovacaoAntesDeExecutar(antes.kind) &&
        antes.status !== 'APROVADA' &&
        antes.status !== 'AGENDADA'
      ) {
        throw new ConflictException(
          'Mudança normal precisa de aprovação antes de executar. ' +
            'Se é emergencial, mude o tipo — e o aval fica registrado depois.',
        );
      }
    }

    if (dto.acao !== 'INICIAR' && !dto.outcome?.trim()) {
      throw new BadRequestException(
        dto.acao === 'CONCLUIR'
          ? 'Escreva o que aconteceu: é o registro que a próxima mudança parecida vai ler.'
          : 'Escreva por que a mudança foi revertida.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.change.update({
        where: { id },
        data: {
          status: destino,
          startedAt: dto.acao === 'INICIAR' ? (antes.startedAt ?? agora) : antes.startedAt,
          // Reverter também termina: o que a mudança não é mais é "em
          // execução", e sem o carimbo a janela ficaria aberta para
          // sempre no relatório.
          finishedAt: dto.acao === 'INICIAR' ? null : agora,
          ...(dto.outcome === undefined ? {} : { outcome: dto.outcome }),
        },
      });

      await MudancasService.registrarMudancaDeStatus(tx, id, usuario, antes.status, destino);

      if (dto.outcome?.trim()) {
        await tx.ticketEvent.create({
          data: {
            changeId: id,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            authorId: usuario.userId,
            channel: 'WEB',
            body: dto.outcome,
          },
        });
      }
    });

    await this.auditoria.registrar(usuario, {
      action: `mudanca.${dto.acao.toLowerCase()}`,
      entity: 'Change',
      entityId: id,
      antes: { status: antes.status },
      depois: { status: destino },
    });

    await this.webhooks.emitir(
      usuario.organizationId,
      destino === 'REVERTIDA' ? 'mudanca.revertida' : 'mudanca.executada',
      { changeId: id, numero: antes.number, titulo: antes.title, status: destino },
    );

    return this.obter(usuario, id);
  }

  async anotar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: NotaDaMudancaDto,
  ): Promise<TicketEventView[]> {
    await this.exigir(usuario, id);

    await this.prisma.ticketEvent.create({
      data: {
        changeId: id,
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
  ): Promise<MudancaDetalhe> {
    const mudanca = await this.exigir(usuario, id);
    const [chamado] = await this.exigirChamadosLegiveis(usuario, [ticketId]);

    if (chamado.changeId === id) return this.obter(usuario, id);

    await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id: ticketId }, data: { changeId: id } }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'NOTA_INTERNA',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          body: `Vinculado à mudança ${changeTag(mudanca.number)} ${mudanca.title}.`,
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          changeId: id,
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
  ): Promise<MudancaDetalhe> {
    await this.exigir(usuario, id);

    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticketId, organizationId: usuario.organizationId, changeId: id },
      data: { changeId: null },
    });

    if (count === 0) throw new NotFoundException('Este chamado não está vinculado à mudança.');

    return this.obter(usuario, id);
  }

  // -------------------------------------------------------------------
  // Regras de transição
  // -------------------------------------------------------------------

  /**
   * O que cada transição exige antes de acontecer.
   *
   * Reunidas num lugar só de propósito: espalhadas pelos `if` de quem
   * chama, a terceira delas seria esquecida por quem escrevesse a
   * quarta rota.
   */
  private exigirTransicaoValida(
    antes: MudancaComRelacoes,
    dto: EditarMudancaDto,
    destino: ChangeStatus,
    janela: { windowStart: Date | null; windowEnd: Date | null },
  ): void {
    if (!canTransitionChange(antes.status, destino)) {
      throw new ConflictException(`Uma mudança ${antes.status} não vai para ${destino}.`);
    }

    const plano = {
      implementationPlan:
        dto.implementationPlan === undefined ? antes.implementationPlan : dto.implementationPlan,
      rollbackPlan: dto.rollbackPlan === undefined ? antes.rollbackPlan : dto.rollbackPlan,
    };

    if (antes.status === 'RASCUNHO' && destino !== 'CANCELADA' && !podeSairDoRascunho(plano)) {
      throw new BadRequestException(
        'Escreva o plano de implementação e o plano de recuo antes de tirar a mudança do rascunho.',
      );
    }

    const tipo = dto.kind ?? antes.kind;

    if (
      JA_EXECUTANDO.includes(destino) &&
      exigeAprovacaoAntesDeExecutar(tipo) &&
      antes.status !== 'APROVADA' &&
      antes.status !== 'AGENDADA'
    ) {
      throw new ConflictException(
        'Mudança normal precisa de aprovação antes de executar. ' +
          'Se é emergencial, mude o tipo — e o aval fica registrado depois.',
      );
    }

    if (exigeJanela(destino) && (!janela.windowStart || !janela.windowEnd)) {
      throw new BadRequestException('Agendar exige a janela de execução: início e fim.');
    }
  }

  private static exigirJanelaCoerente(
    inicio: Date | string | null | undefined,
    fim: Date | string | null | undefined,
  ): void {
    if (!inicio || !fim) return;
    // O CHECK `changes_janela` já recusa no banco. Aqui a recusa vem com
    // uma frase em português, e não com o nome da restrição.
    if (new Date(fim) <= new Date(inicio)) {
      throw new BadRequestException('A janela termina antes de começar.');
    }
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private static async registrarMudancaDeStatus(
    tx: Prisma.TransactionClient,
    changeId: string,
    usuario: UsuarioAutenticado,
    de: ChangeStatus,
    para: ChangeStatus,
  ): Promise<void> {
    await tx.ticketEvent.create({
      data: {
        changeId,
        type: 'MUDANCA_STATUS_MUDANCA',
        visibility: 'INTERNA',
        authorId: usuario.userId,
        channel: 'WEB',
        payload: { type: 'MUDANCA_STATUS_MUDANCA', from: de, to: para },
      },
    });
  }

  private async exigir(usuario: UsuarioAutenticado, id: string): Promise<MudancaComRelacoes> {
    const mudanca = await this.prisma.change.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });

    if (!mudanca) throw new NotFoundException('Mudança não encontrada.');
    return mudanca;
  }

  private async exigirChamadosLegiveis(
    usuario: UsuarioAutenticado,
    ticketIds: readonly string[],
  ): Promise<{ id: string; number: number; changeId: string | null }[]> {
    if (ticketIds.length === 0) return [];

    const chamados = await this.prisma.ticket.findMany({
      where: { AND: [escopoDeLeitura(usuario), { id: { in: [...ticketIds] } }] },
      select: { id: true, number: true, changeId: true },
    });

    if (chamados.length !== new Set(ticketIds).size) {
      throw new NotFoundException('Chamado não encontrado.');
    }

    return chamados;
  }

  private async exigirClassificacaoDaOrganizacao(
    usuario: UsuarioAutenticado,
    dto: {
      categoryId?: string | null;
      assignedTeamId?: string | null;
      assignedUserId?: string | null;
      problemId?: string | null;
    },
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

    if (dto.assignedUserId) {
      const existe = await this.prisma.user.count({
        where: { id: dto.assignedUserId, memberships: { some: { organizationId } } },
      });
      if (!existe) throw new BadRequestException('Responsável não encontrado nesta organização.');
    }

    if (dto.problemId) {
      const existe = await this.prisma.problem.count({
        where: { id: dto.problemId, organizationId },
      });
      if (!existe) throw new BadRequestException('Problema não encontrado nesta organização.');
    }
  }

  /** Mesmo bloqueio consultivo do chamado, com chave própria. */
  private static async proximoNumero(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('change'), hashtext(${organizationId}))`;
    const [linha] = await tx.$queryRaw<{ proximo: number }[]>`
      SELECT COALESCE(MAX(number), 0) + 1 AS proximo
      FROM changes WHERE "organizationId" = ${organizationId}::uuid
    `;
    return Number(linha?.proximo ?? 1);
  }

  /**
   * Busca por texto. A expressão do `to_tsvector` é a mesma do índice
   * `changes_busca`; mudar uma sem a outra faz a busca deixar de usá-lo.
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
      SELECT c."id"
      FROM "changes" c, consulta
      WHERE c."organizationId" = ${organizationId}::uuid
        AND consulta.q IS NOT NULL
        AND to_tsvector('portuguese', c."title" || ' ' || c."description") @@ consulta.q
      ORDER BY ts_rank(
                 to_tsvector('portuguese', c."title" || ' ' || c."description"),
                 consulta.q
               ) DESC
      LIMIT ${limite}
    `;

    return linhas.map((l) => l.id);
  }

  // -------------------------------------------------------------------
  // Serialização
  // -------------------------------------------------------------------

  private static paraResumo(m: MudancaComRelacoes): MudancaResumo {
    return {
      id: m.id,
      number: m.number,
      title: m.title,
      status: m.status,
      kind: m.kind,
      risk: m.risk,
      category: m.category ? { id: m.category.id, name: m.category.name } : null,
      assignedTeam: m.assignedTeam
        ? {
            kind: 'TEAM',
            id: m.assignedTeam.id,
            name: m.assignedTeam.name,
            email: m.assignedTeam.email ?? undefined,
          }
        : null,
      assignedUser: m.assignedUser
        ? {
            kind: 'USER',
            id: m.assignedUser.id,
            name: m.assignedUser.name,
            email: m.assignedUser.email,
          }
        : null,
      windowStart: m.windowStart?.toISOString() ?? null,
      windowEnd: m.windowEnd?.toISOString() ?? null,
      ticketCount: m._count.tickets,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  private static paraDetalhe(
    m: MudancaComRelacoes,
    chamados: {
      id: string;
      number: number;
      subject: string;
      status: ProblemaChamadoRef['status'];
      createdAt: Date;
    }[],
    approvals: ApprovalView[],
  ): MudancaDetalhe {
    return {
      ...MudancasService.paraResumo(m),
      description: m.description,
      implementationPlan: m.implementationPlan,
      testPlan: m.testPlan,
      rollbackPlan: m.rollbackPlan,
      startedAt: m.startedAt?.toISOString() ?? null,
      finishedAt: m.finishedAt?.toISOString() ?? null,
      outcome: m.outcome,
      problem: m.problem,
      tickets: chamados.map((c) => ({
        id: c.id,
        number: c.number,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
      approvals,
    };
  }
}

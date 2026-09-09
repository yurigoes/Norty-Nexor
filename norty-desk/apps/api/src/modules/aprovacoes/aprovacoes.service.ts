import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ApprovalStatus,
  type ApprovalView,
  type TicketStatus,
  canTransition,
  desfechoDaAprovacao,
  estadoDaEtapa,
  faltamParaOQuorum,
  ticketTag,
} from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SaidaService } from '../channels/saida.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import { WebhooksService } from '../webhooks/webhooks.service';
import type { DecidirAprovacaoDto, SolicitarAprovacaoDto } from './dto';

/** O status para onde o chamado volta quando a aprovação se resolve. */
const RETORNO_PADRAO: TicketStatus = 'ATRIBUIDO';

type LinhaDeAprovacao = {
  step: number;
  quorum: number;
  status: ApprovalStatus;
};

type ResumoDoChamado = { id: string; number: number; subject: string };

/**
 * Traduz para o TypeScript o que o banco já garante.
 *
 * Desde a Fase 4 uma aprovação pertence a um chamado **ou** a uma
 * mudança — o CHECK `approvals_dono_unico` impede as duas e impede
 * nenhuma. Numa consulta filtrada por chamado a coluna nunca vem nula,
 * mas o Prisma tipa a coluna, não a consulta. Filtrar é mais honesto que
 * um `as`: se um dia a consulta mudar, some a linha em vez de estourar.
 */
function somenteDeChamado<T extends { ticketId: string | null; ticket: ResumoDoChamado | null }>(
  linhas: readonly T[],
): (T & { ticketId: string; ticket: ResumoDoChamado })[] {
  return linhas.flatMap((linha) =>
    linha.ticket && linha.ticketId
      ? [{ ...linha, ticketId: linha.ticketId, ticket: linha.ticket }]
      : [],
  );
}

/**
 * Aprovação em etapas.
 *
 * Substitui `glpi_ticketvalidations` + `glpi_validationsteps`. A
 * diferença que importa: a regra do quórum é uma função pura em
 * `packages/shared`, e tanto a API quanto o aplicativo a leem. No GLPI
 * a interface monta o desfecho por conta própria, e por isso a tela e o
 * relatório às vezes discordam.
 */
@Injectable()
export class AprovacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saida: SaidaService,
    private readonly webhooks: WebhooksService,
  ) {}

  // -------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------

  async listarDoChamado(usuario: UsuarioAutenticado, ticketId: string): Promise<ApprovalView[]> {
    await this.exigirChamado(usuario, ticketId);
    return this.listar(ticketId);
  }

  /**
   * As aprovações de um chamado, sem conferir o escopo de leitura.
   *
   * Quem já foi autorizado por outro caminho usa esta. É o caso de quem
   * acabou de decidir: um solicitante pode ser validador de um chamado
   * em que não é requerente nem observador, e `escopoDeLeitura` o
   * recusaria — devolvendo 404 logo depois de a decisão dele ter sido
   * gravada.
   */
  private async listar(ticketId: string): Promise<ApprovalView[]> {
    const linhas = await this.prisma.approval.findMany({
      where: { ticketId },
      include: { approver: true, ticket: { select: { id: true, number: true, subject: true } } },
      orderBy: [{ step: 'asc' }, { requestedAt: 'asc' }],
    });

    return somenteDeChamado(linhas).map((l) => AprovacoesService.paraView(l));
  }

  /**
   * O que espera decisão minha.
   *
   * Só as etapas que estão de fato correndo: uma linha da etapa 2 com a
   * etapa 1 ainda pendente não é minha vez, e mostrá-la faria alguém
   * decidir fora de ordem.
   */
  async minhas(usuario: UsuarioAutenticado): Promise<ApprovalView[]> {
    const minhas = somenteDeChamado(
      await this.prisma.approval.findMany({
        where: {
          approverId: usuario.userId,
          status: 'AGUARDANDO',
          ticket: { organizationId: usuario.organizationId },
        },
        include: { approver: true, ticket: { select: { id: true, number: true, subject: true } } },
        orderBy: { requestedAt: 'asc' },
      }),
    );

    if (minhas.length === 0) return [];

    // Uma consulta para todas as linhas dos chamados envolvidos: sem
    // isso seria uma consulta por aprovação para descobrir a etapa
    // corrente de cada chamado.
    const ticketIds = [...new Set(minhas.map((m) => m.ticketId))];
    const todas = await this.prisma.approval.findMany({
      where: { ticketId: { in: ticketIds } },
      select: { ticketId: true, step: true, quorum: true, status: true },
    });

    const porChamado = new Map<string, LinhaDeAprovacao[]>();
    for (const linha of todas) {
      if (!linha.ticketId) continue;
      const lista = porChamado.get(linha.ticketId) ?? [];
      lista.push(linha);
      porChamado.set(linha.ticketId, lista);
    }

    return minhas
      .filter((m) => {
        const desfecho = desfechoDaAprovacao(
          AprovacoesService.agruparEtapas(porChamado.get(m.ticketId) ?? []),
        );
        return desfecho.estado === 'AGUARDANDO' && desfecho.etapaAtual === m.step;
      })
      .map((l) => AprovacoesService.paraView(l));
  }

  // -------------------------------------------------------------------
  // Solicitação
  // -------------------------------------------------------------------

  async solicitar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: SolicitarAprovacaoDto,
  ): Promise<ApprovalView[]> {
    const chamado = await this.exigirChamado(usuario, ticketId);

    if (chamado.status === 'FECHADO') {
      throw new ConflictException('Chamado fechado. Reabra antes de pedir aprovação.');
    }

    const quorum = dto.quorum ?? dto.approverIds.length;
    if (quorum > dto.approverIds.length) {
      throw new BadRequestException(
        `O quórum é ${quorum} mas a etapa tem ${dto.approverIds.length} validador(es): ` +
          'ela nunca poderia ser aprovada.',
      );
    }

    // Validador tem de ser da organização. Sem esta checagem, um id de
    // usuário de outra empresa entraria pelo corpo da requisição.
    const validos = await this.prisma.user.findMany({
      where: {
        id: { in: dto.approverIds },
        memberships: { some: { organizationId: usuario.organizationId } },
      },
      select: { id: true },
    });

    if (validos.length !== dto.approverIds.length) {
      const encontrados = new Set(validos.map((v) => v.id));
      const faltando = dto.approverIds.filter((id) => !encontrados.has(id));
      throw new BadRequestException(
        `Estes validadores não pertencem à organização: ${faltando.join(', ')}.`,
      );
    }

    const ultima = await this.prisma.approval.aggregate({
      where: { ticketId },
      _max: { step: true },
    });

    const step = dto.step ?? (ultima._max.step ?? 0) + 1;

    // O status de origem vai no evento porque é para ele que o chamado
    // volta quando a aprovação se resolve. Guardar isso numa coluna nova
    // do chamado seria estado duplicado; a linha do tempo já é o registro.
    const origem = chamado.status as TicketStatus;
    const vaiParaAprovacao = origem !== 'EM_APROVACAO' && canTransition(origem, 'EM_APROVACAO');

    if (origem !== 'EM_APROVACAO' && !vaiParaAprovacao) {
      throw new ConflictException(
        `Um chamado ${origem} não entra em aprovação. Retome-o primeiro.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.approval.createMany({
        data: dto.approverIds.map((approverId) => ({
          ticketId,
          step,
          quorum,
          approverId,
        })),
        // Pedir de novo a mesma pessoa na mesma etapa não é erro: a
        // segunda chamada não deve apagar a decisão que ela já tomou.
        skipDuplicates: true,
      });

      if (vaiParaAprovacao) {
        await tx.ticket.update({ where: { id: ticketId }, data: { status: 'EM_APROVACAO' } });
        await tx.ticketEvent.create({
          data: {
            ticketId,
            type: 'MUDANCA_STATUS',
            visibility: 'PUBLICA',
            authorId: usuario.userId,
            channel: 'WEB',
            payload: { type: 'MUDANCA_STATUS', from: origem, to: 'EM_APROVACAO' },
          },
        });
      }

      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: 'APROVACAO',
          // Interna: para quem pediu e para quem decide. O solicitante
          // do chamado não precisa acompanhar a aprovação interna da
          // empresa que o atende.
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          body:
            dto.comment ??
            `Aprovação da etapa ${step} pedida a ${dto.approverIds.length} validador(es); ` +
              `${quorum} "sim" necessário(s).`,
          payload: { type: 'APROVACAO', approvalId: `etapa-${step}`, decision: 'AGUARDANDO' },
        },
      });
    });

    await this.avisarValidadores(ticketId, step, dto.approverIds);

    await this.webhooks.emitir(usuario.organizationId, 'aprovacao.solicitada', {
      ticketId,
      numero: chamado.number,
      etapa: step,
      quorum,
      validadores: dto.approverIds,
    });

    return this.listar(ticketId);
  }

  // -------------------------------------------------------------------
  // Decisão
  // -------------------------------------------------------------------

  async decidir(
    usuario: UsuarioAutenticado,
    approvalId: string,
    dto: DecidirAprovacaoDto,
  ): Promise<ApprovalView[]> {
    const linha = await this.prisma.approval.findUnique({
      where: { id: approvalId },
      include: { ticket: { select: { id: true, organizationId: true, status: true } } },
    });

    // Sem `ticket` a aprovação é de uma mudança, e esta rota é a do
    // chamado: para quem pergunta, ela simplesmente não existe aqui.
    if (!linha?.ticket || linha.ticket.organizationId !== usuario.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }

    const ticketId = linha.ticket.id;

    // Decidir é pessoal: nem supervisor decide no lugar de quem foi
    // designado. Permissão diz que a rota abre; isto diz de quem é a vez.
    if (linha.approverId !== usuario.userId) {
      throw new ForbiddenException('Esta aprovação é de outra pessoa.');
    }

    if (linha.status !== 'AGUARDANDO') {
      throw new ConflictException('Você já decidiu esta aprovação.');
    }

    const todas = await this.prisma.approval.findMany({
      where: { ticketId },
      select: { id: true, step: true, quorum: true, status: true },
    });

    const antes = desfechoDaAprovacao(AprovacoesService.agruparEtapas(todas));

    if (antes.estado !== 'AGUARDANDO') {
      throw new ConflictException('Esta aprovação já foi encerrada.');
    }

    if (antes.etapaAtual !== linha.step) {
      throw new ConflictException(
        `A etapa ${linha.step} ainda não começou: a etapa ${antes.etapaAtual} está em curso.`,
      );
    }

    const agora = new Date();

    await this.prisma.approval.update({
      where: { id: approvalId },
      data: { status: dto.decision, comment: dto.comment ?? null, decidedAt: agora },
    });

    const depois = desfechoDaAprovacao(
      AprovacoesService.agruparEtapas(
        todas.map((t) => (t.id === approvalId ? { ...t, status: dto.decision } : t)),
      ),
    );

    await this.registrarDecisao(ticketId, approvalId, usuario, dto, linha.step);

    if (depois.estado !== 'AGUARDANDO') {
      await this.encerrar(ticketId, depois.estado, usuario);
    }

    await this.webhooks.emitir(usuario.organizationId, 'aprovacao.decidida', {
      ticketId,
      aprovacaoId: approvalId,
      etapa: linha.step,
      decisao: dto.decision,
      desfecho: depois.estado,
    });

    return this.listar(ticketId);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /** Uma linha por etapa, com as decisões dos seus validadores. */
  private static agruparEtapas(
    linhas: readonly LinhaDeAprovacao[],
  ): { step: number; quorum: number; decisoes: ApprovalStatus[] }[] {
    const porEtapa = new Map<number, { step: number; quorum: number; decisoes: ApprovalStatus[] }>();

    for (const linha of linhas) {
      const etapa = porEtapa.get(linha.step) ?? {
        step: linha.step,
        quorum: linha.quorum,
        decisoes: [],
      };
      etapa.decisoes.push(linha.status);
      porEtapa.set(linha.step, etapa);
    }

    return [...porEtapa.values()];
  }

  private async registrarDecisao(
    ticketId: string,
    approvalId: string,
    usuario: UsuarioAutenticado,
    dto: DecidirAprovacaoDto,
    step: number,
  ): Promise<void> {
    // O autor do evento é quem decidiu; a linha do tempo já o mostra.
    // Repetir o nome no corpo criaria duas fontes para a mesma coisa.
    const verbo = dto.decision === 'APROVADO' ? 'Aprovada' : 'Recusada';

    await this.prisma.ticketEvent.create({
      data: {
        ticketId,
        type: 'APROVACAO',
        visibility: 'INTERNA',
        authorId: usuario.userId,
        channel: 'WEB',
        body: dto.comment ?? `${verbo} a etapa ${step}.`,
        payload: { type: 'APROVACAO', approvalId, decision: dto.decision },
      },
    });
  }

  /**
   * Devolve o chamado ao trabalho.
   *
   * Para onde ele volta é o `from` da mudança que o levou a
   * `EM_APROVACAO` — a linha do tempo é a fonte, e não uma coluna a
   * mais no chamado que poderia divergir dela.
   */
  private async encerrar(
    ticketId: string,
    desfecho: 'APROVADA' | 'RECUSADA',
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    const chamado = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { status: true, number: true },
    });

    if (chamado.status !== 'EM_APROVACAO') return;

    const entrada = await this.prisma.ticketEvent.findFirst({
      where: { ticketId, type: 'MUDANCA_STATUS' },
      orderBy: { createdAt: 'desc' },
    });

    const carga = entrada?.payload as { to?: string; from?: string } | null;
    const anterior = carga?.to === 'EM_APROVACAO' ? (carga.from as TicketStatus) : undefined;
    const destino =
      anterior && canTransition('EM_APROVACAO', anterior) ? anterior : RETORNO_PADRAO;

    await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id: ticketId }, data: { status: destino } }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'MUDANCA_STATUS',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: { type: 'MUDANCA_STATUS', from: 'EM_APROVACAO', to: destino },
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'APROVACAO',
          visibility: 'INTERNA',
          channel: 'SISTEMA',
          body:
            desfecho === 'APROVADA'
              ? 'Aprovação concluída: todas as etapas passaram.'
              : 'Aprovação recusada. O chamado voltou para o time sem seguir adiante.',
          payload: {
            type: 'APROVACAO',
            approvalId: 'conjunto',
            decision: desfecho === 'APROVADA' ? 'APROVADO' : 'RECUSADO',
          },
        },
      }),
    ]);
  }

  /** Avisa por e-mail quem tem de decidir. Sem isso ninguém sabe que foi chamado. */
  private async avisarValidadores(
    ticketId: string,
    step: number,
    approverIds: readonly string[],
  ): Promise<void> {
    const chamado = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { organizationId: true, number: true, subject: true },
    });

    const pessoas = await this.prisma.user.findMany({
      where: { id: { in: [...approverIds] } },
      select: { email: true, name: true },
    });

    for (const pessoa of pessoas) {
      await this.saida.enfileirarAviso({
        organizationId: chamado.organizationId,
        ticketId,
        channel: 'EMAIL',
        para: pessoa.email,
        assunto: `Aprovação pendente ${ticketTag(chamado.number)} ${chamado.subject}`,
        corpo:
          `Olá, ${pessoa.name}.\n\n` +
          `Sua aprovação foi pedida no chamado ${ticketTag(chamado.number)} — ` +
          `${chamado.subject} (etapa ${step}).\n\n` +
          'Abra o Norty Desk para aprovar ou recusar.',
      });
    }
  }

  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, status: true, number: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  private static paraView(linha: {
    id: string;
    step: number;
    quorum: number;
    status: ApprovalStatus;
    comment: string | null;
    requestedAt: Date;
    decidedAt: Date | null;
    approver: { id: string; name: string; email: string };
    ticket: { id: string; number: number; subject: string };
  }): ApprovalView {
    return {
      id: linha.id,
      ticket: linha.ticket,
      step: linha.step,
      quorum: linha.quorum,
      approver: {
        kind: 'USER',
        id: linha.approver.id,
        name: linha.approver.name,
        email: linha.approver.email,
      },
      status: linha.status,
      comment: linha.comment,
      requestedAt: linha.requestedAt.toISOString(),
      decidedAt: linha.decidedAt?.toISOString() ?? null,
    };
  }

  /** Reexportado para o controller montar o resumo por etapa. */
  static resumoDasEtapas(linhas: readonly LinhaDeAprovacao[]) {
    return AprovacoesService.agruparEtapas(linhas).map((etapa) => ({
      step: etapa.step,
      quorum: etapa.quorum,
      estado: estadoDaEtapa(etapa.decisoes, etapa.quorum),
      faltam: faltamParaOQuorum(etapa.decisoes, etapa.quorum),
    }));
  }
}

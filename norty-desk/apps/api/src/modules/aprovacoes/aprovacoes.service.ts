import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ApprovalStatus,
  type ApprovalTarget,
  type ApprovalView,
  type ChangeStatus,
  type TicketStatus,
  canTransition,
  canTransitionChange,
  changeTag,
  desfechoDaAprovacao,
  estadoDaEtapa,
  faltamParaOQuorum,
  ticketTag,
} from '@norty-desk/shared';

import { Prisma } from '@prisma/client';

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

/**
 * De quem é a aprovação.
 *
 * O CHECK `approvals_dono_unico` garante que é exatamente um: um
 * chamado ou uma mudança, nunca os dois nem nenhum. O tipo aqui só diz
 * ao TypeScript o que o banco já sustenta.
 */
export type DonoDaAprovacao = { kind: 'CHAMADO'; id: string } | { kind: 'MUDANCA'; id: string };

const INCLUDE = {
  approver: true,
  ticket: { select: { id: true, number: true, subject: true, organizationId: true } },
  change: { select: { id: true, number: true, title: true, organizationId: true, status: true } },
} satisfies Prisma.ApprovalInclude;

type LinhaComRelacoes = Prisma.ApprovalGetPayload<{ include: typeof INCLUDE }>;

/** O `where` que isola as aprovações de um dono. */
function ondeDoDono(dono: DonoDaAprovacao): Prisma.ApprovalWhereInput {
  return dono.kind === 'CHAMADO' ? { ticketId: dono.id } : { changeId: dono.id };
}

/** A coluna de dono, para escrever. */
function colunaDoDono(dono: DonoDaAprovacao): { ticketId: string } | { changeId: string } {
  return dono.kind === 'CHAMADO' ? { ticketId: dono.id } : { changeId: dono.id };
}

function donoDaLinha(linha: LinhaComRelacoes): DonoDaAprovacao | null {
  if (linha.ticket) return { kind: 'CHAMADO', id: linha.ticket.id };
  if (linha.change) return { kind: 'MUDANCA', id: linha.change.id };
  return null;
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
    return this.listar({ kind: 'CHAMADO', id: ticketId });
  }

  /**
   * As aprovações de uma mudança.
   *
   * Quem chama já conferiu o escopo — é sempre o serviço de mudanças,
   * que acabou de carregar a mudança da organização.
   */
  async listarDaMudanca(changeId: string): Promise<ApprovalView[]> {
    return this.listar({ kind: 'MUDANCA', id: changeId });
  }

  /**
   * As aprovações de um dono, sem conferir o escopo de leitura.
   *
   * Quem já foi autorizado por outro caminho usa esta. É o caso de quem
   * acabou de decidir: um solicitante pode ser validador de um chamado
   * em que não é requerente nem observador, e `escopoDeLeitura` o
   * recusaria — devolvendo 404 logo depois de a decisão dele ter sido
   * gravada.
   */
  private async listar(dono: DonoDaAprovacao): Promise<ApprovalView[]> {
    const linhas = await this.prisma.approval.findMany({
      where: ondeDoDono(dono),
      include: INCLUDE,
      // O `id` desempata: as linhas de uma etapa nascem no mesmo
      // `createMany` e carimbam o mesmo instante, e sem ele a lista
      // troca de ordem entre duas leituras da mesma tela.
      orderBy: [{ step: 'asc' }, { requestedAt: 'asc' }, { id: 'asc' }],
    });

    return AprovacoesService.paraViews(linhas);
  }

  /**
   * O que espera decisão minha.
   *
   * Só as etapas que estão de fato correndo: uma linha da etapa 2 com a
   * etapa 1 ainda pendente não é minha vez, e mostrá-la faria alguém
   * decidir fora de ordem.
   */
  async minhas(usuario: UsuarioAutenticado): Promise<ApprovalView[]> {
    const minhas = await this.prisma.approval.findMany({
      where: {
        approverId: usuario.userId,
        status: 'AGUARDANDO',
        // A aprovação de mudança entra na mesma lista: são as duas
        // coisas que esperam a mesma pessoa, e separá-las em duas telas
        // faria uma delas ser a que ninguém abre.
        OR: [
          { ticket: { organizationId: usuario.organizationId } },
          { change: { organizationId: usuario.organizationId } },
        ],
      },
      include: INCLUDE,
      orderBy: { requestedAt: 'asc' },
    });

    if (minhas.length === 0) return [];

    // Uma consulta para todas as linhas dos donos envolvidos: sem isso
    // seria uma consulta por aprovação para descobrir a etapa corrente
    // de cada um.
    const ticketIds = minhas.flatMap((m) => (m.ticketId ? [m.ticketId] : []));
    const changeIds = minhas.flatMap((m) => (m.changeId ? [m.changeId] : []));

    const todas = await this.prisma.approval.findMany({
      where: {
        OR: [{ ticketId: { in: ticketIds } }, { changeId: { in: changeIds } }],
      },
      select: { ticketId: true, changeId: true, step: true, quorum: true, status: true },
    });

    const porDono = new Map<string, LinhaDeAprovacao[]>();
    for (const linha of todas) {
      const chave = linha.ticketId ?? linha.changeId;
      if (!chave) continue;
      const lista = porDono.get(chave) ?? [];
      lista.push(linha);
      porDono.set(chave, lista);
    }

    const naVez = minhas.filter((m) => {
      const chave = m.ticketId ?? m.changeId;
      if (!chave) return false;
      const desfecho = desfechoDaAprovacao(
        AprovacoesService.agruparEtapas(porDono.get(chave) ?? []),
      );
      return desfecho.estado === 'AGUARDANDO' && desfecho.etapaAtual === m.step;
    });

    return AprovacoesService.paraViews(naVez);
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

    const quorum = AprovacoesService.exigirQuorumPossivel(dto);
    await this.exigirValidadoresDaOrganizacao(usuario, dto.approverIds);
    const step = await this.proximaEtapa({ kind: 'CHAMADO', id: ticketId }, dto.step);

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

    await this.avisarValidadores(
      {
        organizationId: usuario.organizationId,
        etiqueta: ticketTag(chamado.number),
        titulo: chamado.subject,
        ticketId,
      },
      step,
      dto.approverIds,
    );

    await this.webhooks.emitir(usuario.organizationId, 'aprovacao.solicitada', {
      ticketId,
      numero: chamado.number,
      etapa: step,
      quorum,
      validadores: dto.approverIds,
    });

    return this.listar({ kind: 'CHAMADO', id: ticketId });
  }

  /**
   * Pede aprovação de uma mudança.
   *
   * A mudança não tem `EM_APROVACAO` "de passagem" como o chamado: ela
   * **é** o objeto em aprovação, e o status vai para lá e fica. Quem
   * confere o escopo é o serviço de mudanças, que já carregou a
   * mudança da organização antes de chamar.
   */
  async solicitarDaMudanca(
    usuario: UsuarioAutenticado,
    mudanca: { id: string; number: number; title: string; status: ChangeStatus },
    dto: SolicitarAprovacaoDto,
  ): Promise<ApprovalView[]> {
    const quorum = AprovacoesService.exigirQuorumPossivel(dto);
    await this.exigirValidadoresDaOrganizacao(usuario, dto.approverIds);

    const dono: DonoDaAprovacao = { kind: 'MUDANCA', id: mudanca.id };
    const step = await this.proximaEtapa(dono, dto.step);

    const vaiParaAprovacao =
      mudanca.status !== 'EM_APROVACAO' && canTransitionChange(mudanca.status, 'EM_APROVACAO');

    if (mudanca.status !== 'EM_APROVACAO' && !vaiParaAprovacao) {
      throw new ConflictException(
        `Uma mudança ${mudanca.status} não volta para aprovação.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.approval.createMany({
        data: dto.approverIds.map((approverId) => ({
          changeId: mudanca.id,
          step,
          quorum,
          approverId,
        })),
        skipDuplicates: true,
      });

      if (vaiParaAprovacao) {
        await tx.change.update({
          where: { id: mudanca.id },
          data: { status: 'EM_APROVACAO' },
        });
        await tx.ticketEvent.create({
          data: {
            changeId: mudanca.id,
            type: 'MUDANCA_STATUS_MUDANCA',
            visibility: 'INTERNA',
            authorId: usuario.userId,
            channel: 'WEB',
            payload: {
              type: 'MUDANCA_STATUS_MUDANCA',
              from: mudanca.status,
              to: 'EM_APROVACAO',
            },
          },
        });
      }

      await tx.ticketEvent.create({
        data: {
          changeId: mudanca.id,
          type: 'APROVACAO',
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

    await this.avisarValidadores(
      {
        organizationId: usuario.organizationId,
        etiqueta: changeTag(mudanca.number),
        titulo: mudanca.title,
      },
      step,
      dto.approverIds,
    );

    await this.webhooks.emitir(usuario.organizationId, 'aprovacao.solicitada', {
      changeId: mudanca.id,
      numero: mudanca.number,
      etapa: step,
      quorum,
      validadores: dto.approverIds,
    });

    return this.listar(dono);
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
      include: INCLUDE,
    });

    const dono = linha ? donoDaLinha(linha) : null;
    const organizationId = linha?.ticket?.organizationId ?? linha?.change?.organizationId;

    if (!linha || !dono || organizationId !== usuario.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }

    // Decidir é pessoal: nem supervisor decide no lugar de quem foi
    // designado. Permissão diz que a rota abre; isto diz de quem é a vez.
    if (linha.approverId !== usuario.userId) {
      throw new ForbiddenException('Esta aprovação é de outra pessoa.');
    }

    if (linha.status !== 'AGUARDANDO') {
      throw new ConflictException('Você já decidiu esta aprovação.');
    }

    const todas = await this.prisma.approval.findMany({
      where: ondeDoDono(dono),
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

    await this.registrarDecisao(dono, approvalId, usuario, dto, linha.step);

    if (depois.estado !== 'AGUARDANDO') {
      if (dono.kind === 'CHAMADO') await this.encerrar(dono.id, depois.estado, usuario);
      else await this.encerrarMudanca(dono.id, depois.estado, usuario);
    }

    await this.webhooks.emitir(usuario.organizationId, 'aprovacao.decidida', {
      ...(dono.kind === 'CHAMADO' ? { ticketId: dono.id } : { changeId: dono.id }),
      aprovacaoId: approvalId,
      etapa: linha.step,
      decisao: dto.decision,
      desfecho: depois.estado,
    });

    return this.listar(dono);
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
    dono: DonoDaAprovacao,
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
        ...colunaDoDono(dono),
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
   * Encerra a aprovação de uma mudança.
   *
   * Diferente do chamado, a mudança não "volta" para lugar nenhum: o
   * desfecho da aprovação **é** o próximo estado dela. Aprovada segue
   * para execução; recusada para porque a decisão foi essa — refazer o
   * plano e pedir de novo é uma transição explícita de quem a conduz,
   * não um efeito colateral do "não".
   */
  private async encerrarMudanca(
    changeId: string,
    desfecho: 'APROVADA' | 'RECUSADA',
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    const mudanca = await this.prisma.change.findUniqueOrThrow({
      where: { id: changeId },
      select: { status: true },
    });

    if (mudanca.status !== 'EM_APROVACAO') return;

    const destino: ChangeStatus = desfecho === 'APROVADA' ? 'APROVADA' : 'RECUSADA';

    await this.prisma.$transaction([
      this.prisma.change.update({ where: { id: changeId }, data: { status: destino } }),
      this.prisma.ticketEvent.create({
        data: {
          changeId,
          type: 'MUDANCA_STATUS_MUDANCA',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: { type: 'MUDANCA_STATUS_MUDANCA', from: 'EM_APROVACAO', to: destino },
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          changeId,
          type: 'APROVACAO',
          visibility: 'INTERNA',
          channel: 'SISTEMA',
          body:
            desfecho === 'APROVADA'
              ? 'Aprovação concluída: a mudança está liberada para execução.'
              : 'Aprovação recusada. A mudança não vai a campo como está.',
          payload: {
            type: 'APROVACAO',
            approvalId: 'conjunto',
            decision: desfecho === 'APROVADA' ? 'APROVADO' : 'RECUSADO',
          },
        },
      }),
    ]);
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

  /**
   * Avisa por e-mail quem tem de decidir. Sem isso ninguém sabe que foi
   * chamado.
   *
   * O `ticketId` é opcional porque a fila de saída o usa para amarrar a
   * mensagem ao chamado — e aprovação de mudança não tem chamado a que
   * se amarrar. O aviso continua saindo; o que muda é o vínculo.
   */
  private async avisarValidadores(
    alvo: { organizationId: string; etiqueta: string; titulo: string; ticketId?: string },
    step: number,
    approverIds: readonly string[],
  ): Promise<void> {
    const pessoas = await this.prisma.user.findMany({
      where: { id: { in: [...approverIds] } },
      select: { email: true, name: true },
    });

    for (const pessoa of pessoas) {
      await this.saida.enfileirarAviso({
        organizationId: alvo.organizationId,
        ticketId: alvo.ticketId ?? null,
        channel: 'EMAIL',
        para: pessoa.email,
        assunto: `Aprovação pendente ${alvo.etiqueta} ${alvo.titulo}`,
        corpo:
          `Olá, ${pessoa.name}.\n\n` +
          `Sua aprovação foi pedida em ${alvo.etiqueta} — ` +
          `${alvo.titulo} (etapa ${step}).\n\n` +
          'Abra o Norty Desk para aprovar ou recusar.',
      });
    }
  }

  /** O quórum não pode ser maior que o número de validadores da etapa. */
  private static exigirQuorumPossivel(dto: SolicitarAprovacaoDto): number {
    const quorum = dto.quorum ?? dto.approverIds.length;
    if (quorum > dto.approverIds.length) {
      throw new BadRequestException(
        `O quórum é ${quorum} mas a etapa tem ${dto.approverIds.length} validador(es): ` +
          'ela nunca poderia ser aprovada.',
      );
    }
    return quorum;
  }

  /**
   * Validador tem de ser da organização. Sem esta checagem, um id de
   * usuário de outra empresa entraria pelo corpo da requisição.
   */
  private async exigirValidadoresDaOrganizacao(
    usuario: UsuarioAutenticado,
    approverIds: readonly string[],
  ): Promise<void> {
    const validos = await this.prisma.user.findMany({
      where: {
        id: { in: [...approverIds] },
        memberships: { some: { organizationId: usuario.organizationId } },
      },
      select: { id: true },
    });

    if (validos.length !== new Set(approverIds).size) {
      const encontrados = new Set(validos.map((v) => v.id));
      const faltando = approverIds.filter((id) => !encontrados.has(id));
      throw new BadRequestException(
        `Estes validadores não pertencem à organização: ${faltando.join(', ')}.`,
      );
    }
  }

  /**
   * A etapa. Omitida, entra depois da última existente — que é o que se
   * quer ao encadear "gerente, depois diretor".
   */
  private async proximaEtapa(dono: DonoDaAprovacao, pedida?: number): Promise<number> {
    if (pedida) return pedida;
    const ultima = await this.prisma.approval.aggregate({
      where: ondeDoDono(dono),
      _max: { step: true },
    });
    return (ultima._max.step ?? 0) + 1;
  }

  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, status: true, number: true, subject: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  /**
   * A linha vira contrato.
   *
   * Linha sem dono não existe — o CHECK `approvals_dono_unico` garante.
   * Filtrar em vez de afirmar com `as` mantém a função total: se a
   * consulta mudar e deixar de trazer a relação, some a linha em vez de
   * estourar na serialização.
   */
  private static paraViews(linhas: readonly LinhaComRelacoes[]): ApprovalView[] {
    return linhas.flatMap((linha) => {
      const alvo = AprovacoesService.alvo(linha);
      return alvo ? [AprovacoesService.paraView(linha, alvo)] : [];
    });
  }

  private static alvo(linha: LinhaComRelacoes): ApprovalTarget | null {
    if (linha.ticket) {
      return {
        kind: 'CHAMADO',
        id: linha.ticket.id,
        number: linha.ticket.number,
        title: linha.ticket.subject,
      };
    }
    if (linha.change) {
      return {
        kind: 'MUDANCA',
        id: linha.change.id,
        number: linha.change.number,
        title: linha.change.title,
      };
    }
    return null;
  }

  private static paraView(linha: LinhaComRelacoes, alvo: ApprovalTarget): ApprovalView {
    return {
      id: linha.id,
      alvo,
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

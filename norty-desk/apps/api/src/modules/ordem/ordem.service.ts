import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assinaturaInvalida,
  ordemEditavel,
  ordemInconclusivel,
  type PartyRef,
  type ServiceOrderItemView,
  type ServiceOrderView,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PORTA_DE_ARMAZENAMENTO,
  type PortaDeArmazenamento,
} from '../attachments/armazenamento';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type { ConcluirOrdemDto, EscreverItemDto, EscreverOrdemDto } from './dto';

const INCLUDE = {
  technician: { select: { id: true, name: true, email: true } },
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.ServiceOrderInclude;

type Ordem = Prisma.ServiceOrderGetPayload<{ include: typeof INCLUDE }>;

/**
 * A ordem de serviço do atendimento em campo.
 *
 * É o documento que o técnico leva, preenche na frente do cliente e
 * assina ali mesmo. A regra que governa tudo aqui é uma só: **depois de
 * assinada, não muda**. A assinatura atesta a lista de itens que estava
 * na tela naquele momento; deixar editá-la depois transformaria o
 * documento numa declaração de qualquer coisa — e é justamente ele que
 * o cliente guarda como prova do atendimento.
 *
 * Ver `docs/13-carteira-e-campo.md`, seção 6.
 */
@Injectable()
export class OrdemService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
  ) {}

  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, status: true, organizationId: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  private async carregar(usuario: UsuarioAutenticado, id: string): Promise<Ordem> {
    const ordem = await this.prisma.serviceOrder.findFirst({
      where: { id, ticket: escopoDeLeitura(usuario) },
      include: INCLUDE,
    });
    if (!ordem) throw new NotFoundException('Ordem de serviço não encontrada.');
    return ordem;
  }

  /** Ordem assinada não muda — a checagem que sustenta o documento. */
  private exigirEditavel(ordem: Ordem): void {
    if (!ordemEditavel(ordem.status)) {
      throw new ConflictException(
        'Esta ordem já foi assinada. Abra outra ordem para registrar novo atendimento.',
      );
    }
  }

  /**
   * O técnico e a visita vêm do corpo da requisição, então não se
   * confia neles: o técnico precisa ter vínculo com a organização, e a
   * visita precisa ser deste chamado.
   */
  private async validarVinculos(
    organizationId: string,
    ticketId: string,
    dto: EscreverOrdemDto,
  ): Promise<{ technicianId: string | null; appointmentId: string | null }> {
    let technicianId: string | null = null;
    if (dto.technicianId) {
      const vinculo = await this.prisma.membership.findFirst({
        where: { userId: dto.technicianId, organizationId },
        select: { userId: true },
      });
      if (!vinculo) throw new BadRequestException('Técnico não encontrado nesta organização.');
      technicianId = vinculo.userId;
    }

    let appointmentId: string | null = null;
    if (dto.appointmentId) {
      const visita = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, ticketId },
        select: { id: true },
      });
      if (!visita) throw new BadRequestException('Atendimento não encontrado neste chamado.');
      appointmentId = visita.id;
    }

    return { technicianId, appointmentId };
  }

  async listar(usuario: UsuarioAutenticado, ticketId: string): Promise<ServiceOrderView[]> {
    await this.exigirChamado(usuario, ticketId);

    const ordens = await this.prisma.serviceOrder.findMany({
      where: { ticketId },
      include: INCLUDE,
      orderBy: { number: 'asc' },
    });

    return ordens.map(paraVista);
  }

  async criar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: EscreverOrdemDto,
  ): Promise<ServiceOrderView> {
    const chamado = await this.exigirChamado(usuario, ticketId);

    if (chamado.status === 'FECHADO') {
      throw new ConflictException('Chamado fechado. Reabra antes de abrir ordem de serviço.');
    }

    const { technicianId, appointmentId } = await this.validarVinculos(
      chamado.organizationId,
      ticketId,
      dto,
    );

    // Sem visita informada, vale a que está marcada. A ordem quase
    // sempre nasce da visita, e sem o vínculo o PDF sai sem a data do
    // atendimento — justamente o dado que o cliente confere primeiro.
    const visita =
      appointmentId ??
      (
        await this.prisma.appointment.findFirst({
          where: { ticketId, status: 'AGENDADO' },
          orderBy: { scheduledFor: 'asc' },
          select: { id: true },
        })
      )?.id ??
      null;

    const ordem = await this.prisma.$transaction(async (tx) => {
      // Mesmo travamento do número do chamado: sem ele, duas ordens
      // abertas no mesmo instante disputam o mesmo número e uma morre
      // na restrição de unicidade.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chamado.organizationId}))`;
      const [linha] = await tx.$queryRaw<{ proximo: number }[]>`
        SELECT COALESCE(MAX(number), 0) + 1 AS proximo
        FROM service_orders WHERE "organizationId" = ${chamado.organizationId}::uuid
      `;

      return tx.serviceOrder.create({
        data: {
          organizationId: chamado.organizationId,
          ticketId,
          number: Number(linha?.proximo ?? 1),
          // O técnico do corpo, ou quem está abrindo: o caso comum é o
          // próprio técnico abrir a ordem dele no celular.
          technicianId: technicianId ?? usuario.userId,
          appointmentId: visita,
          report: dto.report,
          createdById: usuario.userId,
        },
        include: INCLUDE,
      });
    });

    return paraVista(ordem);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EscreverOrdemDto,
  ): Promise<ServiceOrderView> {
    const ordem = await this.carregar(usuario, id);
    this.exigirEditavel(ordem);

    const { technicianId, appointmentId } = await this.validarVinculos(
      ordem.organizationId,
      ordem.ticketId,
      dto,
    );

    const salva = await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        ...(dto.technicianId ? { technicianId } : {}),
        ...(dto.appointmentId ? { appointmentId } : {}),
        ...(dto.report !== undefined ? { report: dto.report } : {}),
      },
      include: INCLUDE,
    });

    return paraVista(salva);
  }

  async incluirItem(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EscreverItemDto,
  ): Promise<ServiceOrderView> {
    const ordem = await this.carregar(usuario, id);
    this.exigirEditavel(ordem);

    const ultima = ordem.items.at(-1)?.position ?? 0;

    await this.prisma.serviceOrderItem.create({
      data: {
        orderId: id,
        position: ultima + 1,
        description: dto.description.trim(),
        notes: dto.notes,
        done: dto.done ?? false,
        doneAt: dto.done ? new Date() : null,
      },
    });

    // Sai de rascunho no primeiro item: a ordem deixou de ser ideia e
    // virou trabalho listado.
    if (ordem.status === 'RASCUNHO') {
      await this.prisma.serviceOrder.update({
        where: { id },
        data: { status: 'EXECUTANDO' },
      });
    }

    return paraVista(await this.carregar(usuario, id));
  }

  async editarItem(
    usuario: UsuarioAutenticado,
    id: string,
    itemId: string,
    dto: EscreverItemDto,
  ): Promise<ServiceOrderView> {
    const ordem = await this.carregar(usuario, id);
    this.exigirEditavel(ordem);

    const item = ordem.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item não encontrado nesta ordem.');

    const done = dto.done ?? item.done;

    await this.prisma.serviceOrderItem.update({
      where: { id: itemId },
      data: {
        description: dto.description.trim(),
        notes: dto.notes ?? null,
        done,
        // A hora só é gravada na virada: remarcar um item já feito não
        // deve mover para agora o instante em que ele foi feito.
        doneAt: done ? (item.doneAt ?? new Date()) : null,
      },
    });

    return paraVista(await this.carregar(usuario, id));
  }

  async removerItem(
    usuario: UsuarioAutenticado,
    id: string,
    itemId: string,
  ): Promise<ServiceOrderView> {
    const ordem = await this.carregar(usuario, id);
    this.exigirEditavel(ordem);

    const item = ordem.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item não encontrado nesta ordem.');

    await this.prisma.serviceOrderItem.delete({ where: { id: itemId } });
    return paraVista(await this.carregar(usuario, id));
  }

  /**
   * Conclui e assina.
   *
   * O nome e o papel de quem assina são gravados aqui, e não lidos do
   * cadastro na hora de emitir o PDF: o documento tem de dizer o que era
   * verdade quando foi assinado, e não o que o cadastro diz hoje.
   */
  async concluir(
    usuario: UsuarioAutenticado,
    id: string,
    dto: ConcluirOrdemDto,
  ): Promise<ServiceOrderView> {
    const ordem = await this.carregar(usuario, id);

    const impedimento = ordemInconclusivel(ordem.status, ordem.items);
    if (impedimento) throw new ConflictException(impedimento);

    const problema = assinaturaInvalida(dto.signature);
    if (problema) throw new BadRequestException(problema);

    const png = Buffer.from(dto.signature.slice('data:image/png;base64,'.length), 'base64');
    const chave = `${ordem.organizationId}/ordens/${ordem.id}/${randomUUID()}.png`;
    await this.armazenamento.guardar(chave, png, 'image/png');

    const assinada = await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        status: 'CONCLUIDA',
        signatureKey: chave,
        signedByName: dto.signedByName.trim(),
        signedByRole: dto.signedByRole?.trim() || null,
        signedAt: new Date(),
        ...(dto.report !== undefined ? { report: dto.report } : {}),
      },
      include: INCLUDE,
    });

    // A ordem concluída é fato do atendimento, então entra na conversa.
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: ordem.ticketId,
        type: 'MENSAGEM',
        visibility: 'PUBLICA',
        authorId: usuario.userId,
        channel: 'WEB',
        body: `Ordem de serviço nº ${ordem.number} concluída e assinada por ${assinada.signedByName}.`,
      },
    });

    return paraVista(assinada);
  }

  async cancelar(usuario: UsuarioAutenticado, id: string): Promise<ServiceOrderView> {
    const ordem = await this.carregar(usuario, id);
    this.exigirEditavel(ordem);

    const cancelada = await this.prisma.serviceOrder.update({
      where: { id },
      data: { status: 'CANCELADA' },
      include: INCLUDE,
    });

    return paraVista(cancelada);
  }

  /** O PNG da assinatura, para o PDF. */
  async assinatura(ordem: { signatureKey: string | null }): Promise<Buffer | null> {
    if (!ordem.signatureKey) return null;

    try {
      const fluxo = await this.armazenamento.ler(ordem.signatureKey);
      const pedacos: Buffer[] = [];
      for await (const p of fluxo) pedacos.push(Buffer.from(p as Buffer));
      return Buffer.concat(pedacos);
    } catch {
      // Assinatura que sumiu do armazenamento não impede emitir o
      // documento: o resto do que ele atesta continua verdadeiro, e um
      // PDF sem o traço é melhor que erro na tela do técnico em campo.
      return null;
    }
  }

  /** Carrega a ordem com tudo que o PDF precisa. */
  async paraDocumento(usuario: UsuarioAutenticado, id: string) {
    const ordem = await this.prisma.serviceOrder.findFirst({
      where: { id, ticket: escopoDeLeitura(usuario) },
      include: {
        ...INCLUDE,
        organization: { select: { name: true } },
        ticket: {
          select: {
            number: true,
            protocol: true,
            subject: true,
            client: { select: { name: true, document: true } },
          },
        },
        appointment: { select: { scheduledFor: true } },
      },
    });

    if (!ordem) throw new NotFoundException('Ordem de serviço não encontrada.');
    return ordem;
  }
}

function parte(u: { id: string; name: string; email: string | null } | null): PartyRef | null {
  return u ? { kind: 'USER', id: u.id, name: u.name, email: u.email } : null;
}

function item(i: Ordem['items'][number]): ServiceOrderItemView {
  return {
    id: i.id,
    position: i.position,
    description: i.description,
    done: i.done,
    notes: i.notes,
    doneAt: i.doneAt?.toISOString() ?? null,
  };
}

function paraVista(o: Ordem): ServiceOrderView {
  return {
    id: o.id,
    ticketId: o.ticketId,
    number: o.number,
    status: o.status,
    technician: parte(o.technician),
    appointmentId: o.appointmentId,
    report: o.report,
    items: o.items.map(item),
    signedByName: o.signedByName,
    signedByRole: o.signedByRole,
    signedAt: o.signedAt?.toISOString() ?? null,
    // O traço em si não vai na lista: dezenas de kilobytes por ordem
    // numa listagem que só precisa dizer "esta está assinada".
    hasSignature: o.signatureKey !== null,
    createdAt: o.createdAt.toISOString(),
  };
}

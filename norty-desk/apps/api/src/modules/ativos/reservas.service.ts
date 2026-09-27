import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReservaView } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** Nome da restrição de sobreposição, para traduzir a recusa do banco. */
const SEM_SOBREPOSICAO = 'asset_reservations_sem_sobreposicao';

const INCLUDE = {
  asset: { select: { id: true, name: true, tag: true } },
  user: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Equipamento separado para alguém, numa janela.
 *
 * O notebook de empréstimo, o projetor, a máquina de teste: o que é
 * pouco e disputado. Sem isto a reserva vive no grupo do WhatsApp, e
 * duas pessoas levam o mesmo equipamento na mesma sexta.
 *
 * **A sobreposição é barrada pelo banco.** Verificar antes de gravar
 * não resolve: duas requisições simultâneas leem "livre" e as duas
 * gravam, que é exatamente como duas pessoas reservam a mesma coisa —
 * ao mesmo tempo, na segunda-feira de manhã. Aqui a verificação prévia
 * existe só para a mensagem sair legível; quem garante é o `EXCLUDE`.
 */
@Injectable()
export class ReservasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listarDoAtivo(usuario: UsuarioAutenticado, assetId: string): Promise<ReservaView[]> {
    const reservas = await this.prisma.assetReservation.findMany({
      where: { assetId, organizationId: usuario.organizationId },
      include: INCLUDE,
      orderBy: { startsAt: 'desc' },
    });

    return reservas.map((r) => ReservasService.paraView(r));
  }

  /**
   * A agenda das reservas numa janela.
   *
   * O recorte é por **sobreposição** e não por início: a reserva que
   * começou ontem e termina amanhã é o que interessa a quem pergunta
   * "o que está separado hoje", e filtrar por `startsAt` a deixaria de
   * fora justamente quando ela importa.
   */
  async agenda(
    usuario: UsuarioAutenticado,
    filtro: { de?: string; ate?: string; userId?: string; assetId?: string },
  ): Promise<ReservaView[]> {
    const de = filtro.de ? new Date(filtro.de) : new Date();
    const ate = filtro.ate ? new Date(filtro.ate) : new Date(de.getTime() + 30 * 86_400_000);

    const reservas = await this.prisma.assetReservation.findMany({
      where: {
        organizationId: usuario.organizationId,
        canceledAt: null,
        startsAt: { lt: ate },
        endsAt: { gt: de },
        ...(filtro.userId ? { userId: filtro.userId } : {}),
        ...(filtro.assetId ? { assetId: filtro.assetId } : {}),
      },
      include: INCLUDE,
      orderBy: { startsAt: 'asc' },
      take: 200,
    });

    return reservas.map((r) => ReservasService.paraView(r));
  }

  async reservar(
    usuario: UsuarioAutenticado,
    assetId: string,
    dto: { userId: string; startsAt: string; endsAt: string; purpose?: string | null },
  ): Promise<ReservaView[]> {
    const ativo = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: usuario.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!ativo) throw new NotFoundException('Equipamento não encontrado.');

    if (ativo.status === 'BAIXADO') {
      throw new ConflictException('Equipamento baixado não se reserva.');
    }

    const pessoa = await this.prisma.user.findFirst({
      where: { id: dto.userId, memberships: { some: { organizationId: usuario.organizationId } } },
      select: { id: true },
    });
    if (!pessoa) throw new BadRequestException('Pessoa não encontrada nesta organização.');

    const inicio = new Date(dto.startsAt);
    const fim = new Date(dto.endsAt);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (fim <= inicio) {
      throw new BadRequestException('A reserva termina antes de começar.');
    }
    // Reserva que já acabou não separa nada: é engano de digitação, e
    // fica ocupando a janela de quem reservaria de verdade.
    if (fim <= new Date()) {
      throw new BadRequestException('Essa janela já passou.');
    }

    try {
      await this.prisma.assetReservation.create({
        data: {
          organizationId: usuario.organizationId,
          assetId,
          userId: dto.userId,
          createdById: usuario.userId,
          startsAt: inicio,
          endsAt: fim,
          purpose: dto.purpose?.trim() || null,
        },
      });
    } catch (erro) {
      throw await this.traduzirSobreposicao(erro, assetId, inicio, fim);
    }

    await this.auditoria.registrar(usuario, {
      action: 'ativo.reservado',
      entity: 'Asset',
      entityId: assetId,
      depois: { de: inicio.toISOString(), ate: fim.toISOString(), para: dto.userId },
    });

    return this.listarDoAtivo(usuario, assetId);
  }

  async cancelar(
    usuario: UsuarioAutenticado,
    id: string,
    reason?: string | null,
  ): Promise<ReservaView[]> {
    const reserva = await this.prisma.assetReservation.findFirst({
      where: { id, organizationId: usuario.organizationId },
      select: { id: true, assetId: true, canceledAt: true, holdingId: true },
    });
    if (!reserva) throw new NotFoundException('Reserva não encontrada.');
    if (reserva.canceledAt) throw new ConflictException('Esta reserva já foi cancelada.');

    // Reserva que virou entrega não se cancela: o equipamento já saiu, e
    // o caminho de volta é devolver.
    if (reserva.holdingId) {
      throw new ConflictException(
        'O equipamento já foi retirado com esta reserva. Registre a devolução.',
      );
    }

    await this.prisma.assetReservation.update({
      where: { id },
      data: { canceledAt: new Date(), canceledReason: reason?.trim() || null },
    });

    await this.auditoria.registrar(usuario, {
      action: 'ativo.reserva-cancelada',
      entity: 'Asset',
      entityId: reserva.assetId,
      antes: { reservaId: id },
    });

    return this.listarDoAtivo(usuario, reserva.assetId);
  }

  /**
   * A reserva que vale agora para este equipamento.
   *
   * É o que a entrega consulta: entregar por cima da reserva de outra
   * pessoa é o que faz a reserva não valer nada.
   */
  async vigenteAgora(
    organizationId: string,
    assetId: string,
    agora = new Date(),
  ): Promise<{ id: string; userId: string; userName: string; purpose: string | null } | null> {
    const reserva = await this.prisma.assetReservation.findFirst({
      where: {
        organizationId,
        assetId,
        canceledAt: null,
        holdingId: null,
        startsAt: { lte: agora },
        endsAt: { gt: agora },
      },
      select: { id: true, userId: true, purpose: true, user: { select: { name: true } } },
    });

    if (!reserva) return null;

    return {
      id: reserva.id,
      userId: reserva.userId,
      userName: reserva.user.name,
      purpose: reserva.purpose,
    };
  }

  /** Amarra a reserva à posse que nasceu dela. */
  async marcarRetirada(reservaId: string, holdingId: string): Promise<void> {
    await this.prisma.assetReservation.update({
      where: { id: reservaId },
      data: { holdingId },
    });
  }

  // -------------------------------------------------------------------

  /**
   * Traduz a recusa do banco para uma frase que diz de quem é a janela.
   *
   * A restrição de exclusão devolve o nome dela e mais nada. "Violação
   * da restrição asset_reservations_sem_sobreposicao" não ajuda quem
   * está tentando reservar — o que ajuda é saber com quem falar.
   */
  private async traduzirSobreposicao(
    erro: unknown,
    assetId: string,
    inicio: Date,
    fim: Date,
  ): Promise<Error> {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.includes(SEM_SOBREPOSICAO)) return erro as Error;

    const conflitante = await this.prisma.assetReservation.findFirst({
      where: {
        assetId,
        canceledAt: null,
        startsAt: { lt: fim },
        endsAt: { gt: inicio },
      },
      include: { user: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });

    const quem = conflitante?.user.name ?? 'outra pessoa';
    const quando = conflitante
      ? ` (${conflitante.startsAt.toLocaleString('pt-BR')} até ${conflitante.endsAt.toLocaleString('pt-BR')})`
      : '';

    return new ConflictException(
      `Este equipamento já está reservado para ${quem}${quando}. Escolha outra janela.`,
    );
  }

  private static paraView(r: Prisma.AssetReservationGetPayload<{ include: typeof INCLUDE }>): ReservaView {
    const agora = Date.now();

    const situacao: ReservaView['situacao'] = r.canceledAt
      ? 'CANCELADA'
      : r.holdingId
        ? 'RETIRADA'
        : r.startsAt.getTime() > agora
          ? 'FUTURA'
          : r.endsAt.getTime() > agora
            ? 'EM_CURSO'
            : 'VENCIDA';

    return {
      id: r.id,
      asset: { id: r.asset.id, name: r.asset.name, tag: r.asset.tag },
      user: { kind: 'USER', id: r.user.id, name: r.user.name, email: r.user.email },
      createdBy: {
        kind: 'USER',
        id: r.createdBy.id,
        name: r.createdBy.name,
        email: r.createdBy.email,
      },
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      purpose: r.purpose,
      canceledAt: r.canceledAt?.toISOString() ?? null,
      canceledReason: r.canceledReason,
      holdingId: r.holdingId,
      situacao,
    };
  }
}

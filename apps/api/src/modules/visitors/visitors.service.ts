import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';
import type { RequestUser } from '../../common/types';
import type { CreateVisitorDto } from './dto';

@Injectable()
export class VisitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    condominiumId: string,
    query: PageQueryDto,
    filters: { status?: string; date?: string } = {},
  ) {
    const where = {
      condominiumId,
      // O morador só enxerga os visitantes da própria unidade. A regra
      // vive aqui, no servidor, e não depende da tela que fez a chamada.
      ...(user.role === 'morador' && user.unitId ? { unitId: user.unitId } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.date ? { expectedDate: new Date(filters.date) } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { document: { contains: query.q } },
              { code: { contains: query.q, mode: 'insensitive' as const } },
              { companyName: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.visitor.findMany({
        where,
        orderBy: [{ expectedDate: 'desc' }, { expectedTime: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
        include: { unit: { select: { label: true, block: true } } },
      }),
      this.prisma.visitor.count({ where }),
    ]);

    return paginated(items, total, query);
  }

  async create(user: RequestUser, condominiumId: string, dto: CreateVisitorDto) {
    const unitId = user.role === 'morador' ? user.unitId : (dto.unitId ?? user.unitId);
    if (!unitId) throw new BadRequestException('Informe a unidade do visitante.');

    const resident = await this.prisma.resident.findFirst({
      where: { condominiumId, unitId, active: true },
      orderBy: { isMainContact: 'desc' },
    });
    if (!resident) throw new BadRequestException('A unidade não tem morador ativo cadastrado.');

    const visitor = await this.prisma.visitor.create({
      data: {
        condominiumId,
        unitId,
        residentId: resident.id,
        name: dto.name.trim(),
        document: dto.document.trim(),
        phone: dto.phone,
        kind: dto.kind,
        category: dto.category,
        expectedDate: new Date(dto.expectedDate),
        expectedTime: dto.expectedTime,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        recurrenceDays: dto.recurrenceDays ?? [],
        notes: dto.notes,
        vehiclePlate: dto.vehiclePlate?.toUpperCase(),
        companyName: dto.companyName,
        code: await this.uniqueCode(),
        createdBy: user.name,
      },
    });

    await this.notifications.push({
      condominiumId,
      role: 'portaria',
      kind: 'autorizacao',
      title: 'Nova autorização de visitante',
      body: `${visitor.name} · ${dto.expectedTime} — autorizado pela unidade.`,
      link: '/portaria/visitantes',
      refId: visitor.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Autorizou visitante',
      target: visitor.name,
      detail: `${dto.expectedDate} às ${dto.expectedTime}`,
      module: 'Visitantes',
    });

    return visitor;
  }

  /** Liberação na guarita: registra entrada e avisa o morador. */
  async checkIn(user: RequestUser, condominiumId: string, id: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id, condominiumId } });
    if (!visitor) throw new NotFoundException('Visitante não encontrado.');
    if (visitor.status === 'no_local') throw new BadRequestException('Visitante já está no local.');
    if (visitor.status === 'revogado' || visitor.status === 'recusado') {
      throw new ForbiddenException('Autorização revogada. Confirme com a unidade.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.visitor.update({
        where: { id },
        data: { status: 'no_local', checkInAt: new Date() },
      }),
      this.prisma.accessLog.create({
        data: {
          condominiumId,
          unitId: visitor.unitId,
          subjectType: 'visitante',
          subjectId: visitor.id,
          subjectName: visitor.name,
          direction: 'entrada',
          gateId: await this.mainGateId(condominiumId),
          method: 'qrcode',
          registeredBy: user.name,
          authorized: true,
        },
      }),
    ]);

    await this.notifications.push({
      condominiumId,
      unitId: visitor.unitId,
      kind: 'visitante_chegou',
      title: 'Seu visitante chegou',
      body: `${visitor.name} entrou pela portaria agora.`,
      link: '/app/visitantes',
      refId: visitor.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Liberou entrada de visitante',
      target: visitor.name,
      module: 'Portaria',
    });

    return updated;
  }

  async checkOut(user: RequestUser, condominiumId: string, id: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id, condominiumId } });
    if (!visitor) throw new NotFoundException('Visitante não encontrado.');

    const [updated] = await this.prisma.$transaction([
      this.prisma.visitor.update({
        where: { id },
        data: { status: 'finalizado', checkOutAt: new Date() },
      }),
      this.prisma.accessLog.create({
        data: {
          condominiumId,
          unitId: visitor.unitId,
          subjectType: 'visitante',
          subjectId: visitor.id,
          subjectName: visitor.name,
          direction: 'saida',
          gateId: await this.mainGateId(condominiumId),
          method: 'manual',
          registeredBy: user.name,
          authorized: true,
        },
      }),
    ]);
    return updated;
  }

  async revoke(user: RequestUser, condominiumId: string, id: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id, condominiumId } });
    if (!visitor) throw new NotFoundException('Visitante não encontrado.');
    if (user.role === 'morador' && visitor.unitId !== user.unitId) {
      throw new ForbiddenException('Esta autorização não é da sua unidade.');
    }

    const updated = await this.prisma.visitor.update({
      where: { id },
      data: { status: 'revogado' },
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Revogou autorização',
      target: visitor.name,
      module: 'Visitantes',
    });

    return updated;
  }

  /** Validação do QR na guarita. */
  async byCode(condominiumId: string, code: string) {
    const visitor = await this.prisma.visitor.findFirst({
      where: { condominiumId, code: code.trim().toUpperCase() },
      include: { unit: { select: { label: true, block: true } } },
    });
    if (!visitor) throw new NotFoundException('Código não encontrado ou expirado.');
    return visitor;
  }

  private async mainGateId(condominiumId: string): Promise<string> {
    const gate = await this.prisma.gate.findFirst({
      where: { condominiumId, kind: 'principal' },
    });
    if (!gate) throw new BadRequestException('Condomínio sem portaria principal cadastrada.');
    return gate.id;
  }

  /**
   * Código curto e legível para ditar por telefone, sem caracteres
   * ambíguos (O/0, I/1). Repete o sorteio na colisão em vez de assumir
   * que não vai colidir.
   */
  private async uniqueCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      const exists = await this.prisma.visitor.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Não foi possível gerar o código. Tente novamente.');
  }
}

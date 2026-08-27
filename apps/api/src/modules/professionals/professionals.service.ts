import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';
import type { RequestUser } from '../../common/types';
import type { CreateProfessionalDto, CreateReviewDto, CreateServiceRequestDto } from './dto';

type Sort = 'relevancia' | 'nota' | 'trabalhos' | 'preco';

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(
    condominiumId: string,
    query: PageQueryDto,
    filters: { category?: string; recommended?: boolean; emergency?: boolean; sort?: Sort },
  ) {
    const where: Prisma.ProfessionalWhereInput = {
      condominiumId,
      active: true,
      ...(filters.category ? { category: filters.category as never } : {}),
      ...(filters.recommended ? { recommendedByCondo: true } : {}),
      ...(filters.emergency ? { emergency: true } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { company: { contains: query.q, mode: 'insensitive' } },
              { specialties: { has: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.professional.findMany({
        where,
        orderBy: orderFor(filters.sort),
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.professional.count({ where }),
    ]);

    return paginated(items.map(serialize), total, query);
  }

  async categories(condominiumId: string) {
    const rows = await this.prisma.professional.groupBy({
      by: ['category'],
      where: { condominiumId, active: true },
      _count: { _all: true },
    });
    return rows.map((r) => ({ category: r.category, count: r._count._all }));
  }

  async detail(condominiumId: string, id: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { id, condominiumId },
      include: { reviews: { orderBy: { at: 'desc' }, take: 12 } },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');
    return { ...serialize(professional), reviews: professional.reviews };
  }

  async requests(user: RequestUser, condominiumId: string, query: PageQueryDto) {
    const where = {
      condominiumId,
      ...(user.role === 'morador' && user.unitId ? { unitId: user.unitId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: { professional: { select: { name: true, category: true } } },
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return paginated(
      items.map((r) => ({ ...r, quotedAmount: r.quotedAmount ? Number(r.quotedAmount) : undefined })),
      total,
      query,
    );
  }

  async requestQuote(user: RequestUser, condominiumId: string, dto: CreateServiceRequestDto) {
    if (!user.unitId) throw new BadRequestException('Somente moradores podem pedir orçamento.');

    const professional = await this.prisma.professional.findFirst({
      where: { id: dto.professionalId, condominiumId, active: true },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');

    const request = await this.prisma.serviceRequest.create({
      data: {
        condominiumId,
        professionalId: professional.id,
        unitId: user.unitId,
        residentName: user.name,
        service: dto.service.trim(),
        description: dto.description.trim(),
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
      },
    });

    await this.notifications.push({
      condominiumId,
      unitId: user.unitId,
      kind: 'servico',
      title: 'Pedido de orçamento enviado',
      body: `${professional.name} recebeu seu pedido de "${dto.service}".`,
      link: '/app/profissionais',
      refId: request.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Solicitou orçamento',
      target: professional.name,
      detail: dto.service,
      module: 'Profissionais',
    });

    return request;
  }

  /**
   * Publica a avaliação e reajusta a média numa transação.
   *
   * A média é desnormalizada na tabela do profissional; se a avaliação
   * entrasse sem o reajuste, a listagem passaria a ordenar por um número
   * que não corresponde mais às avaliações existentes.
   */
  async review(user: RequestUser, condominiumId: string, professionalId: string, dto: CreateReviewDto) {
    if (!user.unitId) throw new BadRequestException('Somente moradores podem avaliar.');

    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, condominiumId },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.professionalReview.create({
          data: {
            professionalId,
            condominiumId,
            unitId: user.unitId!,
            authorName: user.name,
            rating: dto.rating,
            service: dto.service.trim(),
            comment: dto.comment.trim(),
          },
        });

        const stats = await tx.professionalReview.aggregate({
          where: { professionalId },
          _avg: { rating: true },
          _count: { _all: true },
        });

        await tx.professional.update({
          where: { id: professionalId },
          data: {
            rating: new Prisma.Decimal((stats._avg.rating ?? dto.rating).toFixed(2)),
            reviewsCount: stats._count._all,
          },
        });

        return review;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Sua unidade já avaliou este profissional.');
      }
      throw error;
    }
  }

  async create(user: RequestUser, condominiumId: string, dto: CreateProfessionalDto) {
    const professional = await this.prisma.professional.create({
      data: {
        condominiumId,
        name: dto.name.trim(),
        document: '—',
        company: dto.company?.trim(),
        category: dto.category,
        specialties: dto.specialties ?? [],
        phone: dto.phone.trim(),
        email: dto.email?.trim(),
        bio: dto.bio?.trim() ?? 'Profissional indicado pela administração.',
        serviceArea: dto.serviceArea ?? 'Bairro e adjacências',
        since: new Date(),
        priceFrom: dto.priceFrom !== undefined ? new Prisma.Decimal(dto.priceFrom) : null,
        responseTime: 'Responde no mesmo dia',
        emergency: dto.emergency ?? false,
        verified: true,
        recommendedByCondo: true,
        recommendedBy: user.name,
      },
    });

    await this.notifications.push({
      condominiumId,
      role: 'morador',
      kind: 'servico',
      title: 'Novo profissional indicado',
      body: `${professional.name} entrou na lista de indicados do condomínio.`,
      link: '/app/profissionais',
      refId: professional.id,
    });

    await this.audit.record({
      condominiumId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'Indicou profissional',
      target: professional.name,
      module: 'Profissionais',
    });

    return serialize(professional);
  }
}

function orderFor(sort?: Sort): Prisma.ProfessionalOrderByWithRelationInput[] {
  switch (sort) {
    case 'nota':
      return [{ rating: 'desc' }, { reviewsCount: 'desc' }];
    case 'trabalhos':
      return [{ jobsInCondo: 'desc' }];
    case 'preco':
      return [{ priceFrom: 'asc' }];
    default:
      // Relevância: a indicação da administração pesa mais que a nota isolada.
      return [{ recommendedByCondo: 'desc' }, { verified: 'desc' }, { rating: 'desc' }];
  }
}

function serialize<T extends { rating: unknown; priceFrom: unknown; since: Date }>(p: T) {
  return {
    ...p,
    rating: Number(p.rating),
    priceFrom: p.priceFrom === null ? undefined : Number(p.priceFrom),
    since: p.since.toISOString().slice(0, 10),
  };
}

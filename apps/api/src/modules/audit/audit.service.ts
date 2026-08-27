import { Injectable } from '@nestjs/common';
import type { UserRole } from '@myhome/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PageQueryDto, paginated } from '../../common/dto/page-query.dto';

export interface RecordAuditInput {
  condominiumId: string;
  actorId?: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  detail?: string;
  module: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Trilha de auditoria. Toda escrita relevante passa por aqui.
 *
 * A gravação é deliberadamente tolerante a falha: se o registro de
 * auditoria falhar, a operação de negócio já concluída não é desfeita —
 * perder uma linha de trilha é ruim, mas reverter uma liberação de
 * visitante que já aconteceu no portão é pior.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.auditEntry.create({
        data: {
          condominiumId: input.condominiumId,
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: input.action,
          target: input.target,
          detail: input.detail,
          module: input.module,
          ip: input.ip ?? '0.0.0.0',
          userAgent: input.userAgent,
        },
      });
    } catch {
      // Silencioso por desenho — ver comentário da classe.
    }
  }

  async list(condominiumId: string, query: PageQueryDto) {
    const where = {
      condominiumId,
      ...(query.q
        ? {
            OR: [
              { actorName: { contains: query.q, mode: 'insensitive' as const } },
              { action: { contains: query.q, mode: 'insensitive' as const } },
              { target: { contains: query.q, mode: 'insensitive' as const } },
              { module: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditEntry.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);

    return paginated(items, total, query);
  }
}

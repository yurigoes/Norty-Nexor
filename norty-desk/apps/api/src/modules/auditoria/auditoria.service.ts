import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Campos que nunca entram na trilha, mesmo que apareçam no diff. */
const NUNCA_REGISTRAR = new Set([
  'password',
  'passwordHash',
  'secret',
  'apiKey',
  'token',
  'tokenHash',
  'webhookSecret',
]);

export type EntradaDeAuditoria = {
  action: string;
  entity: string;
  entityId?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  ip?: string | null;
};

/**
 * A trilha de configuração.
 *
 * Registra **o que mudou**, não a linha inteira: um diff de dois campos
 * numa tabela de trinta é o que se lê seis meses depois quando alguém
 * pergunta "quem afrouxou este SLA?". Guardar o registro completo antes
 * e depois transforma a trilha num backup que ninguém consulta.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra. **Nunca lança**: falha de auditoria não pode desfazer a
   * ação já feita — isso deixaria o sistema num estado pior do que o
   * de não ter trilha.
   */
  async registrar(usuario: UsuarioAutenticado, entrada: EntradaDeAuditoria): Promise<void> {
    try {
      const diff = AuditoriaService.diferenca(entrada.antes, entrada.depois);

      await this.prisma.auditLog.create({
        data: {
          organizationId: usuario.organizationId,
          actorId: usuario.userId,
          action: entrada.action,
          entity: entrada.entity,
          entityId: entrada.entityId ?? null,
          ip: entrada.ip ?? null,
          diff: (diff ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    } catch (erro) {
      this.logger.error(
        `Trilha de ${entrada.action} em ${entrada.entity} não gravou: ` +
          (erro as Error).message,
      );
    }
  }

  async consultar(
    usuario: UsuarioAutenticado,
    filtro: { entity?: string; entityId?: string; actorId?: string; limit?: number },
  ) {
    const linhas = await this.prisma.auditLog.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.entity ? { entity: filtro.entity } : {}),
        ...(filtro.entityId ? { entityId: filtro.entityId } : {}),
        ...(filtro.actorId ? { actorId: filtro.actorId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filtro.limit ?? 100, 500),
    });

    const atores = await this.prisma.user.findMany({
      where: { id: { in: linhas.map((l) => l.actorId).filter(Boolean) as string[] } },
      select: { id: true, name: true, email: true },
    });
    const porId = new Map(atores.map((a) => [a.id, a]));

    return linhas.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      diff: l.diff,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
      actor: l.actorId ? (porId.get(l.actorId) ?? null) : null,
    }));
  }

  /**
   * O que mudou entre os dois estados.
   *
   * Campo com segredo nunca entra — nem o valor antigo. A trilha é
   * lida por gente que não precisa da senha do IMAP para saber que
   * alguém a trocou; registrar "foi alterada" basta.
   */
  static diferenca(
    antes?: Record<string, unknown> | null,
    depois?: Record<string, unknown> | null,
  ): Record<string, { de: unknown; para: unknown }> | null {
    if (!antes && !depois) return null;

    const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
    const diff: Record<string, { de: unknown; para: unknown }> = {};

    for (const chave of chaves) {
      const de = antes?.[chave];
      const para = depois?.[chave];

      if (JSON.stringify(de) === JSON.stringify(para)) continue;

      diff[chave] = NUNCA_REGISTRAR.has(chave)
        ? { de: '(oculto)', para: '(alterado)' }
        : { de: de ?? null, para: para ?? null };
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }
}

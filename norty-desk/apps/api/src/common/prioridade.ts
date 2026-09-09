import { DEFAULT_PRIORITY_MATRIX, type PriorityMatrix, type Scale, computePriority } from '@norty-desk/shared';

import type { PrismaService } from './prisma/prisma.service';

/**
 * Prioridade é derivada, nunca digitada (CLAUDE.md, regra 7).
 *
 * Mora aqui, e não no serviço de chamados, porque o problema usa a
 * mesma matriz da organização: um problema de urgência 5 e impacto 5
 * tem de sair com a mesma prioridade que o chamado equivalente. Duas
 * cópias divergiriam na primeira vez que alguém ajustasse a matriz de
 * um lado só.
 */
export async function derivarPrioridade(
  prisma: PrismaService,
  organizationId: string,
  urgency: Scale,
  impact: Scale,
): Promise<Scale> {
  const organizacao = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { priorityMatrix: true },
  });

  const matriz = (organizacao.priorityMatrix as PriorityMatrix | null) ?? DEFAULT_PRIORITY_MATRIX;
  return computePriority(urgency, impact, matriz);
}

import type { Prisma } from '@prisma/client';
import { ticketReadScope } from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';

/**
 * O `where` que corresponde ao escopo de leitura do perfil.
 *
 * Autorização diz se a rota abre; escopo diz quais linhas voltam. São
 * coisas diferentes e as duas são obrigatórias — este `where` entra
 * mesmo quando a rota já passou pelo `PermissionsGuard`
 * (`docs/04-rbac.md`, seção 3).
 */
export function escopoDeLeitura(usuario: UsuarioAutenticado): Prisma.TicketWhereInput {
  const base: Prisma.TicketWhereInput = { organizationId: usuario.organizationId };

  switch (ticketReadScope(usuario.role)) {
    case 'TODOS':
      return base;

    case 'TIME':
      return {
        ...base,
        OR: [
          { actors: { some: { role: 'ATRIBUIDO', teamId: { in: usuario.teamIds } } } },
          { actors: { some: { userId: usuario.userId } } },
        ],
      };

    case 'PROPRIOS':
      return {
        ...base,
        actors: {
          some: {
            userId: usuario.userId,
            role: { in: ['REQUERENTE', 'OBSERVADOR'] },
          },
        },
      };
  }
}

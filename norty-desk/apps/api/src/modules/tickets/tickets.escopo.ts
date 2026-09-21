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

  // A pessoa da empresa-cliente não sai do próprio cliente.
  //
  // O recorte é por `clientId`, **antes** de olhar quem é ator: mesmo
  // que por engano alguém a coloque como observadora num chamado de
  // outro cliente, ele não volta. É o que impede o vazamento entre
  // empresas da carteira, e por isso está aqui e não numa tela.
  if (usuario.clientId) {
    return {
      ...base,
      clientId: usuario.clientId,
      actors: {
        some: { userId: usuario.userId, role: { in: ['REQUERENTE', 'OBSERVADOR'] } },
      },
    };
  }

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

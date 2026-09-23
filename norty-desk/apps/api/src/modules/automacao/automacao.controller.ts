import { Controller, Get, UseGuards } from '@nestjs/common';
import { ACOES_AUTOMATICAS, type AutomacaoView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * O que o sistema resolve sozinho, em uma tela.
 *
 * ## Por que esta tela existe
 *
 * A ação automática é ligada num campo escondido dentro da edição de
 * **um** modelo de chamado. Quem administra a instalação não tem como
 * responder "o que este sistema faz sem passar por ninguém?" sem abrir
 * modelo por modelo — e essa é exatamente a pergunta que um auditor, um
 * gestor novo ou o próprio Yuri daqui a seis meses vai fazer.
 *
 * Automação que ninguém consegue enumerar é automação que ninguém
 * controla.
 *
 * ## Só leitura
 *
 * Ligar e desligar continua sendo na edição do modelo, onde está o
 * aviso de que o chamado vai se resolver sem passar por ninguém. Um
 * segundo lugar para ligar seria um segundo lugar para esquecer o
 * aviso.
 *
 * Usa `config:formularios` e não uma permissão nova: quem liga a ação
 * é quem edita o modelo, e as duas coisas nunca vão andar separadas.
 */
@Controller('automacoes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutomacaoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('config:formularios')
  async listar(@CurrentUser() usuario: UsuarioAutenticado): Promise<AutomacaoView[]> {
    const modelos = await this.prisma.ticketForm.findMany({
      where: {
        organizationId: usuario.organizationId,
        acaoAutomatica: { not: null },
      },
      select: {
        id: true,
        name: true,
        isModel: true,
        isPublic: true,
        acaoAutomatica: true,
        category: { select: { id: true, name: true, requiresApproval: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Toda ação aparece, inclusive a que ninguém ligou. Uma lista que
    // só mostra o que está ligado não responde "o que dá para
    // automatizar?" — que é metade da pergunta de quem abre esta tela.
    return ACOES_AUTOMATICAS.map((acao) => ({
      acao,
      modelos: modelos
        .filter((m) => m.acaoAutomatica === acao)
        .map((m) => ({
          id: m.id,
          nome: m.name,
          // Um modelo que não é modelo não aparece para ninguém
          // escolher, então a ação nele está ligada e morta. Vale
          // dizer, em vez de deixar a pessoa procurar por que nunca
          // roda.
          ofereceNaTela: m.isModel,
          // Público é a abertura pelo protocolo, sem login — e ali a
          // ação **não** corre, por falta de identidade provada.
          tambemSemLogin: m.isPublic,
          categoria: m.category
            ? {
                id: m.category.id,
                nome: m.category.name,
                exigeAprovacao: m.category.requiresApproval,
              }
            : null,
        })),
    }));
  }
}

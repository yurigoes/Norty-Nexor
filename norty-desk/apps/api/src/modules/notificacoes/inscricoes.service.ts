import { Inject, Injectable } from '@nestjs/common';
import type {
  AparelhoInscritoView,
  EstadoDasNotificacoes,
  InscreverPushRequest,
  TipoDeNotificacao,
} from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_PUSH } from './notificacoes.tokens';
import type { PortaDePush } from './push.transporte';

/**
 * Os aparelhos de uma pessoa, e o que ela escolheu não receber.
 *
 * Não há permissão aqui de propósito: cada um governa os próprios
 * aparelhos, e ninguém governa os de outro. O `where` começa sempre
 * pelo `userId` do token — é o que impede que um id no corpo da
 * requisição desinscreva o aparelho de outra pessoa.
 */
@Injectable()
export class InscricoesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTA_DE_PUSH) private readonly push: PortaDePush,
  ) {}

  /**
   * O estado, para a tela.
   *
   * `endpointAtual` vem do aparelho que está olhando: sem ele a lista
   * seria "três navegadores", sem dizer qual é este. E é este que a
   * pessoa quer desligar quando clica em desligar.
   */
  async estado(userId: string, endpointAtual?: string): Promise<EstadoDasNotificacoes> {
    const [aparelhos, preferencia] = await Promise.all([
      this.prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
    ]);

    return {
      chavePublica: this.push.chavePublica(),
      aparelhos: aparelhos.map(
        (a): AparelhoInscritoView => ({
          id: a.id,
          descricao: a.descricao,
          esteAparelho: Boolean(endpointAtual) && a.endpoint === endpointAtual,
          createdAt: a.createdAt.toISOString(),
          lastSentAt: a.lastSentAt?.toISOString() ?? null,
        }),
      ),
      silenciados: (preferencia?.silenciados ?? []) as TipoDeNotificacao[],
    };
  }

  /**
   * Inscreve o aparelho.
   *
   * `upsert` pelo endpoint, e não `create`: o navegador devolve o mesmo
   * endpoint quando a pessoa se inscreve de novo no mesmo aparelho, e
   * um `create` cego daria erro de unicidade numa ação que, para quem
   * clicou, é apenas "ligar de novo".
   *
   * A troca de dono é real e precisa funcionar: duas pessoas que usam o
   * mesmo computador compartilham o endpoint do navegador, e quem
   * entrou por último é quem deve receber.
   */
  async inscrever(
    usuario: { userId: string; organizationId: string },
    dados: InscreverPushRequest,
  ): Promise<EstadoDasNotificacoes> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dados.endpoint },
      update: {
        userId: usuario.userId,
        organizationId: usuario.organizationId,
        p256dh: dados.p256dh,
        auth: dados.auth,
        descricao: dados.descricao?.slice(0, 120) ?? null,
      },
      create: {
        userId: usuario.userId,
        organizationId: usuario.organizationId,
        endpoint: dados.endpoint,
        p256dh: dados.p256dh,
        auth: dados.auth,
        descricao: dados.descricao?.slice(0, 120) ?? null,
      },
    });

    return this.estado(usuario.userId, dados.endpoint);
  }

  /** Desliga um aparelho. Só os próprios — o `where` carrega o `userId`. */
  async desinscrever(userId: string, id: string, endpointAtual?: string): Promise<EstadoDasNotificacoes> {
    await this.prisma.pushSubscription.deleteMany({ where: { id, userId } });
    return this.estado(userId, endpointAtual);
  }

  /**
   * O que a pessoa não quer receber.
   *
   * Guarda-se o que foi silenciado, e não o que foi ligado: motivo novo
   * nasce ligado para quem já existe. Na lista do que foi ligado, todo
   * motivo acrescentado depois nasceria invisível.
   */
  async silenciar(userId: string, silenciados: TipoDeNotificacao[]): Promise<EstadoDasNotificacoes> {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: { silenciados },
      create: { userId, silenciados },
    });

    return this.estado(userId);
  }
}

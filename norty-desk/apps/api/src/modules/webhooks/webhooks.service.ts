import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { cifrar, decifrar } from '../channels/segredos';
import { EVENTOS_DE_WEBHOOK, type EventoDeWebhook } from './eventos';
import type { EscreverWebhookDto } from './dto';

/**
 * Webhooks de saída.
 *
 * Enfileirar e entregar são separados pela mesma razão da fila de
 * e-mail: fechar um chamado não pode ficar esperando o servidor de
 * ninguém, e um servidor fora do ar não pode fazer o evento se perder.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Emissão
  // -------------------------------------------------------------------

  /**
   * Enfileira o evento para quem o assinou.
   *
   * Nunca lança: um webhook mal configurado não pode derrubar a ação
   * que o gerou. O chamado fecha; a entrega falha e aparece no log.
   */
  async emitir(
    organizationId: string,
    evento: EventoDeWebhook,
    payload: Record<string, unknown>,
  ): Promise<number> {
    try {
      const assinantes = await this.prisma.outboundWebhook.findMany({
        where: { organizationId, isActive: true, events: { has: evento } },
        select: { id: true },
      });

      if (assinantes.length === 0) return 0;

      await this.prisma.webhookDelivery.createMany({
        data: assinantes.map((a) => ({
          webhookId: a.id,
          event: evento,
          payload: { evento, enviadoEm: new Date().toISOString(), dados: payload } as Prisma.InputJsonValue,
        })),
      });

      return assinantes.length;
    } catch (erro) {
      this.logger.error(
        `Não consegui enfileirar ${evento}: ${(erro as Error).message}. A ação seguiu.`,
      );
      return 0;
    }
  }

  // -------------------------------------------------------------------
  // Cadastro
  // -------------------------------------------------------------------

  async listar(usuario: UsuarioAutenticado) {
    const webhooks = await this.prisma.outboundWebhook.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { deliveries: true } } },
    });

    return webhooks.map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      // O segredo não sai. A tela precisa saber que existe, e é só.
      hasSecret: Boolean(w.secret),
      deliveryCount: w._count.deliveries,
    }));
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverWebhookDto) {
    WebhooksService.exigirEventosConhecidos(dto.events);
    WebhooksService.exigirUrlDeSaida(dto.url);

    const webhook = await this.prisma.outboundWebhook.create({
      data: {
        organizationId: usuario.organizationId,
        name: dto.name,
        url: dto.url,
        secret: cifrar(dto.secret),
        events: dto.events,
      },
    });

    await this.auditoria.registrar(usuario, {
      action: 'webhook.criado',
      entity: 'OutboundWebhook',
      entityId: webhook.id,
      depois: { name: webhook.name, url: webhook.url, events: webhook.events },
    });

    return { id: webhook.id, name: webhook.name };
  }

  async editar(usuario: UsuarioAutenticado, id: string, dto: Partial<EscreverWebhookDto>) {
    const atual = await this.exigir(usuario, id);

    if (dto.events) WebhooksService.exigirEventosConhecidos(dto.events);
    if (dto.url) WebhooksService.exigirUrlDeSaida(dto.url);

    await this.prisma.outboundWebhook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        // Segredo em branco significa "não mexi nisso".
        ...(dto.secret ? { secret: cifrar(dto.secret) } : {}),
      },
    });

    await this.auditoria.registrar(usuario, {
      action: 'webhook.editado',
      entity: 'OutboundWebhook',
      entityId: id,
      antes: { name: atual.name, url: atual.url, events: atual.events, isActive: atual.isActive, secret: atual.secret },
      depois: {
        name: dto.name ?? atual.name,
        url: dto.url ?? atual.url,
        events: dto.events ?? atual.events,
        isActive: dto.isActive ?? atual.isActive,
        secret: dto.secret ? 'novo' : atual.secret,
      },
    });

    return { ok: true };
  }

  async desativar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    await this.exigir(usuario, id);
    // Desativar, não excluir: o log de entrega aponta para o webhook.
    await this.prisma.outboundWebhook.update({ where: { id }, data: { isActive: false } });
  }

  async entregas(usuario: UsuarioAutenticado, id: string, status?: string) {
    await this.exigir(usuario, id);

    return this.prisma.webhookDelivery.findMany({
      where: {
        webhookId: id,
        ...(status ? { status: status as 'PENDENTE' | 'ENVIADO' | 'FALHOU' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Reenfileira uma entrega. É o botão de "tenta de novo" do operador. */
  async reenfileirar(usuario: UsuarioAutenticado, deliveryId: string) {
    const entrega = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, webhook: { organizationId: usuario.organizationId } },
    });

    if (!entrega) throw new NotFoundException('Entrega não encontrada.');

    return this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDENTE', attempts: 0, scheduledFor: new Date(), lastError: null },
    });
  }

  /** Uma entrega de teste, para o operador conferir a assinatura no outro lado. */
  async testar(usuario: UsuarioAutenticado, id: string) {
    const webhook = await this.exigir(usuario, id);

    return this.prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: 'ticket.criado',
        payload: {
          evento: 'ticket.criado',
          teste: true,
          enviadoEm: new Date().toISOString(),
          dados: { id: '00000000-0000-4000-8000-000000000000', number: 0, subject: 'Entrega de teste' },
        },
      },
    });
  }

  /** O segredo em claro, só para o job de entrega assinar. */
  segredoDe(webhook: { secret: string }): string {
    return decifrar(webhook.secret);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async exigir(usuario: UsuarioAutenticado, id: string) {
    const webhook = await this.prisma.outboundWebhook.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });

    if (!webhook) throw new NotFoundException('Webhook não encontrado.');
    return webhook;
  }

  private static exigirEventosConhecidos(eventos: readonly string[]): void {
    const desconhecidos = eventos.filter(
      (e) => !EVENTOS_DE_WEBHOOK.includes(e as EventoDeWebhook),
    );

    if (desconhecidos.length > 0) {
      throw new BadRequestException(
        `Evento desconhecido: ${desconhecidos.join(', ')}. ` +
          `Os válidos são: ${EVENTOS_DE_WEBHOOK.join(', ')}.`,
      );
    }
  }

  /**
   * Recusa endereço que não faz sentido como destino.
   *
   * `http://` em claro e endereço de laço são as duas formas de o
   * webhook virar um problema: a primeira manda o payload do chamado
   * pela rede aberta; a segunda transforma a API num scanner da rede
   * interna para quem tiver a permissão de cadastrar webhook.
   */
  private static exigirUrlDeSaida(url: string): void {
    let alvo: URL;
    try {
      alvo = new URL(url);
    } catch {
      throw new BadRequestException('URL inválida.');
    }

    if (alvo.protocol !== 'https:') {
      throw new BadRequestException(
        'O destino tem de ser `https`: o corpo carrega dado de chamado.',
      );
    }

    const host = alvo.hostname.toLowerCase();
    const privado =
      host === 'localhost' ||
      host === '::1' ||
      host.endsWith('.localhost') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);

    if (privado) {
      throw new BadRequestException(
        'Endereço de rede interna não é destino de webhook: a API viraria ' +
          'um scanner da rede para quem pudesse cadastrá-lo.',
      );
    }
  }
}

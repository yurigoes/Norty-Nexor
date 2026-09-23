import {
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { InboundAcceptedResponse, MetaWebhookRequest } from '@norty-desk/shared';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { assinaturaConfere } from './assinatura';
import { EntradaService } from './entrada.service';
import { lerEntrega } from './meta.mensagem';
import { decifrarConfig } from './segredos';

/**
 * Entrada de WhatsApp pela API oficial da Meta.
 *
 * ## Duas rotas, e a primeira só existe uma vez
 *
 * O `GET` é o aperto de mão: ao salvar a URL no painel da Meta, ela
 * chama uma vez com um desafio e espera o desafio de volta, em texto
 * puro. Devolver JSON — que é o padrão desta API — reprova a
 * configuração com uma mensagem que não explica nada. Daí o
 * `@Header('Content-Type', 'text/plain')`.
 *
 * ## A assinatura é sobre os bytes, não sobre o objeto
 *
 * A Meta assina o corpo exato que mandou. Reserializar o JSON já
 * parseado dá outros bytes — a ordem das chaves e o escape de acento
 * mudam — e aí a assinatura de **toda** entrega legítima falharia. Por
 * isso a aplicação sobe com `rawBody: true` e a conferência é sobre
 * `request.rawBody`.
 *
 * O canal antigo (Evolution) reserializa, e funciona porque quem assina
 * lá somos nós mesmos. Aqui quem assina é outra empresa.
 *
 * ## Devolver 200 rápido
 *
 * A Meta reentrega o que não recebeu 200 em poucos segundos, e
 * reentrega com o mesmo `wamid`. Então esta rota só **grava** — a
 * unicidade de `externalId` absorve a reentrega — e o processamento
 * acontece depois, no job. Processar aqui dentro faria a entrega
 * demorar e a Meta reentregar a mesma mensagem já em processamento.
 */
@Controller('channels/meta')
export class MetaController {
  private readonly logger = new Logger(MetaController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entrada: EntradaService,
  ) {}

  /**
   * O aperto de mão da Meta, uma vez, ao salvar a URL no painel.
   *
   * O `verifyToken` é comparado em tempo constante pela mesma razão da
   * assinatura: comparar com `===` vaza o tamanho do prefixo certo.
   */
  @Get('inbound/:channelAccountId')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async verificar(
    @Param('channelAccountId', ParseUUIDPipe) channelAccountId: string,
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
  ): Promise<string> {
    const conta = await this.prisma.channelAccount.findUnique({
      where: { id: channelAccountId },
      select: { kind: true, isActive: true, config: true },
    });

    if (!conta || conta.kind !== 'WHATSAPP_META') {
      throw new NotFoundException('Canal desconhecido.');
    }

    const config = decifrarConfig(conta.config as Record<string, unknown>) as {
      verifyToken?: string;
    };

    if (modo !== 'subscribe' || !token || !config.verifyToken) {
      throw new UnauthorizedException('Verificação recusada.');
    }

    if (!iguaisEmTempoConstante(token, config.verifyToken)) {
      this.logger.warn(`Verificação da conta ${channelAccountId} com token errado.`);
      throw new UnauthorizedException('Verificação recusada.');
    }

    // Texto puro, e só o desafio. Qualquer coisa a mais reprova.
    return desafio ?? '';
  }

  @Post('inbound/:channelAccountId')
  @HttpCode(200)
  async receber(
    @Param('channelAccountId', ParseUUIDPipe) channelAccountId: string,
    @Req() requisicao: RawBodyRequest<Request>,
  ): Promise<InboundAcceptedResponse & { mensagens?: number }> {
    const conta = await this.prisma.channelAccount.findUnique({
      where: { id: channelAccountId },
      select: { id: true, organizationId: true, kind: true, isActive: true, config: true },
    });

    if (!conta || conta.kind !== 'WHATSAPP_META') {
      throw new NotFoundException('Canal desconhecido.');
    }

    if (!conta.isActive) throw new UnauthorizedException('Canal inativo.');

    const config = decifrarConfig(conta.config as Record<string, unknown>) as {
      appSecret?: string;
    };

    // Sem segredo configurado, não há como saber se quem chamou é a
    // Meta. Recusar é o certo: esta URL é pública, e aceitar sem
    // conferir deixaria qualquer um abrir chamado em nome de qualquer
    // telefone. Na configuração isso aparece como canal incompleto.
    if (!config.appSecret) {
      this.logger.error(
        `Conta ${conta.id} recebeu entrega da Meta sem appSecret configurado. Recusada.`,
      );
      throw new UnauthorizedException('Canal sem segredo de aplicativo configurado.');
    }

    const assinatura = requisicao.header('x-hub-signature-256');
    const cru = requisicao.rawBody;

    if (!cru) {
      // Acontece se alguém remover `rawBody: true` da subida. Falhar
      // alto é melhor que conferir a assinatura contra o objeto
      // reserializado — que passaria a recusar tudo, sem dizer por quê.
      this.logger.error('Corpo cru indisponível: a aplicação subiu sem `rawBody`.');
      throw new UnauthorizedException('Não foi possível conferir a assinatura.');
    }

    if (!assinatura || !assinaturaConfere(cru, assinatura, config.appSecret)) {
      this.logger.warn(`Entrega para ${conta.id} com assinatura inválida.`);
      throw new UnauthorizedException('Assinatura inválida.');
    }

    const corpo = requisicao.body as MetaWebhookRequest;
    const mensagens = lerEntrega(corpo);

    // Entrega só com recibo de entrega é o caso comum, e não é erro.
    if (mensagens.length === 0) {
      await this.anotarFalhasDeEntrega(conta.organizationId, corpo);
      return { resultado: 'DESCARTADO', motivo: 'Entrega sem mensagem (recibo).' };
    }

    let aceitas = 0;
    for (const mensagem of mensagens) {
      const resultado = await this.entrada.receber({
        organizationId: conta.organizationId,
        channelAccountId: conta.id,
        channel: 'WHATSAPP',
        externalId: mensagem.externalId,
        fromAddress: mensagem.telefone,
        fromName: mensagem.nome,
        bodyText: mensagem.texto,
        rawHeaders: {
          provedor: 'META',
          messageType: mensagem.tipo,
          // O `id` da linha tocada e a mídia a buscar ficam aqui: o
          // processamento roda depois, e precisa deles sem ter o corpo
          // original em mãos.
          toque: mensagem.toque ?? null,
          midia: mensagem.midia ?? null,
          citando: mensagem.citando ?? null,
        },
        receivedAt: mensagem.recebidaEm,
      });

      if (resultado.resultado === 'ACEITO') aceitas += 1;
    }

    return {
      resultado: aceitas > 0 ? 'ACEITO' : 'DUPLICADO',
      mensagens: mensagens.length,
    };
  }

  /**
   * A Meta avisa quando **não** entregou — e a fila precisa saber.
   *
   * Sem isto a linha de saída ficaria `ENVIADO` para sempre, porque a
   * Meta aceitou a requisição; que a mensagem nunca chegou ao aparelho
   * é notícia que vem depois, por aqui. Um `ENVIADO` que não chegou é
   * pior que um `FALHOU`: ele encerra a investigação no lugar errado.
   */
  private async anotarFalhasDeEntrega(
    organizationId: string,
    corpo: MetaWebhookRequest,
  ): Promise<void> {
    for (const entrada of corpo.entry ?? []) {
      for (const mudanca of entrada.changes ?? []) {
        for (const estado of mudanca.value?.statuses ?? []) {
          if (estado.status !== 'failed' || !estado.id) continue;

          await this.prisma.outboundMessage.updateMany({
            where: { organizationId, externalId: estado.id },
            data: {
              status: 'FALHOU',
              lastError: 'A Meta aceitou a mensagem e depois não conseguiu entregá-la.',
            },
          });
        }
      }
    }
  }
}

/** Compara dois segredos sem vazar o tamanho do prefixo correto. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

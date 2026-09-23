import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EvolutionClient, type ConfigEvolution } from './evolution.client';
import { dentroDaJanela, motivoDaJanelaFechada } from './janela';
import { MetaClient, type ConfigMeta } from './meta.client';
import { decifrarConfig } from './segredos';
import type { Despacho, PortaDeEnvio } from './transporte';

/**
 * A saída do WhatsApp, seja pela Meta ou pela Evolution.
 *
 * ## Por que a escolha é por conta, e não por variável de ambiente
 *
 * A porta antiga lia `EVOLUTION_*` do ambiente: uma instalação, um
 * transporte. Isso quebra na migração de um número real, que não
 * acontece num sábado — durante ela as duas contas existem lado a lado,
 * e mensagens de chamados diferentes saem por caminhos diferentes. Quem
 * decide agora é a conta ativa da organização.
 *
 * A Meta ganha quando as duas existem: é a porta da frente, e a
 * Evolution só continua ali para o que ainda não migrou.
 *
 * ## A janela de 24 h é decidida aqui, antes de tentar
 *
 * Mandar e deixar a Meta recusar custaria quatro tentativas com backoff
 * — nenhuma passaria, porque o que falta não é rede, é permissão — e
 * deixaria "131047" no diagnóstico, que não conta nada a quem for
 * investigar. Ver `janela.ts`.
 */
@Injectable()
export class EnvioDeWhatsapp implements PortaDeEnvio {
  private readonly logger = new Logger(EnvioDeWhatsapp.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaClient,
    private readonly evolution: EvolutionClient,
    private readonly config: ConfigService,
  ) {}

  async enviar(despacho: Despacho): Promise<{ externalId?: string }> {
    const conta = await this.contaDaOrganizacao(despacho);

    if (conta?.kind === 'WHATSAPP_META') {
      return this.pelaMeta(conta, despacho);
    }

    return this.pelaEvolution(conta, despacho);
  }

  /**
   * Qual conta manda esta mensagem.
   *
   * A mensagem pode trazer a conta escolhida — é o caso da resposta a
   * uma mensagem que entrou por uma conta específica, que precisa sair
   * pela mesma: responder no número errado é responder para outra
   * pessoa, do ponto de vista de quem recebe.
   */
  private async contaDaOrganizacao(despacho: Despacho) {
    if (despacho.channelAccountId) {
      const escolhida = await this.prisma.channelAccount.findUnique({
        where: { id: despacho.channelAccountId },
        select: { id: true, kind: true, config: true, isActive: true },
      });
      if (escolhida?.isActive) return escolhida;
    }

    if (!despacho.organizationId) return null;

    const contas = await this.prisma.channelAccount.findMany({
      where: {
        organizationId: despacho.organizationId,
        isActive: true,
        kind: { in: ['WHATSAPP_META', 'WHATSAPP_EVOLUTION'] },
      },
      select: { id: true, kind: true, config: true, isActive: true },
    });

    // A oficial ganha da não oficial quando as duas existem.
    return contas.find((c) => c.kind === 'WHATSAPP_META') ?? contas[0] ?? null;
  }

  private async pelaMeta(
    conta: { id: string; config: unknown },
    despacho: Despacho,
  ): Promise<{ externalId?: string }> {
    const config = decifrarConfig(conta.config as Record<string, unknown>) as {
      phoneNumberId?: string;
      token?: string;
      versao?: string;
    };

    if (!config.phoneNumberId || !config.token) {
      throw new Error(
        'A conta da Meta está sem o id do número ou sem o token. ' +
          'Confira em Configurações → Canais.',
      );
    }

    const daMeta: ConfigMeta = {
      phoneNumberId: config.phoneNumberId,
      token: config.token,
      versao: config.versao,
    };

    const ultima = await this.ultimaEntradaDe(conta.id, despacho.para);

    if (!dentroDaJanela(ultima)) {
      // Erro, e não silêncio: a fila registra o motivo e o diagnóstico
      // o mostra em português. Quem respondeu precisa saber que a
      // resposta não saiu — descobrir pelo cliente é tarde.
      throw new Error(motivoDaJanelaFechada(ultima));
    }

    if (despacho.lista) {
      const resposta = await this.meta.enviarLista(daMeta, despacho.para, despacho.lista);
      return { externalId: resposta.id };
    }

    if (despacho.anexos?.length) {
      // A legenda vai no **primeiro** arquivo, e não em todos: repetida,
      // a mesma frase aparece embaixo de cada foto, e três fotos viram
      // três vezes "Segue o arquivo".
      let ultimo: string | undefined;

      for (const [i, anexo] of despacho.anexos.entries()) {
        const mediaId = await this.meta.subirMidia(daMeta, {
          bytes: anexo.bytes,
          mimeType: anexo.contentType,
          filename: anexo.filename,
        });

        const resposta = await this.meta.enviarMidia(daMeta, despacho.para, {
          tipo: EnvioDeWhatsapp.tipoDaMidia(anexo.contentType),
          mediaId,
          legenda: i === 0 ? despacho.corpo : undefined,
          filename: anexo.filename,
        });

        ultimo = resposta.id ?? ultimo;
      }

      return { externalId: ultimo };
    }

    const resposta = await this.meta.enviarTexto(daMeta, despacho.para, despacho.corpo);
    return { externalId: resposta.id };
  }

  /**
   * O tipo de mídia que a Meta espera, a partir do `Content-Type`.
   *
   * `document` é o destino de tudo que não é foto, vídeo ou áudio — e é
   * o certo: mandar um `.xlsx` como `image` faz a Meta recusar a
   * mensagem inteira.
   *
   * Áudio gravado no navegador chega como `audio/webm`, que a Meta
   * **não** aceita como `audio`. Vai como documento: chega tocável no
   * aparelho, em vez de não chegar.
   */
  private static tipoDaMidia(contentType: string): 'image' | 'document' | 'audio' | 'video' {
    const tipo = contentType.split(';')[0]!.trim().toLowerCase();

    if (tipo.startsWith('image/')) return 'image';
    if (tipo.startsWith('video/')) return 'video';
    if (tipo === 'audio/ogg' || tipo === 'audio/mpeg' || tipo === 'audio/mp4' || tipo === 'audio/amr') {
      return 'audio';
    }

    return 'document';
  }

  private async pelaEvolution(
    conta: { config: unknown } | null,
    despacho: Despacho,
  ): Promise<{ externalId?: string }> {
    const daConta = conta
      ? (decifrarConfig(conta.config as Record<string, unknown>) as Partial<ConfigEvolution>)
      : {};

    const config: ConfigEvolution = {
      baseUrl:
        daConta.baseUrl ||
        this.config.get<string>('EVOLUTION_BASE_URL') ||
        'http://192.168.15.72:8080',
      instance:
        daConta.instance || this.config.get<string>('EVOLUTION_INSTANCE') || 'norty-desk',
      apiKey: daConta.apiKey || this.config.get<string>('EVOLUTION_API_KEY') || '',
    };

    if (despacho.anexos?.length) {
      let ultimo: string | undefined;

      for (const [i, anexo] of despacho.anexos.entries()) {
        const resposta = await this.evolution.enviarMidia(config, despacho.para, {
          // A Evolution usa outro vocabulário de tipos, e não conhece
          // `video` separado de `document` em todas as versões. O
          // mapeamento é o mesmo da Meta, traduzido.
          mediatype: EnvioDeWhatsapp.tipoDaMidia(anexo.contentType),
          fileName: anexo.filename,
          media: anexo.bytes.toString('base64'),
          ...(i === 0 ? { caption: despacho.corpo } : {}),
        });

        ultimo = resposta.key?.id ?? ultimo;
      }

      return { externalId: ultimo };
    }

    // A Evolution não desenha lista de toque. O `corpo` já é a mesma
    // coisa escrita — por isso toda lista nasce com a versão em texto,
    // e não com um resumo dela.
    const resposta = await this.evolution.enviarTexto(config, despacho.para, despacho.corpo);
    return { externalId: resposta.key?.id };
  }

  /**
   * Quando esta pessoa falou com este número pela última vez.
   *
   * Sai de `InboundMessage`, que já grava o fato. Uma coluna à parte com
   * a mesma verdade seria um segundo lugar para ela ficar errada — e o
   * índice `(channelAccountId, fromAddress, receivedAt)` existe para
   * esta consulta.
   */
  private async ultimaEntradaDe(channelAccountId: string, telefone: string): Promise<Date | null> {
    const ultima = await this.prisma.inboundMessage.findFirst({
      where: { channelAccountId, fromAddress: telefone },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });

    return ultima?.receivedAt ?? null;
  }
}

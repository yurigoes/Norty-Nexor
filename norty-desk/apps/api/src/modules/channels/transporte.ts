import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EvolutionClient, type ConfigEvolution } from './evolution.client';
import type { ListaInterativa } from './meta.mensagem';

/**
 * O que uma mensagem precisa carregar para sair.
 *
 * `externalId` é o `Message-ID` que geramos: é por ele que a resposta
 * do cliente volta para o chamado certo (`docs/06-canais.md`, 2.2).
 */
export type Despacho = {
  para: string;
  assunto?: string;
  corpo: string;
  externalId: string;
  /** `Message-ID` da última mensagem nossa neste chamado. */
  emRespostaA?: string;
  remetente?: string;
  /** Quem manda. É por ela que o WhatsApp acha a conta de canal. */
  organizationId?: string;
  /**
   * A conta de canal escolhida.
   *
   * A resposta sai pela conta em que a pessoa falou: responder por
   * outro número é, do ponto de vista de quem recebe, mensagem de um
   * desconhecido.
   */
  channelAccountId?: string;
  /**
   * A mesma mensagem como lista de toque, quando o transporte souber
   * desenhar uma.
   *
   * `corpo` continua sendo a versão escrita **da mesma coisa**, e não um
   * resumo: é o que sai pela Evolution, que não desenha lista, e é o que
   * fica legível no diagnóstico.
   */
  lista?: ListaInterativa;
  /**
   * Os arquivos que vão junto da mensagem.
   *
   * `corpo` continua legível sozinho: é o que sai quando o arquivo não
   * pode ir — acima do limite do canal, armazenamento fora do ar — e é
   * o que fica no diagnóstico. Uma mensagem que só existe como binário
   * não se lê no banco.
   */
  anexos?: AnexoParaEnviar[];
};

/** Um arquivo já lido do armazenamento, pronto para sair. */
export type AnexoParaEnviar = {
  filename: string;
  contentType: string;
  bytes: Buffer;
};

export interface PortaDeEnvio {
  enviar(despacho: Despacho): Promise<{ externalId?: string }>;
}

/**
 * Envio por SMTP.
 *
 * O transporte é criado na primeira mensagem, não na subida: um SMTP
 * fora do ar não deve impedir a API de atender chamado pelo portal.
 */
@Injectable()
export class EnvioPorEmail implements PortaDeEnvio {
  private readonly logger = new Logger(EnvioPorEmail.name);
  private transporte: import('nodemailer').Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private async obterTransporte(): Promise<import('nodemailer').Transporter> {
    if (this.transporte) return this.transporte;

    const host = this.config.get<string>('SMTP_HOST');
    if (!host) throw new Error('SMTP_HOST não configurado: a fila de e-mail não tem por onde sair.');

    const nodemailer = await import('nodemailer');
    this.transporte = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
      secure: this.config.get<string>('SMTP_PORT') === '465',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER')!,
            pass: this.config.get<string>('SMTP_PASSWORD') ?? '',
          }
        : undefined,
    });

    return this.transporte;
  }

  async enviar(despacho: Despacho): Promise<{ externalId?: string }> {
    const transporte = await this.obterTransporte();

    await transporte.sendMail({
      from: despacho.remetente ?? this.config.get<string>('SMTP_FROM'),
      to: despacho.para,
      subject: despacho.assunto,
      text: despacho.corpo,
      // O arquivo vai anexado, e não como link: link de anexo de
      // chamado exige sessão, e quem recebe por e-mail pode não ter uma
      // — era clicar, cair no login e desistir.
      ...(despacho.anexos?.length
        ? {
            attachments: despacho.anexos.map((a) => ({
              filename: a.filename,
              content: a.bytes,
              contentType: a.contentType,
            })),
          }
        : {}),
      // O `Message-ID` é nosso e determinístico: é a âncora do
      // threading. `In-Reply-To` e `References` fazem o cliente de
      // e-mail agrupar, e fazem a resposta voltar identificada.
      messageId: despacho.externalId,
      ...(despacho.emRespostaA
        ? { inReplyTo: despacho.emRespostaA, references: [despacho.emRespostaA] }
        : {}),
    });

    return { externalId: despacho.externalId };
  }
}

/** Envio pela Evolution API (`docs/06-canais.md`, seção 3.6). */
@Injectable()
export class EnvioPorWhatsapp implements PortaDeEnvio {
  constructor(
    private readonly evolution: EvolutionClient,
    private readonly config: () => ConfigEvolution,
  ) {}

  async enviar(despacho: Despacho): Promise<{ externalId?: string }> {
    const resposta = await this.evolution.enviarTexto(this.config(), despacho.para, despacho.corpo);
    return { externalId: resposta.key?.id };
  }
}

/**
 * Transporte que só registra, para desenvolvimento e para a suíte.
 *
 * A alternativa seria a suíte falar com um SMTP de verdade, e aí ela
 * passaria a testar a rede em vez do produto.
 */
@Injectable()
export class EnvioSimulado implements PortaDeEnvio {
  private readonly logger = new Logger(EnvioSimulado.name);
  /** O que "saiu". A suíte lê daqui. */
  readonly enviados: Despacho[] = [];

  async enviar(despacho: Despacho): Promise<{ externalId?: string }> {
    this.enviados.push(despacho);
    this.logger.debug(`[simulado] para ${despacho.para}: ${despacho.corpo.slice(0, 60)}`);
    return { externalId: despacho.externalId };
  }
}

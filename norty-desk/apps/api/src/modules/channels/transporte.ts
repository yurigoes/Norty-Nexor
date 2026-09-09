import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EvolutionClient, type ConfigEvolution } from './evolution.client';

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

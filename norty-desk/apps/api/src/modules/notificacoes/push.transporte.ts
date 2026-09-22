import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Um aparelho, como o protocolo de Web Push o enxerga. */
export type AparelhoDePush = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * O que o envio devolve.
 *
 * `morto` é o que importa: o serviço de push respondeu que aquela
 * inscrição não existe mais (404/410). Quem chamou apaga a linha — sem
 * isso a tabela acumula aparelho de gente que desinstalou o navegador,
 * e toda notificação passa a gastar uma requisição inútil por aparelho
 * morto, para sempre.
 */
export type ResultadoDoPush = { ok: boolean; morto: boolean };

export interface PortaDePush {
  /** A chave pública VAPID, ou nulo se a instalação não tem par. */
  chavePublica(): string | null;
  enviar(aparelho: AparelhoDePush, carga: string): Promise<ResultadoDoPush>;
}

/**
 * Envio de verdade, pelo protocolo de Web Push.
 *
 * A carga vai cifrada de ponta a ponta com a chave do próprio aparelho
 * (RFC 8291): o serviço de push do Google ou da Mozilla encaminha bytes
 * que não consegue ler. É por isso que dá para mandar assunto de
 * chamado por ali.
 */
@Injectable()
export class EnvioDePushReal implements PortaDePush {
  private readonly logger = new Logger(EnvioDePushReal.name);
  private configurado = false;

  constructor(private readonly config: ConfigService) {}

  chavePublica(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() || null;
  }

  private async webPush(): Promise<typeof import('web-push') | null> {
    const publica = this.chavePublica();
    const privada = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();

    // Sem par VAPID o aviso está simplesmente desligado, como o canal
    // que não foi configurado. Não é erro: é instalação que não usa.
    if (!publica || !privada) return null;

    const webPush = await import('web-push');

    if (!this.configurado) {
      webPush.setVapidDetails(
        this.config.get<string>('VAPID_SUBJECT')?.trim() || 'mailto:suporte@norty.com.br',
        publica,
        privada,
      );
      this.configurado = true;
    }

    return webPush;
  }

  async enviar(aparelho: AparelhoDePush, carga: string): Promise<ResultadoDoPush> {
    const webPush = await this.webPush();
    if (!webPush) return { ok: false, morto: false };

    try {
      await webPush.sendNotification(
        {
          endpoint: aparelho.endpoint,
          keys: { p256dh: aparelho.p256dh, auth: aparelho.auth },
        },
        carga,
        // Aviso é perecível: chegar meia hora depois é ruído, não
        // notícia. Meia hora de TTL cobre o notebook que estava
        // fechado no almoço e descarta o resto.
        { TTL: 1800 },
      );
      return { ok: true, morto: false };
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;

      if (status === 404 || status === 410) {
        this.logger.debug(`Inscrição morta (${status}): será apagada.`);
        return { ok: false, morto: true };
      }

      this.logger.warn(`Push falhou (${status ?? 'sem status'}): ${String(erro)}`);
      return { ok: false, morto: false };
    }
  }
}

/**
 * Transporte que só registra, para desenvolvimento e para a suíte.
 *
 * Mesma razão do `EnvioSimulado` dos canais: falar com o serviço de
 * push de verdade faria a suíte testar a rede do Google em vez do
 * produto. E é lendo daqui que os testes verificam a promessa que mais
 * importa — que nota interna não chega a solicitante.
 */
@Injectable()
export class EnvioDePushSimulado implements PortaDePush {
  private readonly logger = new Logger(EnvioDePushSimulado.name);

  /** O que "saiu". A suíte lê daqui. */
  readonly enviados: { endpoint: string; carga: string }[] = [];

  /** Endpoints que devem responder como mortos, para exercitar a poda. */
  readonly mortos = new Set<string>();

  chavePublica(): string | null {
    return 'chave-publica-simulada';
  }

  async enviar(aparelho: AparelhoDePush, carga: string): Promise<ResultadoDoPush> {
    if (this.mortos.has(aparelho.endpoint)) return { ok: false, morto: true };

    this.enviados.push({ endpoint: aparelho.endpoint, carga });
    this.logger.debug(`[simulado] push para ${aparelho.endpoint.slice(-12)}`);
    return { ok: true, morto: false };
  }

  limpar(): void {
    this.enviados.length = 0;
    this.mortos.clear();
  }
}

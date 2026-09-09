import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AnexoRecebido } from '@norty-desk/shared';
import type { AddressObject, ParsedMail } from 'mailparser';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
import { EntradaService } from './entrada.service';
import { decifrarConfig } from './segredos';

type ConfigImap = {
  host: string;
  port?: number;
  tls?: boolean;
  username: string;
  password: string;
  folder?: string;
  processedFolder?: string;
  maxAttachmentBytes?: number;
};

/**
 * Coleta de e-mail por IMAP.
 *
 * O webhook é o caminho preferido — chega na hora e não depende de
 * ciclo. O IMAP existe porque a maioria das caixas corporativas não
 * entrega por HTTP, e porque é o que a Norty já usa hoje no GLPI.
 *
 * A mensagem entra pela mesma `EntradaService` do webhook: o threading,
 * a idempotência e o processamento não sabem por onde ela chegou.
 */
@Injectable()
export class ColetaJob {
  private readonly logger = new Logger(ColetaJob.name);
  /** Uma coleta por conta de cada vez: dois ciclos concorrentes na
      mesma caixa buscariam a mesma mensagem duas vezes. */
  private emCurso = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly entrada: EntradaService,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async coletarTodas(): Promise<void> {
    const contas = await this.prisma.channelAccount.findMany({
      where: { kind: 'EMAIL_IMAP', isActive: true },
    });

    for (const conta of contas) {
      await this.coletar(conta.id).catch((erro: Error) => {
        this.logger.error(`Coleta da conta ${conta.name} falhou: ${erro.message}`);
      });
    }
  }

  /**
   * Coleta uma caixa.
   *
   * Exposto para a tela de canais ter um botão "coletar agora" — sem
   * ele, quem acabou de configurar espera um minuto sem saber se
   * acertou a senha.
   */
  async coletar(channelAccountId: string): Promise<{ lidas: number; aceitas: number }> {
    if (this.emCurso.has(channelAccountId)) return { lidas: 0, aceitas: 0 };
    this.emCurso.add(channelAccountId);

    try {
      return await this.coletarDaCaixa(channelAccountId);
    } finally {
      this.emCurso.delete(channelAccountId);
    }
  }

  private async coletarDaCaixa(
    channelAccountId: string,
  ): Promise<{ lidas: number; aceitas: number }> {
    const conta = await this.prisma.channelAccount.findUniqueOrThrow({
      where: { id: channelAccountId },
    });

    const config = decifrarConfig(conta.config as Record<string, unknown>) as ConfigImap;

    if (!config.host || !config.username || !config.password) {
      await this.registrarErro(conta.id, 'Configuração incompleta: host, username e password.');
      return { lidas: 0, aceitas: 0 };
    }

    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');

    const cliente = new ImapFlow({
      host: config.host,
      port: config.port ?? 993,
      secure: config.tls ?? true,
      auth: { user: config.username, pass: config.password },
      logger: false,
    });

    let lidas = 0;
    let aceitas = 0;

    try {
      await cliente.connect();
      const trava = await cliente.getMailboxLock(config.folder ?? 'INBOX');

      try {
        // Só as não lidas: o que já passou por aqui não volta. A
        // idempotência por Message-ID cobre o resto.
        for await (const mensagem of cliente.fetch({ seen: false }, { source: true, uid: true })) {
          lidas += 1;

          if (!mensagem.source) {
            this.logger.warn('Mensagem sem corpo bruto; ignorada.');
            await cliente.messageFlagsAdd({ uid: String(mensagem.uid) }, ['\\Seen'], { uid: true });
            continue;
          }

          const bruta: ParsedMail = await simpleParser(mensagem.source);
          const remetente = bruta.from?.value?.[0];

          if (!remetente?.address || !bruta.messageId) {
            this.logger.warn('Mensagem sem remetente ou sem Message-ID; ignorada.');
            await cliente.messageFlagsAdd({ uid: String(mensagem.uid) }, ['\\Seen'], { uid: true });
            continue;
          }

          const anexos = await this.guardarAnexos(conta.organizationId, bruta.attachments, config);

          const resultado = await this.entrada.receber({
            organizationId: conta.organizationId,
            channelAccountId: conta.id,
            channel: 'EMAIL',
            externalId: bruta.messageId,
            inReplyTo: bruta.inReplyTo,
            references: Array.isArray(bruta.references)
              ? bruta.references
              : bruta.references
                ? [bruta.references]
                : undefined,
            fromAddress: remetente.address,
            fromName: remetente.name,
            subject: bruta.subject,
            bodyText: bruta.text,
            bodyHtml: typeof bruta.html === 'string' ? bruta.html : undefined,
            rawHeaders: {
              fromName: remetente.name ?? null,
              references: Array.isArray(bruta.references) ? bruta.references : [],
              to: destinatarios(bruta.to),
            },
            anexos,
            receivedAt: bruta.date ?? undefined,
          });

          if (resultado.resultado === 'ACEITO') aceitas += 1;

          // Marca lida sempre, inclusive a duplicata: deixá-la não lida
          // faria o ciclo seguinte buscá-la de novo, para sempre.
          await cliente.messageFlagsAdd({ uid: String(mensagem.uid) }, ['\\Seen'], { uid: true });

          if (config.processedFolder) {
            await cliente
              .messageMove({ uid: String(mensagem.uid) }, config.processedFolder, { uid: true })
              .catch(() => this.logger.warn(`Não consegui mover para ${config.processedFolder}.`));
          }
        }
      } finally {
        trava.release();
      }

      await this.prisma.channelAccount.update({
        where: { id: conta.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });
    } catch (erro) {
      await this.registrarErro(conta.id, (erro as Error).message);
      throw erro;
    } finally {
      await cliente.logout().catch(() => undefined);
    }

    if (lidas > 0) {
      this.logger.log(`${conta.name}: ${lidas} lida(s), ${aceitas} aceita(s).`);
    }

    return { lidas, aceitas };
  }

  private async registrarErro(id: string, mensagem: string): Promise<void> {
    await this.prisma.channelAccount.update({
      where: { id },
      data: { lastError: mensagem.slice(0, 500), lastSyncAt: new Date() },
    });
  }

  private async guardarAnexos(
    organizationId: string,
    anexos: { filename?: string; contentType?: string; content: Buffer }[] | undefined,
    config: ConfigImap,
  ): Promise<AnexoRecebido[]> {
    const limite = config.maxAttachmentBytes ?? 25 * 1024 * 1024;
    const guardados: AnexoRecebido[] = [];

    for (const anexo of anexos ?? []) {
      if (!anexo.content?.length || anexo.content.length > limite) continue;

      const nome =
        (anexo.filename || 'anexo').replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'anexo';
      const chave = `${organizationId}/entrada/${randomUUID()}-${nome}`;

      await this.armazenamento.guardar(
        chave,
        anexo.content,
        anexo.contentType ?? 'application/octet-stream',
      );

      guardados.push({
        storageKey: chave,
        filename: nome,
        contentType: anexo.contentType ?? 'application/octet-stream',
        sizeBytes: anexo.content.length,
        checksum: `sha256:${createHash('sha256').update(anexo.content).digest('hex')}`,
      });
    }

    return guardados;
  }
}

/**
 * O `to` do mailparser vem como um objeto quando há um cabeçalho `To` e
 * como lista quando há mais de um. Normalizar aqui evita espalhar a
 * checagem por quem só quer os endereços.
 */
function destinatarios(campo: AddressObject | AddressObject[] | undefined): { email: string }[] {
  if (!campo) return [];
  const objetos = Array.isArray(campo) ? campo : [campo];
  return objetos.flatMap((objeto) =>
    (objeto.value ?? [])
      .filter((endereco) => Boolean(endereco.address))
      .map((endereco) => ({ email: endereco.address as string })),
  );
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTAS_DE_ENVIO, type PortasDeEnvio } from './canais.tokens';
import type { ListaInterativa } from './meta.mensagem';
import type { AnexoParaEnviar } from './transporte';

/**
 * Backoff da retentativa: 1 min, 5 min, 15 min, 1 h.
 *
 * Quatro tentativas e para. Um endereço que não existe não passa a
 * existir na quinta, e um SMTP fora do ar por mais de uma hora é
 * problema de operação, não de fila — e aparece no painel de canais.
 */
const ESPERA_MINUTOS = [1, 5, 15, 60];

/**
 * O maior arquivo que sai por canal externo.
 *
 * O WhatsApp aceita 16 MB para mídia e 100 MB para documento; o e-mail
 * de quem recebe costuma cortar em 25 MB. Dezesseis é o menor teto
 * comum, e mandar o que vai ser recusado do outro lado é gastar
 * quatro tentativas para nada.
 */
const LIMITE_DE_ANEXO = 16 * 1024 * 1024;

@Injectable()
export class DespachoJob {
  private readonly logger = new Logger(DespachoJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTAS_DE_ENVIO) private readonly portas: PortasDeEnvio,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async despachar(): Promise<void> {
    const pendentes = await this.prisma.outboundMessage.findMany({
      where: { status: 'PENDENTE', scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: 50,
    });

    for (const mensagem of pendentes) {
      await this.despacharUma(mensagem.id);
    }
  }

  /** Exposto para a suíte não depender do relógio do cron. */
  async despacharUma(id: string): Promise<void> {
    const mensagem = await this.prisma.outboundMessage.findUnique({ where: { id } });
    if (!mensagem || mensagem.status !== 'PENDENTE') return;

    // Segunda verificação da nota interna. A primeira está em
    // `SaidaService`; esta existe porque o custo de um comentário
    // interno chegar ao cliente é alto demais para um cinto só.
    if (mensagem.eventId) {
      const evento = await this.prisma.ticketEvent.findUnique({
        where: { id: mensagem.eventId },
        select: { visibility: true },
      });

      if (evento?.visibility === 'INTERNA') {
        this.logger.error(
          `Mensagem ${id} aponta para um evento interno e foi descartada na saída. ` +
            'Isto não deveria acontecer: investigue quem a enfileirou.',
        );
        await this.prisma.outboundMessage.update({
          where: { id },
          data: { status: 'FALHOU', lastError: 'Evento interno: envio bloqueado.' },
        });
        return;
      }
    }

    const porta = this.portas[mensagem.channel];
    if (!porta) {
      await this.prisma.outboundMessage.update({
        where: { id },
        data: { status: 'FALHOU', lastError: `Sem transporte para o canal ${mensagem.channel}.` },
      });
      return;
    }

    const remetente = await this.remetenteDoChamado(mensagem.ticketId);
    const emRespostaA = await this.ultimaSaidaAntes(mensagem);

    try {
      const resultado = await porta.enviar({
        para: mensagem.toAddress,
        assunto: mensagem.subject ?? undefined,
        corpo: mensagem.body,
        externalId: mensagem.externalId ?? '',
        emRespostaA,
        remetente,
        organizationId: mensagem.organizationId,
        channelAccountId: mensagem.channelAccountId ?? undefined,
        // A lista de toque viaja em `payload`; `body` é a mesma coisa
        // escrita, para o transporte que não desenha lista.
        lista: DespachoJob.listaDoPayload(mensagem.payload),
        anexos: await this.anexosDoPayload(mensagem.payload),
      });

      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          status: 'ENVIADO',
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          ...(resultado.externalId ? { externalId: resultado.externalId } : {}),
        },
      });
    } catch (erro) {
      const tentativas = mensagem.attempts + 1;
      const espera = ESPERA_MINUTOS[tentativas - 1];

      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          attempts: tentativas,
          lastError: erro instanceof Error ? erro.message.slice(0, 500) : String(erro),
          ...(espera === undefined
            ? { status: 'FALHOU' }
            : { scheduledFor: new Date(Date.now() + espera * 60_000) }),
        },
      });

      if (espera === undefined) {
        this.logger.error(`Mensagem ${id} falhou nas ${tentativas} tentativas. Desisti.`);
      }
    }
  }

  /**
   * Lê do armazenamento os arquivos que a mensagem carrega.
   *
   * **Aqui, e não no enfileiramento.** Guardar o binário na fila
   * transformaria a tabela de saída num segundo armazenamento — com
   * cópia do arquivo por destinatário, e ela fica no banco para sempre.
   * A fila guarda o id; o byte é buscado na hora de sair.
   *
   * Arquivo que não abre não derruba a mensagem: o texto (`corpo`) já
   * diz o que era, e a pessoa pede de novo. Derrubar faria a fila
   * tentar quatro vezes um arquivo que continua não abrindo.
   */
  private async anexosDoPayload(payload: unknown): Promise<AnexoParaEnviar[] | undefined> {
    if (!payload || typeof payload !== 'object') return undefined;

    const bruto = payload as { tipo?: string; anexos?: { id?: string; filename?: string }[] };
    if (bruto.tipo !== 'ANEXOS' || !Array.isArray(bruto.anexos)) return undefined;

    const prontos: AnexoParaEnviar[] = [];

    for (const referencia of bruto.anexos) {
      if (!referencia?.id) continue;

      const anexo = await this.prisma.attachment.findUnique({
        where: { id: referencia.id },
        select: { filename: true, contentType: true, sizeBytes: true, storageKey: true },
      });

      if (!anexo) continue;

      if (anexo.sizeBytes > LIMITE_DE_ANEXO) {
        this.logger.warn(
          `Anexo ${referencia.id} tem ${anexo.sizeBytes} bytes e não cabe no canal; ` +
            'a mensagem sai só com o texto.',
        );
        continue;
      }

      try {
        const fluxo = await this.armazenamento.ler(anexo.storageKey);
        const pedacos: Buffer[] = [];
        for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco as Buffer));

        prontos.push({
          filename: anexo.filename,
          contentType: anexo.contentType,
          bytes: Buffer.concat(pedacos),
        });
      } catch (erro) {
        this.logger.warn(`Não consegui ler o anexo ${referencia.id}: ${String(erro)}`);
      }
    }

    return prontos.length > 0 ? prontos : undefined;
  }

  /**
   * A lista de toque guardada em `payload`, se houver uma.
   *
   * Conferida na leitura e não confiada: `payload` é `Json` e aceita o
   * que entrar. Uma lista malformada aqui viraria uma requisição
   * recusada pela Meta com uma mensagem que não diz qual campo estava
   * errado — e quatro tentativas iguais depois disso.
   */
  private static listaDoPayload(payload: unknown): ListaInterativa | undefined {
    if (!payload || typeof payload !== 'object') return undefined;

    const bruto = payload as { tipo?: string; lista?: unknown };
    if (bruto.tipo !== 'LISTA' || !bruto.lista || typeof bruto.lista !== 'object') {
      return undefined;
    }

    const lista = bruto.lista as Partial<ListaInterativa>;
    if (!lista.corpo || !lista.botao || !Array.isArray(lista.secoes)) return undefined;

    const secoes = lista.secoes.filter(
      (s): s is ListaInterativa['secoes'][number] => Array.isArray(s?.linhas) && s.linhas.length > 0,
    );

    return secoes.length > 0
      ? { corpo: lista.corpo, botao: lista.botao, secoes }
      : undefined;
  }

  /**
   * O remetente é o e-mail do time atribuído.
   *
   * Assim a resposta do cliente volta para a caixa do time, e não para
   * a caixa geral — que é onde ela se perde.
   */
  private async remetenteDoChamado(ticketId: string | null): Promise<string | undefined> {
    if (!ticketId) return undefined;

    const ator = await this.prisma.ticketActor.findFirst({
      where: { ticketId, role: 'ATRIBUIDO', teamId: { not: null } },
      include: { team: { select: { name: true, email: true } } },
    });

    if (!ator?.team?.email) return undefined;
    return `${ator.team.name} <${ator.team.email}>`;
  }

  /** O `Message-ID` da última mensagem nossa neste chamado. */
  private async ultimaSaidaAntes(mensagem: {
    id: string;
    ticketId: string | null;
    channel: string;
    createdAt: Date;
  }): Promise<string | undefined> {
    if (!mensagem.ticketId || mensagem.channel !== 'EMAIL') return undefined;

    const anterior = await this.prisma.outboundMessage.findFirst({
      where: {
        ticketId: mensagem.ticketId,
        channel: 'EMAIL',
        status: 'ENVIADO',
        externalId: { not: null },
        createdAt: { lt: mensagem.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { externalId: true },
    });

    return anterior?.externalId ?? undefined;
  }
}

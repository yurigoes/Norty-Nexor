import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  type AnexoRecebido,
  type Channel,
  normalizePhone,
  ticketTag,
} from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { TranscricaoService } from '../transcricao/transcricao.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
import { RegrasService } from '../regras/regras.service';
import { TicketsService } from '../tickets/tickets.service';
import { EntradaService } from './entrada.service';
import { EvolutionClient } from './evolution.client';
import { corpoDaMensagem, limparAssunto } from './limpeza';
import { SaidaService } from './saida.service';
import {
  interpretarComando,
  montarMenu,
  montarStatus,
  numeroEscolhido,
} from './whatsapp.conversa';

/**
 * Segunda fase do canal: a mensagem recebida vira evento de chamado.
 *
 * A primeira fase (`EntradaService.receber`) só grava e devolve 202,
 * para o provedor não reentregar. Esta roda depois, sem ninguém
 * esperando — e por isso pode buscar mídia, criar contato e abrir
 * chamado sem estourar o tempo do webhook.
 */
@Injectable()
export class ProcessamentoService {
  private readonly logger = new Logger(ProcessamentoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entrada: EntradaService,
    @Inject(forwardRef(() => TicketsService)) private readonly tickets: TicketsService,
    private readonly saida: SaidaService,
    private readonly regras: RegrasService,
    private readonly evolution: EvolutionClient,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
    private readonly transcricao: TranscricaoService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processarPendentes(): Promise<void> {
    const pendentes = await this.prisma.inboundMessage.findMany({
      where: { processedAt: null, discardedReason: null },
      orderBy: { receivedAt: 'asc' },
      take: 50,
      select: { id: true },
    });

    for (const { id } of pendentes) {
      await this.processarUma(id).catch((erro: Error) => {
        this.logger.error(`Falha ao processar ${id}: ${erro.message}`);
        return this.descartar(id, `Erro no processamento: ${erro.message.slice(0, 300)}`);
      });
    }
  }

  async processarUma(id: string): Promise<void> {
    const mensagem = await this.prisma.inboundMessage.findUnique({
      where: { id },
      include: { channelAccount: true },
    });

    if (!mensagem || mensagem.processedAt || mensagem.discardedReason) return;

    if (mensagem.channel === 'EMAIL') await this.processarEmail(mensagem);
    else if (mensagem.channel === 'WHATSAPP') await this.processarWhatsapp(mensagem);
    else await this.descartar(id, `Canal ${mensagem.channel} não tem processador.`);
  }

  private async descartar(id: string, motivo: string): Promise<void> {
    await this.prisma.inboundMessage.update({
      where: { id },
      data: { discardedReason: motivo, processedAt: new Date() },
    });
  }

  private async concluir(id: string, eventId: string): Promise<void> {
    await this.prisma.inboundMessage.update({
      where: { id },
      data: { eventId, processedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------
  // E-mail
  // -------------------------------------------------------------------

  private async processarEmail(
    mensagem: Prisma.InboundMessageGetPayload<{ include: { channelAccount: true } }>,
  ): Promise<void> {
    const corpo = corpoDaMensagem(mensagem.bodyText, mensagem.bodyHtml);
    const anexos = (mensagem.attachments as AnexoRecebido[] | null) ?? [];

    if (!corpo && anexos.length === 0) {
      await this.descartar(mensagem.id, 'Mensagem sem corpo e sem anexo.');
      return;
    }

    const contato = await this.resolverContato(mensagem.organizationId, {
      email: mensagem.fromAddress,
      nome: this.nomeDoRemetente(mensagem),
    });

    const referencias = (mensagem.rawHeaders as { references?: string[] } | null)?.references;

    const ticketId = await this.entrada.resolverChamadoPorEmail(mensagem.organizationId, {
      inReplyTo: mensagem.inReplyTo ?? undefined,
      references: referencias,
      subject: mensagem.subject ?? undefined,
    });

    if (ticketId) {
      const evento = await this.tickets.responderPorCanal({
        ticketId,
        contactId: contato.id,
        channel: 'EMAIL',
        body: corpo || '(mensagem com anexo)',
      });

      await this.vincularAnexos(ticketId, evento.id, anexos, mensagem.organizationId);
      await this.concluir(mensagem.id, evento.id);
      return;
    }

    const assunto = limparAssunto(mensagem.subject ?? '') || 'Chamado por e-mail';

    // As regras decidem antes de o chamado existir: descartar spam
    // depois de abrir já custou um número de chamado e um aviso ao
    // remetente.
    const decisao = await this.regras.classificar(mensagem.organizationId, {
      assunto,
      corpo,
      remetente: mensagem.fromAddress,
      canal: 'EMAIL',
    });

    if (decisao.descartar) {
      await this.descartar(mensagem.id, `Regra de entrada: ${decisao.descartar}`);
      return;
    }

    const chamado = await this.tickets.abrirPorCanal({
      organizationId: mensagem.organizationId,
      contactId: contato.id,
      channel: 'EMAIL',
      subject: assunto,
      description: corpo || '(mensagem com anexo)',
      teamId: decisao.timeId ?? mensagem.channelAccount.defaultTeamId,
      categoryId: decisao.categoriaId,
      urgency: decisao.urgencia,
      ticketType: decisao.tipo,
      agreementIds: decisao.acordoIds,
      regrasAplicadas: decisao.regrasAplicadas,
    });

    const abertura = await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'ENTRADA_CANAL',
        visibility: 'PUBLICA',
        authorContactId: contato.id,
        channel: 'EMAIL',
        payload: {
          type: 'ENTRADA_CANAL',
          channel: 'EMAIL',
          externalId: mensagem.externalId,
          address: mensagem.fromAddress,
        },
      },
      select: { id: true },
    });

    await this.vincularAnexos(chamado.id, abertura.id, anexos, mensagem.organizationId);
    await this.concluir(mensagem.id, abertura.id);

    await this.avisarAbertura(mensagem.organizationId, chamado, 'EMAIL', mensagem.fromAddress);
  }

  private nomeDoRemetente(mensagem: { rawHeaders: Prisma.JsonValue | null }): string | undefined {
    const cabecalhos = mensagem.rawHeaders as { fromName?: string } | null;
    return cabecalhos?.fromName;
  }

  // -------------------------------------------------------------------
  // WhatsApp
  // -------------------------------------------------------------------

  private async processarWhatsapp(
    mensagem: Prisma.InboundMessageGetPayload<{ include: { channelAccount: true } }>,
  ): Promise<void> {
    const telefone = normalizePhone(mensagem.fromAddress);
    const texto = (mensagem.bodyText ?? '').trim();
    const config = mensagem.channelAccount.config as {
      janelaHoras?: number;
      menuAtivo?: boolean;
      baseUrl?: string;
      instance?: string;
      apiKey?: string;
    };

    const contato = await this.resolverContato(mensagem.organizationId, {
      telefone,
      nome: this.nomeDoRemetente(mensagem),
    });

    const midia = await this.baixarMidiaSeHouver(mensagem, config);

    // Áudio vira texto antes de qualquer decisão: sem isso ele não entra
    // na regra de entrada, não vira assunto e o agente precisa ouvir
    // quarenta segundos para saber do que se trata.
    const transcrito = await this.transcreverSeForAudio(midia);
    const textoEfetivo = transcrito ? TranscricaoService.comMarca(transcrito, texto) : texto;

    // 1. Comando explícito ganha da conversa em andamento. O bot não
    //    tenta interpretar linguagem natural: comando é previsível, e
    //    previsível é o que faz o cliente confiar no canal.
    const comando = config.menuAtivo === false ? null : interpretarComando(texto);

    if (comando && !midia) {
      const tratado = await this.tratarComando(mensagem, contato.id, telefone, comando);
      if (tratado) return;
    }

    // 2. Um número sozinho é a resposta à pergunta "sobre qual
    //    chamado?". Só vale se o número for de um chamado aberto do
    //    próprio contato — senão é conteúdo, e conteúdo não some.
    const escolhido = numeroEscolhido(texto);
    if (escolhido !== null && !midia) {
      const alvo = await this.prisma.ticket.findFirst({
        where: {
          organizationId: mensagem.organizationId,
          number: escolhido,
          status: { not: 'FECHADO' },
          actors: { some: { contactId: contato.id, role: 'REQUERENTE' } },
        },
        select: { id: true, number: true, subject: true },
      });

      if (alvo) {
        await this.saida.enfileirarAviso({
          organizationId: mensagem.organizationId,
          ticketId: alvo.id,
          channel: 'WHATSAPP',
          para: telefone,
          corpo: `${ticketTag(alvo.number)} ${alvo.subject}\n\nPode mandar. Estou ouvindo.`,
        });

        // Uma marca no chamado faz a janela de conversa passar a
        // apontar para ele na próxima mensagem.
        await this.prisma.ticket.update({
          where: { id: alvo.id },
          data: { updatedAt: new Date() },
        });

        await this.descartar(mensagem.id, `Contato escolheu o chamado #${escolhido}.`);
        return;
      }
    }

    // 3. Sem comando e sem escolha, resolve pela janela de conversa.
    const janela = config.janelaHoras ?? 24;
    const alvo = await this.entrada.resolverChamadoPorWhatsapp(
      mensagem.organizationId,
      telefone,
      janela,
    );

    if (alvo.tipo === 'AMBIGUO') {
      await this.perguntarQualChamado(mensagem, telefone, alvo.ticketIds);
      return;
    }

    if (alvo.tipo === 'CHAMADO') {
      const evento = await this.tickets.responderPorCanal({
        ticketId: alvo.ticketId,
        contactId: contato.id,
        channel: 'WHATSAPP',
        body: textoEfetivo || '(mídia)',
      });

      await this.vincularAnexos(
        alvo.ticketId,
        evento.id,
        midia ? [midia] : [],
        mensagem.organizationId,
      );
      await this.concluir(mensagem.id, evento.id);
      return;
    }

    // 4. Conversa nova: abre chamado.
    if (!texto && !midia) {
      await this.descartar(mensagem.id, 'Mensagem sem texto e sem mídia.');
      return;
    }

    // O assunto sai da transcrição quando o áudio veio sem legenda: um
    // chamado chamado "(mídia sem texto)" não se acha na fila.
    const assunto = ProcessamentoService.assuntoDeTexto(transcrito || texto);

    const decisao = await this.regras.classificar(mensagem.organizationId, {
      assunto,
      corpo: textoEfetivo,
      remetente: telefone,
      canal: 'WHATSAPP',
    });

    if (decisao.descartar) {
      await this.descartar(mensagem.id, `Regra de entrada: ${decisao.descartar}`);
      return;
    }

    const chamado = await this.tickets.abrirPorCanal({
      organizationId: mensagem.organizationId,
      contactId: contato.id,
      channel: 'WHATSAPP',
      // O WhatsApp não tem assunto: a primeira linha vira o título e o
      // texto inteiro vira a descrição.
      subject: assunto,
      description: textoEfetivo || '(mídia sem texto)',
      teamId: decisao.timeId ?? mensagem.channelAccount.defaultTeamId,
      categoryId: decisao.categoriaId,
      urgency: decisao.urgencia,
      ticketType: decisao.tipo,
      agreementIds: decisao.acordoIds,
      regrasAplicadas: decisao.regrasAplicadas,
    });

    const abertura = await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'ENTRADA_CANAL',
        visibility: 'PUBLICA',
        authorContactId: contato.id,
        channel: 'WHATSAPP',
        payload: {
          type: 'ENTRADA_CANAL',
          channel: 'WHATSAPP',
          externalId: mensagem.externalId,
          address: telefone,
        },
      },
      select: { id: true },
    });

    await this.vincularAnexos(
      chamado.id,
      abertura.id,
      midia ? [midia] : [],
      mensagem.organizationId,
    );
    await this.concluir(mensagem.id, abertura.id);

    await this.avisarAbertura(mensagem.organizationId, chamado, 'WHATSAPP', telefone);
  }

  /** A primeira linha, ou os primeiros oitenta caracteres. */
  private static assuntoDeTexto(texto: string): string {
    const primeira = texto.split('\n')[0]?.trim() ?? '';
    if (primeira.length >= 8 && primeira.length <= 90) return primeira;
    return (texto.slice(0, 80).trim() || 'Chamado por WhatsApp') + (texto.length > 80 ? '…' : '');
  }

  private async tratarComando(
    mensagem: { id: string; organizationId: string },
    contactId: string,
    telefone: string,
    comando: NonNullable<ReturnType<typeof interpretarComando>>,
  ): Promise<boolean> {
    const responder = async (corpo: string) => {
      await this.saida.enfileirarAviso({
        organizationId: mensagem.organizationId,
        // Resposta de comando não pertence a chamado nenhum.
        ticketId: null,
        channel: 'WHATSAPP',
        para: telefone,
        corpo,
      });
      await this.descartar(mensagem.id, `Comando "${comando.tipo}" respondido.`);
    };

    const abertos = await this.prisma.ticket.findMany({
      where: {
        organizationId: mensagem.organizationId,
        status: { not: 'FECHADO' },
        actors: { some: { contactId, role: 'REQUERENTE' } },
      },
      include: { commitments: { where: { achievedAt: null }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    switch (comando.tipo) {
      case 'MENU':
        await responder(montarMenu());
        return true;

      case 'STATUS':
        await responder(montarStatus(abertos, comando.numero));
        return true;

      case 'FECHAR': {
        const alvo = abertos.find((t) => t.number === comando.numero);
        if (!alvo) {
          await responder(
            `Não encontrei o chamado ${ticketTag(comando.numero)} entre os seus abertos. ` +
              'Mande *status* para ver a lista.',
          );
          return true;
        }

        await this.prisma.$transaction([
          this.prisma.ticket.update({
            where: { id: alvo.id },
            data: { status: 'FECHADO', closedAt: new Date() },
          }),
          this.prisma.ticketEvent.create({
            data: {
              ticketId: alvo.id,
              type: 'MUDANCA_STATUS',
              visibility: 'PUBLICA',
              authorContactId: contactId,
              channel: 'WHATSAPP',
              payload: { type: 'MUDANCA_STATUS', from: alvo.status, to: 'FECHADO' },
            },
          }),
        ]);

        await responder(`Chamado ${ticketTag(alvo.number)} encerrado. Obrigado!`);
        return true;
      }

      case 'ATENDENTE': {
        const alvo = abertos[0];
        if (!alvo) return false;

        await this.prisma.ticketEvent.create({
          data: {
            ticketId: alvo.id,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            channel: 'SISTEMA',
            body: 'O solicitante pediu atendimento humano pelo WhatsApp.',
          },
        });

        await responder(
          'Avisei a equipe que você quer falar com uma pessoa. ' +
            `Alguém responde neste chamado ${ticketTag(alvo.number)}.`,
        );
        return true;
      }

      case 'NOVO':
        // "novo" só anuncia a intenção; o chamado nasce da próxima
        // mensagem, que é onde está o problema.
        await responder('Certo. Me conte o que está acontecendo e eu abro um chamado novo.');
        return true;

      default:
        return false;
    }
  }

  private async perguntarQualChamado(
    mensagem: { id: string; organizationId: string },
    telefone: string,
    ticketIds: string[],
  ): Promise<void> {
    const chamados = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { number: true, subject: true },
      orderBy: { updatedAt: 'desc' },
    });

    const lista = chamados
      .map((c) => `${ticketTag(c.number)} ${c.subject}`)
      .join('\n');

    await this.saida.enfileirarAviso({
      organizationId: mensagem.organizationId,
      ticketId: null,
      channel: 'WHATSAPP',
      para: telefone,
      corpo:
        `Você tem ${chamados.length} chamados abertos:\n\n${lista}\n\n` +
        'Responda com o número (por exemplo: *#' +
        `${chamados[0]!.number}*) para falar sobre ele, ou *novo* para abrir outro.`,
    });

    await this.descartar(mensagem.id, 'Mais de um chamado aberto: pedi desambiguação.');
  }

  /**
   * Transcreve o áudio recebido, quando houver.
   *
   * Lê o arquivo já guardado — não o baixa de novo. Devolve `null` em
   * tudo que não for áudio e em qualquer falha: o chamado abre com o
   * áudio anexado exatamente como antes de existir transcrição.
   */
  private async transcreverSeForAudio(midia: AnexoRecebido | null): Promise<string | null> {
    if (!midia || !this.transcricao.habilitada) return null;
    if (!this.transcricao.ehAudio(midia.contentType)) return null;

    try {
      // `ler` devolve um `Readable` — o driver de disco e o do MinIO
      // transmitem. Aqui o áudio inteiro precisa ir junto para o modelo.
      const fluxo = await this.armazenamento.ler(midia.storageKey);
      const pedacos: Buffer[] = [];
      for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco as Buffer));

      return await this.transcricao.transcrever(Buffer.concat(pedacos), midia.contentType);
    } catch (erro) {
      this.logger.warn(`Não consegui ler o áudio para transcrever: ${(erro as Error).message}`);
      return null;
    }
  }

  private async baixarMidiaSeHouver(
    mensagem: { externalId: string; organizationId: string; rawHeaders: Prisma.JsonValue | null },
    config: { baseUrl?: string; instance?: string; apiKey?: string; maxAttachmentBytes?: number },
  ): Promise<AnexoRecebido | null> {
    const cabecalhos = mensagem.rawHeaders as { messageType?: string } | null;
    const tipo = cabecalhos?.messageType;

    const ehMidia =
      tipo === 'imageMessage' ||
      tipo === 'documentMessage' ||
      tipo === 'audioMessage' ||
      tipo === 'videoMessage';

    if (!ehMidia || !config.baseUrl || !config.apiKey || !config.instance) return null;

    try {
      const midia = await this.evolution.baixarMidia(
        { baseUrl: config.baseUrl, instance: config.instance, apiKey: config.apiKey },
        mensagem.externalId,
      );

      const conteudo = Buffer.from(midia.base64, 'base64');
      const limite = config.maxAttachmentBytes ?? 16 * 1024 * 1024;

      if (conteudo.length > limite) {
        this.logger.warn(`Mídia de ${mensagem.externalId} acima do limite; ignorada.`);
        return null;
      }

      const { createHash, randomUUID } = await import('node:crypto');
      const checksum = createHash('sha256').update(conteudo).digest('hex');
      const nome = midia.fileName ?? `whatsapp-${mensagem.externalId.slice(0, 8)}`;
      const chave = `${mensagem.organizationId}/entrada/${randomUUID()}-${nome}`;

      await this.armazenamento.guardar(chave, conteudo, midia.mimetype);

      return {
        storageKey: chave,
        filename: nome,
        contentType: midia.mimetype,
        sizeBytes: conteudo.length,
        checksum: `sha256:${checksum}`,
      };
    } catch (erro) {
      this.logger.warn(
        `Não consegui baixar a mídia de ${mensagem.externalId}: ${(erro as Error).message}`,
      );
      return null;
    }
  }

  // -------------------------------------------------------------------
  // Comum
  // -------------------------------------------------------------------

  /**
   * Acha ou cria o contato.
   *
   * É assim que quem escreve de fora entra no chamado sem ter conta: o
   * `Contact` é a pessoa conhecida por e-mail ou telefone, e vira
   * usuário só se alguém a cadastrar.
   */
  private async resolverContato(
    organizationId: string,
    quem: { email?: string; telefone?: string; nome?: string },
  ): Promise<{ id: string }> {
    const email = quem.email?.toLowerCase().trim();
    const phone = quem.telefone?.trim();

    const existente = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        ...(email ? { email } : {}),
        ...(phone && !email ? { phone } : {}),
      },
    });

    if (existente) {
      // O nome do WhatsApp (`pushName`) só chega junto da mensagem;
      // aproveitamos a primeira vez que ele aparece.
      if (!existente.name && quem.nome) {
        await this.prisma.contact.update({
          where: { id: existente.id },
          data: { name: quem.nome },
        });
      }
      return existente;
    }

    return this.prisma.contact.create({
      data: { organizationId, email, phone, name: quem.nome },
    });
  }

  private async vincularAnexos(
    ticketId: string,
    eventId: string,
    anexos: AnexoRecebido[],
    _organizationId: string,
  ): Promise<void> {
    for (const anexo of anexos) {
      await this.prisma.attachment.create({
        data: {
          ticketId,
          eventId,
          filename: anexo.filename,
          contentType: anexo.contentType,
          sizeBytes: anexo.sizeBytes,
          storageKey: anexo.storageKey,
          checksum: anexo.checksum,
        },
      });
    }
  }

  /** O aviso de que o chamado foi aberto, pelo canal em que ele nasceu. */
  private async avisarAbertura(
    organizationId: string,
    chamado: { id: string; number: number },
    canal: Channel,
    para: string,
  ): Promise<void> {
    const corpo =
      canal === 'WHATSAPP'
        ? `${ticketTag(chamado.number)} Chamado aberto! Vamos responder por aqui mesmo. ` +
          'Mande *status* quando quiser acompanhar.'
        : `Recebemos a sua mensagem e abrimos o chamado ${ticketTag(chamado.number)}. ` +
          'Basta responder a este e-mail para acrescentar informação.';

    await this.saida.enfileirarAviso({
      organizationId,
      ticketId: chamado.id,
      channel: canal,
      para,
      corpo,
    });
  }
}

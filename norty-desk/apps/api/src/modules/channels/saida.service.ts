import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Channel, MARCA_DE_IA, emailSubject, ticketTag } from '@norty-desk/shared';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import type { ListaInterativa } from './meta.mensagem';

/**
 * A fila de saída.
 *
 * Enfileirar e despachar são separados de propósito: responder um
 * chamado não pode ficar esperando o SMTP, e um SMTP fora do ar não
 * pode fazer a resposta se perder.
 */
@Injectable()
export class SaidaService {
  private readonly logger = new Logger(SaidaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly chat: ChatService,
  ) {}

  /** O domínio que assina os `Message-ID`. */
  private dominio(): string {
    const origem = this.config.get<string>('WEB_ORIGIN') ?? 'https://chamados.norty.com.br';
    try {
      return new URL(origem.split(',')[0]!).hostname;
    } catch {
      return 'chamados.norty.com.br';
    }
  }

  /**
   * O `Message-ID` no formato do GLPI, de propósito.
   *
   * Uma base migrada tem anos de e-mail com o formato antigo nos
   * cabeçalhos `References`. Manter o padrão faz o threading continuar
   * funcionando para conversas que começaram lá.
   */
  private novoMessageId(ticketId: string): string {
    return `<Norty_Desk_Ticket_${ticketId}_${randomUUID()}@${this.dominio()}>`;
  }

  /**
   * Enfileira o que um evento público precisa mandar para fora.
   *
   * Duas regras que não se negociam:
   *
   * 1. **Nota interna nunca sai.** A verificação está aqui e de novo no
   *    despacho. É o pior erro possível deste produto, e um cinto só já
   *    falhou em produto de gente melhor.
   *
   * 2. **A resposta sai pelo canal em que a pessoa falou**, salvo
   *    escolha explícita do agente. Ninguém responde e-mail no WhatsApp
   *    por engano.
   */
  async enfileirarEventoDoChamado(eventId: string): Promise<number> {
    const evento = await this.prisma.ticketEvent.findUnique({
      where: { id: eventId },
      include: {
        ticket: {
          include: {
            actors: { include: { user: true, contact: true, team: true } },
            organization: { select: { id: true } },
          },
        },
        author: { select: { name: true } },
      },
    });

    if (!evento) return 0;

    if (evento.visibility === 'INTERNA') {
      this.logger.debug(`Evento ${eventId} é interno: não sai por canal externo.`);
      return 0;
    }

    if (evento.type !== 'MENSAGEM' && evento.type !== 'SOLUCAO' && evento.type !== 'ANEXO') {
      return 0;
    }

    // Evento de problema ou de mudança não tem por onde sair: quem
    // conversa por canal externo é o chamado. O CHECK `dono_unico` do
    // banco garante que o dono é exatamente um; aqui basta ignorar o
    // que não é chamado.
    const chamado = evento.ticket;
    if (!chamado) return 0;

    const canal: Channel = evento.channel === 'WEB' ? chamado.originChannel : evento.channel;

    // Pelo portal a pessoa já vê a resposta na tela; mandar e-mail
    // também seria eco. WEB e SISTEMA não têm para onde despachar.
    if (canal === 'WEB' || canal === 'SISTEMA' || canal === 'API') return 0;

    const destinatarios = SaidaService.destinatarios(chamado.actors, canal, evento.authorId);
    if (destinatarios.length === 0) return 0;

    // Quem está lendo no chat ao vivo não recebe a mesma frase por
    // e-mail: uma conversa de vinte linhas viraria vinte mensagens na
    // caixa de entrada de quem já as leu na tela.
    //
    // Só vale para quem tem conta — contato de fora não tem presença, e
    // continua recebendo por onde falou.
    const quemLe = chamado.actors
      .filter((a) => a.role === 'REQUERENTE' || a.role === 'OBSERVADOR')
      .map((a) => a.userId)
      .filter((id): id is string => Boolean(id) && id !== evento.authorId);

    const aoVivo = new Set<string>();
    for (const userId of quemLe) {
      if (await this.chat.estaNaConversa(userId, chamado.id)) aoVivo.add(userId);
    }

    if (aoVivo.size > 0) {
      const enderecosAoVivo = SaidaService.destinatarios(
        chamado.actors.filter((a) => a.userId && aoVivo.has(a.userId)),
        canal,
        null,
      );

      const restantes = destinatarios.filter((d) => !enderecosAoVivo.includes(d));
      if (restantes.length === 0) {
        this.logger.debug(`Evento ${eventId}: quem receberia está no chat. Nada a enfileirar.`);
        return 0;
      }
      destinatarios.length = 0;
      destinatarios.push(...restantes);
    }


    const corpo = SaidaService.montarCorpo(
      canal,
      chamado.number,
      evento.body,
      evento.author?.name,
      evento.aiGenerated,
    );

    let enfileirados = 0;

    for (const para of destinatarios) {
      await this.prisma.outboundMessage.create({
        data: {
          organizationId: chamado.organizationId,
          channel: canal,
          ticketId: chamado.id,
          eventId: evento.id,
          toAddress: para,
          subject: canal === 'EMAIL' ? emailSubject(chamado.number, chamado.subject) : null,
          body: corpo,
          externalId: canal === 'EMAIL' ? this.novoMessageId(chamado.id) : null,
        },
      });
      enfileirados += 1;
    }

    return enfileirados;
  }

  /**
   * O corpo de saída, por canal.
   *
   * No WhatsApp a mensagem abre com `[#123]` porque a pessoa não tem
   * assunto para se orientar — é o único marcador de qual chamado é.
   * No e-mail o número já vai no assunto, e o corpo leva a assinatura de
   * quem respondeu.
   *
   * **Resposta do Copilot é declarada aqui também**, e não só na tela.
   * Quem recebe por e-mail ou WhatsApp é justamente quem não tem como
   * desconfiar: não vê selo, não vê interface, e um texto bem escrito
   * passa por pessoa. A linha vai no fim, junto da assinatura, que é
   * onde se lê quem falou.
   */
  private static montarCorpo(
    canal: Channel,
    numero: number,
    corpo: string | null,
    autor?: string,
    porIa = false,
  ): string {
    const texto = (corpo ?? '').trim();
    const marca = porIa ? `${MARCA_DE_IA}` : '';

    if (canal === 'WHATSAPP') {
      return `${ticketTag(numero)} ${texto}${marca ? `\n\n${marca}` : ''}`.trim();
    }

    const rodape = [autor, marca].filter(Boolean).join('\n');
    return rodape ? `${texto}\n\n—\n${rodape}` : texto;
  }

  /**
   * Quem recebe: requerente e observadores, nunca quem escreveu.
   *
   * Mandar a própria mensagem de volta para o autor cria eco — e, no
   * e-mail, o coletor pode reprocessá-la como resposta nova.
   */
  private static destinatarios(
    atores: {
      role: string;
      userId: string | null;
      user: { email: string | null } | null;
      contact: { email: string | null; phone: string | null } | null;
    }[],
    canal: Channel,
    autorId: string | null,
  ): string[] {
    const enderecos = new Set<string>();

    for (const ator of atores) {
      if (ator.role !== 'REQUERENTE' && ator.role !== 'OBSERVADOR') continue;
      if (autorId && ator.userId === autorId) continue;

      if (canal === 'EMAIL') {
        const email = ator.user?.email ?? ator.contact?.email;
        if (email) enderecos.add(email);
      }

      if (canal === 'WHATSAPP') {
        const telefone = ator.contact?.phone;
        if (telefone) enderecos.add(telefone);
      }
    }

    return [...enderecos];
  }

  /**
   * Mensagem avulsa do sistema (abertura, cobrança, escalonamento).
   *
   * Quando o canal é e-mail e há chamado, o assunto é montado a partir
   * dele: e-mail sem assunto cai no lixo eletrônico de metade dos
   * provedores, e o pouco que passa o destinatário não abre.
   */
  async enfileirarAviso(dados: {
    organizationId: string;
    /** Nulo quando o aviso não pertence a chamado (resposta de comando). */
    ticketId: string | null;
    channel: Channel;
    para: string;
    assunto?: string;
    corpo: string;
    /** Por qual conta sai. Sem ela, a saída escolhe a ativa da organização. */
    channelAccountId?: string | null;
    /**
     * A mesma mensagem como lista de toque.
     *
     * `corpo` continua obrigatório e continua sendo a versão escrita
     * **da mesma coisa**: é o que sai pela Evolution, que não desenha
     * lista, e é o que fica legível no diagnóstico e no banco.
     */
    lista?: ListaInterativa;
  }): Promise<void> {
    if (dados.channel === 'WEB' || dados.channel === 'SISTEMA' || dados.channel === 'API') return;

    let assunto = dados.assunto;

    if (dados.channel === 'EMAIL' && !assunto && dados.ticketId) {
      const chamado = await this.prisma.ticket.findUnique({
        where: { id: dados.ticketId },
        select: { number: true, subject: true },
      });
      if (chamado) assunto = emailSubject(chamado.number, chamado.subject);
    }

    await this.prisma.outboundMessage.create({
      data: {
        organizationId: dados.organizationId,
        channel: dados.channel,
        ticketId: dados.ticketId,
        toAddress: dados.para,
        subject: dados.channel === 'EMAIL' ? (assunto ?? 'Norty Desk') : null,
        body: dados.corpo,
        channelAccountId: dados.channelAccountId ?? null,
        payload: dados.lista ? { tipo: 'LISTA', lista: dados.lista } : undefined,
        externalId:
          dados.channel === 'EMAIL' ? this.novoMessageId(dados.ticketId ?? 'avulso') : null,
      },
    });
  }
}

import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ROTULO_STATUS,
  formatarProtocolo,
  normalizarProtocolo,
  type ConsultaPublica,
  type EventoPublico,
  type OrdemPublica,
} from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ThrottleService } from '../../common/throttle/throttle.service';

/**
 * A consulta sem login, pelo protocolo.
 *
 * Duas regras governam tudo aqui:
 *
 * 1. **Quem tem o código provou ter o código, e mais nada.** Não provou
 *    ser a pessoa do chamado. Então o que sai daqui é menos do que o
 *    `TicketDetail`: sem e-mail, sem telefone, sem nota interna, sem
 *    anexo para baixar, sem id de ninguém. Só o andamento.
 *
 * 2. **Errar o código custa.** Sem a escada de bloqueio por IP, um laço
 *    varreria o espaço de códigos sem nenhum atrito. Com ela, a décima
 *    tentativa errada já espera uma hora.
 */
@Injectable()
export class PublicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: ThrottleService,
  ) {}

  async consultar(digitado: string, ip: string): Promise<ConsultaPublica> {
    const chaves = [ThrottleService.chaveDeIp(`PROTOCOLO:${ip}`)];

    const faltam = await this.throttle.segundosBarrados(chaves);
    if (faltam > 0) {
      throw new HttpException(
        `Muitas consultas. Tente de novo em ${Math.ceil(faltam / 60)} minuto(s).`,
        429,
      );
    }

    const codigo = normalizarProtocolo(digitado);

    // Código malformado conta como erro, e não como 400 de graça: sem
    // isso, quem varre o espaço mandaria códigos inválidos de propósito
    // para sondar o formato sem gastar tentativa.
    const chamado = codigo
      ? await this.prisma.ticket.findUnique({
          where: { protocol: codigo },
          select: {
            id: true,
            protocol: true,
            subject: true,
            status: true,
            createdAt: true,
            solvedAt: true,
            closedAt: true,
            organization: { select: { name: true } },
          },
        })
      : null;

    if (!chamado) {
      await this.throttle.registrarFalha(chaves);
      // Mensagem única para código malformado e código que não existe:
      // a diferença contaria quais códigos têm a forma certa.
      throw new NotFoundException('Protocolo não encontrado.');
    }

    await this.throttle.limpar(chaves);

    const agendado = await this.prisma.appointment.findFirst({
      where: { ticketId: chamado.id, status: 'AGENDADO' },
      orderBy: { scheduledFor: 'asc' },
      select: { scheduledFor: true },
    });

    return {
      protocol: formatarProtocolo(chamado.protocol),
      subject: chamado.subject,
      status: chamado.status,
      organization: chamado.organization.name,
      openedAt: chamado.createdAt.toISOString(),
      solvedAt: chamado.solvedAt?.toISOString() ?? null,
      closedAt: chamado.closedAt?.toISOString() ?? null,
      scheduledFor: agendado?.scheduledFor.toISOString() ?? null,
      timeline: await this.linhaDoTempo(chamado.id),
      serviceOrders: await this.ordensConcluidas(chamado.id),
    };
  }

  /**
   * As ordens de serviço já concluídas.
   *
   * É isto que dá sentido ao código de verificação impresso no carimbo:
   * quem tem o papel na mão digita o protocolo e confere que a ordem
   * existe, com o mesmo número e a mesma data. Sem esta lista, o
   * carimbo seria um enfeite.
   *
   * Só as concluídas: rascunho é trabalho em andamento, e mostrá-lo ao
   * cliente antes de o técnico terminar prometeria o que não foi feito.
   */
  private async ordensConcluidas(ticketId: string): Promise<OrdemPublica[]> {
    const ordens = await this.prisma.serviceOrder.findMany({
      where: { ticketId, status: 'CONCLUIDA' },
      orderBy: { number: 'asc' },
      select: {
        number: true,
        signedAt: true,
        signedByName: true,
        items: { select: { done: true } },
      },
    });

    return ordens.map((o) => ({
      number: o.number,
      concludedAt: (o.signedAt ?? new Date(0)).toISOString(),
      signedByName: o.signedByName,
      itemsDone: o.items.filter((i) => i.done).length,
      itemsTotal: o.items.length,
    }));
  }

  /**
   * A linha do tempo que o estranho vê.
   *
   * `visibility: 'PUBLICA'` é o filtro que importa: nota interna é
   * conversa da equipe sobre o chamado, e vazá-la aqui seria o pior
   * defeito possível desta tela.
   *
   * Só o primeiro nome de quem escreveu. "Respondido por Marina" basta
   * para a pessoa saber que houve gente do outro lado; o nome completo
   * e o e-mail de cada técnico não são informação que um código de
   * protocolo deva comprar.
   */
  private async linhaDoTempo(ticketId: string): Promise<EventoPublico[]> {
    const eventos = await this.prisma.ticketEvent.findMany({
      where: {
        ticketId,
        visibility: 'PUBLICA',
        type: { in: ['MENSAGEM', 'SOLUCAO', 'ANEXO', 'MUDANCA_STATUS', 'AGENDAMENTO'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        body: true,
        payload: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    });

    return eventos.map((e) => ({
      at: e.createdAt.toISOString(),
      text: frase(e),
      by: e.author?.name.split(' ')[0] ?? null,
    }));
  }
}

type EventoCru = {
  type: string;
  body: string | null;
  payload: unknown;
  createdAt: Date;
};

/**
 * A frase pronta.
 *
 * Montada no servidor, e não na tela, porque o PDF e o aplicativo têm
 * de dizer exatamente a mesma coisa — e porque a tela pública não
 * deveria precisar conhecer o formato do `payload` de cada evento.
 */
function frase(e: EventoCru): string {
  const p = e.payload as { type?: string; to?: string; action?: string } | null;

  if (e.type === 'MUDANCA_STATUS' && p?.to) {
    const rotulo = ROTULO_STATUS[p.to as keyof typeof ROTULO_STATUS];
    return `Situação alterada para ${rotulo ?? p.to}.`;
  }

  if (e.type === 'AGENDAMENTO') {
    const verbo = {
      MARCADO: 'Atendimento agendado.',
      REMARCADO: 'Atendimento reagendado.',
      CANCELADO: 'Atendimento cancelado.',
      REALIZADO: 'Atendimento realizado.',
    }[p?.action ?? ''];
    return verbo ?? 'Atendimento agendado.';
  }

  if (e.type === 'ANEXO') return `Arquivo anexado: ${e.body ?? 'arquivo'}.`;
  if (e.type === 'SOLUCAO') return e.body ?? 'Solução registrada.';

  return e.body ?? '—';
}

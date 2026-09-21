import { Injectable } from '@nestjs/common';
import { vencimentoComAtendimento, type TargetKind } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { type Calendario, calcularVencimento, segundosDeExpediente } from './calendario';

/**
 * Aplica acordos de nível de serviço a um chamado.
 *
 * O cálculo em si vive em `calendario.ts`, testado em
 * `calendario.test.ts`. Aqui fica só a ligação com o banco.
 */
@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  private async carregarCalendario(calendarId: string | null): Promise<Calendario | null> {
    if (!calendarId) return null;

    const calendario = await this.prisma.calendar.findUnique({
      where: { id: calendarId },
      include: { segments: true, holidays: true },
    });

    if (!calendario) return null;

    return {
      timezone: calendario.timezone,
      segments: calendario.segments.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      })),
      holidays: calendario.holidays.map((f) => ({ date: f.date, isRecurring: f.isRecurring })),
    };
  }

  /**
   * Cria os compromissos do chamado.
   *
   * `@@unique([ticketId, kind, target])` impede dois compromissos do
   * mesmo tipo: reclassificar substitui, não acumula.
   */
  async aplicarAcordos(ticketId: string, agreementIds: string[], inicio = new Date()): Promise<void> {
    const acordos = await this.prisma.agreement.findMany({
      where: { id: { in: agreementIds }, isActive: true },
    });

    for (const acordo of acordos) {
      const calendario = await this.carregarCalendario(acordo.calendarId);
      const dueAt = calcularVencimento(inicio, acordo.durationSeconds, calendario);

      await this.prisma.slaCommitment.upsert({
        where: {
          ticketId_kind_target: { ticketId, kind: acordo.kind, target: acordo.target },
        },
        create: {
          ticketId,
          agreementId: acordo.id,
          kind: acordo.kind,
          target: acordo.target,
          startedAt: inicio,
          dueAt,
        },
        update: { agreementId: acordo.id, startedAt: inicio, dueAt, escalationLevel: 0 },
      });
    }
  }

  /**
   * Marca um compromisso como cumprido.
   *
   * `achievedAt` e `breachedAt` são gravados uma única vez, no momento
   * do fato — relatório de SLA lê essas duas colunas e nunca recalcula
   * prazo histórico. Mudar o acordo hoje não pode reescrever o
   * desempenho de ontem (`docs/05-sla.md`, seção 7).
   */
  async cumprir(ticketId: string, target: TargetKind, quando = new Date()): Promise<void> {
    const compromissos = await this.prisma.slaCommitment.findMany({
      where: { ticketId, target, achievedAt: null },
    });

    for (const compromisso of compromissos) {
      await this.prisma.slaCommitment.update({
        where: { id: compromisso.id },
        data: {
          achievedAt: quando,
          // A violação só é registrada aqui se ainda não estava: o cron
          // de escalonamento pode ter marcado antes, e a hora dele é a
          // que vale.
          breachedAt:
            compromisso.breachedAt ?? (quando > compromisso.dueAt ? compromisso.dueAt : null),
        },
      });
    }
  }

  /**
   * Desconta o tempo de pendência dos compromissos em aberto.
   *
   * O tempo parado é medido em expediente: um chamado pendente da sexta
   * à noite até a segunda de manhã ganha zero, não sessenta horas
   * (`docs/05-sla.md`, seção 4).
   */
  async retomarAposPendencia(ticketId: string, pendingSince: Date, agora = new Date()): Promise<number> {
    const compromissos = await this.prisma.slaCommitment.findMany({
      where: { ticketId, achievedAt: null },
      include: { agreement: true },
    });

    let descontoMaximo = 0;

    for (const compromisso of compromissos) {
      const calendario = await this.carregarCalendario(compromisso.agreement.calendarId);
      const parado = segundosDeExpediente(pendingSince, agora, calendario);
      if (parado <= 0) continue;

      descontoMaximo = Math.max(descontoMaximo, parado);

      await this.prisma.slaCommitment.update({
        where: { id: compromisso.id },
        data: {
          pausedSeconds: { increment: parado },
          dueAt: calcularVencimento(compromisso.dueAt, parado, calendario),
        },
      });
    }

    return descontoMaximo;
  }

  /**
   * Empurra o prazo de resolução até o fim do atendimento marcado.
   *
   * Só o TTR anda. O TTO é "a gente voltou a falar com você", e marcar
   * visita não é desculpa para não ter voltado a falar — ao contrário,
   * quem marcou já falou. Esticar os dois faria o primeiro atendimento
   * parecer no prazo num chamado que ficou dois dias sem resposta.
   *
   * Compromisso já cumprido não anda: o prazo dele acabou quando o
   * trabalho foi feito, e mexer nele mudaria um número do passado.
   *
   * Devolve o adiamento em segundos de expediente — o número do
   * relatório — e, junto, o vencimento que cada compromisso tinha antes.
   * Esse "antes" é guardado no agendamento porque o caminho de volta
   * não é calculável: o fim da visita pode cair fora do expediente, e aí
   * recuar a mesma quantidade de segundos úteis não devolve o instante
   * de onde se saiu.
   */
  async adiarPorAtendimento(
    ticketId: string,
    quando: Date,
    duracaoMinutos: number,
  ): Promise<{ adiadoSegundos: number; vencimentosAnteriores: Record<string, string> }> {
    const compromissos = await this.prisma.slaCommitment.findMany({
      where: { ticketId, achievedAt: null, target: 'TTR' },
      include: { agreement: true },
    });

    let adiamentoMaximo = 0;
    const vencimentosAnteriores: Record<string, string> = {};

    for (const compromisso of compromissos) {
      const novo = vencimentoComAtendimento(compromisso.dueAt, quando, duracaoMinutos);
      if (!novo) continue;

      const calendario = await this.carregarCalendario(compromisso.agreement.calendarId);
      const andou = segundosDeExpediente(compromisso.dueAt, novo, calendario);
      adiamentoMaximo = Math.max(adiamentoMaximo, andou);
      vencimentosAnteriores[compromisso.id] = compromisso.dueAt.toISOString();

      await this.prisma.slaCommitment.update({
        where: { id: compromisso.id },
        data: {
          dueAt: novo,
          postponedSeconds: { increment: andou },
          // O prazo voltou a ser futuro, então o estouro não vale mais.
          // Deixá-lo marcado faria o chamado aparecer vencido num prazo
          // que foi esticado de acordo com o cliente.
          breachedAt: null,
        },
      });
    }

    return { adiadoSegundos: adiamentoMaximo, vencimentosAnteriores };
  }

  /**
   * Devolve o prazo que um atendimento cancelado havia esticado.
   *
   * Cancelar a visita desfaz a razão do adiamento, então o prazo volta
   * para o instante exato de onde saiu. Isso pode deixar o chamado
   * vencido na hora — e está certo que deixe: o que o segurava era uma
   * data que não existe mais.
   */
  async desfazerAdiamento(
    vencimentosAnteriores: Record<string, string>,
    adiadoSegundos: number,
  ): Promise<void> {
    for (const [commitmentId, iso] of Object.entries(vencimentosAnteriores)) {
      const compromisso = await this.prisma.slaCommitment.findUnique({
        where: { id: commitmentId },
      });
      // Cumprido entre o agendamento e o cancelamento: o prazo dele já
      // não corre, e recuá-lo mudaria um número do passado.
      if (!compromisso || compromisso.achievedAt) continue;

      await this.prisma.slaCommitment.update({
        where: { id: commitmentId },
        data: {
          dueAt: new Date(iso),
          postponedSeconds: {
            decrement: Math.min(adiadoSegundos, compromisso.postponedSeconds),
          },
        },
      });
    }
  }
}

import { Injectable } from '@nestjs/common';
import type { TargetKind } from '@norty-desk/shared';

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
}

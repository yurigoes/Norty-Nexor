import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type EscalationAction, type Scale, ticketTag } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { SaidaService } from '../channels/saida.service';

/**
 * Os dois relógios do SLA.
 *
 * O escalonamento avisa quem precisa saber que um prazo está por
 * estourar ou já estourou. A cobrança de pendência resolve o problema
 * que o GLPI resolve com `PendingReason` e quase ninguém usa: chamado
 * parado esperando o cliente, para sempre.
 */
@Injectable()
export class SlaJobs {
  private readonly logger = new Logger(SlaJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly saida: SaidaService,
  ) {}

  // -------------------------------------------------------------------
  // Violação
  // -------------------------------------------------------------------

  /**
   * Marca o que estourou.
   *
   * `breachedAt` é gravado uma vez, no momento do fato, e nunca
   * recalculado — relatório de SLA lê essa coluna, e mudar o acordo hoje
   * não pode reescrever o desempenho de ontem
   * (`docs/05-sla.md`, seção 7).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async marcarViolacoes(): Promise<number> {
    const agora = new Date();

    const vencidos = await this.prisma.slaCommitment.findMany({
      where: { achievedAt: null, breachedAt: null, dueAt: { lt: agora } },
      select: { id: true, ticketId: true, kind: true, target: true, dueAt: true },
      take: 500,
    });

    for (const compromisso of vencidos) {
      await this.prisma.slaCommitment.update({
        where: { id: compromisso.id },
        // A hora da violação é o vencimento, não a hora em que o cron
        // percebeu: um cron atrasado não pode piorar o número.
        data: { breachedAt: compromisso.dueAt },
      });
    }

    if (vencidos.length) {
      this.logger.warn(`${vencidos.length} compromisso(s) de SLA estouraram.`);
    }

    return vencidos.length;
  }

  // -------------------------------------------------------------------
  // Escalonamento
  // -------------------------------------------------------------------

  /**
   * Dispara os níveis de escalonamento.
   *
   * `offsetSeconds` negativo avisa antes do vencimento; positivo, depois.
   * `escalationLevel` no compromisso impede o mesmo nível disparar duas
   * vezes — sem isso, o cron de um minuto mandaria um aviso por minuto
   * até alguém resolver.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async escalonar(): Promise<number> {
    const agora = new Date();

    const emAberto = await this.prisma.slaCommitment.findMany({
      where: { achievedAt: null },
      include: {
        agreement: { include: { levels: { orderBy: { offsetSeconds: 'asc' } } } },
        ticket: {
          include: {
            actors: { include: { user: true, team: true, contact: true } },
          },
        },
      },
      take: 200,
    });

    let disparados = 0;

    for (const compromisso of emAberto) {
      const niveis = compromisso.agreement.levels;
      if (niveis.length === 0) continue;

      for (let indice = compromisso.escalationLevel; indice < niveis.length; indice += 1) {
        const nivel = niveis[indice]!;
        const quando = new Date(compromisso.dueAt.getTime() + nivel.offsetSeconds * 1000);

        if (quando > agora) break;

        await this.aplicarNivel(compromisso, nivel);
        await this.prisma.slaCommitment.update({
          where: { id: compromisso.id },
          data: { escalationLevel: indice + 1 },
        });

        disparados += 1;
      }
    }

    return disparados;
  }

  private async aplicarNivel(
    compromisso: {
      id: string;
      ticketId: string;
      kind: string;
      target: string;
      dueAt: Date;
      ticket: {
        id: string;
        number: number;
        subject: string;
        organizationId: string;
        urgency: number;
        impact: number;
        originChannel: string;
        actors: {
          role: string;
          user: { name: string; email: string } | null;
          team: { id: string; name: string; email: string | null } | null;
          contact: { email: string | null; phone: string | null } | null;
        }[];
      };
    },
    nivel: { id: string; name: string; actions: unknown },
  ): Promise<void> {
    const acoes = (nivel.actions as EscalationAction[] | null) ?? [];
    const chamado = compromisso.ticket;
    const atrasado = compromisso.dueAt < new Date();

    for (const acao of acoes) {
      switch (acao.tipo) {
        case 'NOTIFICAR': {
          const texto =
            `${ticketTag(chamado.number)} ${chamado.subject}\n\n` +
            (atrasado
              ? `O prazo de ${compromisso.kind} ${compromisso.target} estourou.`
              : `O prazo de ${compromisso.kind} ${compromisso.target} está por vencer.`) +
            `\n\nNível de escalonamento: ${nivel.name}.`;

          // O aviso ao requerente sai pelo canal dele; o aviso interno
          // vira nota na conversa, que é onde a equipe olha.
          if (acao.alvo === 'REQUERENTE') {
            const destino = SlaJobs.enderecoDoRequerente(chamado);

            if (destino) {
              await this.saida.enfileirarAviso({
                organizationId: chamado.organizationId,
                ticketId: chamado.id,
                channel: destino.canal,
                para: destino.endereco,
                corpo: texto,
              });
            }
          } else {
            await this.prisma.ticketEvent.create({
              data: {
                ticketId: chamado.id,
                type: 'NOTA_INTERNA',
                visibility: 'INTERNA',
                channel: 'SISTEMA',
                body: texto,
              },
            });

            const time = chamado.actors.find((a) => a.role === 'ATRIBUIDO' && a.team)?.team;
            if (time?.email) {
              await this.saida.enfileirarAviso({
                organizationId: chamado.organizationId,
                ticketId: chamado.id,
                channel: 'EMAIL',
                para: time.email,
                corpo: texto,
              });
            }
          }
          break;
        }

        case 'AUMENTAR_URGENCIA': {
          // Só sobe, nunca desce: escalonamento que reduz urgência seria
          // configuração escrita errada, e obedecê-la esconde o erro.
          if (acao.para <= chamado.urgency) break;

          const organizacao = await this.prisma.organization.findUniqueOrThrow({
            where: { id: chamado.organizationId },
            select: { priorityMatrix: true },
          });

          const { DEFAULT_PRIORITY_MATRIX, computePriority } = await import('@norty-desk/shared');
          const matriz =
            (organizacao.priorityMatrix as typeof DEFAULT_PRIORITY_MATRIX | null) ??
            DEFAULT_PRIORITY_MATRIX;

          await this.prisma.$transaction([
            this.prisma.ticket.update({
              where: { id: chamado.id },
              data: {
                urgency: acao.para,
                priority: computePriority(acao.para, chamado.impact as Scale, matriz),
              },
            }),
            this.prisma.ticketEvent.create({
              data: {
                ticketId: chamado.id,
                type: 'MUDANCA_CLASSIFICACAO',
                visibility: 'INTERNA',
                channel: 'SISTEMA',
                body: `Urgência elevada pelo escalonamento "${nivel.name}".`,
                payload: {
                  type: 'MUDANCA_CLASSIFICACAO',
                  fromUrgency: chamado.urgency as Scale,
                  toUrgency: acao.para,
                },
              },
            }),
          ]);
          break;
        }

        case 'ATRIBUIR_TIME': {
          const time = await this.prisma.team.findFirst({
            where: { id: acao.teamId, organizationId: chamado.organizationId },
          });
          if (!time) break;

          await this.prisma.$transaction([
            this.prisma.ticketActor.deleteMany({
              where: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: { not: null } },
            }),
            this.prisma.ticketActor.create({
              data: { ticketId: chamado.id, role: 'ATRIBUIDO', teamId: time.id },
            }),
            this.prisma.ticketEvent.create({
              data: {
                ticketId: chamado.id,
                type: 'MUDANCA_ATRIBUICAO',
                visibility: 'INTERNA',
                channel: 'SISTEMA',
                body: `Escalonado para ${time.name} pelo nível "${nivel.name}".`,
                payload: { type: 'MUDANCA_ATRIBUICAO', toTeamId: time.id },
              },
            }),
          ]);
          break;
        }

        case 'MARCAR':
          // Sem entidade de etiqueta ainda: a marca vira nota na
          // conversa, que já é pesquisável e aparece na tela.
          await this.prisma.ticketEvent.create({
            data: {
              ticketId: chamado.id,
              type: 'NOTA_INTERNA',
              visibility: 'INTERNA',
              channel: 'SISTEMA',
              body: `Marcado como "${acao.etiqueta}" pelo escalonamento.`,
            },
          });
          break;

        case 'WEBHOOK':
          // Entrega de webhook é da Fase 3. Registrar aqui evita que a
          // configuração pareça ter funcionado.
          this.logger.warn(
            `Nível ${nivel.name} pede webhook ${acao.webhookId}, que ainda não é entregue.`,
          );
          break;
      }
    }
  }

  // -------------------------------------------------------------------
  // Cobrança de pendência
  // -------------------------------------------------------------------

  /**
   * Cobra quem deixou o chamado parado, e encerra se não vier resposta.
   *
   * É o `PendingReasonCron` do GLPI. A cobrança sai pelo canal em que a
   * pessoa falou: quem abriu por WhatsApp é cobrado no WhatsApp.
   */
  @Cron('0 */15 * * * *')
  async cobrarPendencias(): Promise<number> {
    const pendentes = await this.prisma.ticket.findMany({
      where: {
        status: 'PENDENTE',
        pendingSince: { not: null },
        pendingReason: { followupIntervalSeconds: { gt: 0 } },
      },
      include: {
        pendingReason: true,
        actors: { include: { user: true, contact: true } },
        events: {
          where: { channel: 'SISTEMA', type: 'MENSAGEM' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      take: 200,
    });

    let cobrados = 0;

    for (const chamado of pendentes) {
      const motivo = chamado.pendingReason!;
      const ultima = chamado.events[0]?.createdAt ?? chamado.pendingSince!;
      const passou = Date.now() - ultima.getTime();

      if (passou < motivo.followupIntervalSeconds * 1000) continue;

      const jaCobrado = chamado.pendingRemindersSent + 1;
      const encerra =
        motivo.followupsBeforeResolution > 0 && jaCobrado > motivo.followupsBeforeResolution;

      if (encerra) {
        await this.encerrarPorInatividade(chamado.id, motivo.name);
        cobrados += 1;
        continue;
      }

      await this.enviarCobranca(chamado, motivo.followupTemplate, jaCobrado);
      cobrados += 1;
    }

    return cobrados;
  }

  /**
   * Por onde falar com o requerente.
   *
   * Prefere o canal em que ele falou; se não houver endereço nesse
   * canal, usa o que houver. Um chamado aberto pelo portal por alguém
   * que só tem telefone precisa ser cobrado no telefone — a alternativa
   * é a cobrança sumir em silêncio, que foi o defeito que a suíte
   * encontrou aqui.
   */
  private static enderecoDoRequerente(chamado: {
    originChannel: string;
    actors: {
      role: string;
      user: { email: string } | null;
      contact: { email: string | null; phone: string | null } | null;
    }[];
  }): { canal: 'EMAIL' | 'WHATSAPP'; endereco: string } | null {
    const requerente = chamado.actors.find((a) => a.role === 'REQUERENTE');
    if (!requerente) return null;

    const email = requerente.user?.email ?? requerente.contact?.email ?? null;
    const telefone = requerente.contact?.phone ?? null;

    const preferido = chamado.originChannel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL';

    if (preferido === 'WHATSAPP' && telefone) return { canal: 'WHATSAPP', endereco: telefone };
    if (preferido === 'EMAIL' && email) return { canal: 'EMAIL', endereco: email };

    if (email) return { canal: 'EMAIL', endereco: email };
    if (telefone) return { canal: 'WHATSAPP', endereco: telefone };

    return null;
  }

  private async enviarCobranca(
    chamado: {
      id: string;
      number: number;
      subject: string;
      organizationId: string;
      originChannel: string;
      pendingRemindersSent: number;
      actors: {
        role: string;
        user: { email: string } | null;
        contact: { email: string | null; phone: string | null } | null;
      }[];
    },
    modelo: string | null,
    numeroDaCobranca: number,
  ): Promise<void> {
    const destino = SlaJobs.enderecoDoRequerente(chamado);

    if (!destino) {
      // Sem endereço não há como cobrar, e insistir a cada quinze
      // minutos para sempre não ajuda ninguém. Registra na conversa e
      // conta a cobrança, para o encerramento por inatividade seguir
      // seu curso.
      this.logger.warn(
        `Chamado ${chamado.number} está pendente e o requerente não tem endereço em canal nenhum.`,
      );

      await this.prisma.$transaction([
        this.prisma.ticket.update({
          where: { id: chamado.id },
          data: { pendingRemindersSent: numeroDaCobranca },
        }),
        this.prisma.ticketEvent.create({
          data: {
            ticketId: chamado.id,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            channel: 'SISTEMA',
            body:
              'Não foi possível cobrar: o requerente não tem e-mail nem telefone cadastrado. ' +
              'Fale com ele por fora ou complete o cadastro.',
          },
        }),
      ]);
      return;
    }

    const corpo = (
      modelo ??
      'Olá! Ainda precisamos de um retorno seu para seguir com o chamado {{numero}}. ' +
        'Se não houver resposta, ele será encerrado automaticamente.'
    )
      .replace(/\{\{numero\}\}/g, ticketTag(chamado.number))
      .replace(/\{\{assunto\}\}/g, chamado.subject);

    await this.saida.enfileirarAviso({
      organizationId: chamado.organizationId,
      ticketId: chamado.id,
      channel: destino.canal,
      para: destino.endereco,
      corpo,
    });

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: chamado.id },
        data: { pendingRemindersSent: numeroDaCobranca },
      }),
      // A cobrança fica na conversa: sem isso o solicitante recebe três
      // mensagens que a tela do chamado não explica.
      this.prisma.ticketEvent.create({
        data: {
          ticketId: chamado.id,
          type: 'MENSAGEM',
          visibility: 'PUBLICA',
          channel: 'SISTEMA',
          body: corpo,
        },
      }),
    ]);
  }

  private async encerrarPorInatividade(ticketId: string, motivo: string): Promise<void> {
    const agora = new Date();

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'SOLUCIONADO', solvedAt: agora },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'SOLUCAO',
          visibility: 'PUBLICA',
          channel: 'SISTEMA',
          body:
            `Encerrado automaticamente por falta de retorno (${motivo}). ` +
            'Se ainda precisar de ajuda, é só responder que reabrimos.',
          payload: { type: 'SOLUCAO', accepted: false },
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'MUDANCA_STATUS',
          visibility: 'PUBLICA',
          channel: 'SISTEMA',
          payload: { type: 'MUDANCA_STATUS', from: 'PENDENTE', to: 'SOLUCIONADO' },
        },
      }),
    ]);
  }
}

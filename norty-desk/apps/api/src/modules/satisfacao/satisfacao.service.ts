import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SatisfacaoResumo, SurveyPublicView, SurveyView } from '@norty-desk/shared';
import { ticketTag } from '@norty-desk/shared';
import { randomBytes } from 'node:crypto';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SaidaService } from '../channels/saida.service';

/** Quinze dias. Pesquisa velha responde outra coisa que não o atendimento. */
const VALIDADE_DIAS = 15;

@Injectable()
export class SatisfacaoService {
  private readonly logger = new Logger(SatisfacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly saida: SaidaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cria e envia a pesquisa de um chamado fechado.
   *
   * Pelo **canal de origem**: quem abriu por WhatsApp responde no
   * WhatsApp. Mandar e-mail para quem nunca usou e-mail com a gente é
   * como a taxa de resposta do GLPI fica no que fica.
   *
   * Idempotente por `ticketId`: `Survey` tem `@unique` nele, e chamar
   * duas vezes não pede a mesma nota duas vezes.
   */
  async enviarPara(ticketId: string): Promise<void> {
    const chamado = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        survey: true,
        organization: { select: { id: true, name: true } },
        actors: { include: { user: true, contact: true } },
      },
    });

    if (!chamado || chamado.survey) return;

    const destino = SatisfacaoService.enderecoDoRequerente(chamado);
    if (!destino) {
      this.logger.warn(
        `Chamado ${chamado.number} fechado sem endereço do requerente: pesquisa não enviada.`,
      );
      return;
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + VALIDADE_DIAS * 24 * 3600 * 1000);

    const pesquisa = await this.prisma.survey
      .create({
        data: {
          organizationId: chamado.organizationId,
          ticketId,
          token,
          expiresAt,
          sentAt: new Date(),
        },
      })
      // Duas requisições fecharam o chamado ao mesmo tempo: o `@unique`
      // do banco decide, e a segunda desiste em silêncio.
      .catch(() => null);

    if (!pesquisa) return;

    const link = `${this.baseDoPortal()}/pesquisa/${token}`;

    await this.saida.enfileirarAviso({
      organizationId: chamado.organizationId,
      ticketId,
      channel: destino.canal,
      para: destino.endereco,
      assunto: `Como foi o atendimento? ${ticketTag(chamado.number)} ${chamado.subject}`,
      corpo:
        `Seu chamado ${ticketTag(chamado.number)} foi encerrado.\n\n` +
        'De 1 a 5, como foi o atendimento? Leva menos de um minuto:\n' +
        `${link}\n\n` +
        `O link vale por ${VALIDADE_DIAS} dias.`,
    });
  }

  // -------------------------------------------------------------------
  // Página pública
  // -------------------------------------------------------------------

  /**
   * O que o link abre — sem sessão.
   *
   * Só o número, o assunto e o nome da organização. Nada de conversa,
   * nota interna ou dado de outra pessoa: o token vai por e-mail e por
   * WhatsApp, e e-mail encaminhado é coisa que acontece.
   */
  async porToken(token: string): Promise<SurveyPublicView> {
    const pesquisa = await this.prisma.survey.findUnique({
      where: { token },
      include: {
        ticket: { select: { number: true, subject: true } },
        organization: { select: { name: true } },
      },
    });

    if (!pesquisa) throw new NotFoundException('Pesquisa não encontrada.');
    if (pesquisa.expiresAt < new Date()) {
      throw new ConflictException('Este link expirou. Obrigado pelo interesse.');
    }

    return {
      ticketNumber: pesquisa.ticket.number,
      subject: pesquisa.ticket.subject,
      organizationName: pesquisa.organization.name,
      answered: pesquisa.answeredAt !== null,
      score: pesquisa.score,
      comment: pesquisa.comment,
    };
  }

  async responder(token: string, score: number, comment?: string): Promise<SurveyPublicView> {
    const pesquisa = await this.prisma.survey.findUnique({
      where: { token },
      include: { ticket: { select: { id: true, number: true } } },
    });

    if (!pesquisa) throw new NotFoundException('Pesquisa não encontrada.');
    if (pesquisa.expiresAt < new Date()) throw new ConflictException('Este link expirou.');

    // Responder de novo troca a nota: a pessoa mudou de ideia, e recusar
    // seria discutir com quem se dispôs a avaliar.
    await this.prisma.$transaction([
      this.prisma.survey.update({
        where: { token },
        data: { score, comment: comment ?? null, answeredAt: new Date() },
      }),
      // Fica na linha do tempo, como nota interna: a equipe precisa ver
      // a avaliação junto do atendimento que a gerou, e o cliente não
      // precisa reler a própria nota.
      this.prisma.ticketEvent.create({
        data: {
          ticketId: pesquisa.ticket.id,
          type: 'NOTA_INTERNA',
          visibility: 'INTERNA',
          channel: 'SISTEMA',
          body:
            `Pesquisa de satisfação respondida: ${score} de 5.` +
            (comment ? `\n\n“${comment}”` : ''),
        },
      }),
    ]);

    return this.porToken(token);
  }

  // -------------------------------------------------------------------
  // Leitura interna
  // -------------------------------------------------------------------

  async listar(usuario: UsuarioAutenticado, apenasRespondidas = false): Promise<SurveyView[]> {
    const pesquisas = await this.prisma.survey.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(apenasRespondidas ? { answeredAt: { not: null } } : {}),
      },
      include: { ticket: { select: { id: true, number: true, subject: true } } },
      orderBy: { sentAt: 'desc' },
      take: 200,
    });

    return pesquisas.map((p) => ({
      id: p.id,
      ticket: p.ticket,
      sentAt: p.sentAt?.toISOString() ?? null,
      score: p.score,
      comment: p.comment,
      answeredAt: p.answeredAt?.toISOString() ?? null,
      expiresAt: p.expiresAt.toISOString(),
    }));
  }

  /**
   * O resumo.
   *
   * Além da média, o CSAT: percentual de 4 e 5 menos percentual de 1 e
   * 2. Uma média 3,0 pode ser "todo mundo achou mediano" ou "metade
   * amou e metade odiou", e são problemas diferentes.
   */
  async resumo(usuario: UsuarioAutenticado, de: Date): Promise<SatisfacaoResumo> {
    const ate = new Date();

    const [enviadas, respostas] = await Promise.all([
      this.prisma.survey.count({
        where: {
          organizationId: usuario.organizationId,
          sentAt: { gte: de, lte: ate },
        },
      }),
      this.prisma.survey.groupBy({
        by: ['score'],
        where: {
          organizationId: usuario.organizationId,
          sentAt: { gte: de, lte: ate },
          answeredAt: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const porNota = [1, 2, 3, 4, 5].map((nota) => ({
      nota,
      total: respostas.find((r) => r.score === nota)?._count._all ?? 0,
    }));

    const respondidas = porNota.reduce((s, n) => s + n.total, 0);
    const soma = porNota.reduce((s, n) => s + n.nota * n.total, 0);

    const bons = porNota.filter((n) => n.nota >= 4).reduce((s, n) => s + n.total, 0);
    const ruins = porNota.filter((n) => n.nota <= 2).reduce((s, n) => s + n.total, 0);

    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      enviadas,
      respondidas,
      taxaDeResposta: enviadas === 0 ? 0 : Math.round((respondidas / enviadas) * 1000) / 10,
      media: respondidas === 0 ? 0 : Math.round((soma / respondidas) * 10) / 10,
      csat:
        respondidas === 0
          ? 0
          : Math.round(((bons - ruins) / respondidas) * 1000) / 10,
      porNota,
    };
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private baseDoPortal(): string {
    const origem = this.config.get<string>('WEB_ORIGIN') ?? 'https://chamados.norty.com.br';
    return origem.split(',')[0]!.replace(/\/$/, '');
  }

  /** Prefere o canal de origem; sem endereço nele, usa o que houver. */
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

    if (chamado.originChannel === 'WHATSAPP' && telefone) {
      return { canal: 'WHATSAPP', endereco: telefone };
    }
    if (email) return { canal: 'EMAIL', endereco: email };
    if (telefone) return { canal: 'WHATSAPP', endereco: telefone };

    return null;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AvisoPush, TipoDeNotificacao } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_PUSH } from './notificacoes.tokens';
import type { PortaDePush } from './push.transporte';

/**
 * O aviso que chega fora da aba.
 *
 * O que este serviço decide é **quem** recebe, e é aí que está o risco
 * do recurso. Um e-mail mal endereçado a pessoa abre e fecha; um aviso
 * mal endereçado aparece na barra do Windows de quem estava numa
 * reunião, com o assunto à mostra, e não tem volta.
 *
 * Três regras, nesta ordem:
 *
 * 1. **Nota interna nunca chega a quem pediu o chamado.** Nem ao
 *    solicitante, nem a observador. É a mesma cerca do `SaidaService`,
 *    pela mesma razão, e é o pior erro possível deste produto.
 * 2. **Ninguém é avisado do que ele mesmo fez.** Quem escreveu a
 *    resposta não precisa do aviso de que houve resposta.
 * 3. **O que a pessoa silenciou não chega.** Preferência é por pessoa,
 *    não por aparelho: quem desligou "nota interna" desligou nos dois
 *    computadores e no celular.
 */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTA_DE_PUSH) private readonly push: PortaDePush,
  ) {}

  /**
   * Manda o aviso para todos os aparelhos das pessoas indicadas.
   *
   * Melhor esforço, e de propósito: não há fila nem retentativa. Aviso
   * é perecível — reentregar o "o cliente respondeu" vinte minutos
   * depois, quando a pessoa já leu e já respondeu, é ruído. O que sai
   * daqui ou chega agora ou não interessa mais. (A entrega confiável é
   * a do e-mail, que tem fila própria e retentativa.)
   */
  async avisar(dados: {
    organizationId: string;
    userIds: readonly string[];
    tipo: TipoDeNotificacao;
    titulo: string;
    corpo: string;
    url: string;
    etiqueta: string;
  }): Promise<number> {
    const alvos = [...new Set(dados.userIds)].filter(Boolean);
    if (alvos.length === 0) return 0;

    // Quem silenciou este motivo sai da lista antes de qualquer
    // consulta de aparelho.
    const preferencias = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: alvos } },
      select: { userId: true, silenciados: true },
    });

    const silenciou = new Set(
      preferencias.filter((p) => p.silenciados.includes(dados.tipo)).map((p) => p.userId),
    );

    const querem = alvos.filter((id) => !silenciou.has(id));
    if (querem.length === 0) return 0;

    const aparelhos = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: querem }, organizationId: dados.organizationId },
    });
    if (aparelhos.length === 0) return 0;

    const aviso: AvisoPush = {
      tipo: dados.tipo,
      titulo: dados.titulo,
      corpo: dados.corpo,
      url: dados.url,
      etiqueta: dados.etiqueta,
    };
    const carga = JSON.stringify(aviso);

    const mortos: string[] = [];
    let entregues = 0;

    for (const aparelho of aparelhos) {
      const r = await this.push.enviar(aparelho, carga);
      if (r.morto) mortos.push(aparelho.id);
      else if (r.ok) entregues += 1;
    }

    if (mortos.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: mortos } } });
      this.logger.debug(`${mortos.length} inscrição(ões) morta(s) apagada(s).`);
    }

    if (entregues > 0) {
      await this.prisma.pushSubscription.updateMany({
        where: { id: { in: aparelhos.filter((a) => !mortos.includes(a.id)).map((a) => a.id) } },
        data: { lastSentAt: new Date() },
      });
    }

    return entregues;
  }

  /**
   * O aviso que nasce de um evento do chamado.
   *
   * Quem recebe depende de dois eixos: o evento é interno ou público, e
   * quem escreveu é do cliente ou da casa.
   *
   * | Evento | Quem escreveu | Quem é avisado |
   * |---|---|---|
   * | interno | qualquer um | só quem atende (atribuído e time) |
   * | público | o cliente | quem atende |
   * | público | a casa | o solicitante e os observadores |
   *
   * O autor nunca entra, em nenhuma linha.
   */
  async doEventoDoChamado(eventId: string): Promise<number> {
    const evento = await this.prisma.ticketEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        type: true,
        visibility: true,
        body: true,
        authorId: true,
        author: { select: { name: true } },
        ticket: {
          select: {
            id: true,
            number: true,
            subject: true,
            organizationId: true,
            actors: { select: { role: true, userId: true, teamId: true } },
          },
        },
      },
    });

    const chamado = evento?.ticket;
    if (!evento || !chamado) return 0;

    // Mudança de status, de atribuição, pausa de SLA: são registros,
    // não fala de ninguém. Quem avisa sobre atribuição é `daAtribuicao`,
    // que sabe para quem o chamado foi.
    if (evento.type !== 'MENSAGEM' && evento.type !== 'SOLUCAO' && evento.type !== 'NOTA_INTERNA') {
      return 0;
    }

    const interno = evento.visibility === 'INTERNA';

    const requerenteId = chamado.actors.find((a) => a.role === 'REQUERENTE')?.userId ?? null;
    const observadores = chamado.actors
      .filter((a) => a.role === 'OBSERVADOR' && a.userId)
      .map((a) => a.userId as string);

    const atendentes = await this.quemAtende(chamado.actors);

    // Autor do cliente: ou é o próprio requerente, ou veio de fora sem
    // usuário (e-mail, WhatsApp). Sem esta distinção, "tem autor" seria
    // lido como "é da casa" e a conversa inteira do solicitante logado
    // cairia do lado errado.
    const daCasa = evento.authorId !== null && evento.authorId !== requerenteId;

    const { alvos, tipo, titulo } = interno
      ? {
          // A cerca. O requerente e os observadores não entram aqui, e
          // não há caminho em que entrem: a lista é construída só com
          // quem atende.
          alvos: atendentes,
          tipo: 'NOTA_INTERNA' as const,
          titulo: `Nota interna no chamado #${chamado.number}`,
        }
      : daCasa
        ? {
            alvos: [...(requerenteId ? [requerenteId] : []), ...observadores],
            tipo: 'RESPOSTA_NO_MEU_CHAMADO' as const,
            titulo: `Resposta no chamado #${chamado.number}`,
          }
        : {
            alvos: atendentes,
            tipo: 'RESPOSTA_DO_CLIENTE' as const,
            titulo: `O cliente respondeu — chamado #${chamado.number}`,
          };

    return this.avisar({
      organizationId: chamado.organizationId,
      userIds: alvos.filter((id) => id !== evento.authorId),
      tipo,
      titulo,
      corpo: NotificacoesService.resumo(evento.body) || chamado.subject,
      url: `/chamados/${chamado.id}`,
      etiqueta: `chamado-${chamado.id}`,
    });
  }

  /** O chamado passou a ser de alguém. */
  async daAtribuicao(
    ticketId: string,
    destino: { userId?: string | null; teamId?: string | null },
    porQuem: string | null,
  ): Promise<number> {
    const chamado = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, number: true, subject: true, organizationId: true },
    });
    if (!chamado) return 0;

    const alvos = destino.userId
      ? [destino.userId]
      : destino.teamId
        ? (
            await this.prisma.teamMember.findMany({
              where: { teamId: destino.teamId },
              select: { userId: true },
            })
          ).map((m) => m.userId)
        : [];

    return this.avisar({
      organizationId: chamado.organizationId,
      // Pegar o chamado para si não precisa de aviso de que o chamado é
      // seu: a pessoa acabou de clicar no botão.
      userIds: alvos.filter((id) => id !== porQuem),
      tipo: 'ATRIBUICAO',
      titulo: `Chamado #${chamado.number} é seu`,
      corpo: chamado.subject,
      url: `/chamados/${chamado.id}`,
      etiqueta: `chamado-${chamado.id}`,
    });
  }

  /** Há um aval esperando. */
  async daAprovacao(
    ticketId: string,
    validadores: readonly string[],
    pedidoPor: string | null,
  ): Promise<number> {
    const chamado = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, number: true, subject: true, organizationId: true },
    });
    if (!chamado) return 0;

    return this.avisar({
      organizationId: chamado.organizationId,
      userIds: validadores.filter((id) => id !== pedidoPor),
      tipo: 'APROVACAO',
      titulo: `Aval pendente — chamado #${chamado.number}`,
      corpo: chamado.subject,
      // Para a lista de avais, não para o chamado: quem é avisado está
      // sendo chamado a decidir, e é lá que se decide.
      url: '/aprovacoes',
      etiqueta: `aprovacao-${chamado.id}`,
    });
  }

  /** O prazo está estourando, ou estourou. */
  async doSla(ticketId: string, estourou: boolean): Promise<number> {
    const chamado = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        organizationId: true,
        actors: { select: { role: true, userId: true, teamId: true } },
      },
    });
    if (!chamado) return 0;

    return this.avisar({
      organizationId: chamado.organizationId,
      userIds: await this.quemAtende(chamado.actors),
      tipo: 'SLA',
      titulo: estourou
        ? `Prazo estourado — chamado #${chamado.number}`
        : `Prazo apertando — chamado #${chamado.number}`,
      corpo: chamado.subject,
      url: `/chamados/${chamado.id}`,
      etiqueta: `sla-${chamado.id}`,
    });
  }

  /**
   * Quem atende: o atribuído e, quando o chamado está com um time, as
   * pessoas dele.
   *
   * Requerente e observador não entram nunca — é esta função que
   * sustenta a cerca da nota interna, e é por isso que ela não recebe
   * um parâmetro "incluir o solicitante".
   */
  private async quemAtende(
    atores: readonly { role: string; userId: string | null; teamId: string | null }[],
  ): Promise<string[]> {
    const atribuidos = atores.filter((a) => a.role === 'ATRIBUIDO');

    const pessoas = atribuidos.map((a) => a.userId).filter((id): id is string => Boolean(id));
    const times = atribuidos.map((a) => a.teamId).filter((id): id is string => Boolean(id));

    if (times.length === 0) return [...new Set(pessoas)];

    const membros = await this.prisma.teamMember.findMany({
      where: { teamId: { in: times } },
      select: { userId: true },
    });

    return [...new Set([...pessoas, ...membros.map((m) => m.userId)])];
  }

  /**
   * O corpo em uma linha.
   *
   * O aviso do sistema corta onde quiser; cortar aqui, em 140, garante
   * que o corte caia num lugar previsível e que a mensagem não vire um
   * parágrafo na barra de notificações.
   */
  private static resumo(corpo: string | null): string {
    const texto = (corpo ?? '').replace(/\s+/g, ' ').trim();
    return texto.length > 140 ? `${texto.slice(0, 139)}…` : texto;
  }
}

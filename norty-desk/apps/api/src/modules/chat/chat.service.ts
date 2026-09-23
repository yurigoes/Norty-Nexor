import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SEGUNDOS_DIGITANDO,
  SEGUNDOS_ONLINE,
  type EstadoDoChat,
  type PresencaView,
} from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * O chat ao vivo do chamado.
 *
 * ## O chat **é** a conversa do chamado
 *
 * Cada linha é um `TicketEvent`, o mesmo de uma resposta pela caixa de
 * texto (CLAUDE.md, regra 8). Uma tabela de mensagens à parte criaria
 * duas histórias do mesmo atendimento: a que a tela de chamado mostra e
 * a que ficou no chat — que é exatamente o defeito do GLPI que a regra
 * 8 existe para corrigir. O que o chat muda é a **entrega**, não o
 * registro.
 *
 * ## A presença mora no banco
 *
 * Mesma razão do `LoginThrottle`: a API roda em mais de um processo, e
 * presença em memória só é vista por quem caiu no mesmo processo. Uma
 * linha por pessoa, não por conexão — duas abas abertas são uma pessoa
 * online, e o que interessa é se **a pessoa** está por perto.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private static desde(segundos: number): Date {
    return new Date(Date.now() - segundos * 1000);
  }

  /**
   * "Ainda estou aqui" — e, de quebra, quem mais está.
   *
   * `upsert` pelo `userId`: a batida é idempotente e barata, e é ela
   * que mantém a presença viva. Quem fecha a aba simplesmente para de
   * bater, e some sozinho em `SEGUNDOS_ONLINE`. Não há "sair do chat"
   * a ser chamado no `beforeunload` — evento que o navegador entrega
   * quando quer, e que não chega quando a aba morre de vez.
   */
  async baterPonto(
    usuario: UsuarioAutenticado,
    dados: { ticketId?: string | null; digitando?: boolean },
  ): Promise<EstadoDoChat> {
    const ticketId = dados.ticketId ? await this.exigirChamado(usuario, dados.ticketId) : null;
    const agora = new Date();

    await this.prisma.chatPresence.upsert({
      where: { userId: usuario.userId },
      update: {
        organizationId: usuario.organizationId,
        ticketId,
        lastSeenAt: agora,
        typingAt: dados.digitando ? agora : null,
      },
      create: {
        userId: usuario.userId,
        organizationId: usuario.organizationId,
        ticketId,
        lastSeenAt: agora,
        typingAt: dados.digitando ? agora : null,
      },
    });

    return ticketId ? this.estado(usuario, ticketId) : { aberto: false, presentes: [] };
  }

  /**
   * Quem está nesta conversa agora, **sem contar quem perguntou**.
   *
   * Contar a si mesmo faria a tela dizer "o chat está aberto" para
   * quem está sozinho — e a promessa do selo é justamente que há
   * alguém do outro lado.
   */
  async estado(usuario: UsuarioAutenticado, ticketId: string): Promise<EstadoDoChat> {
    await this.exigirChamado(usuario, ticketId);

    const linhas = await this.prisma.chatPresence.findMany({
      where: {
        organizationId: usuario.organizationId,
        ticketId,
        userId: { not: usuario.userId },
        lastSeenAt: { gt: ChatService.desde(SEGUNDOS_ONLINE) },
      },
      include: { user: { select: { id: true, name: true } } },
    });

    const digitandoDesde = ChatService.desde(SEGUNDOS_DIGITANDO);

    const presentes: PresencaView[] = linhas.map((l) => ({
      userId: l.user.id,
      name: l.user.name,
      naConversa: true,
      digitando: Boolean(l.typingAt && l.typingAt > digitandoDesde),
    }));

    return { aberto: presentes.length > 0, presentes };
  }

  /**
   * Esta pessoa está com o chat deste chamado aberto agora?
   *
   * É o que decide se a resposta também sai por e-mail ou WhatsApp: a
   * pessoa que está lendo ao vivo não precisa receber a mesma frase na
   * caixa de entrada, e uma conversa de vinte linhas viraria vinte
   * e-mails.
   */
  async estaNaConversa(userId: string, ticketId: string): Promise<boolean> {
    const presente = await this.prisma.chatPresence.count({
      where: {
        userId,
        ticketId,
        lastSeenAt: { gt: ChatService.desde(SEGUNDOS_ONLINE) },
      },
    });
    return presente > 0;
  }

  /**
   * O chamado existe e esta pessoa o enxerga?
   *
   * A mesma cerca do resto do produto: o `where` começa pela
   * organização, e o escopo de leitura do papel decide o resto. Sem
   * isto, o id de um chamado alheio no corpo da batida entregaria a
   * presença — e, pelo fluxo, as mensagens.
   */
  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string): Promise<string> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: usuario.organizationId },
      select: { id: true, actors: { select: { role: true, userId: true, teamId: true } } },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    // Quem lê todos os chamados entra em qualquer conversa.
    if (
      usuario.role === 'ADMINISTRADOR' ||
      usuario.role === 'SUPERVISOR' ||
      usuario.role === 'GESTOR'
    ) {
      return chamado.id;
    }

    const meu = chamado.actors.some((a) => a.userId === usuario.userId);
    if (meu) return chamado.id;

    // Do meu time: o agente entra na conversa do chamado da fila dele.
    const times = chamado.actors.map((a) => a.teamId).filter((id): id is string => Boolean(id));
    if (times.length > 0) {
      const noTime = await this.prisma.teamMember.count({
        where: { userId: usuario.userId, teamId: { in: times } },
      });
      if (noTime > 0) return chamado.id;
    }

    throw new NotFoundException('Chamado não encontrado.');
  }

  /**
   * As mensagens que entraram depois de um instante.
   *
   * É o que o fluxo consulta a cada volta. `gt` sobre `createdAt` com
   * o id de desempate: duas mensagens no mesmo milissegundo existem, e
   * ordenar só por data devolveria as duas na volta seguinte — ou
   * perderia uma.
   */
  async desdeEntao(
    usuario: UsuarioAutenticado,
    ticketId: string,
    depoisDe: Date,
  ): Promise<{ id: string; createdAt: Date }[]> {
    const podeVerInterno = usuario.role !== 'SOLICITANTE';

    return this.prisma.ticketEvent.findMany({
      where: {
        ticketId,
        createdAt: { gt: depoisDe },
        ...(podeVerInterno ? {} : { visibility: 'PUBLICA' }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, createdAt: true },
      take: 50,
    });
  }

  /** Quem lê o fluxo precisa ter passado pela mesma cerca. */
  async podeEntrar(usuario: UsuarioAutenticado, ticketId: string): Promise<void> {
    await this.exigirChamado(usuario, ticketId);
  }

  /**
   * Some com quem parou de bater.
   *
   * A linha não é apagada no fechamento da aba: o navegador não avisa
   * de forma confiável. Ela é limpa aqui, de tempos em tempos, e a
   * consulta de presença já ignora batida velha — a poda é higiene da
   * tabela, não a regra.
   *
   * O `@Cron` faltava: o método existia e ninguém o chamava, então a
   * tabela só crescia. Não quebrava nada — a consulta de presença
   * sempre ignorou batida velha —, mas uma linha por pessoa por dia,
   * para sempre, é lixo que um dia aparece num backup.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async podar(): Promise<number> {
    const { count } = await this.prisma.chatPresence.deleteMany({
      where: { lastSeenAt: { lt: ChatService.desde(SEGUNDOS_ONLINE * 20) } },
    });
    return count;
  }
}

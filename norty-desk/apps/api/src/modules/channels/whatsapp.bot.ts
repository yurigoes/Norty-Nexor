import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { normalizePhone } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Quem é a pessoa do outro lado, e para qual empresa ela está falando.
 *
 * ## O número é a identidade, e às vezes ele é de duas pessoas
 *
 * Quem escreve pelo WhatsApp não digita login. O número é o que há, e
 * dele sai o nome e a empresa — o chamado nasce identificado, com
 * contrato e SLA certos, sem ninguém perguntar nada.
 *
 * O caso que obriga a perguntar é real e não é raro: o mesmo número
 * aparece em mais de uma empresa da carteira. Acontece com quem presta
 * serviço para duas, com o dono que tem duas razões sociais, e com o
 * celular que passou de uma pessoa para outra. No banco isso é mais de
 * um `User` com o mesmo `phone`, cada um no seu `Client` — o vínculo é
 * único por `(userId, organizationId)`, então a mesma pessoa em duas
 * empresas é, para o modelo, duas pessoas.
 *
 * **Adivinhar pela primeira que aparecer erraria em silêncio**, e o erro
 * só apareceria no relatório do mês, com o chamado cobrado da empresa
 * errada. Então o bot pergunta — uma vez, com a lista na tela.
 */

export type QuemEstaFalando = {
  /** A conta no Desk, quando a pessoa tem uma. */
  userId: string | null;
  nome: string | null;
  /** As empresas em que este número aparece. Vazia para quem não é da carteira. */
  empresas: { id: string; nome: string }[];
};

/** Quanto tempo o bot lembra do que perguntou. */
const VIDA_DA_CONVERSA_HORAS = 12;

@Injectable()
export class WhatsappBot {
  private readonly logger = new Logger(WhatsappBot.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quem é este número nesta organização.
   *
   * A consulta começa por `organizationId` como todas as outras
   * (CLAUDE.md, regra 3): um número que existe em duas organizações é
   * duas pessoas diferentes, e nenhuma delas enxerga a outra.
   */
  async identificar(organizationId: string, telefone: string): Promise<QuemEstaFalando> {
    const normalizado = normalizePhone(telefone);

    const pessoas = await this.prisma.user.findMany({
      where: {
        phone: normalizado,
        isActive: true,
        memberships: { some: { organizationId } },
      },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { organizationId },
          select: { client: { select: { id: true, name: true, isActive: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const empresas = new Map<string, string>();
    for (const pessoa of pessoas) {
      for (const vinculo of pessoa.memberships) {
        if (vinculo.client?.isActive) empresas.set(vinculo.client.id, vinculo.client.name);
      }
    }

    return {
      // Quem é da Norty (sem empresa) ou quem só tem uma conta resolve
      // aqui. Com várias, o `userId` só se decide depois da escolha da
      // empresa — é ela que diz qual das contas está falando.
      userId: pessoas.length === 1 ? pessoas[0]!.id : null,
      nome: pessoas[0]?.name ?? null,
      empresas: [...empresas].map(([id, nome]) => ({ id, nome })),
    };
  }

  /** Qual conta desta pessoa pertence a esta empresa. */
  async pessoaDaEmpresa(
    organizationId: string,
    telefone: string,
    clientId: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.prisma.user.findFirst({
      where: {
        phone: normalizePhone(telefone),
        isActive: true,
        memberships: { some: { organizationId, clientId } },
      },
      select: { id: true, name: true },
    });
  }

  // -------------------------------------------------------------------
  // O que o bot lembra
  // -------------------------------------------------------------------

  /**
   * O estado da conversa, se ainda estiver de pé.
   *
   * Expirado conta como inexistente e **não** é apagado aqui: apagar na
   * leitura transformaria uma consulta numa escrita, e duas mensagens
   * quase simultâneas brigariam pela mesma linha. A poda é do job.
   */
  async lembrar(
    channelAccountId: string,
    telefone: string,
  ): Promise<{ clientId: string | null; aguardando: 'EMPRESA' | 'ASSUNTO' | null } | null> {
    const conversa = await this.prisma.whatsappConversa.findUnique({
      where: { channelAccountId_phone: { channelAccountId, phone: normalizePhone(telefone) } },
      select: { clientId: true, aguardando: true, expiresAt: true },
    });

    if (!conversa || conversa.expiresAt <= new Date()) return null;

    return { clientId: conversa.clientId, aguardando: conversa.aguardando };
  }

  /** Guarda o que o bot está esperando desta pessoa. */
  async anotar(
    dados: {
      organizationId: string;
      channelAccountId: string;
      telefone: string;
      clientId?: string | null;
      aguardando?: 'EMPRESA' | 'ASSUNTO' | null;
    },
  ): Promise<void> {
    const phone = normalizePhone(dados.telefone);
    const expiresAt = new Date(Date.now() + VIDA_DA_CONVERSA_HORAS * 3600_000);

    const conteudo = {
      clientId: dados.clientId ?? null,
      aguardando: dados.aguardando ?? null,
      expiresAt,
    };

    await this.prisma.whatsappConversa.upsert({
      where: { channelAccountId_phone: { channelAccountId: dados.channelAccountId, phone } },
      update: conteudo,
      create: {
        organizationId: dados.organizationId,
        channelAccountId: dados.channelAccountId,
        phone,
        ...conteudo,
      },
    });
  }

  /** Esquece o que estava pendente. Chamado quando o chamado nasce. */
  async esquecer(channelAccountId: string, telefone: string): Promise<void> {
    await this.prisma.whatsappConversa
      .delete({
        where: { channelAccountId_phone: { channelAccountId, phone: normalizePhone(telefone) } },
      })
      .catch(() => undefined);
  }

  /**
   * Casa o texto da pessoa com o nome de uma empresa.
   *
   * É o caminho de quem está na Evolution, que não desenha lista de
   * toque: a lista sai escrita e a pessoa responde o nome. Comparação
   * sem acento e sem caixa, e aceita o começo do nome — ninguém digita
   * "Transportadora São Jorge Ltda" inteiro.
   */
  static acharEmpresaPorTexto(
    texto: string,
    empresas: { id: string; nome: string }[],
  ): { id: string; nome: string } | null {
    const limpo = WhatsappBot.simplificar(texto);
    if (limpo.length < 2) return null;

    const exata = empresas.find((e) => WhatsappBot.simplificar(e.nome) === limpo);
    if (exata) return exata;

    const comecam = empresas.filter((e) => WhatsappBot.simplificar(e.nome).startsWith(limpo));
    // Só quando **uma** casa: "São" batendo em duas empresas vira
    // escolha errada com cara de escolha certa.
    if (comecam.length === 1) return comecam[0]!;

    const contem = empresas.filter((e) => WhatsappBot.simplificar(e.nome).includes(limpo));
    return contem.length === 1 ? contem[0]! : null;
  }

  private static simplificar(texto: string): string {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Some com conversa vencida.
   *
   * Estado de conversa que não expira vira um bot que continua achando
   * que a pergunta de terça-feira ainda está no ar — e abre o chamado
   * na empresa que a pessoa escolheu para outro assunto, dias antes.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async podar(): Promise<number> {
    const { count } = await this.prisma.whatsappConversa.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}

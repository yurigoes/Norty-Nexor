import { Injectable, NotFoundException } from '@nestjs/common';
import type { ImpactoView, MotivoDeImpacto, NoDeImpacto } from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Até onde a travessia vai, e quanto ela pode trazer. */
const PROFUNDIDADE_PADRAO = 2;
const PROFUNDIDADE_MAXIMA = 5;
const LIMITE_PADRAO = 60;
const LIMITE_MAXIMO = 200;

type Achado = {
  id: string;
  profundidade: number;
  motivo: MotivoDeImpacto;
  caminho: string[];
};

/**
 * O que cai junto com este equipamento.
 *
 * A pergunta é a de antes da manutenção: "posso desligar isto agora?".
 * Ela se responde com duas coisas, e a resposta traz as duas — os
 * **equipamentos** que a queda alcança, e as **consequências**: chamado
 * aberto, mudança marcada, reserva de alguém, gente para avisar.
 * Separá-las em duas telas faria a segunda nunca ser aberta.
 *
 * **Duas arestas, e só duas.** Periférico pendurado cai com a máquina;
 * o que está do outro lado do cabo perde rede. Estar no mesmo rack
 * **não** entra: proximidade não é dependência, e tratá-la como tal
 * encheria a lista de equipamento que continua de pé — que é o jeito
 * mais rápido de a análise virar ruído e ninguém mais olhar.
 *
 * O cabo é percorrido nos dois sentidos porque o inventário **não sabe**
 * qual ponta é a de cima: a conexão é simétrica no banco, e a assimetria
 * (uplink e acesso) é semântica que ninguém cadastra. Dizer que sabe
 * seria pior que dizer que não: o switch some da análise do desktop, e
 * é justamente o switch que derruba o andar.
 */
@Injectable()
export class ImpactoService {
  constructor(private readonly prisma: PrismaService) {}

  async analisar(
    usuario: UsuarioAutenticado,
    assetId: string,
    opcoes: { profundidade?: number; limite?: number } = {},
  ): Promise<ImpactoView> {
    const organizationId = usuario.organizationId;

    const raiz = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
      select: { id: true, name: true, tag: true },
    });
    if (!raiz) throw new NotFoundException('Equipamento não encontrado.');

    const profundidade = Math.min(
      Math.max(opcoes.profundidade ?? PROFUNDIDADE_PADRAO, 1),
      PROFUNDIDADE_MAXIMA,
    );
    const limite = Math.min(Math.max(opcoes.limite ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO);

    const { achados, truncado } = await this.percorrer(
      organizationId,
      { id: raiz.id, nome: raiz.name },
      profundidade,
      limite,
    );

    const ids = [raiz.id, ...achados.map((a) => a.id)];
    const [detalhes, chamados, reservas] = await Promise.all([
      this.prisma.asset.findMany({
        where: { id: { in: achados.map((a) => a.id) } },
        select: {
          id: true,
          name: true,
          tag: true,
          status: true,
          user: { select: { id: true, name: true, email: true } },
          client: { select: { id: true, name: true } },
        },
      }),
      this.chamadosAbertos(organizationId, ids),
      this.reservasVigentes(organizationId, ids),
    ]);

    const porId = new Map(detalhes.map((d) => [d.id, d]));

    const nos: NoDeImpacto[] = achados.flatMap((a) => {
      const d = porId.get(a.id);
      if (!d) return [];

      return [
        {
          asset: { id: d.id, name: d.name, tag: d.tag },
          profundidade: a.profundidade,
          motivo: a.motivo,
          caminho: a.caminho,
          status: d.status,
          user: d.user
            ? { kind: 'USER' as const, id: d.user.id, name: d.user.name, email: d.user.email }
            : null,
          client: d.client,
        },
      ];
    });

    const mudancas = await this.mudancasPlanejadas(
      organizationId,
      chamados.map((c) => c.id),
    );

    // Quem avisar: uma pessoa por linha, mesmo que ela esteja com três
    // equipamentos. A lista existe para ser lida, não para ser contada.
    const pessoas = new Map(nos.filter((n) => n.user).map((n) => [n.user!.id, n.user!]));

    return {
      raiz,
      nos,
      chamadosAbertos: chamados,
      mudancasPlanejadas: mudancas,
      reservas,
      pessoas: [...pessoas.values()],
      truncado,
    };
  }

  /**
   * A travessia em largura, um nível por vez.
   *
   * Em largura e não em profundidade porque o teto corta pelo fim: com
   * busca em profundidade, um ramo comprido consumiria o orçamento
   * inteiro e o vizinho imediato ficaria de fora — que é exatamente o
   * contrário do que interessa.
   *
   * Uma consulta por nível, não uma por nó: um switch com 48 portas
   * seriam 48 idas ao banco no primeiro salto.
   */
  private async percorrer(
    organizationId: string,
    raiz: { id: string; nome: string },
    profundidadeMaxima: number,
    limite: number,
  ): Promise<{ achados: Achado[]; truncado: boolean }> {
    const achados: Achado[] = [];
    const vistos = new Set<string>([raiz.id]);
    const nomes = new Map<string, string>([[raiz.id, raiz.nome]]);

    let fronteira: { id: string; caminho: string[] }[] = [{ id: raiz.id, caminho: [raiz.nome] }];
    let truncado = false;

    for (let salto = 1; salto <= profundidadeMaxima && fronteira.length > 0; salto += 1) {
      const origens = fronteira.map((f) => f.id);
      const caminhoDe = new Map(fronteira.map((f) => [f.id, f.caminho]));

      const [filhos, cabos] = await Promise.all([
        this.prisma.asset.findMany({
          where: { organizationId, parentAssetId: { in: origens } },
          select: { id: true, name: true, parentAssetId: true },
        }),
        this.vizinhosPorCabo(organizationId, origens),
      ]);

      const candidatos: { id: string; nome: string; de: string; motivo: MotivoDeImpacto }[] = [
        ...filhos.map((f) => ({
          id: f.id,
          nome: f.name,
          de: f.parentAssetId!,
          motivo: 'PERIFERICO' as const,
        })),
        ...cabos,
      ];

      const proxima: { id: string; caminho: string[] }[] = [];

      for (const c of candidatos) {
        if (vistos.has(c.id)) continue;

        if (achados.length >= limite) {
          truncado = true;
          break;
        }

        vistos.add(c.id);
        nomes.set(c.id, c.nome);

        const caminho = [...(caminhoDe.get(c.de) ?? [raiz.nome]), c.nome];
        achados.push({ id: c.id, profundidade: salto, motivo: c.motivo, caminho });
        proxima.push({ id: c.id, caminho });
      }

      if (truncado) break;
      fronteira = proxima;
    }

    return { achados, truncado };
  }

  /** O que está do outro lado do cabo, para cada origem. */
  private async vizinhosPorCabo(
    organizationId: string,
    origens: string[],
  ): Promise<{ id: string; nome: string; de: string; motivo: MotivoDeImpacto }[]> {
    const portas = await this.prisma.networkPort.findMany({
      where: {
        organizationId,
        connectedToId: { not: null },
        OR: [{ assetId: { in: origens } }, { connectedTo: { assetId: { in: origens } } }],
      },
      select: {
        assetId: true,
        asset: { select: { id: true, name: true } },
        connectedTo: { select: { assetId: true, asset: { select: { id: true, name: true } } } },
      },
    });

    const saida: { id: string; nome: string; de: string; motivo: MotivoDeImpacto }[] = [];

    for (const porta of portas) {
      if (!porta.connectedTo) continue;

      // O cabo é simétrico no banco: a mesma conexão aparece dos dois
      // lados, e a origem é a ponta que está na fronteira.
      if (origens.includes(porta.assetId)) {
        saida.push({
          id: porta.connectedTo.asset.id,
          nome: porta.connectedTo.asset.name,
          de: porta.assetId,
          motivo: 'CABO',
        });
      }

      if (origens.includes(porta.connectedTo.assetId)) {
        saida.push({
          id: porta.asset.id,
          nome: porta.asset.name,
          de: porta.connectedTo.assetId,
          motivo: 'CABO',
        });
      }
    }

    return saida;
  }

  /**
   * Chamado aberto em qualquer equipamento atingido.
   *
   * Não é dependência: é o que já está pegando fogo ali. Desligar uma
   * máquina que tem chamado aberto no meio do atendimento é o tipo de
   * coisa que só se descobre depois.
   */
  private async chamadosAbertos(organizationId: string, assetIds: string[]) {
    const vinculos = await this.prisma.ticketAsset.findMany({
      where: {
        assetId: { in: assetIds },
        ticket: {
          organizationId,
          status: { notIn: ['SOLUCIONADO', 'FECHADO'] },
        },
      },
      select: {
        ticket: { select: { id: true, number: true, subject: true } },
        asset: { select: { id: true, name: true, tag: true } },
      },
      orderBy: { ticket: { number: 'desc' } },
      take: 50,
    });

    return vinculos.map((v) => ({
      id: v.ticket.id,
      number: v.ticket.number,
      subject: v.ticket.subject,
      asset: v.asset,
    }));
  }

  /**
   * Mudança marcada que envolve algum deles.
   *
   * A mudança se liga ao equipamento pelo chamado, que é onde o
   * equipamento é registrado — duas janelas de manutenção no mesmo
   * switch na mesma noite é o que isto existe para não deixar passar.
   */
  private async mudancasPlanejadas(organizationId: string, ticketIds: string[]) {
    if (ticketIds.length === 0) return [];

    const mudancas = await this.prisma.change.findMany({
      where: {
        organizationId,
        status: { notIn: ['CONCLUIDA', 'REVERTIDA', 'RECUSADA', 'CANCELADA'] },
        tickets: { some: { id: { in: ticketIds } } },
      },
      select: {
        id: true,
        title: true,
        status: true,
        windowStart: true,
        windowEnd: true,
      },
      orderBy: { windowStart: 'asc' },
      take: 20,
    });

    return mudancas.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      windowStart: m.windowStart?.toISOString() ?? null,
      windowEnd: m.windowEnd?.toISOString() ?? null,
    }));
  }

  /** Reserva vigente ou futura: derrubar agora atropela alguém. */
  private async reservasVigentes(organizationId: string, assetIds: string[]) {
    const agora = new Date();

    const reservas = await this.prisma.assetReservation.findMany({
      where: {
        organizationId,
        assetId: { in: assetIds },
        canceledAt: null,
        endsAt: { gt: agora },
      },
      include: {
        asset: { select: { id: true, name: true, tag: true } },
        user: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 20,
    });

    return reservas.map((r) => ({
      id: r.id,
      asset: r.asset,
      user: { kind: 'USER' as const, id: r.user.id, name: r.user.name, email: r.user.email },
      createdBy: {
        kind: 'USER' as const,
        id: r.createdBy.id,
        name: r.createdBy.name,
        email: r.createdBy.email,
      },
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      purpose: r.purpose,
      canceledAt: null,
      canceledReason: null,
      holdingId: r.holdingId,
      situacao: (r.holdingId
        ? 'RETIRADA'
        : r.startsAt > agora
          ? 'FUTURA'
          : 'EM_CURSO') as 'RETIRADA' | 'FUTURA' | 'EM_CURSO',
    }));
  }
}

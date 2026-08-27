/* =========================================================
   LICITA+ API — Relatórios
   ---------------------------------------------------------
   Agregados que a tela de relatórios desenha. Tudo sai do que
   de fato existe no banco — nenhuma série é preenchida com
   número inventado para o gráfico não ficar vazio. Mês sem
   oportunidade aparece como zero, e a tela diz isso.

   As séries vêm por consulta agregada, não carregando as
   linhas para contar em memória: a lista de licitações cresce
   todo dia, e o relatório não pode crescer junto.
   ========================================================= */

import { Controller, Get } from '@nestjs/common';
import { Prisma } from '../../../gerado/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface LinhaMes {
  mes: Date;
  total: bigint;
}

@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async painel(@EmpresaId() empresaId: string) {
    const agora = new Date();
    const abertas = {
      empresaId,
      descartadaPor: null,
      licitacao: { encerramentoProposta: { gte: agora }, situacaoCodigo: 1 },
    };

    const [serieMensal, porEstado, porCategoria, participacoes, indicadores] = await Promise.all([
      this.serieMensal(empresaId),
      this.porEstado(empresaId),
      this.porCategoria(empresaId),
      this.participacoes(empresaId),
      this.indicadores(empresaId, abertas, agora),
    ]);

    return { serieMensal, porEstado, porCategoria, participacoes, indicadores };
  }

  /** Quantas oportunidades entraram por mês nos últimos 12 meses. */
  private async serieMensal(empresaId: string) {
    const linhas = await this.prisma.$queryRaw<LinhaMes[]>(Prisma.sql`
      SELECT date_trunc('month', l."vistaEm") AS mes, COUNT(*)::bigint AS total
      FROM "Avaliacao" a
      JOIN "Licitacao" l ON l.id = a."licitacaoId"
      WHERE a."empresaId" = ${empresaId}
        AND l."vistaEm" >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1
      ORDER BY 1
    `);

    const porMes = new Map(
      linhas.map((linha) => [chaveDeMes(new Date(linha.mes)), Number(linha.total)]),
    );

    // Doze posições sempre, inclusive as vazias: um gráfico que
    // omite o mês sem resultado sugere continuidade onde houve
    // interrupção.
    return ultimosDozeMeses().map((data) => ({
      rotulo: MESES[data.getMonth()],
      valor: porMes.get(chaveDeMes(data)) ?? 0,
    }));
  }

  private async porEstado(empresaId: string) {
    const grupos = await this.prisma.licitacao.groupBy({
      by: ['uf'],
      where: { avaliacoes: { some: { empresaId, descartadaPor: null } } },
      _count: { _all: true },
      orderBy: { _count: { uf: 'desc' } },
      take: 8,
    });

    return grupos.map((g) => ({ rotulo: g.uf, valor: g._count._all }));
  }

  /**
   * Por linha de fornecimento. `linhasAtendidas` é um array por
   * avaliação, e o Postgres não agrupa por elemento de array pelo
   * caminho do Prisma — então a contagem é feita aqui, sobre a
   * projeção mínima de uma coluna.
   */
  private async porCategoria(empresaId: string) {
    const avaliacoes = await this.prisma.avaliacao.findMany({
      where: {
        empresaId,
        descartadaPor: null,
        licitacao: { encerramentoProposta: { gte: new Date() } },
      },
      select: { linhasAtendidas: true },
    });

    const contagem = new Map<string, number>();
    for (const avaliacao of avaliacoes) {
      for (const linha of avaliacao.linhasAtendidas) {
        contagem.set(linha, (contagem.get(linha) ?? 0) + 1);
      }
    }

    return [...contagem.entries()]
      .map(([rotulo, valor]) => ({ rotulo, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }

  private async participacoes(empresaId: string) {
    const grupos = await this.prisma.participacao.groupBy({
      by: ['situacao'],
      where: { empresaId },
      _count: { _all: true },
      _sum: { valor: true },
    });

    const de = (situacao: string) => grupos.find((g) => g.situacao === situacao);
    const ganhas = de('ganha')?._count._all ?? 0;
    const perdidas = de('perdida')?._count._all ?? 0;
    const decididas = ganhas + perdidas;

    return {
      total: grupos.reduce((soma, g) => soma + g._count._all, 0),
      ganhas,
      perdidas,
      emAnalise: de('analise')?._count._all ?? 0,
      valorGanho: Number(de('ganha')?._sum.valor ?? 0),
      // `null` enquanto nada foi decidido — 0% diria que a empresa
      // perdeu tudo, que é outra afirmação.
      taxaVitoria: decididas === 0 ? null : Math.round((ganhas / decididas) * 100),
    };
  }

  private async indicadores(
    empresaId: string,
    abertas: Prisma.AvaliacaoWhereInput,
    agora: Date,
  ) {
    const [encontradas, altaCompatibilidade, novasHoje, soma] = await Promise.all([
      this.prisma.avaliacao.count({ where: abertas }),
      this.prisma.avaliacao.count({ where: { ...abertas, nota: { gte: 80 } } }),
      this.prisma.avaliacao.count({
        where: {
          ...abertas,
          licitacao: {
            encerramentoProposta: { gte: agora },
            situacaoCodigo: 1,
            vistaEm: { gte: new Date(agora.getTime() - 24 * 60 * 60 * 1000) },
          },
        },
      }),
      this.prisma.licitacao.aggregate({
        where: {
          avaliacoes: { some: { empresaId, descartadaPor: null } },
          encerramentoProposta: { gte: agora },
        },
        _sum: { valorEstimado: true },
      }),
    ]);

    return {
      encontradas,
      altaCompatibilidade,
      novasHoje,
      valorEstimado: Number(soma._sum.valorEstimado ?? 0),
    };
  }
}

const chaveDeMes = (data: Date): string => `${data.getUTCFullYear()}-${data.getUTCMonth()}`;

function ultimosDozeMeses(): Date[] {
  const agora = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const data = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 11 + i, 1));
    return data;
  });
}

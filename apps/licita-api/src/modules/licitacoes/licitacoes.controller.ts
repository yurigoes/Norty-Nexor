/* =========================================================
   LICITA+ API — Oportunidades
   ---------------------------------------------------------
   A listagem lê de `Avaliacao`, não de `Licitacao`. A nota já
   está calculada e indexada por `(empresaId, nota)`, então
   ordenar e paginar por compatibilidade acontece no banco.
   Calcular na leitura obrigaria a carregar tudo em memória a
   cada página.
   ========================================================= */

import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '../../../gerado/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';
import { serializarOportunidade } from './serializar';

class ListarDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() uf?: string;
  @IsOptional() @IsString() modalidade?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) valorMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) valorMax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) compatMin?: number;

  @IsOptional() @IsIn(['compatibilidade', 'prazo', 'valor-desc', 'valor-asc', 'recente'])
  ordem?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) tamanho?: number;
}

@Controller('oportunidades')
export class LicitacoesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(@EmpresaId() empresaId: string, @Query() query: ListarDto) {
    const pagina = query.pagina ?? 1;
    const tamanho = query.tamanho ?? 20;

    const licitacao: Prisma.LicitacaoWhereInput = {
      encerramentoProposta: { gte: new Date() },
      situacaoCodigo: 1,
      ...(query.uf ? { uf: query.uf.toUpperCase() } : {}),
      ...(query.modalidade ? { modalidadeCodigo: Number(query.modalidade) } : {}),
      ...(query.valorMin !== undefined || query.valorMax !== undefined
        ? {
            valorEstimado: {
              ...(query.valorMin !== undefined ? { gte: query.valorMin } : {}),
              ...(query.valorMax !== undefined ? { lte: query.valorMax } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { objeto: { contains: query.q, mode: 'insensitive' } },
              { orgaoRazaoSocial: { contains: query.q, mode: 'insensitive' } },
              { municipio: { contains: query.q, mode: 'insensitive' } },
              { numeroCompra: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const where: Prisma.AvaliacaoWhereInput = {
      empresaId,
      // Descartadas ficam guardadas para diagnóstico, mas não
      // entram na lista: descarte não é nota baixa.
      descartadaPor: null,
      ...(query.compatMin ? { nota: { gte: query.compatMin } } : {}),
      licitacao,
    };

    const [itens, total] = await Promise.all([
      this.prisma.avaliacao.findMany({
        where,
        orderBy: ordenar(query.ordem),
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        include: { licitacao: true },
      }),
      this.prisma.avaliacao.count({ where }),
    ]);

    const favoritos = await this.prisma.favorito.findMany({
      where: { empresaId, licitacaoId: { in: itens.map((i) => i.licitacaoId) } },
      select: { licitacaoId: true },
    });
    const marcados = new Set(favoritos.map((f) => f.licitacaoId));

    return {
      itens: itens.map((a) => serializarOportunidade(a, marcados.has(a.licitacaoId))),
      total,
      pagina,
      tamanho,
      totalPaginas: Math.max(1, Math.ceil(total / tamanho)),
    };
  }

  /** Resumo do painel: o que fecha logo e o que é mais aderente. */
  @Get('resumo')
  async resumo(@EmpresaId() empresaId: string) {
    const agora = new Date();
    const base = { empresaId, descartadaPor: null, licitacao: { encerramentoProposta: { gte: agora }, situacaoCodigo: 1 } };

    const [total, altaCompat, novasHoje] = await Promise.all([
      this.prisma.avaliacao.count({ where: base }),
      this.prisma.avaliacao.count({ where: { ...base, nota: { gte: 80 } } }),
      this.prisma.avaliacao.count({
        where: {
          ...base,
          licitacao: {
            ...base.licitacao,
            vistaEm: { gte: new Date(agora.getTime() - 24 * 60 * 60 * 1000) },
          },
        },
      }),
    ]);

    // A soma de valores vem por consulta própria: agregar Decimal
    // pela relação exigiria join manual, e o total cabe numa
    // consulta simples sobre as licitações avaliadas.
    const somaValor = await this.prisma.licitacao.aggregate({
      where: { avaliacoes: { some: { empresaId, descartadaPor: null } }, encerramentoProposta: { gte: agora } },
      _sum: { valorEstimado: true },
    });

    return {
      encontradas: total,
      altaCompatibilidade: altaCompat,
      valorEstimado: Number(somaValor._sum.valorEstimado ?? 0),
      novasHoje,
      descartadas: await this.prisma.avaliacao.count({
        where: { empresaId, descartadaPor: { not: null } },
      }),
    };
  }

  @Get(':id')
  async detalhe(@EmpresaId() empresaId: string, @Param('id') id: string) {
    const avaliacao = await this.prisma.avaliacao.findFirst({
      where: { empresaId, licitacao: { OR: [{ id }, { numeroControlePncp: id }] } },
      include: { licitacao: { include: { itens: { orderBy: { numero: 'asc' } } } } },
    });

    if (!avaliacao) throw new NotFoundException('Oportunidade não encontrada.');

    const favorito = await this.prisma.favorito.findFirst({
      where: { empresaId, licitacaoId: avaliacao.licitacaoId },
      select: { id: true },
    });

    return {
      ...serializarOportunidade(avaliacao, Boolean(favorito)),
      itens: avaliacao.licitacao.itens.map((i) => ({
        ...i,
        quantidade: Number(i.quantidade),
        valorUnitario: i.valorUnitario === null ? null : Number(i.valorUnitario),
      })),
    };
  }
}

function ordenar(ordem?: string): Prisma.AvaliacaoOrderByWithRelationInput[] {
  switch (ordem) {
    case 'prazo':
      return [{ licitacao: { encerramentoProposta: 'asc' } }];
    case 'valor-desc':
      return [{ licitacao: { valorEstimado: 'desc' } }];
    case 'valor-asc':
      return [{ licitacao: { valorEstimado: 'asc' } }];
    case 'recente':
      return [{ licitacao: { publicacaoPncp: 'desc' } }];
    default:
      // Nota manda; entre iguais, o que fecha antes vem antes —
      // é o que se perde se ficar para amanhã.
      return [{ nota: 'desc' }, { licitacao: { encerramentoProposta: 'asc' } }];
  }
}

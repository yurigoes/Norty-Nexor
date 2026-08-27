/* =========================================================
   LICITA+ API — Participações
   ---------------------------------------------------------
   Histórico do que a empresa disputou. Alimentado à mão por
   enquanto: o resultado de um certame aparece no PNCP com atraso
   e nem sempre de forma legível por máquina, então inventar um
   número automático seria pior que registrar o real.
   ========================================================= */

import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';

const SITUACOES = ['analise', 'ganha', 'perdida', 'desistiu'] as const;

class ParticipacaoDto {
  @IsString() @MaxLength(300) descricao!: string;
  @IsString() @MaxLength(200) orgao!: string;
  @IsOptional() @IsNumber() @Min(0) valor?: number;
  @IsOptional() @IsIn(SITUACOES) situacao?: (typeof SITUACOES)[number];
  @IsOptional() @IsDateString() data?: string;
  @IsOptional() @IsString() @MaxLength(500) observacao?: string;
  @IsOptional() @IsString() licitacaoId?: string;
}

@Controller('participacoes')
export class ParticipacoesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(@EmpresaId() empresaId: string) {
    const itens = await this.prisma.participacao.findMany({
      where: { empresaId },
      orderBy: { data: 'desc' },
    });

    const ganhas = itens.filter((p) => p.situacao === 'ganha');
    const perdidas = itens.filter((p) => p.situacao === 'perdida');
    const decididas = ganhas.length + perdidas.length;

    return {
      itens: itens.map((p) => ({ ...p, valor: p.valor === null ? null : Number(p.valor) })),
      resumo: {
        total: itens.length,
        ganhas: ganhas.length,
        perdidas: perdidas.length,
        emAnalise: itens.filter((p) => p.situacao === 'analise').length,
        valorGanho: ganhas.reduce((soma, p) => soma + Number(p.valor ?? 0), 0),
        // Sem certame decidido não há taxa: devolver 0% sugeriria
        // que a empresa perdeu tudo, o que é diferente de ainda
        // não ter resultado.
        taxaVitoria: decididas === 0 ? null : Math.round((ganhas.length / decididas) * 100),
      },
    };
  }

  @Post()
  async criar(@EmpresaId() empresaId: string, @Body() dto: ParticipacaoDto) {
    const criada = await this.prisma.participacao.create({
      data: {
        empresaId,
        descricao: dto.descricao.trim(),
        orgao: dto.orgao.trim(),
        valor: dto.valor ?? null,
        situacao: dto.situacao ?? 'analise',
        data: dto.data ? new Date(dto.data) : new Date(),
        observacao: dto.observacao ?? null,
        licitacaoId: dto.licitacaoId ?? null,
      },
    });
    return { ...criada, valor: criada.valor === null ? null : Number(criada.valor) };
  }

  @Put(':id')
  async atualizar(@EmpresaId() empresaId: string, @Param('id') id: string, @Body() dto: ParticipacaoDto) {
    const { count } = await this.prisma.participacao.updateMany({
      where: { id, empresaId },
      data: {
        descricao: dto.descricao.trim(),
        orgao: dto.orgao.trim(),
        valor: dto.valor ?? null,
        situacao: dto.situacao ?? 'analise',
        ...(dto.data ? { data: new Date(dto.data) } : {}),
        observacao: dto.observacao ?? null,
      },
    });

    if (count === 0) throw new NotFoundException('Participação não encontrada.');
    return this.prisma.participacao.findUniqueOrThrow({ where: { id } });
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(@EmpresaId() empresaId: string, @Param('id') id: string) {
    await this.prisma.participacao.deleteMany({ where: { id, empresaId } });
  }
}

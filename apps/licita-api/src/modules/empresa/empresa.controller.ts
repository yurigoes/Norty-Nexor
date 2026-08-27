/* =========================================================
   LICITA+ API — Perfil da empresa
   ---------------------------------------------------------
   O perfil é o insumo da triagem: mudar uma linha de
   fornecimento muda a nota de todas as licitações abertas. Por
   isso toda escrita aqui marca as avaliações para recálculo, em
   vez de deixar a lista mostrando notas de um perfil que já não
   existe.
   ========================================================= */

import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';

class LinhaDto {
  @IsString() @MaxLength(80) nome!: string;
  @IsArray() @IsString({ each: true }) palavrasChave!: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) palavrasExcluidas?: string[];
}

class PerfilDto {
  @IsOptional() @IsString() @MaxLength(200) razaoSocial?: string;
  @IsOptional() @IsString() @MaxLength(120) nomeFantasia?: string;
  @IsOptional() @IsString() @MaxLength(4) porte?: string;
  @IsOptional() @IsString() @MaxLength(120) municipio?: string;
  @IsOptional() @IsString() @Matches(/^\d{7}$/, { message: 'Código IBGE deve ter 7 dígitos.' })
  municipioIbge?: string;
  @IsOptional() @IsString() @Length(2, 2) uf?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) municipiosRegiao?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estadosAtuacao?: string[];

  @IsOptional() @IsNumber() @Min(0) valorMinimo?: number;
  @IsOptional() @IsNumber() @Min(0) valorMaximo?: number;

  @IsOptional() @IsArray() @IsInt({ each: true }) modalidades?: number[];
  @IsOptional() @IsInt() @Min(1) @Max(30) diasMinimosPreparo?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LinhaDto)
  linhas?: LinhaDto[];
}

@Controller('empresa')
export class EmpresaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async obter(@EmpresaId() empresaId: string) {
    const empresa = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      include: { linhas: { orderBy: { criadaEm: 'asc' } } },
    });

    return { ...serializar(empresa), completude: completude(empresa) };
  }

  /**
   * Municípios disponíveis para escolher no perfil. Vêm do que já
   * foi ingerido, não de uma tabela do IBGE embarcada: a lista
   * relevante é a dos municípios que de fato publicam licitação na
   * região, e ela se mantém sozinha a cada varredura.
   */
  @Get('municipios')
  async municipios(@Query('uf') uf?: string) {
    const linhas = await this.prisma.licitacao.findMany({
      where: { ...(uf ? { uf: uf.toUpperCase() } : {}), municipioIbge: { not: null } },
      select: { municipio: true, municipioIbge: true, uf: true },
      distinct: ['municipioIbge'],
      orderBy: { municipio: 'asc' },
      take: 600,
    });

    return linhas.map((l) => ({ nome: l.municipio, ibge: l.municipioIbge, uf: l.uf }));
  }

  @Put()
  async atualizar(@EmpresaId() empresaId: string, @Body() dto: PerfilDto) {
    const { linhas, ...campos } = dto;

    const empresa = await this.prisma.$transaction(async (tx) => {
      if (linhas) {
        // Substituição inteira em vez de diferença campo a campo:
        // a lista é curta, e reconciliar por id traria um problema
        // de identidade que o usuário não tem como resolver na tela.
        await tx.linhaFornecimento.deleteMany({ where: { empresaId } });
        await tx.linhaFornecimento.createMany({
          data: linhas.map((l) => ({
            empresaId,
            nome: l.nome.trim(),
            palavrasChave: l.palavrasChave.map((p) => p.trim()).filter(Boolean),
            palavrasExcluidas: (l.palavrasExcluidas ?? []).map((p) => p.trim()).filter(Boolean),
          })),
        });
      }

      // O perfil mudou: as notas guardadas viraram passado. Apagar
      // força o recálculo na próxima varredura, em vez de exibir
      // compatibilidade de um perfil que já não vale.
      await tx.avaliacao.deleteMany({ where: { empresaId } });

      return tx.empresa.update({
        where: { id: empresaId },
        data: {
          ...campos,
          porte: campos.porte as never,
        },
        include: { linhas: { orderBy: { criadaEm: 'asc' } } },
      });
    });

    return { ...serializar(empresa), completude: completude(empresa) };
  }
}

/** Decimal do Prisma vira number uma única vez, aqui na fronteira. */
function serializar(empresa: Record<string, unknown>) {
  return {
    ...empresa,
    valorMinimo: Number(empresa.valorMinimo),
    valorMaximo: Number(empresa.valorMaximo),
  };
}

/**
 * Quanto do perfil está preenchido. É o número que a tela usa
 * para justificar o pedido de completar — e ele só convence se
 * refletir o que de fato melhora a recomendação.
 */
function completude(empresa: {
  razaoSocial: string;
  municipioIbge: string | null;
  municipiosRegiao: string[];
  estadosAtuacao: string[];
  modalidades: number[];
  linhas: unknown[];
}): number {
  const criterios = [
    Boolean(empresa.razaoSocial),
    Boolean(empresa.municipioIbge),
    empresa.municipiosRegiao.length > 0,
    empresa.estadosAtuacao.length > 0,
    empresa.modalidades.length > 0,
    empresa.linhas.length > 0,
    empresa.linhas.length > 1,
  ];
  return Math.round((criterios.filter(Boolean).length / criterios.length) * 100);
}

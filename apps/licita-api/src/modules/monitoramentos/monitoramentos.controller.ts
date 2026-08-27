/* =========================================================
   LICITA+ API — Monitoramentos
   ---------------------------------------------------------
   Uma busca salva que trabalha sozinha. O que a tela precisa
   saber não é quantas oportunidades existem, e sim quantas
   chegaram desde a última visita — por isso `ultimaVarreduraEm`
   é marca d'água, e não um contador que alguém teria de zerar.
   ========================================================= */

import {
  Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put,
} from '@nestjs/common';
import {
  IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';

class MonitoramentoDto {
  @IsString() @MaxLength(120) nome!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) termos?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estados?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) municipios?: string[];
  @IsOptional() @IsArray() @IsInt({ each: true }) modalidades?: number[];
  @IsOptional() @IsNumber() @Min(0) valorMinimo?: number;
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsBoolean() alertaEmail?: boolean;
}

@Controller('monitoramentos')
export class MonitoramentosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(@EmpresaId() empresaId: string) {
    const monitoramentos = await this.prisma.monitoramento.findMany({
      where: { empresaId },
      orderBy: { criadoEm: 'asc' },
    });

    // Contagem por monitoramento numa consulta cada. São poucos
    // por empresa; agrupar num SQL só complicaria mais do que
    // economizaria.
    return Promise.all(
      monitoramentos.map(async (m) => {
        const desde = m.ultimaVarreduraEm ?? m.criadoEm;

        const [total, novas] = await Promise.all([
          this.contar(empresaId, m, null),
          this.contar(empresaId, m, desde),
        ]);

        return {
          ...m,
          valorMinimo: m.valorMinimo === null ? null : Number(m.valorMinimo),
          total,
          novas,
        };
      }),
    );
  }

  @Post()
  async criar(@EmpresaId() empresaId: string, @Body() dto: MonitoramentoDto) {
    const criado = await this.prisma.monitoramento.create({
      data: { empresaId, ...normalizar(dto) },
    });
    return { ...criado, valorMinimo: criado.valorMinimo === null ? null : Number(criado.valorMinimo) };
  }

  @Put(':id')
  async atualizar(
    @EmpresaId() empresaId: string,
    @Param('id') id: string,
    @Body() dto: MonitoramentoDto,
  ) {
    // `updateMany` com empresaId no `where` em vez de `update` por
    // id: assim um id de outra empresa não atualiza nada, em vez de
    // atualizar o registro alheio.
    const { count } = await this.prisma.monitoramento.updateMany({
      where: { id, empresaId },
      data: normalizar(dto),
    });

    if (count === 0) throw new NotFoundException('Monitoramento não encontrado.');
    return this.prisma.monitoramento.findUniqueOrThrow({ where: { id } });
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(@EmpresaId() empresaId: string, @Param('id') id: string) {
    await this.prisma.monitoramento.deleteMany({ where: { id, empresaId } });
  }

  /** Marca tudo como visto: zera o "novas" da próxima leitura. */
  @Post(':id/visto')
  @HttpCode(200)
  async marcarVisto(@EmpresaId() empresaId: string, @Param('id') id: string) {
    await this.prisma.monitoramento.updateMany({
      where: { id, empresaId },
      data: { ultimaVarreduraEm: new Date() },
    });
    return { ok: true };
  }

  /**
   * Quantas oportunidades avaliadas batem com os critérios do
   * monitoramento. `desde` restringe ao que apareceu depois da
   * marca d'água.
   */
  private contar(
    empresaId: string,
    m: { termos: string[]; estados: string[]; municipios: string[]; modalidades: number[]; valorMinimo: unknown },
    desde: Date | null,
  ): Promise<number> {
    return this.prisma.avaliacao.count({
      where: {
        empresaId,
        descartadaPor: null,
        licitacao: {
          encerramentoProposta: { gte: new Date() },
          situacaoCodigo: 1,
          ...(desde ? { vistaEm: { gte: desde } } : {}),
          ...(m.estados.length ? { uf: { in: m.estados } } : {}),
          ...(m.municipios.length ? { municipio: { in: m.municipios } } : {}),
          ...(m.modalidades.length ? { modalidadeCodigo: { in: m.modalidades } } : {}),
          ...(m.valorMinimo !== null ? { valorEstimado: { gte: Number(m.valorMinimo) } } : {}),
          ...(m.termos.length
            ? { OR: m.termos.map((t) => ({ objeto: { contains: t, mode: 'insensitive' as const } })) }
            : {}),
        },
      },
    });
  }
}

function normalizar(dto: MonitoramentoDto) {
  return {
    nome: dto.nome.trim(),
    termos: (dto.termos ?? []).map((t) => t.trim()).filter(Boolean),
    estados: (dto.estados ?? []).map((e) => e.trim().toUpperCase()).filter(Boolean),
    municipios: (dto.municipios ?? []).map((m) => m.trim()).filter(Boolean),
    modalidades: dto.modalidades ?? [],
    valorMinimo: dto.valorMinimo ?? null,
    ativo: dto.ativo ?? true,
    alertaEmail: dto.alertaEmail ?? true,
  };
}

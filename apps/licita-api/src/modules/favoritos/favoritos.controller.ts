import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';

class FavoritarDto {
  @IsOptional() @IsString() @MaxLength(400) nota?: string;
}

@Controller('favoritos')
export class FavoritosController {
  constructor(private readonly prisma: PrismaService) {}

  /** Ordenado por prazo: aqui o que importa é o que vence antes. */
  @Get()
  async listar(@EmpresaId() empresaId: string) {
    const favoritos = await this.prisma.favorito.findMany({
      where: { empresaId },
      include: { licitacao: true },
      orderBy: { licitacao: { encerramentoProposta: 'asc' } },
    });

    const avaliacoes = await this.prisma.avaliacao.findMany({
      where: { empresaId, licitacaoId: { in: favoritos.map((f) => f.licitacaoId) } },
      select: { licitacaoId: true, nota: true, alertas: true, linhasAtendidas: true },
    });
    const porLicitacao = new Map(avaliacoes.map((a) => [a.licitacaoId, a]));

    return favoritos.map((f) => ({
      id: f.licitacao.id,
      objeto: f.licitacao.objeto,
      orgao: {
        razaoSocial: f.licitacao.orgaoRazaoSocial,
        municipio: f.licitacao.municipio,
        uf: f.licitacao.uf,
      },
      modalidadeCodigo: f.licitacao.modalidadeCodigo,
      valorEstimado: f.licitacao.valorEstimado === null ? null : Number(f.licitacao.valorEstimado),
      encerramentoProposta: f.licitacao.encerramentoProposta,
      linkPncp: f.licitacao.linkPncp,
      compatibilidade: porLicitacao.get(f.licitacaoId)?.nota ?? 0,
      alertas: porLicitacao.get(f.licitacaoId)?.alertas ?? [],
      linhasAtendidas: porLicitacao.get(f.licitacaoId)?.linhasAtendidas ?? [],
      favorito: true,
      anotacao: f.nota,
    }));
  }

  /**
   * `PUT` em vez de `POST`: favoritar é idempotente — favoritar
   * duas vezes é a mesma coisa que favoritar uma. O `upsert`
   * apoia-se no `@@unique([empresaId, licitacaoId])` do schema,
   * porque duas requisições simultâneas passariam juntas por uma
   * checagem feita só na aplicação.
   */
  @Put(':licitacaoId')
  async favoritar(
    @EmpresaId() empresaId: string,
    @Param('licitacaoId') licitacaoId: string,
    @Body() dto: FavoritarDto,
  ) {
    await this.prisma.favorito.upsert({
      where: { empresaId_licitacaoId: { empresaId, licitacaoId } },
      create: { empresaId, licitacaoId, nota: dto.nota ?? null },
      update: { nota: dto.nota ?? null },
    });

    return { favorito: true };
  }

  @Delete(':licitacaoId')
  @HttpCode(200)
  async remover(@EmpresaId() empresaId: string, @Param('licitacaoId') licitacaoId: string) {
    // `deleteMany` não reclama quando não há o que apagar —
    // desfavoritar algo que já não é favorito é sucesso.
    await this.prisma.favorito.deleteMany({ where: { empresaId, licitacaoId } });
    return { favorito: false };
  }
}

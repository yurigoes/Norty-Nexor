import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmpresaId } from '../../common/decorators';
import { serializarOportunidade, semAvaliacao } from '../licitacoes/serializar';

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
      select: { licitacaoId: true, nota: true, motivos: true, alertas: true, linhasAtendidas: true },
    });
    const porLicitacao = new Map(avaliacoes.map((a) => [a.licitacaoId, a]));

    // Mesma forma da lista de oportunidades: o cliente não deve
    // precisar conhecer dois formatos do mesmo objeto.
    const itens = favoritos.map((f) => {
      const avaliacao = porLicitacao.get(f.licitacaoId);
      const base = avaliacao
        ? { ...avaliacao, licitacao: f.licitacao as unknown as Record<string, unknown> }
        : semAvaliacao(f.licitacao as unknown as Record<string, unknown>);

      return { ...serializarOportunidade(base, true), anotacao: f.nota };
    });

    return { itens, total: itens.length };
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

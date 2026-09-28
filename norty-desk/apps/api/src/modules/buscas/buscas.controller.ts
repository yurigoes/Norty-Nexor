import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { BuscaSalvaView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BuscasSalvasService } from './buscas.service';
import { AtualizarBuscaSalvaDto, CriarBuscaSalvaDto, ReordenarBuscasDto } from './dto';

/**
 * As buscas salvas de quem está pedindo — sempre as próprias.
 *
 * Não há endpoint para ler a busca de outra pessoa, e não é esquecimento:
 * a busca salva é preferência de tela de quem a salvou. Quem quiser
 * passar um filtro ao colega manda o link da fila, que é o que o filtro
 * na URL já permite.
 *
 * A permissão é `chamado:ler:proprios`, a mesma da fila. Um filtro da
 * fila não pode exigir mais que a fila — e não concede nada: o escopo de
 * leitura é aplicado depois, sobre o filtro.
 */
@Controller('saved-searches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BuscasSalvasController {
  constructor(private readonly buscas: BuscasSalvasService) {}

  @Get()
  @RequirePermission('chamado:ler:proprios')
  listar(@CurrentUser() usuario: UsuarioAutenticado): Promise<BuscaSalvaView[]> {
    return this.buscas.listar(usuario);
  }

  @Post()
  @RequirePermission('chamado:ler:proprios')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CriarBuscaSalvaDto,
  ): Promise<BuscaSalvaView[]> {
    return this.buscas.criar(usuario, dto);
  }

  /** A ordem vem antes de `:id` — senão "ordem" seria lido como um id. */
  @Put('ordem')
  @RequirePermission('chamado:ler:proprios')
  reordenar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: ReordenarBuscasDto,
  ): Promise<BuscaSalvaView[]> {
    return this.buscas.reordenar(usuario, dto.ids);
  }

  @Patch(':id')
  @RequirePermission('chamado:ler:proprios')
  atualizar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarBuscaSalvaDto,
  ): Promise<BuscaSalvaView[]> {
    return this.buscas.atualizar(usuario, id, dto);
  }

  @Delete(':id')
  @RequirePermission('chamado:ler:proprios')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BuscaSalvaView[]> {
    return this.buscas.remover(usuario, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AssetView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AtivosService } from './ativos.service';
import { BuscarAtivosDto, EditarAtivoDto, EscreverAtivoDto, VincularAtivoDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AtivosController {
  constructor(private readonly ativos: AtivosService) {}

  @Get('assets')
  @RequirePermission('ativo:ler')
  buscar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarAtivosDto,
  ): Promise<AssetView[]> {
    return this.ativos.buscar(usuario, filtro);
  }

  @Get('assets/:id')
  @RequirePermission('ativo:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetView> {
    return this.ativos.obter(usuario, id);
  }

  /** O histórico do equipamento — "essa máquina dá problema?". */
  @Get('assets/:id/chamados')
  @RequirePermission('ativo:ler')
  chamados(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ativos.chamadosDoAtivo(usuario, id);
  }

  @Post('assets')
  @RequirePermission('ativo:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverAtivoDto,
  ): Promise<AssetView> {
    return this.ativos.criar(usuario, dto);
  }

  @Patch('assets/:id')
  @RequirePermission('ativo:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarAtivoDto,
  ): Promise<AssetView> {
    return this.ativos.editar(usuario, id, dto);
  }

  // --- Vínculo com o chamado ------------------------------------------

  @Get('tickets/:id/ativos')
  @RequirePermission('ativo:ler')
  doChamado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetView[]> {
    return this.ativos.doChamado(usuario, id);
  }

  /**
   * Vincular é `ativo:ler`, não `ativo:gerenciar`.
   *
   * Quem atende precisa dizer qual máquina é; mudar o cadastro do
   * equipamento é outra conversa.
   */
  @Post('tickets/:id/ativos')
  @RequirePermission('ativo:ler')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularAtivoDto,
  ): Promise<AssetView[]> {
    return this.ativos.vincular(usuario, id, dto.assetId);
  }

  @Delete('tickets/:id/ativos/:assetId')
  @RequirePermission('ativo:ler')
  desvincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<AssetView[]> {
    return this.ativos.desvincular(usuario, id, assetId);
  }
}

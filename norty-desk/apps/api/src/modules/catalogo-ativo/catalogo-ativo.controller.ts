import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { FabricanteView, LocalizacaoView, ModeloDeAtivoView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CatalogoDoAtivoService } from './catalogo-ativo.service';
import {
  EscreverFabricanteDto,
  EscreverLocalizacaoDto,
  EscreverModeloDeAtivoDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogoDoAtivoController {
  constructor(private readonly catalogo: CatalogoDoAtivoService) {}

  /**
   * Ler o catálogo é `ativo:ler`: quem cadastra o ativo precisa das
   * opções. Mexer nele é `ativo:catalogo`.
   */
  @Get('locations')
  @RequirePermission('ativo:ler')
  localizacoes(@CurrentUser() usuario: UsuarioAutenticado): Promise<LocalizacaoView[]> {
    return this.catalogo.localizacoes(usuario);
  }

  @Post('locations')
  @RequirePermission('ativo:catalogo')
  criarLocalizacao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverLocalizacaoDto,
  ): Promise<LocalizacaoView[]> {
    return this.catalogo.criarLocalizacao(usuario, dto);
  }

  @Patch('locations/:id')
  @RequirePermission('ativo:catalogo')
  editarLocalizacao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverLocalizacaoDto,
  ): Promise<LocalizacaoView[]> {
    return this.catalogo.editarLocalizacao(usuario, id, dto);
  }

  @Delete('locations/:id')
  @RequirePermission('ativo:catalogo')
  removerLocalizacao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocalizacaoView[]> {
    return this.catalogo.removerLocalizacao(usuario, id);
  }

  @Get('manufacturers')
  @RequirePermission('ativo:ler')
  fabricantes(@CurrentUser() usuario: UsuarioAutenticado): Promise<FabricanteView[]> {
    return this.catalogo.fabricantes(usuario);
  }

  @Post('manufacturers')
  @RequirePermission('ativo:catalogo')
  criarFabricante(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverFabricanteDto,
  ): Promise<FabricanteView[]> {
    return this.catalogo.criarFabricante(usuario, dto);
  }

  @Patch('manufacturers/:id')
  @RequirePermission('ativo:catalogo')
  editarFabricante(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverFabricanteDto,
  ): Promise<FabricanteView[]> {
    return this.catalogo.editarFabricante(usuario, id, dto);
  }

  @Delete('manufacturers/:id')
  @RequirePermission('ativo:catalogo')
  removerFabricante(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FabricanteView[]> {
    return this.catalogo.removerFabricante(usuario, id);
  }

  @Get('asset-models')
  @RequirePermission('ativo:ler')
  modelos(@CurrentUser() usuario: UsuarioAutenticado): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.modelos(usuario);
  }

  @Post('asset-models')
  @RequirePermission('ativo:catalogo')
  criarModelo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverModeloDeAtivoDto,
  ): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.criarModelo(usuario, dto);
  }

  @Patch('asset-models/:id')
  @RequirePermission('ativo:catalogo')
  editarModelo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverModeloDeAtivoDto,
  ): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.editarModelo(usuario, id, dto);
  }

  @Delete('asset-models/:id')
  @RequirePermission('ativo:catalogo')
  removerModelo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.removerModelo(usuario, id);
  }
}

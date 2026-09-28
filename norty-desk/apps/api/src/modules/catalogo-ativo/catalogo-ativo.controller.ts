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
import type {
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
  ReclassificacaoView,
  RegraDeSistemaView,
  SistemasDoParqueView,
} from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CatalogoDoAtivoService } from './catalogo-ativo.service';
import {
  ApelidarFabricanteDto,
  ApelidarModeloDto,
  EscreverFabricanteDto,
  JuntarCadastrosDto,
  EscreverLocalizacaoDto,
  EscreverModeloDeAtivoDto,
  EscreverRegraDeSistemaDto,
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

  /**
   * O apelido, a remoção dele e a junção de dois cadastros.
   *
   * Os três vivem sob `ativo:catalogo` e não sob `ativo:gerenciar`:
   * quem mexe no dicionário está editando o catálogo da casa, não o
   * equipamento de alguém. A junção em especial mexe em tudo o que
   * apontava para o cadastro absorvido — é operação de curadoria.
   */
  @Post('manufacturers/:id/apelidos')
  @RequirePermission('ativo:catalogo')
  apelidar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApelidarFabricanteDto,
  ): Promise<FabricanteView[]> {
    return this.catalogo.apelidar(usuario, id, dto.alias);
  }

  @Delete('manufacturers/:id/apelidos/:aliasId')
  @RequirePermission('ativo:catalogo')
  removerApelido(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ): Promise<FabricanteView[]> {
    return this.catalogo.removerApelido(usuario, id, aliasId);
  }

  @Post('manufacturers/:id/juntar')
  @RequirePermission('ativo:catalogo')
  juntar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JuntarCadastrosDto,
  ): Promise<FabricanteView[]> {
    return this.catalogo.juntarFabricantes(usuario, id, dto.absorvidoId);
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

  @Post('asset-models/:id/apelidos')
  @RequirePermission('ativo:catalogo')
  apelidarModelo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApelidarModeloDto,
  ): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.apelidarModelo(usuario, id, dto.alias);
  }

  @Delete('asset-models/:id/apelidos/:aliasId')
  @RequirePermission('ativo:catalogo')
  removerApelidoDeModelo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.removerApelidoDeModelo(usuario, id, aliasId);
  }

  @Post('asset-models/:id/juntar')
  @RequirePermission('ativo:catalogo')
  juntarModelos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JuntarCadastrosDto,
  ): Promise<ModeloDeAtivoView[]> {
    return this.catalogo.juntarModelos(usuario, id, dto.absorvidoId);
  }

  // -----------------------------------------------------------------
  // Dicionário de sistema operacional
  // -----------------------------------------------------------------

  /**
   * O parque visto pelo SO. Leitura, e por isso `ativo:ler`: é a mesma
   * pergunta que o relatório faz, e quem lê o inventário pode fazê-la.
   */
  @Get('operating-systems')
  @RequirePermission('ativo:ler')
  sistemas(@CurrentUser() usuario: UsuarioAutenticado): Promise<SistemasDoParqueView> {
    return this.catalogo.sistemasDoParque(usuario);
  }

  @Get('operating-systems/regras')
  @RequirePermission('ativo:ler')
  regrasDeSistema(@CurrentUser() usuario: UsuarioAutenticado): Promise<RegraDeSistemaView[]> {
    return this.catalogo.regrasDeSistema(usuario);
  }

  /** Cria ou corrige — a chave é o caption normalizado, então é `upsert`. */
  @Post('operating-systems/regras')
  @RequirePermission('ativo:catalogo')
  escreverRegraDeSistema(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverRegraDeSistemaDto,
  ): Promise<RegraDeSistemaView[]> {
    return this.catalogo.escreverRegraDeSistema(usuario, dto);
  }

  @Delete('operating-systems/regras/:id')
  @RequirePermission('ativo:catalogo')
  removerRegraDeSistema(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RegraDeSistemaView[]> {
    return this.catalogo.removerRegraDeSistema(usuario, id);
  }

  @Post('operating-systems/reclassificar')
  @RequirePermission('ativo:catalogo')
  reclassificarSistemas(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ReclassificacaoView> {
    return this.catalogo.reclassificarSistemas(usuario);
  }
}

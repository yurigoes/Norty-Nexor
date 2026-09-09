import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CatalogoService } from './catalogo.service';
import {
  CriarCategoriaDto,
  CriarChaveDto,
  CriarTimeDto,
  CriarUsuarioDto,
  EditarCategoriaDto,
  EditarTimeDto,
  EditarUsuarioDto,
  FiltroUsuarioDto,
  MembroDoTimeDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  // --- Categorias ---------------------------------------------------
  //
  // A leitura não exige permissão de configuração: quem abre chamado
  // precisa escolher a categoria. Escrever, sim.

  @Get('categories')
  @RequirePermission('chamado:criar')
  categorias(@CurrentUser() usuario: UsuarioAutenticado, @Query('todas') todas?: string) {
    return this.catalogo.categorias(usuario, todas === 'true');
  }

  @Post('categories')
  @RequirePermission('config:categorias')
  criarCategoria(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarCategoriaDto) {
    return this.catalogo.criarCategoria(usuario, dto);
  }

  @Patch('categories/:id')
  @RequirePermission('config:categorias')
  editarCategoria(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarCategoriaDto,
  ) {
    return this.catalogo.editarCategoria(usuario, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermission('config:categorias')
  desativarCategoria(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogo.desativarCategoria(usuario, id);
  }

  // --- Times --------------------------------------------------------

  @Get('teams')
  @RequirePermission('pessoa:ler')
  times(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.catalogo.times(usuario);
  }

  @Post('teams')
  @RequirePermission('time:gerenciar')
  criarTime(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarTimeDto) {
    return this.catalogo.criarTime(usuario, dto);
  }

  @Patch('teams/:id')
  @RequirePermission('time:gerenciar')
  editarTime(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarTimeDto,
  ) {
    return this.catalogo.editarTime(usuario, id, dto);
  }

  @Post('teams/:id/membros')
  @RequirePermission('time:gerenciar')
  adicionarMembro(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MembroDoTimeDto,
  ) {
    return this.catalogo.adicionarMembro(usuario, id, dto.userId, dto.isManager);
  }

  @Delete('teams/:id/membros/:userId')
  @RequirePermission('time:gerenciar')
  removerMembro(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.catalogo.removerMembro(usuario, id, userId);
  }

  // --- Chaves de aplicação -------------------------------------------

  @Get('api-keys')
  @RequirePermission('config:chaves-api')
  chaves(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.catalogo.chaves(usuario);
  }

  @Post('api-keys')
  @RequirePermission('config:chaves-api')
  criarChave(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarChaveDto) {
    return this.catalogo.criarChave(usuario, dto);
  }

  @Delete('api-keys/:id')
  @HttpCode(204)
  @RequirePermission('config:chaves-api')
  revogarChave(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogo.revogarChave(usuario, id);
  }

  // --- Pessoas ------------------------------------------------------

  @Get('users')
  @RequirePermission('pessoa:ler')
  usuarios(@CurrentUser() usuario: UsuarioAutenticado, @Query() filtro: FiltroUsuarioDto) {
    return this.catalogo.usuarios(usuario, filtro);
  }

  @Post('users')
  @RequirePermission('pessoa:gerenciar')
  criarUsuario(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarUsuarioDto) {
    return this.catalogo.criarUsuario(usuario, dto);
  }

  @Patch('users/:id')
  @RequirePermission('pessoa:gerenciar')
  editarUsuario(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarUsuarioDto,
  ) {
    return this.catalogo.editarUsuario(usuario, id, dto);
  }
}

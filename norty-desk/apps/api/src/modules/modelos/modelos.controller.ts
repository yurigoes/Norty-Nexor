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
import type { ModeloView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BuscarModelosDto, EditarModeloDto, EscreverModeloDto } from './dto';
import { ModelosService } from './modelos.service';

@Controller('modelos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModelosController {
  constructor(private readonly modelos: ModelosService) {}

  /**
   * Listar é `chamado:responder`, não `config:modelos`.
   *
   * Modelo existe para ser usado por quem atende; exigir a permissão de
   * configuração para *ler* a lista deixaria o recurso inalcançável de
   * dentro da tela do chamado, que é onde ele serve.
   */
  @Get()
  @RequirePermission('chamado:responder')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarModelosDto,
  ): Promise<ModeloView[]> {
    return this.modelos.listar(usuario, filtro);
  }

  @Post()
  @RequirePermission('config:modelos')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverModeloDto,
  ): Promise<ModeloView> {
    return this.modelos.criar(usuario, dto);
  }

  @Patch(':id')
  @RequirePermission('config:modelos')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarModeloDto,
  ): Promise<ModeloView> {
    return this.modelos.editar(usuario, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('config:modelos')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.modelos.remover(usuario, id);
  }

  /** Conta o uso. É o que faz a lista se ordenar sozinha pelo que serve. */
  @Post(':id/uso')
  @HttpCode(204)
  @RequirePermission('chamado:responder')
  registrarUso(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.modelos.registrarUso(usuario, id);
  }
}

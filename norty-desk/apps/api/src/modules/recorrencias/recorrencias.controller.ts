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
  UseGuards,
} from '@nestjs/common';
import type { RecorrenciaView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EditarRecorrenciaDto, EscreverRecorrenciaDto } from './dto';
import { RecorrenciasService } from './recorrencias.service';

@Controller('recorrencias')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecorrenciasController {
  constructor(private readonly recorrencias: RecorrenciasService) {}

  @Get()
  @RequirePermission('config:recorrencia')
  listar(@CurrentUser() usuario: UsuarioAutenticado): Promise<RecorrenciaView[]> {
    return this.recorrencias.listar(usuario);
  }

  @Get(':id')
  @RequirePermission('config:recorrencia')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecorrenciaView> {
    return this.recorrencias.obter(usuario, id);
  }

  /** Os chamados que a agenda já abriu — a prova de que ela funciona. */
  @Get(':id/chamados')
  @RequirePermission('config:recorrencia')
  chamados(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recorrencias.chamados(usuario, id);
  }

  @Post()
  @RequirePermission('config:recorrencia')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverRecorrenciaDto,
  ): Promise<RecorrenciaView> {
    return this.recorrencias.criar(usuario, dto);
  }

  @Patch(':id')
  @RequirePermission('config:recorrencia')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarRecorrenciaDto,
  ): Promise<RecorrenciaView> {
    return this.recorrencias.editar(usuario, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('config:recorrencia')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.recorrencias.remover(usuario, id);
  }
}

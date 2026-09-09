import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ConfiguracaoSlaService } from './configuracao.service';
import {
  EditarAcordoDto,
  EditarCalendarioDto,
  EditarMotivoDto,
  EscreverAcordoDto,
  EscreverCalendarioDto,
  EscreverMotivoDto,
  EscreverNivelDto,
  FeriadoDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConfiguracaoSlaController {
  constructor(private readonly config: ConfiguracaoSlaService) {}

  // --- Acordos ---------------------------------------------------------

  @Get('agreements')
  @RequirePermission('config:sla')
  acordos(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.config.listarAcordos(usuario);
  }

  @Post('agreements')
  @RequirePermission('config:sla')
  criarAcordo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverAcordoDto,
    @Ip() ip: string,
  ) {
    return this.config.criarAcordo(usuario, dto, ip);
  }

  @Patch('agreements/:id')
  @RequirePermission('config:sla')
  editarAcordo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarAcordoDto,
    @Ip() ip: string,
  ) {
    return this.config.editarAcordo(usuario, id, dto, ip);
  }

  @Delete('agreements/:id')
  @HttpCode(204)
  @RequirePermission('config:sla')
  desativarAcordo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.config.desativarAcordo(usuario, id, ip);
  }

  @Post('agreements/:id/niveis')
  @RequirePermission('config:sla')
  criarNivel(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverNivelDto,
  ) {
    return this.config.criarNivel(usuario, id, dto);
  }

  @Delete('agreements/:id/niveis/:nivelId')
  @HttpCode(204)
  @RequirePermission('config:sla')
  removerNivel(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nivelId', ParseUUIDPipe) nivelId: string,
  ): Promise<void> {
    return this.config.removerNivel(usuario, id, nivelId);
  }

  // --- Calendários -----------------------------------------------------

  @Get('calendars')
  @RequirePermission('config:calendario')
  calendarios(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.config.listarCalendarios(usuario);
  }

  @Post('calendars')
  @RequirePermission('config:calendario')
  criarCalendario(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverCalendarioDto,
  ) {
    return this.config.criarCalendario(usuario, dto);
  }

  @Patch('calendars/:id')
  @RequirePermission('config:calendario')
  editarCalendario(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarCalendarioDto,
  ) {
    return this.config.editarCalendario(usuario, id, dto);
  }

  @Post('calendars/:id/feriados')
  @RequirePermission('config:calendario')
  criarFeriado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FeriadoDto,
  ) {
    return this.config.adicionarFeriado(usuario, id, dto);
  }

  @Delete('calendars/:id/feriados/:feriadoId')
  @HttpCode(204)
  @RequirePermission('config:calendario')
  removerFeriado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('feriadoId', ParseUUIDPipe) feriadoId: string,
  ): Promise<void> {
    return this.config.removerFeriado(usuario, id, feriadoId);
  }

  // --- Motivos de pendência --------------------------------------------

  @Get('pending-reasons')
  @RequirePermission('config:motivos-pendencia')
  motivos(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.config.listarMotivos(usuario);
  }

  @Post('pending-reasons')
  @RequirePermission('config:motivos-pendencia')
  criarMotivo(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: EscreverMotivoDto) {
    return this.config.criarMotivo(usuario, dto);
  }

  @Patch('pending-reasons/:id')
  @RequirePermission('config:motivos-pendencia')
  editarMotivo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarMotivoDto,
  ) {
    return this.config.editarMotivo(usuario, id, dto);
  }

  @Delete('pending-reasons/:id')
  @HttpCode(204)
  @RequirePermission('config:motivos-pendencia')
  removerMotivo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.config.removerMotivo(usuario, id);
  }
}

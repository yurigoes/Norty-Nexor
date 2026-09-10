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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { LicencaView, SoftwareDetail, SoftwareDoAtivo, SoftwareView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  AtribuirLicencaDto,
  BuscarSoftwareDto,
  CriarVersaoDto,
  EditarLicencaDto,
  EditarSoftwareDto,
  EscreverLicencaDto,
  EscreverSoftwareDto,
  InstalarSoftwareDto,
  LicencasVencendoDto,
} from './dto';
import { SoftwareService } from './software.service';

/**
 * Software e licenças. Ler é de quem lê ativos; escrever, de quem os
 * gerencia — é o mesmo inventário, visto de outro ângulo. A chave da
 * licença só sai para quem gerencia (o serviço decide pelo perfil).
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SoftwareController {
  constructor(private readonly software: SoftwareService) {}

  // --- Software -------------------------------------------------------

  @Get('software')
  @RequirePermission('ativo:ler')
  listar(@CurrentUser() usuario: UsuarioAutenticado, @Query() filtro: BuscarSoftwareDto): Promise<SoftwareView[]> {
    return this.software.listar(usuario, filtro);
  }

  @Get('software/:id')
  @RequirePermission('ativo:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SoftwareDetail> {
    return this.software.detalhe(usuario, id);
  }

  @Post('software')
  @RequirePermission('ativo:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverSoftwareDto,
    @Ip() ip: string,
  ): Promise<SoftwareDetail> {
    return this.software.criar(usuario, dto, ip);
  }

  @Patch('software/:id')
  @RequirePermission('ativo:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarSoftwareDto,
    @Ip() ip: string,
  ): Promise<SoftwareDetail> {
    return this.software.editar(usuario, id, dto, ip);
  }

  @Delete('software/:id')
  @HttpCode(204)
  @RequirePermission('ativo:gerenciar')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.software.remover(usuario, id, ip);
  }

  // --- Versões --------------------------------------------------------

  @Post('software/:id/versions')
  @RequirePermission('ativo:gerenciar')
  criarVersao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CriarVersaoDto,
  ): Promise<SoftwareDetail> {
    return this.software.criarVersao(usuario, id, dto.name);
  }

  @Delete('software/:id/versions/:versionId')
  @RequirePermission('ativo:gerenciar')
  removerVersao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<SoftwareDetail> {
    return this.software.removerVersao(usuario, id, versionId);
  }

  // --- Licenças -------------------------------------------------------

  /** Vencidas e vencendo nos próximos `dias` (padrão 30). */
  @Get('licenses')
  @RequirePermission('ativo:ler')
  vencendo(@CurrentUser() usuario: UsuarioAutenticado, @Query() filtro: LicencasVencendoDto): Promise<LicencaView[]> {
    return this.software.vencendo(usuario, filtro.dias);
  }

  @Post('software/:id/licenses')
  @RequirePermission('ativo:gerenciar')
  criarLicenca(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverLicencaDto,
    @Ip() ip: string,
  ): Promise<SoftwareDetail> {
    return this.software.criarLicenca(usuario, id, dto, ip);
  }

  @Patch('licenses/:id')
  @RequirePermission('ativo:gerenciar')
  editarLicenca(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarLicencaDto,
    @Ip() ip: string,
  ): Promise<SoftwareDetail> {
    return this.software.editarLicenca(usuario, id, dto, ip);
  }

  @Delete('licenses/:id')
  @RequirePermission('ativo:gerenciar')
  removerLicenca(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<SoftwareDetail> {
    return this.software.removerLicenca(usuario, id, ip);
  }

  @Post('licenses/:id/assignments')
  @RequirePermission('ativo:gerenciar')
  atribuir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtribuirLicencaDto,
  ): Promise<SoftwareDetail> {
    return this.software.atribuir(usuario, id, dto);
  }

  @Delete('licenses/:id/assignments/:assignmentId')
  @RequirePermission('ativo:gerenciar')
  liberar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<SoftwareDetail> {
    return this.software.liberar(usuario, id, assignmentId);
  }

  // --- Pelo equipamento ----------------------------------------------

  @Get('assets/:id/software')
  @RequirePermission('ativo:ler')
  doAtivo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SoftwareDoAtivo> {
    return this.software.doAtivo(usuario, id);
  }

  @Post('assets/:id/software')
  @RequirePermission('ativo:gerenciar')
  instalar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstalarSoftwareDto,
  ): Promise<SoftwareDoAtivo> {
    return this.software.instalar(usuario, id, dto);
  }

  @Delete('assets/:id/software/:installationId')
  @RequirePermission('ativo:gerenciar')
  desinstalar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installationId', ParseUUIDPipe) installationId: string,
  ): Promise<SoftwareDoAtivo> {
    return this.software.desinstalar(usuario, id, installationId);
  }
}

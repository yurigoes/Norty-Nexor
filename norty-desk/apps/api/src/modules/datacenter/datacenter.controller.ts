import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { OndeEstaNoRack, RackDetail, RackView, SalaView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DatacenterService } from './datacenter.service';
import { ColocarNoRackDto, EditarRackDto, EditarSalaDto, EscreverRackDto, EscreverSalaDto, MoverNoRackDto } from './dto';

/** Datacenter do inventário: ler é de quem lê ativos; montar, de quem os gerencia. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DatacenterController {
  constructor(private readonly dc: DatacenterService) {}

  @Get('dc-rooms')
  @RequirePermission('ativo:ler')
  salas(@CurrentUser() u: UsuarioAutenticado): Promise<SalaView[]> {
    return this.dc.salas(u);
  }

  @Post('dc-rooms')
  @RequirePermission('ativo:gerenciar')
  criarSala(@CurrentUser() u: UsuarioAutenticado, @Body() dto: EscreverSalaDto): Promise<SalaView[]> {
    return this.dc.criarSala(u, dto);
  }

  @Patch('dc-rooms/:id')
  @RequirePermission('ativo:gerenciar')
  editarSala(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarSalaDto): Promise<SalaView[]> {
    return this.dc.editarSala(u, id, dto);
  }

  @Delete('dc-rooms/:id')
  @RequirePermission('ativo:gerenciar')
  removerSala(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<SalaView[]> {
    return this.dc.removerSala(u, id);
  }

  @Get('racks')
  @RequirePermission('ativo:ler')
  racks(@CurrentUser() u: UsuarioAutenticado): Promise<RackView[]> {
    return this.dc.racks(u);
  }

  @Get('racks/:id')
  @RequirePermission('ativo:ler')
  rack(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<RackDetail> {
    return this.dc.rack(u, id);
  }

  @Post('racks')
  @RequirePermission('ativo:gerenciar')
  criarRack(@CurrentUser() u: UsuarioAutenticado, @Body() dto: EscreverRackDto): Promise<RackDetail> {
    return this.dc.criarRack(u, dto);
  }

  @Patch('racks/:id')
  @RequirePermission('ativo:gerenciar')
  editarRack(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarRackDto): Promise<RackDetail> {
    return this.dc.editarRack(u, id, dto);
  }

  @Delete('racks/:id')
  @HttpCode(204)
  @RequirePermission('ativo:gerenciar')
  removerRack(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.dc.removerRack(u, id);
  }

  @Post('racks/:id/items')
  @RequirePermission('ativo:gerenciar')
  colocar(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ColocarNoRackDto): Promise<RackDetail> {
    return this.dc.colocar(u, id, dto);
  }

  @Patch('rack-items/:id')
  @RequirePermission('ativo:gerenciar')
  mover(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoverNoRackDto): Promise<RackDetail> {
    return this.dc.mover(u, id, dto);
  }

  @Delete('rack-items/:id')
  @RequirePermission('ativo:gerenciar')
  retirar(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<RackDetail> {
    return this.dc.retirar(u, id);
  }

  @Get('assets/:id/rack')
  @RequirePermission('ativo:ler')
  doAtivo(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<OndeEstaNoRack> {
    return this.dc.doAtivo(u, id);
  }
}

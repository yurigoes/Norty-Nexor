import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { IpView, RedeDoAtivo, SubRedeDetail, SubRedeView, VlanView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  ConectarPortaDto,
  EditarIpDto,
  EditarPortaDto,
  EditarSubRedeDto,
  EditarVlanDto,
  EscreverIpDto,
  EscreverPortaDto,
  EscreverSubRedeDto,
  EscreverVlanDto,
} from './dto';
import { RedeService } from './rede.service';

/** Rede do inventário: ler é de quem lê ativos; escrever, de quem os gerencia. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RedeController {
  constructor(private readonly rede: RedeService) {}

  @Get('vlans')
  @RequirePermission('ativo:ler')
  vlans(@CurrentUser() u: UsuarioAutenticado): Promise<VlanView[]> {
    return this.rede.vlans(u);
  }

  @Post('vlans')
  @RequirePermission('ativo:gerenciar')
  criarVlan(@CurrentUser() u: UsuarioAutenticado, @Body() dto: EscreverVlanDto): Promise<VlanView[]> {
    return this.rede.criarVlan(u, dto);
  }

  @Patch('vlans/:id')
  @RequirePermission('ativo:gerenciar')
  editarVlan(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarVlanDto): Promise<VlanView[]> {
    return this.rede.editarVlan(u, id, dto);
  }

  @Delete('vlans/:id')
  @RequirePermission('ativo:gerenciar')
  removerVlan(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<VlanView[]> {
    return this.rede.removerVlan(u, id);
  }

  @Get('ip-networks')
  @RequirePermission('ativo:ler')
  subredes(@CurrentUser() u: UsuarioAutenticado): Promise<SubRedeView[]> {
    return this.rede.subredes(u);
  }

  @Get('ip-networks/:id')
  @RequirePermission('ativo:ler')
  subrede(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<SubRedeDetail> {
    return this.rede.subrede(u, id);
  }

  @Post('ip-networks')
  @RequirePermission('ativo:gerenciar')
  criarSubrede(@CurrentUser() u: UsuarioAutenticado, @Body() dto: EscreverSubRedeDto): Promise<SubRedeDetail> {
    return this.rede.criarSubrede(u, dto);
  }

  @Patch('ip-networks/:id')
  @RequirePermission('ativo:gerenciar')
  editarSubrede(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarSubRedeDto): Promise<SubRedeDetail> {
    return this.rede.editarSubrede(u, id, dto);
  }

  @Delete('ip-networks/:id')
  @HttpCode(204)
  @RequirePermission('ativo:gerenciar')
  removerSubrede(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rede.removerSubrede(u, id);
  }

  @Post('ip-addresses')
  @RequirePermission('ativo:gerenciar')
  criarIp(@CurrentUser() u: UsuarioAutenticado, @Body() dto: EscreverIpDto): Promise<IpView> {
    return this.rede.criarIp(u, dto);
  }

  @Patch('ip-addresses/:id')
  @RequirePermission('ativo:gerenciar')
  editarIp(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarIpDto): Promise<IpView> {
    return this.rede.editarIp(u, id, dto);
  }

  @Delete('ip-addresses/:id')
  @HttpCode(204)
  @RequirePermission('ativo:gerenciar')
  removerIp(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rede.removerIp(u, id);
  }

  @Get('assets/:id/network')
  @RequirePermission('ativo:ler')
  doAtivo(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<RedeDoAtivo> {
    return this.rede.doAtivo(u, id);
  }

  @Post('assets/:id/ports')
  @RequirePermission('ativo:gerenciar')
  criarPorta(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EscreverPortaDto): Promise<RedeDoAtivo> {
    return this.rede.criarPorta(u, id, dto);
  }

  @Patch('ports/:id')
  @RequirePermission('ativo:gerenciar')
  editarPorta(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarPortaDto): Promise<RedeDoAtivo> {
    return this.rede.editarPorta(u, id, dto);
  }

  @Delete('ports/:id')
  @RequirePermission('ativo:gerenciar')
  removerPorta(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<RedeDoAtivo> {
    return this.rede.removerPorta(u, id);
  }

  @Post('ports/:id/connection')
  @RequirePermission('ativo:gerenciar')
  conectar(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConectarPortaDto): Promise<RedeDoAtivo> {
    return this.rede.conectar(u, id, dto.portId);
  }

  @Delete('ports/:id/connection')
  @RequirePermission('ativo:gerenciar')
  desconectar(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<RedeDoAtivo> {
    return this.rede.desconectar(u, id);
  }
}

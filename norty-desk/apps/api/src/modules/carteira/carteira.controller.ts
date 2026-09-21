import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import type { ClienteDetail, ClienteView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CarteiraService } from './carteira.service';
import {
  DefinirPinDto, EditarClienteDto, EscreverClienteDto, EscreverPessoaDoClienteDto,
} from './dto';

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CarteiraController {
  constructor(private readonly carteira: CarteiraService) {}

  /** Ler a carteira é `cliente:ler`: o agente precisa saber de quem é o chamado. */
  @Get()
  @RequirePermission('cliente:ler')
  listar(@CurrentUser() u: UsuarioAutenticado): Promise<ClienteView[]> {
    return this.carteira.clientes(u);
  }

  @Get(':id')
  @RequirePermission('cliente:ler')
  detalhe(
    @CurrentUser() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClienteDetail> {
    return this.carteira.detalhe(u, id);
  }

  @Post()
  @RequirePermission('cliente:gerenciar')
  criar(@CurrentUser() u: UsuarioAutenticado, @Body() dto: EscreverClienteDto): Promise<ClienteDetail> {
    return this.carteira.criar(u, dto);
  }

  @Patch(':id')
  @RequirePermission('cliente:gerenciar')
  editar(
    @CurrentUser() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarClienteDto,
  ): Promise<ClienteDetail> {
    return this.carteira.editar(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('cliente:gerenciar')
  remover(
    @CurrentUser() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.carteira.remover(u, id);
  }

  // --- Pessoas da empresa ---------------------------------------------

  @Post(':id/people')
  @RequirePermission('cliente:gerenciar')
  adicionarPessoa(
    @CurrentUser() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverPessoaDoClienteDto,
  ): Promise<ClienteDetail> {
    return this.carteira.adicionarPessoa(u, id, dto);
  }

  @Delete(':id/people/:userId')
  @RequirePermission('cliente:gerenciar')
  removerPessoa(
    @CurrentUser() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ClienteDetail> {
    return this.carteira.removerPessoa(u, id, userId);
  }

  @Post(':id/people/:userId/pin')
  @RequirePermission('cliente:gerenciar')
  definirPin(
    @CurrentUser() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: DefinirPinDto,
  ): Promise<ClienteDetail> {
    return this.carteira.definirPin(u, id, userId, dto);
  }
}

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
import type { ConsumivelDetail, ConsumivelView, SuprimentosDoAtivo } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ConsumiveisService } from './consumiveis.service';
import { BuscarConsumiveisDto, EditarConsumivelDto, EscreverConsumivelDto, MovimentarDto } from './dto';

/**
 * Consumíveis e cartuchos. Ler é de quem lê ativos; cadastrar, de quem os
 * gerencia; registrar saída, de quem atende (`consumivel:movimentar`) —
 * entrada e ajuste o serviço reserva a quem gerencia.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConsumiveisController {
  constructor(private readonly consumiveis: ConsumiveisService) {}

  @Get('consumables')
  @RequirePermission('ativo:ler')
  listar(@CurrentUser() usuario: UsuarioAutenticado, @Query() filtro: BuscarConsumiveisDto): Promise<ConsumivelView[]> {
    return this.consumiveis.listar(usuario, filtro);
  }

  @Get('consumables/:id')
  @RequirePermission('ativo:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConsumivelDetail> {
    return this.consumiveis.detalhe(usuario, id);
  }

  @Post('consumables')
  @RequirePermission('ativo:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverConsumivelDto,
    @Ip() ip: string,
  ): Promise<ConsumivelDetail> {
    return this.consumiveis.criar(usuario, dto, ip);
  }

  @Patch('consumables/:id')
  @RequirePermission('ativo:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarConsumivelDto,
    @Ip() ip: string,
  ): Promise<ConsumivelDetail> {
    return this.consumiveis.editar(usuario, id, dto, ip);
  }

  @Delete('consumables/:id')
  @HttpCode(204)
  @RequirePermission('ativo:gerenciar')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.consumiveis.remover(usuario, id, ip);
  }

  @Post('consumables/:id/movements')
  @RequirePermission('consumivel:movimentar')
  movimentar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MovimentarDto,
    @Ip() ip: string,
  ): Promise<ConsumivelDetail> {
    return this.consumiveis.movimentar(usuario, id, dto, ip);
  }

  @Get('assets/:id/consumables')
  @RequirePermission('ativo:ler')
  doAtivo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SuprimentosDoAtivo> {
    return this.consumiveis.doAtivo(usuario, id);
  }
}

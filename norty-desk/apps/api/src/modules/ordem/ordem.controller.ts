import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ServiceOrderView } from '@norty-desk/shared';
import type { Response } from 'express';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ConcluirOrdemDto, EscreverItemDto, EscreverOrdemDto } from './dto';
import { OrdemService } from './ordem.service';
import { ordemEmPdf } from './pdf';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdemController {
  constructor(private readonly ordens: OrdemService) {}

  @Get('tickets/:id/ordens')
  @RequirePermission('ordem:ler')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderView[]> {
    return this.ordens.listar(usuario, id);
  }

  @Post('tickets/:id/ordens')
  @RequirePermission('ordem:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverOrdemDto,
  ): Promise<ServiceOrderView> {
    return this.ordens.criar(usuario, id, dto);
  }

  @Patch('ordens/:id')
  @RequirePermission('ordem:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverOrdemDto,
  ): Promise<ServiceOrderView> {
    return this.ordens.editar(usuario, id, dto);
  }

  @Post('ordens/:id/itens')
  @RequirePermission('ordem:gerenciar')
  incluirItem(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverItemDto,
  ): Promise<ServiceOrderView> {
    return this.ordens.incluirItem(usuario, id, dto);
  }

  @Patch('ordens/:id/itens/:itemId')
  @RequirePermission('ordem:gerenciar')
  editarItem(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: EscreverItemDto,
  ): Promise<ServiceOrderView> {
    return this.ordens.editarItem(usuario, id, itemId, dto);
  }

  @Delete('ordens/:id/itens/:itemId')
  @RequirePermission('ordem:gerenciar')
  removerItem(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<ServiceOrderView> {
    return this.ordens.removerItem(usuario, id, itemId);
  }

  @Post('ordens/:id/concluir')
  @RequirePermission('ordem:gerenciar')
  concluir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConcluirOrdemDto,
  ): Promise<ServiceOrderView> {
    return this.ordens.concluir(usuario, id, dto);
  }

  @Post('ordens/:id/cancelar')
  @RequirePermission('ordem:gerenciar')
  cancelar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderView> {
    return this.ordens.cancelar(usuario, id);
  }

  /**
   * O PDF. `ordem:ler` e não `ordem:gerenciar`: o documento é do
   * cliente tanto quanto da Norty, e negá-lo a quem ele atesta seria
   * negar a razão de existir dele.
   */
  @Get('ordens/:id/pdf')
  @RequirePermission('ordem:ler')
  async pdf(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const ordem = await this.ordens.paraDocumento(usuario, id);
    const arquivo = await ordemEmPdf(ordem, await this.ordens.assinatura(ordem));

    resposta.setHeader('Content-Type', 'application/pdf');
    resposta.setHeader('Content-Length', arquivo.length);
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="ordem-${ordem.number}.pdf"`,
    );
    resposta.setHeader('Cache-Control', 'no-store');
    resposta.end(arquivo);
  }
}

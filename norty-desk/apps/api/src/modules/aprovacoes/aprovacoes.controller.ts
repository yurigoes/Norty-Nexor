import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { ApprovalView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AprovacoesService } from './aprovacoes.service';
import { DecidirAprovacaoDto, SolicitarAprovacaoDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AprovacoesController {
  constructor(private readonly aprovacoes: AprovacoesService) {}

  /**
   * O que espera decisão minha.
   *
   * Vem antes de `aprovacoes/:id` de propósito: `minhas` seria lido
   * como um id e cairia no `ParseUUIDPipe`.
   */
  @Get('aprovacoes/minhas')
  @RequirePermission('aprovacao:decidir')
  minhas(@CurrentUser() usuario: UsuarioAutenticado): Promise<ApprovalView[]> {
    return this.aprovacoes.minhas(usuario);
  }

  @Get('tickets/:id/aprovacoes')
  @RequirePermission('chamado:ler:proprios')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApprovalView[]> {
    return this.aprovacoes.listarDoChamado(usuario, id);
  }

  @Post('tickets/:id/aprovacoes')
  @RequirePermission('aprovacao:solicitar')
  solicitar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SolicitarAprovacaoDto,
  ): Promise<ApprovalView[]> {
    return this.aprovacoes.solicitar(usuario, id, dto);
  }

  @Post('aprovacoes/:id/decidir')
  @RequirePermission('aprovacao:decidir')
  decidir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecidirAprovacaoDto,
  ): Promise<ApprovalView[]> {
    return this.aprovacoes.decidir(usuario, id, dto);
  }
}

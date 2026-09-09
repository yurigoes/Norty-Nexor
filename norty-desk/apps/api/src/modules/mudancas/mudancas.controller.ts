import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ApprovalView, MudancaDetalhe, MudancaResumo, TicketEventView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SolicitarAprovacaoDto } from '../aprovacoes/dto';
import {
  BuscarMudancasDto,
  CriarMudancaDto,
  EditarMudancaDto,
  ExecutarMudancaDto,
  NotaDaMudancaDto,
  VincularChamadoDto,
} from './dto';
import { MudancasService } from './mudancas.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MudancasController {
  constructor(private readonly mudancas: MudancasService) {}

  @Get('changes')
  @RequirePermission('mudanca:ler')
  buscar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarMudancasDto,
  ): Promise<MudancaResumo[]> {
    return this.mudancas.buscar(usuario, filtro);
  }

  @Get('changes/:id')
  @RequirePermission('mudanca:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MudancaDetalhe> {
    return this.mudancas.obter(usuario, id);
  }

  @Get('changes/:id/eventos')
  @RequirePermission('mudanca:ler')
  eventos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketEventView[]> {
    return this.mudancas.eventos(usuario, id);
  }

  @Post('changes')
  @RequirePermission('mudanca:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CriarMudancaDto,
  ): Promise<MudancaDetalhe> {
    return this.mudancas.criar(usuario, dto);
  }

  @Patch('changes/:id')
  @RequirePermission('mudanca:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarMudancaDto,
  ): Promise<MudancaDetalhe> {
    return this.mudancas.editar(usuario, id, dto);
  }

  @Post('changes/:id/aprovacoes')
  @RequirePermission('aprovacao:solicitar')
  solicitarAprovacao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SolicitarAprovacaoDto,
  ): Promise<ApprovalView[]> {
    return this.mudancas.solicitarAprovacao(usuario, id, dto);
  }

  /**
   * Executar é rota própria, e permissão própria.
   *
   * Quem passa a madrugada aplicando a mudança é quem sabe dizer se ela
   * deu certo; obrigar um supervisor a marcar "concluída" às três da
   * manhã só produz registro atrasado. O aval continua sendo de outro.
   */
  @Post('changes/:id/executar')
  @RequirePermission('mudanca:executar')
  executar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExecutarMudancaDto,
  ): Promise<MudancaDetalhe> {
    return this.mudancas.executar(usuario, id, dto);
  }

  @Post('changes/:id/notas')
  @RequirePermission('mudanca:ler')
  anotar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotaDaMudancaDto,
  ): Promise<TicketEventView[]> {
    return this.mudancas.anotar(usuario, id, dto);
  }

  /** Vincular é `mudanca:ler`, como no ativo e no problema. */
  @Post('changes/:id/tickets')
  @RequirePermission('mudanca:ler')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularChamadoDto,
  ): Promise<MudancaDetalhe> {
    return this.mudancas.vincularChamado(usuario, id, dto.ticketId);
  }

  @Delete('changes/:id/tickets/:ticketId')
  @RequirePermission('mudanca:ler')
  desvincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<MudancaDetalhe> {
    return this.mudancas.desvincularChamado(usuario, id, ticketId);
  }
}

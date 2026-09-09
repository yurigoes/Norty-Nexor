import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  Paginated,
  TicketDetail,
  TicketEventView,
  TicketListItem,
} from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  AtribuirDto,
  ClassificarDto,
  CriarChamadoDto,
  FiltroFilaDto,
  PausarDto,
  ReabrirDto,
  ResolverDto,
  ResponderDto,
  VincularDto,
} from './dto';
import { TicketsService } from './tickets.service';

/**
 * Rotas de chamado (`docs/07-api.md`, seção 3).
 *
 * Toda rota carrega a permissão nomeada que a protege. O escopo de
 * leitura é aplicado dentro do service, sempre — autorização diz se a
 * rota abre, escopo diz quais linhas voltam.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermission('chamado:ler:proprios')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: FiltroFilaDto,
  ): Promise<Paginated<TicketListItem>> {
    return this.tickets.listar(usuario, filtro);
  }

  @Get(':id')
  @RequirePermission('chamado:ler:proprios')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDetail> {
    return this.tickets.obter(usuario, id);
  }

  @Get(':id/eventos')
  @RequirePermission('chamado:ler:proprios')
  eventos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limite?: string,
  ): Promise<TicketEventView[]> {
    return this.tickets.eventos(usuario, id, limite ? Number(limite) : 100);
  }

  @Post()
  @RequirePermission('chamado:criar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CriarChamadoDto,
  ): Promise<TicketDetail> {
    return this.tickets.abrir(usuario, dto);
  }

  @Post(':id/responder')
  @RequirePermission('chamado:responder')
  responder(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResponderDto,
  ): Promise<TicketEventView> {
    return this.tickets.responder(usuario, id, dto);
  }

  @Post(':id/atribuir')
  @RequirePermission('chamado:atribuir:a-mim')
  atribuir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtribuirDto,
  ): Promise<TicketDetail> {
    return this.tickets.atribuir(usuario, id, dto);
  }

  @Post(':id/classificar')
  @RequirePermission('chamado:classificar')
  classificar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClassificarDto,
  ): Promise<TicketDetail> {
    return this.tickets.classificar(usuario, id, dto);
  }

  @Post(':id/pausar')
  @RequirePermission('chamado:pausar')
  pausar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PausarDto,
  ): Promise<TicketDetail> {
    return this.tickets.pausar(usuario, id, dto.pendingReasonId, dto.body);
  }

  @Post(':id/retomar')
  @RequirePermission('chamado:pausar')
  retomar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDetail> {
    return this.tickets.retomar(usuario, id);
  }

  @Post(':id/resolver')
  @RequirePermission('chamado:resolver')
  resolver(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverDto,
  ): Promise<TicketDetail> {
    return this.tickets.mudarStatus(usuario, id, 'SOLUCIONADO', dto.body);
  }

  @Post(':id/fechar')
  @RequirePermission('chamado:fechar')
  fechar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDetail> {
    return this.tickets.mudarStatus(usuario, id, 'FECHADO');
  }

  @Post(':id/reabrir')
  @RequirePermission('chamado:reabrir')
  reabrir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReabrirDto,
  ): Promise<TicketDetail> {
    return this.tickets.mudarStatus(usuario, id, 'ATRIBUIDO', dto.body);
  }

  @Post(':id/vincular')
  @RequirePermission('chamado:vincular')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularDto,
  ): Promise<TicketDetail> {
    return this.tickets.vincular(usuario, id, dto);
  }
}

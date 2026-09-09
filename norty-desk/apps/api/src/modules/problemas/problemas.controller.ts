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
import type {
  ErroConhecidoSugerido,
  ProblemaDetalhe,
  ProblemaResumo,
  TicketEventView,
} from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  BuscarProblemasDto,
  CriarProblemaDto,
  EditarProblemaDto,
  NotaDoProblemaDto,
  VincularChamadoDto,
} from './dto';
import { ProblemasService } from './problemas.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProblemasController {
  constructor(private readonly problemas: ProblemasService) {}

  @Get('problems')
  @RequirePermission('problema:ler')
  buscar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarProblemasDto,
  ): Promise<ProblemaResumo[]> {
    return this.problemas.buscar(usuario, filtro);
  }

  /**
   * A base de erros conhecidos.
   *
   * Vem antes de `problems/:id` na ordem das rotas porque
   * `erros-conhecidos` casaria com `:id` e morreria no `ParseUUIDPipe`.
   */
  @Get('problems/erros-conhecidos')
  @RequirePermission('problema:ler')
  errosConhecidos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarProblemasDto,
  ): Promise<ErroConhecidoSugerido[]> {
    return this.problemas.errosConhecidos(usuario, filtro.q, filtro.limit ?? 20);
  }

  @Get('problems/:id')
  @RequirePermission('problema:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProblemaDetalhe> {
    return this.problemas.obter(usuario, id);
  }

  @Get('problems/:id/eventos')
  @RequirePermission('problema:ler')
  eventos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketEventView[]> {
    return this.problemas.eventos(usuario, id);
  }

  @Post('problems')
  @RequirePermission('problema:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CriarProblemaDto,
  ): Promise<ProblemaDetalhe> {
    return this.problemas.criar(usuario, dto);
  }

  @Patch('problems/:id')
  @RequirePermission('problema:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarProblemaDto,
  ): Promise<ProblemaDetalhe> {
    return this.problemas.editar(usuario, id, dto);
  }

  @Post('problems/:id/notas')
  @RequirePermission('problema:gerenciar')
  anotar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotaDoProblemaDto,
  ): Promise<TicketEventView[]> {
    return this.problemas.anotar(usuario, id, dto);
  }

  /**
   * Vincular é `problema:ler`, não `problema:gerenciar` — a mesma
   * decisão do ativo. Quem atende diz "este chamado é aquele problema";
   * escrever a causa raiz é outra conversa.
   */
  @Post('problems/:id/tickets')
  @RequirePermission('problema:ler')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularChamadoDto,
  ): Promise<ProblemaDetalhe> {
    return this.problemas.vincularChamado(usuario, id, dto.ticketId);
  }

  @Delete('problems/:id/tickets/:ticketId')
  @RequirePermission('problema:ler')
  desvincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<ProblemaDetalhe> {
    return this.problemas.desvincularChamado(usuario, id, ticketId);
  }

  /** "Isso já é um problema conhecido?" — na tela do chamado. */
  @Get('tickets/:id/erros-conhecidos')
  @RequirePermission('problema:ler')
  errosConhecidosDoChamado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ErroConhecidoSugerido[]> {
    return this.problemas.errosConhecidosParaChamado(usuario, id);
  }
}

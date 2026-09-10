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
import type { ProjetoDetail, ProjetoView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  BuscarProjetosDto,
  EditarProjetoDto,
  EditarTarefaProjetoDto,
  EscreverProjetoDto,
  EscreverTarefaProjetoDto,
  VincularChamadoDto,
} from './dto';
import { ProjetosService } from './projetos.service';

/**
 * Projetos. Ler é de `projeto:ler`; criar, editar, montar tarefas e
 * vincular chamados, de `projeto:gerenciar`. Editar uma tarefa só pede
 * leitura na rota: o serviço deixa o responsável mexer nas próprias.
 */
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjetosController {
  constructor(private readonly projetos: ProjetosService) {}

  @Get()
  @RequirePermission('projeto:ler')
  listar(@CurrentUser() usuario: UsuarioAutenticado, @Query() filtro: BuscarProjetosDto): Promise<ProjetoView[]> {
    return this.projetos.listar(usuario, filtro);
  }

  @Get(':id')
  @RequirePermission('projeto:ler')
  obter(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<ProjetoDetail> {
    return this.projetos.detalhe(usuario, id);
  }

  @Post()
  @RequirePermission('projeto:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverProjetoDto,
    @Ip() ip: string,
  ): Promise<ProjetoDetail> {
    return this.projetos.criar(usuario, dto, ip);
  }

  @Patch(':id')
  @RequirePermission('projeto:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarProjetoDto,
    @Ip() ip: string,
  ): Promise<ProjetoDetail> {
    return this.projetos.editar(usuario, id, dto, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('projeto:gerenciar')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.projetos.remover(usuario, id, ip);
  }

  @Post(':id/tasks')
  @RequirePermission('projeto:gerenciar')
  criarTarefa(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverTarefaProjetoDto,
  ): Promise<ProjetoDetail> {
    return this.projetos.criarTarefa(usuario, id, dto);
  }

  @Patch(':id/tasks/:taskId')
  @RequirePermission('projeto:ler')
  editarTarefa(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: EditarTarefaProjetoDto,
  ): Promise<ProjetoDetail> {
    return this.projetos.editarTarefa(usuario, id, taskId, dto);
  }

  @Delete(':id/tasks/:taskId')
  @RequirePermission('projeto:gerenciar')
  removerTarefa(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<ProjetoDetail> {
    return this.projetos.removerTarefa(usuario, id, taskId);
  }

  @Post(':id/tickets')
  @RequirePermission('projeto:gerenciar')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularChamadoDto,
  ): Promise<ProjetoDetail> {
    return this.projetos.vincularChamado(usuario, id, dto.number);
  }

  @Delete(':id/tickets/:ticketId')
  @RequirePermission('projeto:gerenciar')
  desvincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<ProjetoDetail> {
    return this.projetos.desvincularChamado(usuario, id, ticketId);
  }
}

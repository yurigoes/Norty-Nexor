import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { TicketTaskView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CriarTarefaDto, EditarTarefaDto } from './dto';
import { TarefasService } from './tarefas.service';

@Controller('tickets/:id/tarefas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TarefasController {
  constructor(private readonly tarefas: TarefasService) {}

  /**
   * Ler as tarefas é `chamado:ler:proprios`, não `tarefa:criar`.
   *
   * Quem abre a tela do chamado vê o que já foi feito nele; criar e
   * apontar tempo é que exige quem atende.
   */
  @Get()
  @RequirePermission('chamado:ler:proprios')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketTaskView[]> {
    return this.tarefas.listar(usuario, id);
  }

  @Post()
  @RequirePermission('tarefa:criar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CriarTarefaDto,
  ): Promise<TicketTaskView[]> {
    return this.tarefas.criar(usuario, id, dto);
  }

  /**
   * Concluir e apontar tempo passam pela mesma rota.
   *
   * Separá-las em duas daria dois `PATCH` para o mesmo registro, e a
   * tela teria de escolher qual chamar conforme o que o dedo tocou.
   * `tarefa:concluir` cobre as duas porque quem conclui é quem aponta.
   */
  @Patch(':tarefaId')
  @RequirePermission('tarefa:concluir')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tarefaId', ParseUUIDPipe) tarefaId: string,
    @Body() dto: EditarTarefaDto,
  ): Promise<TicketTaskView[]> {
    return this.tarefas.editar(usuario, id, tarefaId, dto);
  }

  @Delete(':tarefaId')
  @RequirePermission('tarefa:criar')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tarefaId', ParseUUIDPipe) tarefaId: string,
  ): Promise<TicketTaskView[]> {
    return this.tarefas.remover(usuario, id, tarefaId);
  }
}
